/**
 * Happy Path: Повний флоу користувача
 *
 * Покриває:
 *  1. Реєстрація нового користувача
 *  2. Верифікація email через PostgreSQL (обходимо Mailgun sandbox)
 *  3. Логін без 2FA
 *  4. Налаштування двофакторної автентифікації (TOTP/Google Authenticator)
 *  5. Логін з 2FA
 *  6. Створення тегу 1
 *  7. Створення акаунту 1 з тегом 1
 *  8. Створення тегу 2
 *  9. Створення акаунту 2 з тегом 2
 * 10. Отримання deposit-адреси акаунту 2
 * 11. Ініціація переказу з акаунту 1 на адресу акаунту 2
 * 12. Перевірка в адмін-панелі: транзакція у черзі підпису (signing_required)
 * 13. Відстеження статусу транзакції в юзерській апці
 *
 * Примітка:
 *  - Підпис транзакції (Ledger Signer_app) — поза скоупом автотестів.
 *    Тест перевіряє лише появу транзакції в Signing Queue з коректним статусом.
 */

import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { RegisterPage } from '../../page-objects/user/RegisterPage';
import { UserLoginPage } from '../../page-objects/user/UserLoginPage';
import { SettingsSecurityPage } from '../../page-objects/user/SettingsSecurityPage';
import { TagsPage } from '../../page-objects/user/TagsPage';
import { AccountsPage } from '../../page-objects/user/AccountsPage';
import { SendPage } from '../../page-objects/user/SendPage';
import { TransactionsPage } from '../../page-objects/user/TransactionsPage';
import { AdminLoginPage } from '../../page-objects/admin/AdminLoginPage';
import { AdminSigningQueuePage } from '../../page-objects/admin/AdminSigningQueuePage';
import { verifyUserEmail, fundAccountWithTestEth } from '../../utils/db-helpers';
import { generateTOTPCode } from '../../utils/otp-helpers';

// Тестові дані — генеруються один раз для всього запуску
// faker.internet.username() може дати спеціальні символи — заміняємо на підкреслення
const rawUsername = faker.internet.username().replace(/[^a-zA-Z0-9_]/g, '_');
const testUser = {
  username: rawUsername.slice(0, 20), // максимум 20 символів
  email: faker.internet.email().toLowerCase(),
  password: 'TestPass123!', // мінімум 8 символів + великі/малі/цифри
};

// Назви тегів і акаунтів з унікальним суфіксом (щоб уникнути конфліктів)
const suffix = faker.string.numeric(4);
const tag1Name = `Savings-${suffix}`;
const tag2Name = `Trading-${suffix}`;
const account1Name = `Main Wallet ${suffix}`;
const account2Name = `Trading Wallet ${suffix}`;

// Сума переказу — невелика сума для тестів
const SEND_AMOUNT = '0.001';

// Shared-змінні між кроками (зберігають стан між test.step)
let otpSecret = '';
let account1Address = '';
let account2Address = '';

// Тест використовує чисту сесію (без збережених кукі з .auth/)
test.use({ storageState: { cookies: [], origins: [] } });
// Повний флоу включає реєстрацію, 2FA, кілька акаунтів і транзакцію — потрібно більше часу
test.setTimeout(180_000);

test('Happy Path: Повний флоу користувача', async ({ page, browser }) => {
  // =========================================================================
  // КРОК 1: Реєстрація нового користувача
  // =========================================================================
  await test.step('1. Реєстрація', async () => {
    const registerPage = new RegisterPage(page);
    await registerPage.navigate();

    await registerPage.register(testUser.username, testUser.email, testUser.password);

    // Після реєстрації — редирект на сторінку підтвердження email
    await expect(page).toHaveURL(/verify-email-sent/, { timeout: 10_000 });
  });

  // =========================================================================
  // КРОК 2: Верифікація email через пряме оновлення в PostgreSQL
  // =========================================================================
  await test.step('2. Верифікація email (через БД)', async () => {
    // Виконуємо SQL: UPDATE users SET email_verified = true WHERE email = '...'
    // через docker exec custody-postgres psql
    verifyUserEmail(testUser.email);

    // Перевіряємо що можна залогінитись (email верифіковано)
    const loginPage = new UserLoginPage(page);
    await loginPage.navigate();
    await loginPage.login(testUser.email, testUser.password);

    // Якщо 2FA ще не налаштована — одразу потрапляємо на dashboard/accounts
    await expect(page).not.toHaveURL(/login/, { timeout: 10_000 });
  });

  // =========================================================================
  // КРОК 3: Налаштування двофакторної автентифікації (TOTP)
  // =========================================================================
  await test.step('3. Налаштування 2FA', async () => {
    const settingsPage = new SettingsSecurityPage(page);
    await settingsPage.navigate();

    // setup2FA() повертає secret-ключ для подальшої генерації OTP
    otpSecret = await settingsPage.setup2FA();

    // Переконуємось що secret-ключ отримано
    expect(otpSecret).toBeTruthy();
    expect(otpSecret.length).toBeGreaterThanOrEqual(16);
  });

  // =========================================================================
  // КРОК 4: Вихід та логін з двофакторною автентифікацією
  // =========================================================================
  await test.step('4. Логін з 2FA', async () => {
    // Очищуємо сесію для чистого логіну
    await page.context().clearCookies();

    const loginPage = new UserLoginPage(page);
    await loginPage.navigate();
    await loginPage.login(testUser.email, testUser.password);

    // Після введення пароля — OTP-форма з'являється прямо на сторінці /login
    // (URL НЕ змінюється на /otp — OTP відображається в тому ж шаблоні)
    const otpInput = page.locator('input[name="code"]');
    await expect(otpInput).toBeVisible({ timeout: 10_000 });

    // Генеруємо поточний TOTP-код та вводимо його
    const otpCode = generateTOTPCode(otpSecret);
    await otpInput.fill(otpCode);

    // Кнопка "Verify" — звичайна submit-форма (POST /login/otp)
    await page.getByRole('button', { name: /Verify/i }).click();

    // Успішний логін — залишаємо сторінку логіну
    await expect(page).not.toHaveURL(/login/, { timeout: 10_000 });
  });

  // =========================================================================
  // КРОК 5: Створення тегу 1
  // =========================================================================
  await test.step('5. Створення тегу 1', async () => {
    const tagsPage = new TagsPage(page);
    await tagsPage.navigate();

    await tagsPage.createTag(tag1Name, 'green');
  });

  // =========================================================================
  // КРОК 6: Створення акаунту 1 з тегом 1
  // =========================================================================
  await test.step('6. Створення акаунту 1 з тегом 1', async () => {
    const accountsPage = new AccountsPage(page);
    account1Address = await accountsPage.createAccount(account1Name, tag1Name);
  });

  // =========================================================================
  // КРОК 7: Створення тегу 2
  // =========================================================================
  await test.step('7. Створення тегу 2', async () => {
    const tagsPage = new TagsPage(page);
    await tagsPage.navigate();

    await tagsPage.createTag(tag2Name, 'blue');
  });

  // =========================================================================
  // КРОК 8: Створення акаунту 2 з тегом 2 + зчитуємо його адресу
  // =========================================================================
  await test.step('8. Створення акаунту 2 з тегом 2', async () => {
    const accountsPage = new AccountsPage(page);
    account2Address = await accountsPage.createAccount(account2Name, tag2Name);

    // Якщо адреса не зчиталась зі success-скрину — беремо з сторінки деталей
    if (!account2Address) {
      account2Address = await accountsPage.getAccountAddress(account2Name);
    }

    expect(account2Address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  // =========================================================================
  // КРОК 8.5: Поповнення балансу акаунту 1 через БД (обхід Sepolia faucet)
  //
  // Тестові акаунти не мають реального ETH — фронтенд блокує відправку.
  // Напряму оновлюємо кеш onchain_balances щоб Send форма показала баланс.
  // =========================================================================
  await test.step('8.5. Фінансування акаунту 1 (тестовий баланс)', async () => {
    expect(account1Address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    fundAccountWithTestEth(account1Address, 1);
  });

  // =========================================================================
  // КРОК 9: Ініціація переказу з акаунту 1 на адресу акаунту 2
  // =========================================================================
  await test.step('9. Переказ: Акаунт 1 → Акаунт 2', async () => {
    const sendPage = new SendPage(page);
    await sendPage.navigate();

    await sendPage.send(account1Name, account2Address, SEND_AMOUNT, 'medium');

    // Після успішного сабміту — редирект або success-повідомлення
    // Транзакція тепер у статусі "signing_required" в БД
    await expect(page).not.toHaveURL(/send$/, { timeout: 10_000 });
  });

  // =========================================================================
  // КРОК 10: Перевірка в адмін-панелі: транзакція у черзі підпису
  //
  // Відкриваємо новий browser context для логіну адміна
  // (щоб не перезаписати сесію юзера)
  // =========================================================================
  await test.step('10. Адмін: перевірка транзакції у Signing Queue', async () => {
    // Створюємо окремий контекст для адміна
    const adminContext = await browser.newContext({
      baseURL: process.env.ADMIN_URL,
    });
    const adminPage = await adminContext.newPage();

    try {
      // Логін адміна
      const adminLoginPage = new AdminLoginPage(adminPage);
      await adminLoginPage.navigate();
      await adminLoginPage.login(
        process.env.ADMIN_EMAIL!,
        process.env.ADMIN_PASSWORD!,
        process.env.ADMIN_OTP_SECRET,
      );

      // Переходимо до Signing Queue
      const signingQueuePage = new AdminSigningQueuePage(adminPage);
      await signingQueuePage.navigate();

      // Перевіряємо що транзакція є у черзі зі статусом "Needs Export"
      await signingQueuePage.expectTransactionInQueue(account2Address, SEND_AMOUNT);
    } finally {
      // Закриваємо адмін-контекст
      await adminContext.close();
    }
  });

  // =========================================================================
  // КРОК 11: Відстеження статусу транзакції в юзерській апці
  // =========================================================================
  await test.step('11. Відстеження статусу транзакції', async () => {
    const transactionsPage = new TransactionsPage(page);
    await transactionsPage.navigate();

    // Транзакція повинна бути присутня в списку
    await transactionsPage.expectTransactionWithAmount(SEND_AMOUNT);

    // Статус = "pending" (юзер бачить pending поки адмін не підписав)
    await transactionsPage.expectTransactionStatus('pending', SEND_AMOUNT);
  });
});
