import { totp } from 'otplib';

/**
 * Декодує Base32 рядок у hex-рядок.
 *
 * otplib v12 не підтримує base32 encoding і трактує секрет як ASCII.
 * pyotp очікує base32-секрет і decode-ить його до bytes перед HMAC.
 * Тому ми вручну base32-декодуємо secret → hex і передаємо otplib з encoding='hex'.
 */
function base32ToHex(base32: string): string {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = base32.replace(/\s/g, '').replace(/=+$/, '').toUpperCase();
  let bits = 0, value = 0, hex = '';
  for (const c of clean) {
    value = (value << 5) | CHARS.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      hex += ((value >>> (bits - 8)) & 0xff).toString(16).padStart(2, '0');
      bits -= 8;
    }
  }
  return hex;
}

/**
 * Генерує поточний 6-значний TOTP код за Base32 секретним ключем.
 * Сумісний з pyotp (Google Authenticator, RFC 6238).
 *
 * @param secret - Base32 секрет, який отримуємо зі сторінки налаштувань 2FA
 * @returns 6-значний OTP код як рядок
 */
export function generateTOTPCode(secret: string): string {
  totp.options = { encoding: 'hex' };
  return totp.generate(base32ToHex(secret));
}
