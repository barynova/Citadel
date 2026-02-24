import { Locator, Page, expect } from '@playwright/test';

export class RegisterPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly termsCheckbox: Locator;
  readonly createAccountButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.locator('input[name="username"]');
    this.emailInput = page.locator('input[name="email"]');
    this.passwordInput = page.locator('input[name="password"]');
    this.confirmPasswordInput = page.locator('input[name="confirm_password"]');
    this.termsCheckbox = page.locator('input[name="terms"]');
    this.createAccountButton = page.getByRole('button', { name: /Create Account/i });
  }

  // --- Навігація ---

  async navigate() {
    await this.page.goto('register');
  }

  // --- Дії ---

  /**
   * Заповнює форму реєстрації та сабмітить її.
   * Після успіху — редирект на /verify-email-sent
   */
  async register(username: string, email: string, password: string) {
    await this.usernameInput.fill(username);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.confirmPasswordInput.fill(password);
    await this.termsCheckbox.check();
    await this.createAccountButton.click();
  }

  // --- Окремі дії для validation-тестів ---

  async fillUsername(value: string) {
    await this.usernameInput.fill(value);
  }

  async fillEmail(value: string) {
    await this.emailInput.fill(value);
  }

  async fillPassword(value: string) {
    await this.passwordInput.fill(value);
  }

  async fillConfirmPassword(value: string) {
    await this.confirmPasswordInput.fill(value);
  }

  async checkTerms() {
    await this.termsCheckbox.check();
  }

  async clickCreateAccount() {
    await this.createAccountButton.click();
  }

  async isCreateAccountEnabled(): Promise<boolean> {
    return this.createAccountButton.isEnabled();
  }

  /**
   * Клікає кнопку "Resend" на сторінці /verify-email-sent.
   * Якщо кнопка задизейблена (countdown активний) — повертає false.
   */
  async clickResendIfEnabled(): Promise<boolean> {
    const resendBtn = this.page
      .getByRole('button', { name: /Resend/i })
      .or(this.page.getByRole('link', { name: /Resend/i }));
    const isEnabled = await resendBtn.isEnabled().catch(() => false);
    if (isEnabled) {
      await resendBtn.click();
    }
    return isEnabled;
  }

  // --- Перевірки ---

  async expectRedirectToVerifyEmailSent() {
    await expect(this.page).toHaveURL(/verify-email-sent/);
  }

  async expectOnVerifyEmailSentPage() {
    await expect(this.page).toHaveURL(/verify-email-sent/, { timeout: 10_000 });
  }
}
