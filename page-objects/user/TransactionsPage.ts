import { Page, expect } from '@playwright/test';

export class TransactionsPage {
  constructor(private page: Page) {}

  // --- Навігація ---

  async navigate() {
    await this.page.goto('transactions');
    await this.page.waitForLoadState('networkidle');
  }

  // --- Перевірки ---

  /**
   * Перевіряє що транзакція з вказаною сумою присутня в списку.
   *
   * @param amount - Сума транзакції (наприклад "0.001")
   */
  async expectTransactionWithAmount(amount: string) {
    // Шукаємо рядок таблиці що містить суму
    await expect(
      this.page.locator('table, [class*="transaction"]').getByText(amount),
    ).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Перевіряє статус першої транзакції в списку (або за сумою).
   *
   * Можливі статуси: pending | completed | failed
   *
   * @param expectedStatus - Очікуваний статус
   * @param amount         - Фільтр за сумою (опціонально)
   */
  async expectTransactionStatus(expectedStatus: string, amount?: string) {
    let row = this.page.locator('tr, [class*="transaction-row"]').first();

    if (amount) {
      row = this.page
        .locator('tr, [class*="transaction-row"]')
        .filter({ hasText: amount })
        .first();
    }

    await expect(row.getByText(new RegExp(expectedStatus, 'i'))).toBeVisible({
      timeout: 10_000,
    });
  }
}
