import { test as setup, expect } from '@playwright/test';
import path from 'path';

const adminAuthFile = path.join(__dirname, '../../.auth/admin.json');

setup('authenticate admin', async ({ page }) => {
  await page.goto('login'); 

  await page.getByRole('textbox', { name: /Email/i }).fill(process.env.ADMIN_EMAIL!);
  await page.getByRole('textbox', { name: /Password/i }).fill(process.env.ADMIN_PASSWORD!);

  await page.getByRole('button', { name: /Sign In/i }).click();

  // Чекаємо редиректу
  await page.waitForURL(url => !url.href.includes('login'));

  // Явно переходимо на Dashboard, щоб сервер підтвердив сесію
  await page.goto(''); 
  await expect(page.getByRole('link', { name: /Dashboard/i })).toBeVisible();

  // Зберігаємо
  await page.context().storageState({ path: adminAuthFile });
  
  console.log('✅ Сесію АДМІНА збережено успішно');
});