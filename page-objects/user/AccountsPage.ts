import { Page, expect } from '@playwright/test';

export class AccountsPage {
  constructor(private page: Page) {}

  // --- Навігація ---

  async navigate() {
    await this.page.goto('accounts');
    await this.page.waitForLoadState('networkidle');
  }

  async navigateToAddAccount() {
    await this.page.goto('accounts/add');
    await this.page.waitForLoadState('domcontentloaded');
  }

  // --- Дії ---

  /**
   * Створює новий акаунт через multi-step форму.
   *
   * Кроки степпера:
   * 1. Вибір Asset (криптовалюта)
   * 2. Вибір Network (блокчейн мережа)
   * 3. Назва акаунту
   * 4. Теги (опціонально)
   * 5. Підтвердження
   *
   * @param name    - Назва акаунту (макс 64 символи)
   * @param tagName - Назва вже створеного тегу для призначення (опціонально)
   * @returns Адреса гаманця (deposit address)
   */
  async createAccount(name: string, tagName?: string): Promise<string> {
    await this.navigateToAddAccount();

    // --- Крок 1: Вибір Asset ---
    // Клікаємо на першу доступну asset-картку (radio input з name="canonical_asset_id")
    await this.page.locator('.asset-card').first().click();

    // Кнопка "Continue" (Alpine.js: @click="nextStep")
    await this.page.getByRole('button', { name: /Continue/i }).click();

    // --- Крок 2: Вибір Network ---
    // Чекаємо появи мереж (завантажуються динамічно після вибору asset)
    await this.page.waitForLoadState('networkidle');
    // x-transition duration-300 — чекаємо завершення анімації переходу між кроками
    await this.page.waitForTimeout(400);

    // input[name="network_id"] має class="hidden" — клікаємо по label-обгортці
    // Label містить прихований radio та видимий .asset-card
    const networkLabel = this.page.locator('label:has(input[name="network_id"])').first();
    await networkLabel.waitFor({ state: 'visible', timeout: 15_000 });
    await networkLabel.click();

    await this.page.getByRole('button', { name: /Continue/i }).click();
    // x-transition duration-300 — чекаємо завершення анімації кроку 3
    await this.page.waitForTimeout(400);

    // --- Крок 3: Назва акаунту ---
    // input#account_name (name="name")
    await this.page.locator('#account_name').fill(name);

    // Після введення назви — Alpine.js перевіряє унікальність (checkName())
    await this.page.waitForTimeout(500);

    await this.page.getByRole('button', { name: /Continue/i }).click();
    // x-transition duration-300 — чекаємо завершення анімації кроку 4
    await this.page.waitForTimeout(400);

    // --- Крок 4: Теги (опціонально) ---
    if (tagName) {
      // Тег-кнопки: <button @click="toggleTag(tag)"><span x-text="tag.name">...</span></button>
      // Клікаємо саме по кнопці (не по span всередині), бо span може мати opacity:0 під час транзиції
      const tagButton = this.page.locator('button').filter({ hasText: tagName }).first();
      await tagButton.waitFor({ state: 'visible', timeout: 10_000 });
      await tagButton.click();
    }

    await this.page.getByRole('button', { name: /Continue/i }).click();
    // x-transition duration-300 — чекаємо завершення анімації кроку 5
    await this.page.waitForTimeout(400);

    // --- Крок 5: Підтвердження ---
    // Кнопка "Create Account" сабмітить форму (POST → redirect /accounts/{id})
    await this.page.getByRole('button', { name: /Create Account/i }).click();

    // --- Після створення: чекаємо на redirect на /accounts/{id} ---
    // Використовуємо загальний патерн /accounts/ (ID може бути UUID або integer)
    await this.page.waitForURL(/\/accounts\/[^/]+$/, { timeout: 20_000 });

    // Витягуємо account ID з URL і переходимо напряму на /receive?account_id={id}
    // Це безпечніше ніж клікати "Receive" — в sidebar є ще один link /receive (без account_id)
    const accountId = this._extractAccountIdFromUrl();
    return await this._readAddressFromReceivePage(accountId);
  }

  /**
   * Витягує ID акаунту з поточного URL.
   * Очікує URL вигляду /accounts/{id}
   */
  private _extractAccountIdFromUrl(): string {
    const url = this.page.url();
    const match = url.match(/\/accounts\/([^/?#]+)/);
    if (!match) {
      throw new Error(`Cannot extract account ID from URL: ${url}`);
    }
    return match[1];
  }

  /**
   * Читає deposit-адресу зі сторінки Receive для вказаного акаунту.
   *
   * Receive-сторінка — 3-кроковий wizard:
   *   1. Select Account (auto-selected через ?account_id= query param)
   *   2. Select Asset (треба вручну відкрити dropdown і обрати)
   *   3. Your Address (з'являється input.address-input)
   *
   * @param accountId - ID акаунту для ?account_id= параметру
   */
  private async _readAddressFromReceivePage(accountId: string): Promise<string> {
    // Переходимо напряму на /receive?account_id={id}
    // НЕ клікаємо на sidebar "Receive" link — він не передає account_id
    await this.page.goto(`receive?account_id=${accountId}`);
    await this.page.waitForLoadState('domcontentloaded');

    // Крок 2: Акаунт авто-обирається через init() + selectAccount().
    // selectAccount() робить async fetch → завантажує this.assets.
    // Чекаємо поки assetTrigger стане доступним (step 2 active = account selected).
    const assetTrigger = this.page.locator('button[x-ref="assetTrigger"]');
    await assetTrigger.waitFor({ state: 'visible', timeout: 15_000 });

    // Відкриваємо asset dropdown (клік по trigger)
    await assetTrigger.click();

    // Чекаємо появи ВИДИМИХ dropdown-item (asset items).
    // ВАЖЛИВО: div.dropdown-item також є в account dropdown (крок 1, прихований x-show).
    // Тому беремо лише :visible — account items приховані після вибору акаунту.
    const visibleItem = this.page.locator('div.dropdown-item:visible').first();
    await visibleItem.waitFor({ state: 'visible', timeout: 10_000 });
    await visibleItem.click();

    // Крок 3: address-input з'являється через <template x-if="currentStep >= 3">
    const addressInput = this.page.locator('input.address-input');
    await addressInput.waitFor({ state: 'visible', timeout: 10_000 });
    await expect(addressInput).not.toHaveValue('', { timeout: 10_000 });
    return await addressInput.inputValue();
  }

  /**
   * Відкриває деталі акаунту та повертає його deposit-адресу.
   *
   * @param accountName - Назва акаунту в списку
   */
  async getAccountAddress(accountName: string): Promise<string> {
    await this.navigate();

    // Клікаємо на акаунт за назвою → потрапляємо на detail page
    await this.page.getByText(accountName).first().click();
    await this.page.waitForURL(/\/accounts\/[^/]+$/, { timeout: 10_000 });

    // Витягуємо account ID та читаємо адресу через Receive сторінку
    const accountId = this._extractAccountIdFromUrl();
    return await this._readAddressFromReceivePage(accountId);
  }
}
