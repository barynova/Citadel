import { Locator, Page, expect } from '@playwright/test';

export class BaseAdminPage {
  readonly page: Page;
  // Локатори меню
  readonly dashboardLink: Locator;
  readonly usersLink: Locator;
  readonly walletsLink: Locator;
  readonly transactionsLink: Locator;
  readonly signingQueueLink: Locator;
  readonly networksLink: Locator;
  readonly assetsLink: Locator;
  readonly auditLogsLink: Locator;
  readonly logoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // Використовуємо getByRole для стабільності
    this.dashboardLink = page.getByRole('link', { name: 'Dashboard' });
    this.usersLink = page.getByRole('link', { name: 'Users' });
    this.walletsLink = page.getByRole('link', { name: 'Wallets' });
    this.transactionsLink = page.getByRole('link', { name: 'Transactions' });
    this.signingQueueLink = page.getByRole('link', { name: 'Signing Queue' });
    this.networksLink = page.getByRole('link', { name: 'Networks' });
    this.assetsLink = page.getByRole('link', { name: 'Assets' });
    this.auditLogsLink = page.getByRole('link', { name: 'Audit Logs' });
    this.logoutButton = page.getByRole('button', { name: 'Logout' });
  }

  async goToDashboard() { await this.dashboardLink.click(); }
  async goToTransactions() { await this.transactionsLink.click(); }
  async goToUsers() { await this.usersLink.click(); }
  async goToWallets() { await this.walletsLink.click(); }
  async goToSigningQueue() { await this.signingQueueLink.click(); }
  async goToNetworks() { await this.networksLink.click(); }
  async goToAssets() { await this.assetsLink.click(); }
  async goToAuditLogs() { await this.auditLogsLink.click(); }
  async goToLogoutButton() { await this.logoutButton.click(); }

}