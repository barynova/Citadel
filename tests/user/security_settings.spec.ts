/**
 * Security Settings — Two-Factor Authentication section
 *
 * Тести:
 *  1. Profile has "Security Settings" → "Two-Factor Authentication" section visible
 *  2. "Reset Authenticator" button visible when 2FA is enabled
 *  3. After reset: new secret key generated + new QR displayed + old OTP key invalid
 *  4. After reset: user must scan new QR and enter OTP code for confirmation (verify step)
 *  5. New backup codes are generated after reset (old ones are revoked)
 */

import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { RegisterPage } from '../../page-objects/user/RegisterPage';
import { UserLoginPage } from '../../page-objects/user/UserLoginPage';
import { SettingsSecurityPage } from '../../page-objects/user/SettingsSecurityPage';
import { verifyUserEmail } from '../../utils/db-helpers';
import { generateTOTPCode } from '../../utils/otp-helpers';

test.use({ storageState: { cookies: [], origins: [] } });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateUser() {
  const suffix = faker.string.numeric(6);
  return {
    username: `user_${suffix}`,
    email: faker.internet.email().toLowerCase(),
    password: 'TestPass123!',
  };
}

async function registerAndLogin(page: any, user: ReturnType<typeof generateUser>) {
  const registerPage = new RegisterPage(page);
  await page.goto('register');
  await registerPage.register(user.username, user.email, user.password);
  await page.waitForURL(/verify-email-sent/, { timeout: 10_000 });
  verifyUserEmail(user.email);

  const loginPage = new UserLoginPage(page);
  await loginPage.navigate();
  await loginPage.login(user.email, user.password);
  await expect(page).not.toHaveURL(/login/, { timeout: 10_000 });
}

/**
 * Повний setup: реєстрація + верифікація + логін + 2FA setup.
 * Повертає email, password, secret.
 */
async function setupUserWith2FA(page: any): Promise<{ email: string; password: string; secret: string }> {
  const user = generateUser();
  await registerAndLogin(page, user);

  const settingsPage = new SettingsSecurityPage(page);
  await settingsPage.navigate();
  const secret = await settingsPage.setup2FA();

  return { email: user.email, password: user.password, secret };
}

/**
 * Повний setup з захопленням backup codes зі сторінки кроку "Save Backup Codes".
 * Інлайн-реалізація (не використовує setup2FA() — потрібен доступ до backup step).
 */
async function setupUserWith2FAAndGetBackupCodes(
  page: any,
): Promise<{ email: string; password: string; secret: string; backupCodes: string[] }> {
  const user = generateUser();
  await registerAndLogin(page, user);

  const settingsPage = new SettingsSecurityPage(page);
  await settingsPage.navigate();

  await page.locator('h3', { hasText: 'Two-Factor Authentication' }).click();
  await page.getByRole('button', { name: /Set Up Authenticator/i }).click();

  // Крок QR — зчитуємо secret
  const secretEl = page.locator('code[x-text="secret"]');
  await secretEl.waitFor({ state: 'visible', timeout: 10_000 });
  await expect(secretEl).not.toBeEmpty({ timeout: 10_000 });
  const secret = (await secretEl.textContent())!.trim();

  // Continue → крок "Save Backup Codes"
  await page.getByRole('button', { name: /Continue/i }).click();
  await page.waitForTimeout(500); // Alpine x-for рендер

  // Захоплюємо backup codes (code[x-text="code"] — 8 кодів)
  const backupCodes = (await page.evaluate(() =>
    Array.from(document.querySelectorAll('code[x-text="code"]'))
      .map((c: any) => c.textContent?.trim())
      .filter(Boolean),
  )) as string[];

  // I've Saved My Codes → крок верифікації
  await page.getByRole('button', { name: /I've Saved My Codes/i }).click();

  // Вводимо TOTP (Alpine x-model: native setter + input event)
  const otpCode = generateTOTPCode(secret);
  const otpInput = page.getByPlaceholder('000000');
  await otpInput.waitFor({ state: 'visible', timeout: 8_000 });
  await otpInput.click();
  await page.evaluate((code: string) => {
    const input = document.querySelector('input[placeholder="000000"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, code);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, otpCode);

  const enableBtn = page.getByRole('button', { name: /Enable Two-Factor Auth/i });
  await expect(enableBtn).toBeEnabled({ timeout: 5_000 });
  await enableBtn.click();

  await expect(page.getByText(/Two-Factor Auth Enabled/i)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForLoadState('networkidle');

  return { email: user.email, password: user.password, secret, backupCodes };
}

/**
 * Клікає "Reset Authenticator", підтверджує confirm() dialog,
 * чекає нового QR і повертає новий secret.
 */
async function clickResetAndGetNewSecret(page: any): Promise<string> {
  // resetOtp() починається з browser confirm() — Playwright відхиляє автоматично,
  // тому реєструємо once-handler ПЕРЕД кліком
  page.once('dialog', (dialog: any) => dialog.accept());
  await page.getByRole('button', { name: /Reset Authenticator/i }).click();

  const secretEl = page.locator('code[x-text="secret"]');
  await secretEl.waitFor({ state: 'visible', timeout: 10_000 });
  await expect(secretEl).not.toBeEmpty({ timeout: 10_000 });

  return (await secretEl.textContent())!.trim();
}

/**
 * Завершує setup після reset: QR (вже відкрито) → Continue → backup step
 * → захоплює нові backup codes → I've Saved → verify → Enable.
 * Повертає нові backup codes.
 */
async function completeResetAndGetNewBackupCodes(page: any, newSecret: string): Promise<string[]> {
  await page.getByRole('button', { name: /Continue/i }).click();
  await page.waitForTimeout(500);

  const newCodes = (await page.evaluate(() =>
    Array.from(document.querySelectorAll('code[x-text="code"]'))
      .map((c: any) => c.textContent?.trim())
      .filter(Boolean),
  )) as string[];

  await page.getByRole('button', { name: /I've Saved My Codes/i }).click();

  const otpCode = generateTOTPCode(newSecret);
  const otpInput = page.getByPlaceholder('000000');
  await otpInput.waitFor({ state: 'visible', timeout: 8_000 });
  await otpInput.click();
  await page.evaluate((code: string) => {
    const input = document.querySelector('input[placeholder="000000"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, code);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, otpCode);

  const enableBtn = page.getByRole('button', { name: /Enable Two-Factor Auth/i });
  await expect(enableBtn).toBeEnabled({ timeout: 5_000 });
  await enableBtn.click();
  await expect(page.getByText(/Two-Factor Auth Enabled/i)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForLoadState('networkidle');

  return newCodes;
}

// ─────────────────────────────────────────────────────────────────────────────

// ── 1. "Two-Factor Authentication" section visible ───────────────────────────

test(
  'Security Settings: "Two-Factor Authentication" section visible in Security tab',
  async ({ page }) => {
    const user = generateUser();
    await registerAndLogin(page, user);

    await page.goto('settings');
    await page.locator('.tab-btn', { hasText: 'Security' }).click();

    // ❌ Якщо секція відсутня — тест впаде і покаже баг
    await expect(
      page.locator('h3', { hasText: 'Two-Factor Authentication' }),
    ).toBeVisible({ timeout: 5_000 });
  },
);

// ── 2. "Reset Authenticator" button visible when 2FA is enabled ──────────────

test(
  'Security Settings: "Reset Authenticator" button visible when 2FA is enabled',
  async ({ page }) => {
    await setupUserWith2FA(page);

    // Після setup2FA() сторінка перезавантажується → re-navigate до Security tab
    const settingsPage = new SettingsSecurityPage(page);
    await settingsPage.navigate();

    await page.locator('h3', { hasText: 'Two-Factor Authentication' }).click();
    await page.waitForTimeout(400);

    // ❌ Якщо кнопки немає — тест впаде і покаже баг
    await expect(
      page.getByRole('button', { name: /Reset Authenticator/i }),
    ).toBeVisible({ timeout: 5_000 });
  },
);

// ── 3. After reset: new secret key + new QR + old OTP invalid ────────────────

test(
  'Security Settings: after Reset Authenticator — new secret and QR generated, old OTP code is invalid',
  async ({ page }) => {
    const { secret: oldSecret } = await setupUserWith2FA(page);

    const settingsPage = new SettingsSecurityPage(page);
    await settingsPage.navigate();
    await page.locator('h3', { hasText: 'Two-Factor Authentication' }).click();
    await page.waitForTimeout(400);

    const newSecret = await clickResetAndGetNewSecret(page);

    // ❌ Якщо секрети однакові — reset не генерує нову пару ключів → баг
    expect(newSecret).not.toBe(oldSecret);

    // Вводимо код зі СТАРОГО secret → на verify кроці
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.getByRole('button', { name: /I've Saved My Codes/i }).click();

    const oldOtpCode = generateTOTPCode(oldSecret);
    const otpInput = page.getByPlaceholder('000000');
    await otpInput.waitFor({ state: 'visible', timeout: 8_000 });
    await otpInput.click();
    await page.evaluate((code: string) => {
      const input = document.querySelector('input[placeholder="000000"]') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, code);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, oldOtpCode);

    const enableBtn = page.getByRole('button', { name: /Enable Two-Factor Auth/i });
    await expect(enableBtn).toBeEnabled({ timeout: 5_000 });
    await enableBtn.click();

    // ❌ Якщо старий код проходить — інвалідація не працює → баг
    await expect(page.getByText(/Two-Factor Auth Enabled/i)).not.toBeVisible({ timeout: 5_000 });
    await expect(
      page.locator('[x-text="error"]').or(page.getByText(/invalid|incorrect|expired/i)),
    ).toBeVisible({ timeout: 5_000 });
  },
);

// ── 4. After reset: verify step (OTP input) required ─────────────────────────

test(
  'Security Settings: after Reset Authenticator — OTP confirmation step is required',
  async ({ page }) => {
    await setupUserWith2FA(page);

    const settingsPage = new SettingsSecurityPage(page);
    await settingsPage.navigate();
    await page.locator('h3', { hasText: 'Two-Factor Authentication' }).click();
    await page.waitForTimeout(400);

    await clickResetAndGetNewSecret(page);

    // Після Reset → модал QR кроку → Continue → backup codes
    await page.getByRole('button', { name: /Continue/i }).click();

    // ❌ Якщо backup codes step не показується — flow broken → баг
    await expect(
      page.getByRole('button', { name: /I've Saved My Codes/i }),
    ).toBeVisible({ timeout: 5_000 });

    // I've Saved My Codes → verify step
    await page.getByRole('button', { name: /I've Saved My Codes/i }).click();

    // ❌ Якщо поле вводу OTP відсутнє — verify step пропущено → баг
    const otpInput = page.getByPlaceholder('000000');
    await expect(otpInput).toBeVisible({ timeout: 8_000 });

    // ❌ Якщо кнопка "Enable Two-Factor Auth" відсутня — verify step неповний → баг
    await expect(
      page.getByRole('button', { name: /Enable Two-Factor Auth/i }),
    ).toBeVisible({ timeout: 5_000 });
  },
);

// ── 5. New backup codes generated, old ones revoked ──────────────────────────

test(
  'Security Settings: after Reset Authenticator — new backup codes generated and old backup codes are revoked',
  async ({ page }) => {
    // Setup з захопленням початкових backup codes
    const { email, password, backupCodes: oldCodes } =
      await setupUserWith2FAAndGetBackupCodes(page);
    console.log('Old backup codes:', oldCodes);

    // ❌ Якщо початкових кодів немає — setup2FA не генерує коди → баг
    expect(oldCodes.length).toBeGreaterThan(0);

    // Navigate → Security → 2FA → Reset
    const settingsPage = new SettingsSecurityPage(page);
    await settingsPage.navigate();
    await page.locator('h3', { hasText: 'Two-Factor Authentication' }).click();
    await page.waitForTimeout(400);

    const newSecret = await clickResetAndGetNewSecret(page);

    // Проходимо reset setup і захоплюємо нові backup codes
    const newCodes = await completeResetAndGetNewBackupCodes(page, newSecret);
    console.log('New backup codes:', newCodes);

    // ❌ Якщо нових кодів немає — reset не генерує нові коди → баг
    expect(newCodes.length).toBeGreaterThan(0);

    // ❌ Якщо нові коди збігаються зі старими — коди не були замінені → баг
    const hasOverlap = oldCodes.some((c) => newCodes.includes(c));
    expect(hasOverlap).toBe(false);

    // ─── Перевірка що старі backup codes заблоковані на login ────────────────

    // Логаут через очищення сесії
    await page.context().clearCookies();

    // Логін → OTP форма (2FA увімкнено)
    const loginPage = new UserLoginPage(page);
    await loginPage.navigate();
    await loginPage.login(email, password);
    await expect(page.locator('input[name="code"]')).toBeVisible({ timeout: 8_000 });

    // Клікаємо "Use a backup code instead"
    const useBackupBtn = page.getByRole('button', { name: /Use a backup code instead/i });
    await expect(useBackupBtn).toBeVisible({ timeout: 5_000 });
    await useBackupBtn.click();

    // Вводимо СТАРИЙ backup code
    const oldCode = oldCodes[0]!;
    // backup code input — очікуємо input[name="backup_code"] або input з maxlength=8
    const backupInput = page.locator('input[name="backup_code"]')
      .or(page.locator('input[maxlength="8"]'))
      .first();
    await backupInput.waitFor({ state: 'visible', timeout: 5_000 });
    await backupInput.fill(oldCode);

    await page.getByRole('button', { name: /Verify/i }).click();

    // ❌ Якщо старий код прийнятий → він не відкликаний → баг
    // Перевіряємо що юзер НЕ залогінений (залишається на /login)
    await page.waitForTimeout(2_000);
    await expect(page).toHaveURL(/login/, { timeout: 5_000 });

    // Повідомлення про помилку — код не прийнятий
    await expect(
      page.getByText(/invalid|not found|revoked|expired|incorrect/i),
    ).toBeVisible({ timeout: 5_000 });
  },
);
