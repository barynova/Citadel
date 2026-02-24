import { test, expect } from '@playwright/test';
import { UserLoginPage } from '../../page-objects/user/UserLoginPage';

test.describe('User Login Validation', () => {
  // Очищуємо сесію для тестів логіну
  test.use({ storageState: { cookies: [], origins: [] } });

  let loginPage: UserLoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new UserLoginPage(page);
    await loginPage.navigate();
  });

  test('Негативний кейс: Невірні дані', async () => {
    await loginPage.login('wrong_user@gmail.com', 'wrong_pass');
    // Використовуємо той самий текст помилки, що й в адмінці
    await expect(loginPage.page.getByText('Invalid email or password')).toBeVisible();
  });

  test('Позитивний кейс: Успішний вхід юзера', async () => {
    await loginPage.login(process.env.USER_EMAIL!, process.env.USER_PASSWORD!);
    // Перевіряємо, що бачимо Dashboard (заголовок або меню)
    await expect(loginPage.page.getByRole('link', { name: /Dashboard/i })).toBeVisible();
  });
});