import { Locator, Page, expect } from '@playwright/test';

export class UserLoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // На скріншоті бачимо "Username or Email" та "Password"
    this.emailInput = page.getByPlaceholder(/username or email/i);
    this.passwordInput = page.getByPlaceholder(/password/i);
    this.signInButton = page.getByRole('button', { name: /Sign In/i });
  }

  async navigate() {
    // Юзерська апка зазвичай в корені або /login
    await this.page.goto('login'); 
  }

  async login(email: string, pass: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(pass);
    await this.signInButton.click();
  }
}