/**
 * Register — Модуль перевірки реєстрації
 * Тести додаються по одному, кожен узгоджується перед запуском.
 */

import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { RegisterPage } from '../../page-objects/user/RegisterPage';
import { getVerificationToken, isEmailVerified } from '../../utils/db-helpers';

test.use({ storageState: { cookies: [], origins: [] } });

function generateUser() {
  const suffix = faker.string.numeric(6);
  return {
    username: `user_${suffix}`,
    email: faker.internet.email().toLowerCase(),
    password: 'TestPass123!',
  };
}
