import { Page, expect } from '@playwright/test';
import { generateTOTPCode } from '../../utils/otp-helpers';

export class SettingsSecurityPage {
  constructor(private page: Page) {}

  // --- Навігація ---

  async navigate() {
    await this.page.goto('settings');

    // Клікаємо по вкладці "Security" (кнопки-таби в settings.html)
    // Шукаємо кнопку з текстом "Security" в блоці навігації вкладок
    await this.page.locator('.tab-btn', { hasText: 'Security' }).click();
  }

  // --- Налаштування 2FA ---

  /**
   * Проходить повний флоу налаштування Google Authenticator (TOTP).
   *
   * Кроки:
   * 1. Клік "Set Up Authenticator" → відкривається модальне вікно
   * 2. QR крок: зчитуємо secret-ключ, клік "Continue"
   * 3. Backup крок: клік "I've Saved My Codes"
   * 4. Verify крок: вводимо згенерований TOTP, клік "Enable Two-Factor Auth"
   * 5. Success крок: перевіряємо підтвердження
   *
   * @returns Base32 секрет для подальшої генерації OTP кодів у тестах
   */
  async setup2FA(): Promise<string> {
    // Секція "Two-Factor Authentication" — акордеон, за замовчуванням згорнута.
    // Заголовок-кнопка — це <h3> (вся картка клікабельна для розгортання)
    await this.page.locator('h3', { hasText: 'Two-Factor Authentication' }).click();

    // Клік на кнопку налаштування — вона є в security-секції (Alpine.js @click="setupOtp()")
    await this.page.getByRole('button', { name: /Set Up Authenticator/i }).click();

    // --- Крок 1: QR Code ---
    // Secret ключ відображається у: <code x-text="secret" class="...font-mono...">
    // Використовуємо атрибут x-text="secret" — він унікальний (backup codes мають x-text="code")
    const secretLocator = this.page.locator('code[x-text="secret"]');
    await secretLocator.waitFor({ state: 'visible', timeout: 10_000 });
    // Чекаємо поки Alpine.js заповнить вміст (AJAX-відповідь може трохи запізнюватись)
    await expect(secretLocator).not.toBeEmpty({ timeout: 10_000 });
    const secret = (await secretLocator.textContent())!.trim();

    // Продовжуємо до кроку backup-кодів
    await this.page.getByRole('button', { name: /Continue/i }).click();

    // --- Крок 2: Backup Codes ---
    await this.page.getByRole('button', { name: /I've Saved My Codes/i }).click();

    // --- Крок 3: Verify ---
    // Генеруємо TOTP прямо перед введенням
    const otpCode = generateTOTPCode(secret);
    const otpInput = this.page.getByPlaceholder('000000');

    // Alpine.js x-model слухає native 'input' event.
    // Ні fill(), ні pressSequentially не завжди тригерять його коректно.
    // Використовуємо evaluate: встановлюємо value через native setter + dispatch input event
    await otpInput.click();
    await this.page.evaluate((code) => {
      const input = document.querySelector(
        'input[placeholder="000000"]',
      ) as HTMLInputElement;
      if (!input) throw new Error('OTP input not found');
      // Native setter обходить React/Vue/Alpine.js і правильно тригерить reactive update
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      nativeSetter.call(input, code);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, otpCode);

    // Чекаємо що кнопка стала активною (Alpine.js: `:disabled="verifying || otpCode.length < 6"`)
    const enableButton = this.page.getByRole('button', { name: /Enable Two-Factor Auth/i });
    await expect(enableButton).toBeEnabled({ timeout: 5_000 });
    await enableButton.click();

    // --- Крок 4: Success ---
    // Чекаємо на відповідь сервера — він валідує TOTP і повертає success
    // x-show керує видимістю, тому чекаємо саме на visible (не hidden)
    await expect(this.page.getByText(/Two-Factor Auth Enabled/i)).toBeVisible({
      timeout: 15_000,
    });

    // "Continue" закриває модалку (перезавантажує сторінку)
    await this.page.getByRole('button', { name: 'Continue' }).click();
    await this.page.waitForLoadState('networkidle');

    return secret;
  }
}
