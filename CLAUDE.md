# Autotests — Citadel Core

## Проект
E2E автотести для **Citadel Core** — custody-платформи для управління криптоактивами.
Два окремих веб-застосунки на одному сервері:
- **Юзерська апка**: `http://localhost:8000/` — реєстрація, акаунти, переказ, теги
- **Адмінка**: `http://localhost:8000/admin/` — signing queue, управління користувачами

## Стек
- **Playwright** + **TypeScript** — E2E тести
- **Page Object Model** — всі взаємодії в `page-objects/`
- **Faker.js** — генерація тестових даних
- **otplib** — генерація TOTP-кодів для 2FA
- **Allure** — звіти

## Структура
```
page-objects/
  admin/
    AdminLoginPage.ts       — логін адміна (email + password + split OTP)
    AdminSigningQueuePage.ts — перевірка транзакцій у черзі підпису
  user/
    AccountsPage.ts         — створення акаунту (multi-step stepper), читання адреси
    SendPage.ts             — відправка транзакції
    TagsPage.ts             — створення тегів
    UserLoginPage.ts        — логін юзера (email + password + inline OTP)
    RegisterPage.ts         — реєстрація
    SettingsSecurityPage.ts — налаштування 2FA (повертає otpSecret)
    TransactionsPage.ts     — перевірка статусу транзакцій

tests/
  setup/
    admin.setup.spec.ts     — зберігає сесію адміна в .auth/admin.json
    user.setup.spec.ts      — зберігає сесію юзера в .auth/user.json
  admin/
    smoke.spec.ts
    login_validation.spec.ts
  user/
    happy_path.spec.ts      — ГОЛОВНИЙ ТЕСТ: повний флоу від реєстрації до signing queue
    smoke.spec.ts
    login_validation.spec.ts

utils/
  otp-helpers.ts            — generateTOTPCode(base32Secret) — сумісно з pyotp/RFC 6238
  db-helpers.ts             — verifyUserEmail(), fundAccountWithTestEth()
  date-format.ts
  math-helpers.ts
```

## Запуск
```bash
npx playwright test --project=happy-path          # головний E2E флоу
npx playwright test --project=user-chromium       # юзерські тести (потребує user-setup)
npx playwright test --project=admin-chromium      # адмін тести (потребує setup)
npx playwright test --ui                          # інтерактивний UI Mode
npx playwright test --project=happy-path --headed # з видимим браузером
npx playwright show-report                        # HTML звіт
```

## Конфігурація (.env — не в git)
```
ADMIN_URL=http://localhost:8000/admin/
USER_URL=http://localhost:8000/
ADMIN_EMAIL=qacitadelcore@gmail.com
ADMIN_PASSWORD=ad99bSZfu22!
ADMIN_OTP_SECRET=ANEWT3XDNOLB7WK4UBWBWPFAKPAWMRHA
USER_EMAIL=churichka.alla@gmail.com
USER_PASSWORD=ad99bSZfu22!
```

## Інфраструктура
- **PostgreSQL** у Docker-контейнері `custody-postgres` (user: `user`, db: `custody`)
- **Docker**: `docker ps` → `core-app-1`, `custody-postgres`, worker-контейнери
- Email верифікація обходиться через пряме оновлення БД (`verifyUserEmail()`)
- Баланс для тестів: `fundAccountWithTestEth(address)` → `UPDATE onchain_balances`
- ETH Sepolia asset_id: `2745a97c-2201-52f5-b41e-dfb933bea3b5`

## Особливості UI (критично для локаторів)

### Alpine.js
- `x-transition duration-300` — після кожного кроку stepper потрібен `waitForTimeout(400)`
- `x-for` рендерить елементи як siblings до `<template>` — сам template не клікається
- `x-show` приховує елементи через `display:none` — вони є в DOM але не `:visible`
- `x-ref="otpContainer"` — контейнер split OTP input (6 окремих boxes)
- Прихований `<input name="code" :value="otpCode">` містить фінальний OTP-код

### TOTP / 2FA
- `otplib` v12 НЕ підтримує base32 — використовуємо `base32ToHex()` + `encoding: 'hex'`
- Юзер OTP: inline форма на `/login` (той самий URL), `input[name="code"]`
- Адмін OTP: split 6-box input, `[x-ref="otpContainer"] input`, вводити через `keyboard.type()`

### Форми
- Network radio inputs мають `class="hidden"` → клікати по `label:has(input[name="network_id"])`
- Password inputs (`type="password"`) → використовувати `getByLabel()`, не `getByRole('textbox')`
- Asset dropdown в Send page: опції — `button` elements, не `div.dropdown-item`
- Asset dropdown в Receive page: опції — `div.dropdown-item:visible` (є приховані account items)

### Навігація
- Після "Create Account" — POST redirect на `/accounts/{id}`, чекати через `waitForURL`
- Receive page: передавати `?account_id=` в URL напряму (sidebar "Receive" link — без account_id)
- Admin login: після успішного логіну чекати `waitForURL(url => !url.includes('/login'))`

## Happy Path — кроки
1. Реєстрація нового юзера (faker email/username)
2. Верифікація email через DB (`verifyUserEmail`)
3. Логін без 2FA
4. Налаштування TOTP 2FA → зберігаємо `otpSecret`
5. Логін з TOTP кодом
6. Створення тегу 1
7. Створення акаунту 1 → зберігаємо `account1Address`
8. Створення тегу 2
9. Створення акаунту 2 → зберігаємо `account2Address`
10. 8.5: `fundAccountWithTestEth(account1Address)` — поповнення балансу для send
11. Відправка 0.001 ETH з акаунту 1 на адресу акаунту 2
12. Перевірка в адмінці: транзакція у Signing Queue зі статусом "Needs Export"
13. Перевірка статусу транзакції в юзерській апці: "pending"
