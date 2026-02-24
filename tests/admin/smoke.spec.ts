import { test, expect } from '@playwright/test';
import { BaseAdminPage } from '../../page-objects/admin/BaseAdminPage';

test.describe('Admin Panel Smoke Tests', () => {
  // Playwright автоматично підтягне сесію з .auth/admin.json 
  // завдяки налаштуванням у playwright.config.ts

  let basePage: BaseAdminPage;

  test.beforeEach(async ({ page }) => {
    basePage = new BaseAdminPage(page);
    // Переходимо на головну сторінку адмінки перед кожним тестом
    await page.goto(''); 
  });

  // Список розділів для перевірки: назва в меню та очікуваний заголовок на сторінці
  const menuSections = [
    { name: 'Dashboard', heading: /Dashboard/i },
    { name: 'Users', heading: /Users/i },
    { name: 'Wallets', heading: /Wallets/i },
    { name: 'Transactions', heading: /Transactions/i },
    { name: 'Signing Queue', heading: /Signing Queue/i },
    { name: 'Networks', heading: /Networks/i },
    { name: 'Assets', heading: /Assets/i },
    { name: 'Audit Logs', heading: /Audit Logs/i },
  ];

for (const section of menuSections) {
    test(`Розділ "${section.name}" має успішно відкриватися`, async ({ page }) => {
      // Використовуємо локатор, який шукає ТІЛЬКИ в боковому меню
      // Фільтруємо за текстом розділу
      const menuLink = page.locator('aside a, nav a').filter({ hasText: section.name }).first();
      
      await expect(menuLink).toBeVisible();
      await menuLink.click();

      const pageHeading = page.getByRole('heading', { name: section.heading });
      await expect(pageHeading).toBeVisible({ timeout: 10000 });

      expect(page.url()).not.toContain('login');

      console.log(`✅ Сторінку ${section.name} перевірено`);

    });
  }
  
  test('Кнопка Logout має бути видимою', async () => {
    // Перевіряємо, що кнопка виходу присутня на екрані
    await expect(basePage.logoutButton).toBeVisible();
  });
});