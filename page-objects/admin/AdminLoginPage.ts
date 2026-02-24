import { Locator, Page, expect } from '@playwright/test';
import { generateTOTPCode } from '../../utils/otp-helpers';

export class AdminLoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;

    // Поля вводу: getByLabel() знаходить поля за текстом лейблу — працює і з type="password"
    // (getByRole('textbox') не знаходить type="password" — воно не має role textbox в ARIA)
    this.emailInput = page.getByLabel(/Email/i);
    this.passwordInput = page.getByLabel(/Password/i);

    // Кнопка входу
    this.signInButton = page.getByRole('button', { name: /Sign In/i });

    this.errorMessage = page.locator('.alert-danger, .error-message, [role="alert"], .invalid-feedback');
  }

  /**
   * Перехід на сторінку логіну адмінки
   */
  async navigate() {
    await this.page.goto('login');
  }

  /**
   * Логін адміна з підтримкою OTP (якщо 2FA увімкнено).
   *
   * @param email     - Email адміна
   * @param pass      - Пароль адміна
   * @param otpSecret - Base32 OTP-секрет (опціонально; якщо є — вводимо код після пароля)
   */
  async login(email: string, pass: string, otpSecret?: string) {
    await this.emailInput.waitFor({ state: 'visible' });

    await this.emailInput.fill(email);
    await this.passwordInput.fill(pass);

    await expect(this.signInButton).toBeEnabled();
    await this.signInButton.click();

    // Якщо 2FA увімкнено — після Sign In з'являється OTP-форма (та сама сторінка /login, show_otp=True)
    // OTP-форма використовує split-input: 6 окремих boxes + прихований <input name="code">
    // Контейнер боксів: [x-ref="otpContainer"]
    if (otpSecret) {
      await this.page.waitForLoadState('domcontentloaded');
      const otpContainer = this.page.locator('[x-ref="otpContainer"]');
      const hasOtp = await otpContainer.isVisible().catch(() => false);
      if (hasOtp) {
        // Клікаємо на перший бокс і вводимо всі 6 цифр по черзі
        // Alpine.js @input автоматично переходить на наступний бокс після кожного символу
        const firstBox = otpContainer.locator('input').first();
        await firstBox.waitFor({ state: 'visible', timeout: 5_000 });
        await firstBox.click();

        const otpCode = generateTOTPCode(otpSecret);
        await this.page.keyboard.type(otpCode);

        // Чекаємо оновлення Alpine.js (прихований input name="code" має стати 6-значним)
        await this.page.waitForTimeout(300);

        await this.page.getByRole('button', { name: /Verify/i }).click();
      }
    }

    // Чекаємо редиректу після успішного логіну (йдемо з /login → dashboard)
    await this.page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15_000 });
  }
}
