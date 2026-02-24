import { execSync } from 'child_process';

// Назва Docker-контейнера з PostgreSQL (з docker-compose.yml: container_name: custody-postgres)
const DB_CONTAINER = 'custody-postgres';
const DB_USER = 'user';
const DB_NAME = 'custody';

/**
 * Верифікує email користувача напряму через PostgreSQL у Docker-контейнері.
 * Використовується замість реального email (Mailgun sandbox).
 *
 * @param email - Email адреса користувача, якого потрібно верифікувати
 */
export function verifyUserEmail(email: string): void {
  // Екрануємо одинарні лапки (захист від SQL injection навіть у тестах)
  const safeEmail = email.replace(/'/g, "''");

  const query = `UPDATE users SET email_verified = true, email_verified_at = NOW() WHERE email = '${safeEmail}';`;

  execSync(
    `docker exec ${DB_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} -c "${query}"`,
    { stdio: 'pipe' },
  );
}

// ID активу ETH на мережі Sepolia в таблиці assets_on_network
const ETH_SEPOLIA_ASSET_ID = '2745a97c-2201-52f5-b41e-dfb933bea3b5';

/**
 * Додає тестовий баланс ETH для акаунту в кеш onchain_balances.
 *
 * Тестові акаунти на Sepolia мають 0 ETH — фронтенд блокує відправку.
 * Цей хелпер напряму оновлює кеш балансів у БД, щоб обійти обмеження
 * без реального фінансування через faucet.
 *
 * @param address   - Ethereum-адреса акаунту (0x...)
 * @param ethAmount - Сума ETH для зарахування (default: 1.0)
 */
export function fundAccountWithTestEth(address: string, ethAmount: number = 1): void {
  const safeAddress = address.replace(/'/g, "''");

  const query =
    `INSERT INTO onchain_balances (account_id, asset_id, balance, block_number) ` +
    `SELECT a.id, '${ETH_SEPOLIA_ASSET_ID}', ${ethAmount}, 1 ` +
    `FROM accounts a ` +
    `WHERE LOWER(a.address) = LOWER('${safeAddress}') ` +
    `ON CONFLICT (account_id, asset_id) DO UPDATE SET balance = ${ethAmount};`;

  execSync(
    `docker exec ${DB_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} -c "${query}"`,
    { stdio: 'pipe' },
  );
}
