/**
 * OTP Login — перевірка флоу введення OTP-коду при логіні
 *
 * Після введення email + password (з активною 2FA):
 *  → редирект на /login/otp — inline OTP-форма на тій самій сторінці
 *
 * Тести:
 *  1. Після успішної перевірки пароля — відкривається OTP форма
 *  2. Поле вводу для 6-значного OTP-коду
 *  3. Невалідний OTP → "Invalid authentication code. Please try again."
 *  4. "Lost access to authenticator?" → вхід з обмеженим доступом до settings
 *  5. Після 5 невдалих спроб → "Too many failed attempts. Your account is locked for 30 minutes."
 */

import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { RegisterPage } from '../../page-objects/user/RegisterPage';
import { UserLoginPage } from '../../page-objects/user/UserLoginPage';
import { SettingsSecurityPage } from '../../page-objects/user/SettingsSecurityPage';
import { verifyUserEmail } from '../../utils/db-helpers';

test.use({ storageState: { cookies: [], origins: [] } });

// ─── Shared user з 2FA (створюється один раз для тестів 1–4) ────────────────

let sharedUser: { email: string; password: string };

test.describe('OTP Login flow', () => {
  test.beforeAll(async ({ browser }) => {
    const suffix = faker.string.numeric(6);
    sharedUser = {
      email: faker.internet.email().toLowerCase(),
      password: 'TestPass123!',
    };
    const username = `user_${suffix}`;

    const ctx = await browser.newContext({ baseURL: process.env.USER_URL });
    const page = await ctx.newPage();

    const registerPage = new RegisterPage(page);
    await page.goto('register');
    await registerPage.register(username, sharedUser.email, sharedUser.password);
    await page.waitForURL(/verify-email-sent/, { timeout: 15_000 });
    verifyUserEmail(sharedUser.email);

    const loginPage = new UserLoginPage(page);
    await loginPage.navigate();
    await loginPage.login(sharedUser.email, sharedUser.password);
    await page.waitForTimeout(2_000);

    const settingsPage = new SettingsSecurityPage(page);
    await settingsPage.navigate();
    await settingsPage.setup2FA();

    await ctx.close();
  });

  /**
   * Навігує до /login і вводить credentials shared user.
   * OTP-форма з'являється як overlay на /login (URL не змінюється до першого сабміту).
   */
  async function goToOtpForm(page: any) {
    const loginPage = new UserLoginPage(page);
    await loginPage.navigate();
    await loginPage.login(sharedUser.email, sharedUser.password);
    // Чекаємо поки OTP-модалка появиться (не URL — він залишається /login до першого сабміту)
    await expect(page.locator('input[name="code"]')).toBeVisible({ timeout: 8_000 });
  }

  // ── 1. Після пароля — відкривається OTP форма ────────────────────────────

  test(
    'OTP Login: after successful password verification OTP code form opens',
    async ({ page }) => {
      const loginPage = new UserLoginPage(page);
      await loginPage.navigate();
      await loginPage.login(sharedUser.email, sharedUser.password);

      // OTP-форма показується як overlay (URL залишається /login до першого сабміту OTP)
      await expect(
        page.getByText(/Two-Factor Authentication/i),
      ).toBeVisible({ timeout: 8_000 });

      await expect(
        page.getByText(/Enter the 6-digit code from your authenticator app/i),
      ).toBeVisible();

      // Форма на тій самій сторінці — URL /login (не /login/otp, поки не зроблено перший сабміт)
      await expect(page).toHaveURL(/login/);
    },
  );

  // ── 2. Поле вводу для 6-значного OTP-коду ────────────────────────────────

  test(
    'OTP Login: input field for 6-digit OTP code is present and configured correctly',
    async ({ page }) => {
      await goToOtpForm(page);

      const otpInput = page.locator('input[name="code"]');
      await expect(otpInput).toBeVisible();

      // Поле повинне приймати лише 6 символів
      // ❌ Якщо maxlength != 6 — тест впаде і покаже баг
      const maxLength = await otpInput.getAttribute('maxlength');
      expect(maxLength).toBe('6');

      // Кнопка Verify — активна (форма готова до введення)
      await expect(page.getByRole('button', { name: /Verify/i })).toBeVisible();
    },
  );

  // ── 3. Невалідний OTP → error message ─────────────────────────────────────

  test(
    'OTP Login: when entering invalid OTP code, error message shows "Invalid authentication code. Please try again"',
    async ({ page }) => {
      await goToOtpForm(page);

      await page.locator('input[name="code"]').fill('000000');
      await page.getByRole('button', { name: /Verify/i }).click();

      // ❌ Якщо помилка не показується або текст інший — тест впаде
      await expect(
        page.getByText(/Invalid authentication code\. Please try again/i),
      ).toBeVisible({ timeout: 8_000 });

      // Після першого сабміту URL змінюється на /login/otp — форма залишається
      await expect(page).toHaveURL(/login/);
    },
  );

  // ── 4. "Lost access to authenticator?" → restricted access ───────────────

  test(
    'OTP Login: "Lost access to authenticator?" logs in to platform with restricted access',
    async ({ page }) => {
      await goToOtpForm(page);

      // Кнопка "Lost access to authenticator?" видима на OTP формі
      const lostAccessBtn = page.getByRole('button', {
        name: /Lost access to authenticator/i,
      });
      await expect(lostAccessBtn).toBeVisible();

      await lostAccessBtn.click();

      // Після кліку — юзер залогінений, редирект на settings (для скидання 2FA)
      // ❌ Якщо залишається на /login/otp або редиректує кудись не туди — тест впаде
      await expect(page).not.toHaveURL(/login/, { timeout: 10_000 });
      await expect(page).toHaveURL(/settings/, { timeout: 10_000 });

      // Settings/Security сторінка — юзер може скинути 2FA
      // Шукаємо h3-заголовок (унікальний елемент, уникаємо strict mode violation)
      await expect(
        page.locator('h3', { hasText: 'Two-Factor Authentication' }),
      ).toBeVisible({ timeout: 5_000 });

      // Доступ обмежений — спроба перейти на /accounts редиректить назад на /settings
      // (клік по будь-якій вкладці залишає юзера в settings)
      // ❌ Якщо /accounts дійсно відкривається — bypass 2FA → баг
      await page.goto('accounts');
      await page.waitForTimeout(1_000);

      await expect(page).not.toHaveURL(/accounts/, { timeout: 5_000 });
    },
  );
});

// ─── Тест 5: Lockout (окремий юзер, деструктивний тест) ─────────────────────

test(
  'OTP Login: after 5 failed OTP attempts user is locked for 30 minutes',
  async ({ page }) => {
    const suffix = faker.string.numeric(6);
    const user = {
      username: `user_${suffix}`,
      email: faker.internet.email().toLowerCase(),
      password: 'TestPass123!',
    };

    // Реєстрація + верифікація + setup 2FA
    const registerPage = new RegisterPage(page);
    await page.goto('register');
    await registerPage.register(user.username, user.email, user.password);
    await page.waitForURL(/verify-email-sent/, { timeout: 10_000 });
    verifyUserEmail(user.email);

    const loginPage = new UserLoginPage(page);
    await loginPage.navigate();
    await loginPage.login(user.email, user.password);
    await page.waitForTimeout(2_000);

    const settingsPage = new SettingsSecurityPage(page);
    await settingsPage.navigate();
    await settingsPage.setup2FA();

    // Logout та логін → OTP форма (modal overlay на /login)
    await page.context().clearCookies();
    await loginPage.navigate();
    await loginPage.login(user.email, user.password);
    // OTP форма з'являється як overlay — чекаємо поле вводу, а не URL
    await expect(page.locator('input[name="code"]')).toBeVisible({ timeout: 8_000 });

    // 4 невдалих спроби → помилка "Invalid authentication code"
    for (let i = 1; i <= 4; i++) {
      await page.locator('input[name="code"]').fill('000000');
      await page.getByRole('button', { name: /Verify/i }).click();
      await expect(
        page.getByText(/Invalid authentication code\. Please try again/i),
      ).toBeVisible({ timeout: 5_000 });
    }

    // 5-та спроба → lockout повідомлення
    await page.locator('input[name="code"]').fill('000000');
    await page.getByRole('button', { name: /Verify/i }).click();

    // ❌ Якщо після 5 спроб не показується lockout — тест впаде і покаже баг
    await expect(
      page.getByText(/Too many failed attempts\. Your account is locked for 30 minutes/i),
    ).toBeVisible({ timeout: 8_000 });

    // Юзер залишається на OTP формі (не залогінений)
    await expect(page).toHaveURL(/login/);

    // 6-та спроба — акаунт все ще заблокований
    await page.locator('input[name="code"]').fill('111111');
    await page.getByRole('button', { name: /Verify/i }).click();
    await expect(
      page.getByText(/Too many failed attempts\. Your account is locked for 30 minutes/i),
    ).toBeVisible({ timeout: 5_000 });
  },
);
