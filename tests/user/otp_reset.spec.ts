/**
 * OTP Reset — перевірка флоу скидання Google Authenticator
 *
 * Як працює resetOtp():
 *  1. Показує browser confirm() dialog
 *  2. POST /settings/otp/reset → сервер генерує НОВИЙ pending secret
 *  3. dispatch CustomEvent('otp-setup') → відкривається setup-модал з новим QR
 *  4. Юзер повинен підтвердити новий код (POST /settings/otp/confirm)
 *
 * Тест 1 — Invalidation: після Reset старий OTP код повинен НЕ проходити
 * Тест 2 — Verification: новий OTP код після Reset повинен проходити
 * Тест 3 — Double Reset: другий Reset інвалідує перший QR
 */

import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { RegisterPage } from '../../page-objects/user/RegisterPage';
import { UserLoginPage } from '../../page-objects/user/UserLoginPage';
import { SettingsSecurityPage } from '../../page-objects/user/SettingsSecurityPage';
import { verifyUserEmail } from '../../utils/db-helpers';
import { generateTOTPCode } from '../../utils/otp-helpers';

test.use({ storageState: { cookies: [], origins: [] } });

function generateUser() {
  const suffix = faker.string.numeric(6);
  return {
    username: `user_${suffix}`,
    email: faker.internet.email().toLowerCase(),
    password: 'TestPass123!',
  };
}

/**
 * Повна реєстрація + верифікація + логін + налаштування 2FA.
 * Повертає otpSecret первинного налаштування.
 */
async function setupUserWith2FA(page: any): Promise<string> {
  const user = generateUser();

  const registerPage = new RegisterPage(page);
  await page.goto('register');
  await registerPage.register(user.username, user.email, user.password);
  await page.waitForURL(/verify-email-sent/, { timeout: 10_000 });
  verifyUserEmail(user.email);

  const loginPage = new UserLoginPage(page);
  await loginPage.navigate();
  await loginPage.login(user.email, user.password);
  await expect(page).not.toHaveURL(/login/, { timeout: 10_000 });

  const settingsPage = new SettingsSecurityPage(page);
  await settingsPage.navigate();
  return await settingsPage.setup2FA();
}

/**
 * Клікає "Reset Authenticator", підтверджує confirm() dialog,
 * чекає появи модалки з новим QR і повертає новий secret.
 */
async function clickResetAndGetNewSecret(page: any): Promise<string> {
  // Приймаємо browser confirm() dialog (інакше Playwright відхиляє автоматично)
  page.once('dialog', (dialog: any) => dialog.accept());

  await page.getByRole('button', { name: /Reset Authenticator/i }).click();

  // Після підтвердження: POST /settings/otp/reset → dispatch otp-setup → modal відкривається
  const secretEl = page.locator('code[x-text="secret"]');
  await secretEl.waitFor({ state: 'visible', timeout: 10_000 });
  await expect(secretEl).not.toBeEmpty({ timeout: 10_000 });

  return (await secretEl.textContent())!.trim();
}

/**
 * Заповнює OTP verify крок модалки і клікає "Enable Two-Factor Auth".
 * Повертає true якщо success, false якщо error.
 */
async function enterOtpInResetModal(page: any, secret: string): Promise<boolean> {
  // Переходимо до verify кроку
  await page.getByRole('button', { name: /Continue/i }).click();
  await page.getByRole('button', { name: /I've Saved My Codes/i }).click();

  const otpCode = generateTOTPCode(secret);
  const otpInput = page.getByPlaceholder('000000');
  await otpInput.waitFor({ state: 'visible', timeout: 8_000 });

  // Alpine x-model: native setter + input event
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

  // Перевіряємо чи з'явився success або error
  const success = page.getByText(/Two-Factor Auth Enabled/i);
  const error = page.locator('[x-text="error"]').or(page.getByText(/invalid|incorrect|expired|error/i));

  const result = await Promise.race([
    success.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'success'),
    error.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'error'),
  ]).catch(() => 'timeout');

  return result === 'success';
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Check Reset Authenticator flow', () => {
  test(
    'OTP Reset - Invalidation Test: entering old OTP code after Reset shows error',
    async ({ page }) => {
      const oldSecret = await setupUserWith2FA(page);

      // Відкриваємо settings → Security → 2FA section
      const settingsPage = new SettingsSecurityPage(page);
      await settingsPage.navigate();
      await page.locator('h3', { hasText: 'Two-Factor Authentication' }).click();
      await page.waitForTimeout(400);

      // Клікаємо Reset → отримуємо нові QR і secret
      const newSecret = await clickResetAndGetNewSecret(page);
      console.log('Old secret:', oldSecret);
      console.log('New secret:', newSecret);

      // Перевіряємо що секрети РІЗНІ (reset дійсно генерує новий)
      // ❌ Якщо секрети однакові — reset не працює → тест впаде і покаже баг
      expect(newSecret).not.toBe(oldSecret);

      // Вводимо код зі СТАРОГО secret → повинна бути помилка
      // ❌ Якщо старий код проходить — інвалідація не працює → тест впаде і покаже баг
      const success = await enterOtpInResetModal(page, oldSecret);
      expect(success).toBe(false);
    },
  );

  test(
    'OTP Reset - Verification Test: entering new OTP code after Reset succeeds',
    async ({ page }) => {
      await setupUserWith2FA(page);

      const settingsPage = new SettingsSecurityPage(page);
      await settingsPage.navigate();
      await page.locator('h3', { hasText: 'Two-Factor Authentication' }).click();
      await page.waitForTimeout(400);

      // Клікаємо Reset → новий secret
      const newSecret = await clickResetAndGetNewSecret(page);

      // Вводимо код з НОВОГО secret → повинен проходити
      // ❌ Якщо новий код не проходить — reset не працює коректно → тест впаде
      const success = await enterOtpInResetModal(page, newSecret);
      expect(success).toBe(true);
    },
  );

  test(
    'OTP Reset - Double Reset Test: second Reset invalidates first QR',
    async ({ page }) => {
      await setupUserWith2FA(page);

      const settingsPage = new SettingsSecurityPage(page);
      await settingsPage.navigate();
      await page.locator('h3', { hasText: 'Two-Factor Authentication' }).click();
      await page.waitForTimeout(400);

      // Перший Reset → QR #1 / secret1
      // Після Reset: 2FA стає "Disabled", кнопка змінюється на "Set Up Authenticator"
      const secret1 = await clickResetAndGetNewSecret(page);
      console.log('QR1 secret:', secret1);

      // Навігація назад до settings — закриває поточний модал без підтвердження
      await settingsPage.navigate();
      await page.locator('h3', { hasText: 'Two-Factor Authentication' }).click();
      await page.waitForTimeout(400);

      // Другий "Reset" — клік "Set Up Authenticator" (2FA тепер Disabled)
      // Сервер генерує QR #2, що інвалідує QR #1
      page.once('dialog', (dialog: any) => dialog.accept());
      await page.getByRole('button', { name: /Set Up Authenticator/i }).click();

      const secretEl = page.locator('code[x-text="secret"]');
      await secretEl.waitFor({ state: 'visible', timeout: 10_000 });
      await expect(secretEl).not.toBeEmpty({ timeout: 10_000 });
      const secret2 = (await secretEl.textContent())!.trim();
      console.log('QR2 secret:', secret2);

      // QR2 повинен відрізнятись від QR1
      expect(secret2).not.toBe(secret1);

      // Вводимо код від QR #1 → повинна бути помилка (QR1 вже інвалідований QR2)
      // ❌ Якщо QR1 все ще проходить — сервер не інвалідує попередні pending secrets → баг
      const success = await enterOtpInResetModal(page, secret1);
      expect(success).toBe(false);
    },
  );
});
