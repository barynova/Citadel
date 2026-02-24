import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import path from 'path';

// 1. Підключаємо секрети з .env
dotenv.config();

// 2. Шляхи до файлів сесій (тепер вони в папці .auth у корені)
export const ADMIN_AUTH = path.join(__dirname, '.auth/admin.json');
export const USER_AUTH = path.join(__dirname, '.auth/user.json');

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['allure-playwright']],

  use: {
    // Загальні налаштування для всіх тестів
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // --- ЕТАП 1: АВТОРИЗАЦІЯ (SETUP) ---
    {
      name: 'setup',
      // Шукаємо файли логіну в папці tests/setup/
      testMatch: 'setup/*.setup.spec.ts', 
      use: { baseURL: process.env.ADMIN_URL },
    },
    {
      name: 'user-setup',
      testMatch: 'setup/user.setup.spec.ts',
      use: { baseURL: process.env.USER_URL },
    },

    // --- ЕТАП 2: ТЕСТИ ДЛЯ АДМІНКИ ---
    {
      name: 'admin-chromium',
      use: { 
        ...devices['Desktop Chrome'],
        baseURL: process.env.ADMIN_URL,
        storageState: ADMIN_AUTH,
      },
      dependencies: ['setup'], 
      // Шукаємо всі тести в папці tests/admin/
      testMatch: 'admin/*.spec.ts', 
    },

    // --- ЕТАП 3: ТЕСТИ ДЛЯ ЮЗЕРСЬКОЇ АПКИ ---
    {
      name: 'user-chromium',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.USER_URL,
        storageState: USER_AUTH,
      },
      dependencies: ['user-setup'],
      // Шукаємо всі тести в папці tests/user/ крім happy_path
      testMatch: 'user/*.spec.ts',
      testIgnore: '**/happy_path.spec.ts',
    },

    // --- ЕТАП 4: E2E HAPPY PATH (повний флоу від реєстрації) ---
    // Запускається окремо — без збереженої сесії, реєструє нового юзера
    {
      name: 'happy-path',
      retries: 0, // Не повторювати: тест створює стан в БД, повтор з тими ж даними зламає флоу
      use: {
        ...devices['Desktop Chrome'],
        // baseURL для юзерської апки (ADMIN_URL використовується всередині тесту через browser.newContext)
        baseURL: process.env.USER_URL,
        // Без storageState — тест стартує з нуля (сам логіниться)
      },
      // Не залежить від setup — не використовує збережені сесії
      testMatch: 'user/happy_path.spec.ts',
    },
  ],
});