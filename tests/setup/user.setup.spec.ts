import { test as setup, expect } from '@playwright/test';
import path from 'path';

const userAuthFile = path.join(__dirname, '../../.auth/user.json');

setup('authenticate user', async ({ page }) => {
  // 1. Переходимо на сторінку логіну юзера
  await page.goto('login'); 

  // 2. Заповнюємо поля даними юзера з .env
  await page.getByRole('textbox', { name: /Email/i }).fill(process.env.USER_EMAIL!);
  await page.getByRole('textbox', { name: /Password/i }).fill(process.env.USER_PASSWORD!);

  // 3. Натискаємо Sign In / Login
  await page.getByRole('button', { name: /Sign In|Login/i }).click();

  // 4. Чекаємо на елемент, який бачить тільки юзер (напр. текст Wallet або Dashboard)
  // ПІДПРАВ текст нижче під свій інтерфейс юзера
  await expect(page.getByText(/Dashboard|Wallet|Withdraw/i).first()).toBeVisible({ timeout: 15000 });

  // 5. Зберігаємо "бейдж" авторизації юзера
  await page.context().storageState({ path: userAuthFile });
  
  console.log('✅ Сесію ЮЗЕРА збережено');
});