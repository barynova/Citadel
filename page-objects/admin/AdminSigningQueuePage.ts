import { Page, expect } from '@playwright/test';

export class AdminSigningQueuePage {
  constructor(private page: Page) {}

  // --- Навігація ---

  async navigate() {
    // Відкриваємо вкладку "signing_required" одразу
    await this.page.goto('signing?tab=signing_required');
    await this.page.waitForLoadState('networkidle');
  }

  // --- Перевірки ---

  /**
   * Перевіряє що транзакція з'явилась в черзі підпису зі статусом "Needs Export".
   *
   * Структура сторінки: Users → Accounts → Transactions (tree)
   * Статус "signing_required" відображається як badge "Needs Export"
   *
   * @param toAddress - Адреса отримувача (для ідентифікації транзакції)
   * @param amount    - Сума (опціонально, для додаткової перевірки)
   */
  async expectTransactionInQueue(toAddress: string, amount?: string) {
    // Перевіряємо що є хоча б одна транзакція в черзі
    // Badge "Needs Export" відображається для статусу signing_required
    const needsExportBadge = this.page.locator('.badge-warning').filter({
      hasText: /Needs Export/i,
    });

    await expect(needsExportBadge.first()).toBeVisible({ timeout: 15_000 });

    // Якщо передана адреса — перевіряємо що вона присутня в дереві
    if (toAddress) {
      // Розкриваємо дерево (Expand All) для перегляду всіх транзакцій
      const expandAll = this.page.locator('#expand-all-btn');
      if (await expandAll.isVisible()) {
        await expandAll.click();
        await this.page.waitForTimeout(500);
      }

      // Адреса отримувача відображається в деталях транзакції
      await expect(
        this.page.getByText(toAddress, { exact: false }),
      ).toBeVisible({ timeout: 5_000 });
    }

    if (amount) {
      await expect(this.page.getByText(amount, { exact: false }).first()).toBeVisible({
        timeout: 5_000,
      });
    }
  }

  /**
   * Перевіряє кількість транзакцій в черзі підпису (signing_required).
   *
   * @param minCount - Мінімальна кількість (default: 1)
   */
  async expectQueueNotEmpty(minCount: number = 1) {
    // Лічильник відображається в stats-картці або badge на вкладці
    const badges = this.page.locator('.badge-warning').filter({ hasText: /Needs Export/i });
    const count = await badges.count();
    expect(count).toBeGreaterThanOrEqual(minCount);
  }
}
