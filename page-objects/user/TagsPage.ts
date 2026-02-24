import { Page, expect } from '@playwright/test';

// Доступні кольори тегів (з template: tagColors array)
export type TagColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'gray';

export class TagsPage {
  constructor(private page: Page) {}

  // --- Навігація ---

  async navigate() {
    await this.page.goto('tags');
    await this.page.waitForLoadState('networkidle');
  }

  // --- Дії ---

  /**
   * Створює новий тег.
   *
   * @param name  - Назва тегу (макс 30 символів)
   * @param color - Колір: red | orange | yellow | green | blue | purple | pink | gray
   */
  async createTag(name: string, color: TagColor = 'blue') {
    // Кнопка "Create Tag" або "Create Your First Tag" (якщо тегів ще немає)
    // Обидві кнопки відкривають форму (@click="openForm()")
    const createButton = this.page
      .getByRole('button', { name: /Create Tag|Create Your First Tag/i })
      .first();
    await createButton.click();

    // Поле назви — x-ref="tagNameInput" у формі створення (унікальний атрибут)
    // input[name="name"] не підходить — також є edit-input для наявних тегів
    await this.page.locator('input[x-ref="tagNameInput"]').fill(name);

    // Кнопки кольорів — кружечки (@click="newTag.color = c")
    // Клас кнопки: color-{color} (color-green, color-blue тощо), НЕ bg-{color}-500
    await this.page.locator(`button.color-${color}`).first().click();

    // Сабміт форми — кнопка "Create Tag" в самій формі (не та що відкриває)
    // Шукаємо кнопку submit типу всередині відкритої форми
    await this.page.locator('form').getByRole('button', { name: /^Create Tag$/i }).click();

    // Перевіряємо появу нового тегу в списку
    // .first() потрібен бо tag name також є в прихованій edit-формі рядка тегу
    await expect(this.page.getByText(name).first()).toBeVisible({ timeout: 5_000 });
  }
}
