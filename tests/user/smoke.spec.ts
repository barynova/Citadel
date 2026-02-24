import { test, expect } from '@playwright/test';
import { BaseUserPage } from '../../page-objects/user/BaseUserPage';

test.describe('User App Smoke Tests', () => {
  // Використовує сесію .auth/user.json автоматично
  
  let basePage: BaseUserPage;

  test.beforeEach(async ({ page }) => {
    basePage = new BaseUserPage(page);
    await page.goto('dashboard'); // Переходимо на дашборд юзера
  });

  const menuItems = [
    { name: 'Dashboard', heading: /Dashboard/i },
    { name: 'My Wallets', heading: /My Wallets/i },
    { name: 'Send', heading: /Send Transaction/i },
    { name: 'Receive', heading: /Receive/i },
    { name: 'Transactions', heading: /Transactions/i },
    { name: 'Profile', heading: /Profile/i },
  ];

for (const item of menuItems) {
    test(`Юзер може відкрити розділ: ${item.name}`, async ({ page }) => {
      // 1. Клікаємо в меню за короткою назвою ("Send")
      await basePage.clickMenuItem(item.name);
      
      // 2. ПЕРЕВІРКА: шукаємо заголовок за довшою назвою (/Send Transaction/i)
      // Використовуємо .first(), щоб уникнути помилок із дублікатами (як було в Receive)
      const header = page.getByRole('heading', { name: item.heading }).first();
      
      await expect(header).toBeVisible({ timeout: 10000 });
      
      console.log(`✅ Розділ юзера ${item.name} перевірено`);
    });
  }
});