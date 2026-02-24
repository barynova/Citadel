import { test as setup, expect } from '@playwright/test';
import * as path from 'path';

// Шлях до файлу сесії юзера
const userAuthFile = path.join(__dirname, '../.auth/user.json');

setup('authenticate user', async ({ page }) => {
  // 1. Переходимо на сторінку логіну користувача
  await page.goto('login'); 

  // 2. Вводимо дані юзера з .env
  await page.getByRole('textbox', { name: /Email/i }).fill(process.env.USER_EMAIL!);
  await page.getByRole('textbox', { name: /Password/i }).fill(process.env.USER_PASSWORD!);

  // 3. Натискаємо Sign In (або Login)
  await page.getByRole('button', { name: /Sign In|Login/i }).click();

  // 4. Чекаємо на елемент, який є в кабінеті користувача
  // ЗАМІНИ 'Withdraw' на те слово, яке реально є в меню юзера
  await expect(page.getByText(/Withdraw|Dashboard|Wallet/i).first()).toBeVisible({ timeout: 15000 });

  // 5. Зберігаємо стан у файл user.json
  await page.context().storageState({ path: userAuthFile });
  
  console.log('✅ Користувач авторизований! Сесію збережено у .auth/user.json');
});