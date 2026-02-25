/**
 * OTP Setup — Модуль перевірки налаштування двофакторної автентифікації
 * Тести перевіряють UI та поведінку кроку налаштування Google Authenticator.
 */

import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { RegisterPage } from '../../page-objects/user/RegisterPage';
import { UserLoginPage } from '../../page-objects/user/UserLoginPage';
import { verifyUserEmail, getVerificationToken } from '../../utils/db-helpers';

test.use({ storageState: { cookies: [], origins: [] } });

function generateUser() {
  const suffix = faker.string.numeric(6);
  return {
    username: `user_${suffix}`,
    email: faker.internet.email().toLowerCase(),
    password: 'TestPass123!',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Redirect після реєстрації
// ─────────────────────────────────────────────────────────────────────────────

test.describe('OTP Setup - Redirect', () => {
  test(
    'OTP Setup: After success registration, system redirects to user settings, where user setups OTP setting',
    async ({ page }) => {
      const user = generateUser();
      const registerPage = new RegisterPage(page);

      // Реєстрація
      await page.goto('register');
      await registerPage.register(user.username, user.email, user.password);
      await page.waitForURL(/verify-email-sent/, { timeout: 10_000 });

      // Верифікація через токен (E2E — без прямого DB-запиту)
      const token = getVerificationToken(user.email);
      await page.goto(`verify-email?token=${token}`);
      await page.waitForLoadState('domcontentloaded');

      // Логін на сторінці верифікації
      await page.locator('input[name="identifier"]').fill(user.email);
      await page.locator('input[name="password"]').fill(user.password);
      await page.getByRole('button', { name: /Sign In/i }).click();

      // Після першого логіну → редирект на settings (security tab із 2FA setup)
      await expect(page).toHaveURL(/settings/, { timeout: 10_000 });

      // На сторінці повинна бути видима секція "Two-Factor Authentication"
      // ❌ Якщо секція не відкрита або не існує — тест впаде і покаже баг
      await expect(
        page.locator('h3', { hasText: 'Two-Factor Authentication' }),
      ).toBeVisible({ timeout: 8_000 });

      // Кнопка налаштування 2FA повинна бути доступна
      // (секція може бути згорнута — клікаємо щоб розгорнути)
      await page.locator('h3', { hasText: 'Two-Factor Authentication' }).click();
      await expect(
        page.getByRole('button', { name: /Set Up Authenticator/i }),
      ).toBeVisible({ timeout: 5_000 });
    },
  );

  test(
    'OTP Setup: User cannot get access to all pages except user profile before OTP setup',
    async ({ page }) => {
      const user = generateUser();
      const registerPage = new RegisterPage(page);

      // Реєстрація + верифікація email через DB
      await page.goto('register');
      await registerPage.register(user.username, user.email, user.password);
      await page.waitForURL(/verify-email-sent/, { timeout: 10_000 });
      verifyUserEmail(user.email);

      // Логін (2FA ще не налаштована)
      const loginPage = new UserLoginPage(page);
      await loginPage.navigate();
      await loginPage.login(user.email, user.password);
      await expect(page).not.toHaveURL(/login/, { timeout: 10_000 });

      // Сторінка /accounts відкривається, але повинна показувати модалку "Secure Your Account"
      // із пропозицією налаштувати 2FA — без неї контент недоступний
      await page.goto('accounts');
      await page.waitForTimeout(1_000);

      // Модалка з вимогою налаштувати 2FA
      await expect(page.getByText('Secure Your Account')).toBeVisible({ timeout: 5_000 });
      await expect(
        page.getByText(/Two-factor authentication adds an extra layer of security/i),
      ).toBeVisible();
      // Кнопка — це <a href="/settings?tab=security">, не <button>
      await expect(page.getByRole('link', { name: /Set Up Authenticator/i })).toBeVisible();
      await expect(
        page.getByText(/Required to access your accounts and transactions/i),
      ).toBeVisible();
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// UI модалки налаштування OTP (QR крок)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('OTP Setup - Modal UI', () => {
  test.beforeEach(async ({ page }) => {
    const user = generateUser();

    // Реєстрація
    const registerPage = new RegisterPage(page);
    await page.goto('register');
    await registerPage.register(user.username, user.email, user.password);
    await page.waitForURL(/verify-email-sent/, { timeout: 10_000 });

    // Верифікація email через DB
    verifyUserEmail(user.email);

    // Логін
    const loginPage = new UserLoginPage(page);
    await loginPage.navigate();
    await loginPage.login(user.email, user.password);
    await expect(page).not.toHaveURL(/login/, { timeout: 10_000 });

    // Відкриваємо settings → Security tab
    await page.goto('settings');
    await page.locator('.tab-btn', { hasText: 'Security' }).click();

    // Розгортаємо 2FA секцію та відкриваємо модалку
    await page.locator('h3', { hasText: 'Two-Factor Authentication' }).click();
    await page.getByRole('button', { name: /Set Up Authenticator/i }).click();

    // Чекаємо QR крок (secret з'являється після AJAX)
    await page.locator('code[x-text="secret"]').waitFor({ state: 'visible', timeout: 10_000 });
    await expect(page.locator('code[x-text="secret"]')).not.toBeEmpty({ timeout: 10_000 });
  });

  test(
    'OTP Setup: A QR code is displayed for scanning with Google Authenticator',
    async ({ page }) => {
      // QR-код рендериться як <img> з base64 data або <svg>
      // ❌ Якщо QR відсутній або src порожній — тест впаде і покаже баг
      const qrImage = page.locator('img[src*="data:image"], img[alt*="QR"], img[alt*="qr"], canvas, svg').first();
      await expect(qrImage).toBeVisible({ timeout: 8_000 });

      // Перевіряємо що QR не є порожнім зображенням (src не порожній)
      const tag = await qrImage.evaluate((el) => el.tagName.toLowerCase());
      if (tag === 'img') {
        const src = await qrImage.getAttribute('src');
        expect(src).toBeTruthy();
        expect(src!.length).toBeGreaterThan(10);
      }
    },
  );

  test(
    'OTP Setup: Secret key is shown in text format below QR code (for manual entry)',
    async ({ page }) => {
      const secretEl = page.locator('code[x-text="secret"]');

      // Secret повинен бути видимий
      await expect(secretEl).toBeVisible();

      // Secret повинен містити alphanumeric текст (Base32: A-Z, 2-7)
      const secret = (await secretEl.textContent())!.trim();
      expect(secret).toBeTruthy();
      // ❌ Якщо secret порожній або не Base32 формату — тест впаде і покаже баг
      expect(secret).toMatch(/^[A-Z2-7]+=*$/i);
      expect(secret.length).toBeGreaterThanOrEqual(16);
    },
  );

  test(
    'OTP Setup: Instructions are provided: "Download Google Authenticator, scan the QR code, and enter the 6-digit code to confirm" is present and typo-free',
    async ({ page }) => {
      // Перевіряємо точний текст інструкцій (з чеклисту)
      // ❌ Якщо текст відсутній або з друкарською помилкою — тест впаде і покаже баг
      await expect(
        page.getByText(/Download Google Authenticator/i),
      ).toBeVisible({ timeout: 5_000 });

      await expect(
        page.getByText(/scan the QR code/i),
      ).toBeVisible({ timeout: 5_000 });

      await expect(
        page.getByText(/enter the 6.?digit code/i).first(),
      ).toBeVisible({ timeout: 5_000 });
    },
  );

  test(
    'OTP Setup: Check Input field for 6-digit confirmation code',
    async ({ page }) => {
      // Переходимо далі: QR крок → Backup codes крок → Verify крок
      await page.getByRole('button', { name: /Continue/i }).click();
      await page.getByRole('button', { name: /I've Saved My Codes/i }).click();

      // Verify крок: поле для введення 6-значного OTP коду
      const otpInput = page.getByPlaceholder('000000');
      await expect(otpInput).toBeVisible({ timeout: 8_000 });

      // Поле приймає лише 6 цифр (maxlength="6" або pattern="[0-9]{6}")
      const maxLength = await otpInput.getAttribute('maxlength');
      // ❌ Якщо maxlength не встановлений або != 6 — тест впаде і покаже баг
      expect(maxLength).toBe('6');

      // Перевіряємо що поле type="text" або type="number" (не password)
      const inputType = await otpInput.getAttribute('type');
      expect(['text', 'number', 'tel']).toContain(inputType);

      // Кнопка "Enable Two-Factor Auth" задизейблена поки не введено код
      const enableBtn = page.getByRole('button', { name: /Enable Two-Factor Auth/i });
      await expect(enableBtn).toBeDisabled();
    },
  );
});
