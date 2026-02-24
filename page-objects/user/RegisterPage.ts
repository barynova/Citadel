import { Page, expect } from '@playwright/test';

export class RegisterPage {
  constructor(private page: Page) {}

  // --- Навігація ---

  async navigate() {
    // URL склеїться з baseURL з конфігу (process.env.USER_URL)
    await this.page.goto('register');
  }

  // --- Дії ---

  /**
   * Заповнює форму реєстрації та сабмітить її.
   * Після успіху — редирект на /verify-email-sent
   */
  async register(username: string, email: string, password: string) {
    // Поля визначені за атрибутом name (надійніший локатор ніж placeholder/текст)
    await this.page.locator('input[name="username"]').fill(username);
    await this.page.locator('input[name="email"]').fill(email);
    await this.page.locator('input[name="password"]').fill(password);
    await this.page.locator('input[name="confirm_password"]').fill(password);

    // Чекбокс Terms — обов'язковий для активації кнопки
    await this.page.locator('input[name="terms"]').check();

    // Кнопка "Create Account" (активна тільки після правильного заповнення)
    await this.page.getByRole('button', { name: /Create Account/i }).click();
  }

  // --- Перевірки ---

  async expectRedirectToVerifyEmailSent() {
    await expect(this.page).toHaveURL(/verify-email-sent/);
  }
}
