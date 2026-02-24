import { Page, expect } from '@playwright/test';

export type TransactionSpeed = 'low' | 'medium' | 'fast';

export class SendPage {
  constructor(private page: Page) {}

  // --- Навігація ---

  async navigate() {
    await this.page.goto('send');
    await this.page.waitForLoadState('networkidle');
  }

  // --- Дії ---

  /**
   * Ініціює переказ з акаунту на адресу отримувача.
   *
   * Форма завантажується через HTMX після вибору акаунту.
   *
   * @param fromAccountName  - Назва акаунту-відправника (як відображається в дропдауні)
   * @param toAddress        - Ethereum-адреса отримувача (0x...)
   * @param amount           - Сума у форматі "0.001"
   * @param speed            - Швидкість: low | medium | fast (default: medium)
   */
  async send(
    fromAccountName: string,
    toAddress: string,
    amount: string,
    speed: TransactionSpeed = 'medium',
  ) {
    // --- Крок 1: Вибір акаунту-відправника ---
    // Відкриваємо дропдаун (кнопка відображає "Select an account" або поточний акаунт)
    await this.page
      .locator('button')
      .filter({ hasText: /Select an account|Select account/i })
      .click();

    // Шукаємо акаунт за назвою в списку дропдауну
    await this.page
      .locator('[x-data*="accounts"]')
      .getByText(fromAccountName)
      .first()
      .click();

    // Чекаємо завантаження форми через HTMX (target: #form-container)
    await this.page.locator('#form-container').waitFor({ state: 'visible' });
    await this.page.waitForLoadState('networkidle');

    // --- Крок 2: Введення адреси отримувача ---
    // Поле "To Address" (id="to_address_input", pattern: ^0x[a-fA-F0-9]{40}$)
    await this.page.locator('#to_address_input').fill(toAddress);

    // --- Крок 3: Вибір першого доступного asset (якщо є дропдаун) ---
    // Asset-тригер: button всередині [x-data*="selectedAssetId"] контейнера
    // Якщо trigger показує "Select an asset" — потрібно відкрити та вибрати
    // Якщо вже обрано (показує назву asset) — пропускаємо
    const assetContainer = this.page.locator('[x-data*="selectedAssetId"]');
    const assetTrigger = assetContainer.locator('button').first();
    const isAssetVisible = await assetTrigger.isVisible();
    if (isAssetVisible) {
      const triggerText = await assetTrigger.textContent() ?? '';
      if (/select\s+an?\s+asset/i.test(triggerText)) {
        // Asset не обрано — відкриваємо dropdown і обираємо перший варіант
        // В Send page options — button elements (nth(1) = перший option після trigger)
        await assetTrigger.click();
        const firstOption = assetContainer.locator('button').nth(1);
        await firstOption.waitFor({ state: 'visible', timeout: 10_000 });
        await firstOption.click();
      }
      // Якщо asset вже обрано — нічого не робимо (форма вже готова до наступного кроку)
    }

    // --- Крок 4: Введення суми ---
    // input id="amount", name="amount"
    await this.page.locator('#amount').fill(amount);

    // --- Крок 5: Вибір швидкості транзакції ---
    // Кнопки: low | medium | fast (@click="speedMode = speed")
    await this.page.locator(`button`).filter({ hasText: new RegExp(speed, 'i') }).first().click();

    // --- Крок 6: Сабміт ---
    // Кнопка активується тільки якщо canSubmit = true (є баланс, валідна адреса, обраний asset).
    // Перед цим кроком тест повинен поповнити баланс через fundAccountWithTestEth().
    const submitButton = this.page.getByRole('button', { name: /Create Transaction/i });
    await expect(submitButton).toBeEnabled({ timeout: 10_000 });
    await submitButton.click();

    // Чекаємо підтвердження (редирект або success-повідомлення)
    await this.page.waitForLoadState('networkidle');
  }
}
