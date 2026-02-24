import { Locator, Page } from '@playwright/test';

export class BaseUserPage {
  readonly page: Page;
  readonly logoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.logoutButton = page.getByRole('link', { name: 'Logout' });
  }

  // Метод для кліку по будь-якому пункту меню (для Smoke тесту)
  async clickMenuItem(name: string) {
    // Шукаємо в тегу <aside> або <nav>, щоб не переплутати з кнопками в центрі
    await this.page.locator('aside, nav').getByText(name, { exact: true }).click();
    await this.page.waitForLoadState('networkidle');
  }
}