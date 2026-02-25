/**
 * Register — Модуль перевірки реєстрації
 * Тести додаються по одному, кожен узгоджується перед запуском.
 */

import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { RegisterPage } from '../../page-objects/user/RegisterPage';
import { getVerificationToken, isEmailVerified } from '../../utils/db-helpers';

test.use({ storageState: { cookies: [], origins: [] } });

function generateUser() {
  const suffix = faker.string.numeric(6);
  return {
    username: `user_${suffix}`,
    email: faker.internet.email().toLowerCase(),
    password: 'TestPass123!',
  };
}

test.describe('Basic Checks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('register');
  });

  test(
    'Register: User can successfully create an account by entering a valid username, email, password, and confirming the password.',
    async ({ page }) => {
      const user = generateUser();
      const registerPage = new RegisterPage(page);
      await registerPage.register(user.username, user.email, user.password);

      await expect(page).toHaveURL(/verify-email-sent/, { timeout: 10_000 });
    },
  );

  test(
    'Register: User cannot create an account when required fields are empty.',
    async ({ page }) => {
      await page.getByRole('button', { name: /Create Account/i }).click();

      // Форма не сабмітилась — залишаємось на /register
      await expect(page).toHaveURL(/register/);

      // Браузер встановив повідомлення про помилку на першому required полі (username)
      const validationMessage = await page
        .locator('input[name="username"]')
        .evaluate((el: HTMLInputElement) => el.validationMessage);
      expect(validationMessage).not.toBe('');
    },
  );

  test(
    'Register: The password strength indicator updates correctly as the user types in their password.',
    async ({ page }) => {
      const passwordInput = page.locator('input[name="password"]');
      // 3 бари індикатора — div.h-1 всередині flex-контейнера під полем пароля
      const bars = page.locator('div.mt-2.flex.gap-1 > div.h-1');

      // Порожнє поле — всі бари неактивні (bg-dark-200)
      await expect(bars.nth(0)).toHaveClass(/bg-dark-200/);
      await expect(bars.nth(1)).toHaveClass(/bg-dark-200/);
      await expect(bars.nth(2)).toHaveClass(/bg-dark-200/);

      // Слабкий пароль (< 8 символів) — тільки бар 1 активний (bg-danger)
      await passwordInput.fill('Abc1!');
      await expect(bars.nth(0)).toHaveClass(/bg-danger/);
      await expect(bars.nth(1)).toHaveClass(/bg-dark-200/);
      await expect(bars.nth(2)).toHaveClass(/bg-dark-200/);

      // Середній пароль (8–11 символів) — бари 1–2 жовті (bg-warning)
      await passwordInput.fill('Abcde1!x');
      await expect(bars.nth(0)).toHaveClass(/bg-warning/);
      await expect(bars.nth(1)).toHaveClass(/bg-warning/);
      await expect(bars.nth(2)).toHaveClass(/bg-dark-200/);

      // Сильний пароль (12+ символів) — всі 3 бари зелені (bg-success)
      await passwordInput.fill('Abcde1!xYzWq');
      await expect(bars.nth(0)).toHaveClass(/bg-success/);
      await expect(bars.nth(1)).toHaveClass(/bg-success/);
      await expect(bars.nth(2)).toHaveClass(/bg-success/);
    },
  );

  test(
    'Register: The password strength indicator does not advance past "weak" until the password reaches the required length.',
    async ({ page }) => {
      const passwordInput = page.locator('input[name="password"]');
      const bars = page.locator('div.mt-2.flex.gap-1 > div.h-1');

      // 7 символів — один символ до порогу 8 — бари 2 і 3 повинні залишатись неактивними
      await passwordInput.fill('Abcde1!');
      await expect(bars.nth(0)).toHaveClass(/bg-danger/);
      await expect(bars.nth(1)).toHaveClass(/bg-dark-200/);
      await expect(bars.nth(2)).toHaveClass(/bg-dark-200/);

      // 11 символів — один символ до порогу 12 — бар 3 ще не зелений
      await passwordInput.fill('Abcde1!xYzW');
      await expect(bars.nth(0)).toHaveClass(/bg-warning/);
      await expect(bars.nth(1)).toHaveClass(/bg-warning/);
      await expect(bars.nth(2)).toHaveClass(/bg-dark-200/);
    },
  );

  test(
    'Register: The password strength indicator resets to inactive when the password field is cleared.',
    async ({ page }) => {
      const passwordInput = page.locator('input[name="password"]');
      const bars = page.locator('div.mt-2.flex.gap-1 > div.h-1');

      // Вводимо сильний пароль — всі бари зелені
      await passwordInput.fill('Abcde1!xYzWq');
      await expect(bars.nth(0)).toHaveClass(/bg-success/);

      // Очищуємо поле — всі бари повертаються до неактивного стану
      await passwordInput.clear();
      await expect(bars.nth(0)).toHaveClass(/bg-dark-200/);
      await expect(bars.nth(1)).toHaveClass(/bg-dark-200/);
      await expect(bars.nth(2)).toHaveClass(/bg-dark-200/);
    },
  );

  test(
    'Register: The "Create Account" button is enabled only when the password and confirm password fields match.',
    async ({ page }) => {
      const registerPage = new RegisterPage(page);
      const createBtn = registerPage.createAccountButton;

      // ✅ Паролі співпадають — кнопка активна
      await registerPage.fillPassword('TestPass123!');
      await registerPage.fillConfirmPassword('TestPass123!');
      await expect(createBtn).toBeEnabled();

      // ❌ Паролі різні — кнопка задизейблена
      await registerPage.fillConfirmPassword('DifferentPass456!');
      await expect(createBtn).toBeDisabled();

      // ❌ Confirm password порожній, password заповнений — кнопка задизейблена
      await registerPage.fillConfirmPassword('');
      await expect(createBtn).toBeDisabled();
    },
  );

  test(
    'Register: Register User already exists',
    async ({ page }) => {
      const registerPage = new RegisterPage(page);
      // Реєструємось з вже існуючим email із .env
      await registerPage.register('newuniqueuser', process.env.USER_EMAIL!, 'TestPass123!');

      await expect(
        page.getByText(/already exists|already registered|email.*taken|account.*exists/i),
      ).toBeVisible({ timeout: 10_000 });
    },
  );
});

test.describe('Check Email activation/verification', () => {
  let testUser: { username: string; email: string; password: string };

  test.beforeEach(async ({ page }) => {
    testUser = generateUser();
    const registerPage = new RegisterPage(page);
    await page.goto('register');
    await registerPage.register(testUser.username, testUser.email, testUser.password);
    await page.waitForURL(/verify-email-sent/, { timeout: 10_000 });
  });

  // ── Повідомлення після реєстрації ───────────────────────────────────────

  test(
    'Register: after completing registration, user sees message: "Please check your email to verify your account"',
    async ({ page }) => {
      // h1: "Check Your Email", p: "We've sent a verification link to your inbox"
      await expect(page.getByRole('heading', { name: /Check Your Email/i })).toBeVisible();
      await expect(page.getByText(/We've sent a verification link to your inbox/i)).toBeVisible();
    },
  );

  test(
    'Register: unverified user sees error when trying to log in before email verification',
    async ({ page }) => {
      await page.goto('login');
      await page.locator('input[name="identifier"]').fill(testUser.email);
      await page.locator('input[name="password"]').fill(testUser.password);
      await page.getByRole('button', { name: /Sign In/i }).click();

      await expect(
        page.getByText(/Please verify your email before logging in/i),
      ).toBeVisible({ timeout: 8_000 });
    },
  );

  // ── Доступ до платформи ─────────────────────────────────────────────────

  test(
    'Register: User cannot access platform until email is verified',
    async ({ page }) => {
      // Незалогінений юзер пробує потрапити на accounts → редирект на login
      await page.goto('accounts');
      await expect(page).toHaveURL(/login/, { timeout: 8_000 });
    },
  );

  test(
    'Register: after email verification user can successfully log in',
    async ({ page }) => {
      const token = getVerificationToken(testUser.email);
      await page.goto(`verify-email?token=${token}`);
      await page.waitForLoadState('domcontentloaded');

      await page.locator('input[name="identifier"]').fill(testUser.email);
      await page.locator('input[name="password"]').fill(testUser.password);
      await page.getByRole('button', { name: /Sign In/i }).click();

      // Після першого логіну після верифікації — редирект на /settings (2FA setup)
      // ❌ Якщо редирект веде кудись інше або залишається /login — тест впаде
      await expect(page).toHaveURL(/settings/, { timeout: 10_000 });
    },
  );

  // ── Success page ────────────────────────────────────────────────────────

  test(
    'Register: After registration open success page: "Verification email sent! Please check your inbox" with countdown timer: "You can request another email in X minutes"',
    async ({ page }) => {
      // Статичне повідомлення (не Alpine.js resendSuccess)
      await expect(
        page.getByText(/Verification email has been sent\. Please check your inbox/i),
      ).toBeVisible();

      // Countdown — Alpine.js x-show="cooldown > 0", cooldown стартує з 60
      await expect(
        page.getByText(/You can request another email in/i),
      ).toBeVisible();
    },
  );

  test(
    'Register: success page "Check Your Email" heading is not shown on the registration form page',
    async ({ page }) => {
      await page.goto('register');
      await expect(page.getByRole('heading', { name: /Check Your Email/i })).not.toBeVisible();
    },
  );

  // ── Email вміст (потребує email-провайдера) ─────────────────────────────

  test.skip('Register: Verification email sent after registration', async () => {
    // TODO: потребує Mailhog/Mailpit або Mailgun API
  });

  test.skip('Register: Email subject: "Verify your email address for Citadel Core"', async () => {
    // TODO: потребує email-провайдера
  });

  test.skip('Register: Email contains: Welcome message', async () => {});
  test.skip('Register: Email contains: "Verify Email Address" button/link', async () => {});
  test.skip('Register: Email contains: Link with expiration time (valid for 24 hours)', async () => {});
  test.skip(
    'Register: Email contains: Support contact if user did not register — mailto:support@citadel-core.pp.ua',
    async () => {},
  );

  // ── Верифікаційне посилання ─────────────────────────────────────────────

  test(
    'Register: Clicking verification link opens login page',
    async ({ page }) => {
      const token = getVerificationToken(testUser.email);
      await page.goto(`verify-email?token=${token}`);

      await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible({ timeout: 8_000 });
    },
  );

  test(
    'Register: Clicking verification link with invalid token shows error, not login success',
    async ({ page }) => {
      await page.goto('verify-email?token=invalid-token-abc123');

      await expect(
        page.getByText(/Invalid or expired verification link/i),
      ).toBeVisible({ timeout: 8_000 });
    },
  );

  // ── Статус акаунту ──────────────────────────────────────────────────────

  test(
    'Register: If token is valid: account status changes to "verified"',
    async ({ page }) => {
      expect(isEmailVerified(testUser.email)).toBe(false);

      const token = getVerificationToken(testUser.email);
      await page.goto(`verify-email?token=${token}`);
      await page.waitForLoadState('domcontentloaded');

      expect(isEmailVerified(testUser.email)).toBe(true);
    },
  );

  test(
    'Register: account status is "not verified" before clicking the verification link',
    async () => {
      expect(isEmailVerified(testUser.email)).toBe(false);
    },
  );

  // ── Success message ─────────────────────────────────────────────────────

  test(
    'Register: If token is valid: success message: "Email verified successfully! You can now access all features"',
    async ({ page }) => {
      const token = getVerificationToken(testUser.email);
      await page.goto(`verify-email?token=${token}`);

      await expect(
        page.getByText(/Email verified successfully/i),
      ).toBeVisible({ timeout: 8_000 });
    },
  );

  test(
    'Register: Invalid token shows error message instead of success',
    async ({ page }) => {
      await page.goto('verify-email?token=invalid-token-xyz');

      await expect(page.getByText(/Invalid or expired/i)).toBeVisible({ timeout: 8_000 });
      await expect(page.getByText(/Email verified successfully/i)).not.toBeVisible();
    },
  );

  // ── Redirect до 2FA ─────────────────────────────────────────────────────

  test(
    'Register: If token is valid: automatic redirect to 2FA in settings',
    async ({ page }) => {
      const token = getVerificationToken(testUser.email);
      await page.goto(`verify-email?token=${token}`);
      await page.waitForLoadState('domcontentloaded');

      await page.locator('input[name="identifier"]').fill(testUser.email);
      await page.locator('input[name="password"]').fill(testUser.password);
      await page.getByRole('button', { name: /Sign In/i }).click();

      await expect(page).toHaveURL(/settings.*security|settings.*tab=security/, {
        timeout: 10_000,
      });
    },
  );

  test(
    'Register: Unverified user cannot access settings after failed login attempt',
    async ({ page }) => {
      await page.goto('login');
      await page.locator('input[name="identifier"]').fill(testUser.email);
      await page.locator('input[name="password"]').fill(testUser.password);
      await page.getByRole('button', { name: /Sign In/i }).click();

      await expect(page).toHaveURL(/login/, { timeout: 5_000 });
    },
  );

  // ── If user is logged in ────────────────────────────────────────────────

  test.skip(
    'Register: If user is logged in, redirect to 2FA in settings',
    async () => {
      // TODO: потребує окремої залогіненої сесії + клік по верифікаційному посиланню
      // Поточна реалізація: /verify-email рендерить login-сторінку незалежно від сесії
    },
  );

  // ── Confirmation email ──────────────────────────────────────────────────

  test.skip('Register: confirmation email sent: "Your email has been verified"', async () => {
    // TODO: потребує email-провайдера
  });
});

test.describe('Check Resend Verification Email', () => {
  test.beforeEach(async ({ page }) => {
    // Встановлюємо fake timers ДО того як Alpine запустить startCooldown() → setInterval
    await page.clock.install();

    const user = generateUser();
    const registerPage = new RegisterPage(page);
    await page.goto('register');
    await registerPage.register(user.username, user.email, user.password);
    await page.waitForURL(/verify-email-sent/, { timeout: 10_000 });
  });

  // ── Button visibility ──────────────────────────────────────────────────

  test(
    'Register: "Resend verification email" button visible on waiting page',
    async ({ page }) => {
      const resendBtn = page.getByRole('button', { name: /Resend verification email/i });
      await expect(resendBtn).toBeVisible({ timeout: 5_000 });
    },
  );

  // ── Rate limiting ──────────────────────────────────────────────────────

  test(
    'Register: rate limiting: max 3 resend requests per 15 minutes',
    async ({ page }) => {
      const userId = new URL(page.url()).searchParams.get('user_id');
      expect(userId).toBeTruthy();

      // 3 дозволені запити → 200
      for (let i = 0; i < 3; i++) {
        const res = await page.request.post('/resend-verification', {
          form: { user_id: userId! },
        });
        expect(res.status()).toBe(200);
      }

      // 4-й запит → rate limit 429
      const response = await page.request.post('/resend-verification', {
        form: { user_id: userId! },
      });
      expect(response.status()).toBe(429);
      const data = await response.json();
      expect(data.error).toMatch(/Too many requests/i);
    },
  );

  // ── After clicking: success message ───────────────────────────────────

  test(
    'Register: after clicking "Resend verification email": success message "Verification email sent!" is visible',
    async ({ page }) => {
      // Перемотуємо 61с → cooldown спливає → кнопка активна
      await page.clock.runFor(61_000);
      await expect(page.getByRole('button', { name: /Resend verification email/i })).toBeEnabled({ timeout: 3_000 });
      await page.getByRole('button', { name: /Resend verification email/i }).click();
      await expect(page.getByText('Verification email sent!')).toBeVisible({ timeout: 5_000 });
    },
  );

  test(
    'Register: success message "Verification email sent!" is not visible before clicking Resend',
    async ({ page }) => {
      await expect(page.getByText('Verification email sent!')).not.toBeVisible();
    },
  );

  // ── After clicking: countdown timer ───────────────────────────────────

  test(
    'Register: after clicking "Resend verification email": countdown timer "You can request another email in X minutes" is visible',
    async ({ page }) => {
      // Перемотуємо 61с → кнопка активна, клікаємо → cooldown скидається до 60
      await page.clock.runFor(61_000);
      await expect(page.getByRole('button', { name: /Resend verification email/i })).toBeEnabled({ timeout: 3_000 });
      await page.getByRole('button', { name: /Resend verification email/i }).click();
      await expect(page.getByText(/You can request another email in/i)).toBeVisible({ timeout: 5_000 });
    },
  );

  test(
    'Register: countdown timer "You can request another email in" is not visible when cooldown is 0',
    async ({ page }) => {
      // Перемотуємо 61с → cooldown = 0 → x-show="cooldown > 0" ховає таймер
      await page.clock.runFor(61_000);
      await expect(page.getByText(/You can request another email in/i)).not.toBeVisible();
    },
  );

  // ── After clicking: email & token (потребують email-провайдера) ────────

  test.skip(
    'Register: after clicking "Resend verification email": new verification email is sent',
    async () => {
      // TODO: потребує email-провайдера (Mailhog/Mailpit)
    },
  );

  test.skip(
    'Register: after clicking "Resend verification email": new token is valid, old token remains valid until expiration',
    async () => {
      // TODO: потребує email-провайдера для отримання нового токену
    },
  );
});

test.describe('Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('register');
  });

  test(
    'Register: Link to "Terms of Service" and "Privacy Policy" is accessible and leads to the correct pages.',
    async ({ page }) => {
      const termsLink = page.getByRole('link', { name: /Terms of Service/i });
      const privacyLink = page.getByRole('link', { name: /Privacy Policy/i });

      await expect(termsLink).toBeVisible();
      await expect(privacyLink).toBeVisible();

      // Посилання мають вести на реальні сторінки, а не "#"
      // ❌ Наразі обидва href="#" — тест впаде і покаже баг
      const termsHref = await termsLink.getAttribute('href');
      const privacyHref = await privacyLink.getAttribute('href');
      expect(termsHref).not.toBe('#');
      expect(privacyHref).not.toBe('#');
    },
  );

  test(
    'Register: Attempt to create an account with a username that is less than 3 characters long and verify that an error message is displayed.',
    async ({ page }) => {
      const usernameInput = page.locator('input[name="username"]');
      await usernameInput.fill('ab');

      // Перевіряємо що браузер встановив повідомлення про помилку (minlength="3")
      const validationMessage = await usernameInput.evaluate(
        (el: HTMLInputElement) => el.validationMessage,
      );
      expect(validationMessage).not.toBe('');

      // Форма не сабмітиться — залишаємось на /register
      await page.locator('input[name="email"]').fill('test@example.com');
      await page.locator('input[name="password"]').fill('TestPass123!');
      await page.locator('input[name="confirm_password"]').fill('TestPass123!');
      await page.locator('input[name="terms"]').check();
      await page.getByRole('button', { name: /Create Account/i }).click();
      await expect(page).toHaveURL(/register/);
    },
  );

  test(
    'Register: Try using an invalid email format and check that the form does not submit and an appropriate error message is shown.',
    async ({ page }) => {
      const emailInput = page.locator('input[name="email"]');
      await emailInput.fill('notanemail');

      // Перевіряємо що браузер встановив повідомлення про помилку (type="email")
      const validationMessage = await emailInput.evaluate(
        (el: HTMLInputElement) => el.validationMessage,
      );
      expect(validationMessage).not.toBe('');

      // Форма не сабмітиться
      await page.locator('input[name="username"]').fill('validuser');
      await page.locator('input[name="password"]').fill('TestPass123!');
      await page.locator('input[name="confirm_password"]').fill('TestPass123!');
      await page.locator('input[name="terms"]').check();
      await page.getByRole('button', { name: /Create Account/i }).click();
      await expect(page).toHaveURL(/register/);
    },
  );

  test(
    'Register: Enter a password that is shorter than 8 characters and ensure that the system does not allow account creation.',
    async ({ page }) => {
      const passwordInput = page.locator('input[name="password"]');
      await passwordInput.fill('Short1!');

      // Перевіряємо що браузер встановив повідомлення про помилку (minlength="8")
      const validationMessage = await passwordInput.evaluate(
        (el: HTMLInputElement) => el.validationMessage,
      );
      expect(validationMessage).not.toBe('');

      // Паролі співпадають (кнопка активна) — але форма не сабмітиться
      await page.locator('input[name="username"]').fill('validuser');
      await page.locator('input[name="email"]').fill('test@example.com');
      await page.locator('input[name="confirm_password"]').fill('Short1!');
      await page.locator('input[name="terms"]').check();
      await page.getByRole('button', { name: /Create Account/i }).click();
      await expect(page).toHaveURL(/register/);
    },
  );

  test(
    "Register: Input a password and a different confirm password, then verify that an error message indicating \"Passwords don't match\" is displayed.",
    async ({ page }) => {
      const registerPage = new RegisterPage(page);
      await registerPage.fillPassword('TestPass123!');
      await registerPage.fillConfirmPassword('DifferentPass456!');

      // Alpine x-show показує DOM-повідомлення "Passwords don't match"
      await expect(page.getByText("Passwords don't match")).toBeVisible();
    },
  );

  test(
    'Register: Leave the terms and conditions checkbox unchecked and attempt to submit the form to confirm that an error is raised.',
    async ({ page }) => {
      const suffix = faker.string.numeric(6);
      const registerPage = new RegisterPage(page);

      await registerPage.fillUsername(`user_${suffix}`);
      await registerPage.fillEmail(faker.internet.email().toLowerCase());
      await registerPage.fillPassword('TestPass123!');
      await registerPage.fillConfirmPassword('TestPass123!');
      // terms НЕ чекаємо

      await page.getByRole('button', { name: /Create Account/i }).click();

      // Форма не сабмітиться
      await expect(page).toHaveURL(/register/);

      // Браузер встановив повідомлення про помилку на checkbox (required)
      const validationMessage = await page
        .locator('input[name="terms"]')
        .evaluate((el: HTMLInputElement) => el.validationMessage);
      expect(validationMessage).not.toBe('');
    },
  );

  test(
    'Register: Test the account creation process using a variety of special characters in the username and password fields to ensure the system handles them correctly.',
    async ({ page }) => {
      const suffix = faker.string.numeric(6);
      const registerPage = new RegisterPage(page);

      const specialUsername = `user_${suffix}-test.ok`;
      const specialPassword = 'P@$$w0rd!#123';

      await registerPage.register(
        specialUsername,
        faker.internet.email().toLowerCase(),
        specialPassword,
      );

      await expect(page).toHaveURL(/verify-email-sent/, { timeout: 10_000 });
    },
  );

  test(
    'Register: Check how the form behaves when a user rapidly switches between showing and hiding the password fields.',
    async ({ page }) => {
      const passwordInput = page.locator('input[name="password"]');
      const toggleBtn = page.locator('div.relative:has(input[name="password"]) button');

      await passwordInput.fill('TestPass123!');

      // Початково: type="password"
      await expect(passwordInput).toHaveAttribute('type', 'password');

      // 5 швидких кліків
      for (let i = 0; i < 5; i++) {
        await toggleBtn.click();
      }

      // Після непарної кількості кліків → type="text"
      await expect(passwordInput).toHaveAttribute('type', 'text');

      // Значення пароля збережене
      await expect(passwordInput).toHaveValue('TestPass123!');
    },
  );

  test(
    'Register: Simulate a slow network connection and see if the system provides feedback during the account creation process.',
    async ({ page }) => {
      const user = generateUser();

      // Додаємо 3с затримку до POST /register
      await page.route('**/register', async (route) => {
        if (route.request().method() === 'POST') {
          await new Promise((r) => setTimeout(r, 3_000));
        }
        await route.continue();
      });

      const registerPage = new RegisterPage(page);
      await registerPage.fillUsername(user.username);
      await registerPage.fillEmail(user.email);
      await registerPage.fillPassword(user.password);
      await registerPage.fillConfirmPassword(user.password);
      await registerPage.checkTerms();

      // Клікаємо submit — запит "в польоті" (3с затримка)
      await registerPage.clickCreateAccount();

      // Під час очікування відповіді кнопка має бути задизейблена (loading state)
      // ❌ В поточному UI немає loading state — тест впаде і покаже баг
      await expect(
        page.getByRole('button', { name: /Create Account/i }),
      ).toBeDisabled({ timeout: 1_000 });
    },
  );

  test(
    "Register: Test the form's responsiveness by resizing the browser window and checking if all elements adjust correctly without losing functionality.",
    async ({ page }) => {
      const checkFormVisible = async () => {
        await expect(page.locator('input[name="username"]')).toBeVisible();
        await expect(page.locator('input[name="email"]')).toBeVisible();
        await expect(page.locator('input[name="password"]')).toBeVisible();
        await expect(page.getByRole('button', { name: /Create Account/i })).toBeVisible();
      };

      // Mobile 375×667
      await page.setViewportSize({ width: 375, height: 667 });
      await checkFormVisible();

      // Tablet 768×1024
      await page.setViewportSize({ width: 768, height: 1024 });
      await checkFormVisible();

      // Desktop 1280×800
      await page.setViewportSize({ width: 1280, height: 800 });
      await checkFormVisible();
    },
  );
});
