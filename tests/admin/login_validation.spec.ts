import { test, expect } from '@playwright/test';
import { AdminLoginPage } from '../../page-objects/admin/AdminLoginPage';

test.describe('Admin Login - Validation & Security', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let loginPage: AdminLoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new AdminLoginPage(page);
    await loginPage.navigate();
  });

  // 1. КЕЙС: НЕВІРНІ ДАНІ (Повідомлення від сервера)
  test('Негативний кейс: Невірний пароль або пошта', async () => {
    await loginPage.login('wrong_admin@gmail.com', 'wrong_password');
    
    // Перевіряємо точний текст, який ти вказала
    await expect(loginPage.page.getByText('Invalid email or password')).toBeVisible();
    await expect(loginPage.page).toHaveURL(/.*login/);
  });

  // 2. КЕЙС: ВАЛІДАЦІЯ ПОЛЯ (Невірний формат пошти)
  test('Валідація: Невірний формат email', async () => {
    await loginPage.emailInput.fill('invalid-email-format');
    await loginPage.passwordInput.fill('123456');
    await loginPage.signInButton.click();

    // Тут зазвичай фронтенд показує свою помилку. 
    // Тобі треба дізнатися, який там текст. Наприклад: "The email field must be a valid email address"
    // Якщо текст не знаєш, перевір хоча б те, що ми НЕ залогінилися:
    await expect(loginPage.page).toHaveURL(/.*login/);
    
    // Або якщо є специфічний клас помилки на полі:
    // await expect(loginPage.emailInput).toHaveClass(/is-invalid/); 
  });

  // 3. КЕЙС: ПОРОЖНІ ПОЛЯ
  test('Валідація: Порожні поля', async () => {
    await loginPage.signInButton.click();

    // Перевіряємо, що ми залишилися на сторінці логіну
    await expect(loginPage.page).toHaveURL(/.*login/);
    
    // Якщо фронт пише "This field is required", додай:
    // await expect(loginPage.page.getByText(/required/i)).toBeVisible();
  });

  // 4. ПОЗИТИВНИЙ КЕЙС
  test('Позитивний кейс: Успішний вхід', async () => {
    await loginPage.login(process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
    await expect(loginPage.page.getByRole('link', { name: /Transactions/i })).toBeVisible();
  });

  //5. РЕДІРЕКТ НА ЕКРАН Dashboard ПІСЛЯ УСПІШНОГО ЛОГІНУ
  test('Після успішного логіну відкривається сторінка Dashboard', async ({ page }) => {
    await loginPage.login(process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
    
    // Перевірку URL коментуємо, оскільки Dashboard вантажиться за базовою адресою /admin/
    // await expect(page).toHaveURL(/.*dashboard/i);

    // Перевіряємо Dashboard за унікальними елементами на сторінці:
    
    // 1. Заголовок Dashboard
    const dashboardHeader = page.getByRole('heading', { name: /Dashboard/i });
    await expect(dashboardHeader).toBeVisible({ timeout: 10000 });

    // 2. Додатковий чекап за текстом Overview of your custody platform
    // Наприклад, якщо там є текст "Overview of your custody platform"
    await expect(page.getByText(/Overview of your custody platform/i).first()).toBeVisible();

    console.log('✅ Dashboard успішно ідентифіковано за елементами UI');
  });
});