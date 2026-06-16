/**
 * Local (offline) weak / common password denylist.
 *
 * This is a defense-in-depth complement to the HIBP breach check
 * (see {@link ./breached-password.ts}). The HIBP lookup "fails open" — it
 * allows the password when the API is unreachable (e.g. an intranet that
 * blocks outbound traffic). This local check can never fail open, so
 * notoriously weak credentials such as "Admin@123" are always rejected,
 * even though they technically satisfy the complexity rules.
 */

// Frequently abused base words. Combined with predictable digit/symbol
// suffixes these form passwords like "Admin@123", "Welcome@2024", "Password1!".
const COMMON_BASE_WORDS = new Set([
  'password', 'passwd', 'passw0rd', 'admin', 'administrator', 'welcome',
  'qwerty', 'qwertyuiop', 'asdf', 'asdfgh', 'zxcvbn', 'letmein', 'login',
  'logon', 'user', 'username', 'guest', 'root', 'superuser', 'changeme',
  'default', 'secret', 'master', 'test', 'testing', 'demo', 'temp',
  'temporary', 'abc', 'abcd', 'abcde', 'iloveyou', 'monkey', 'dragon',
  'sunshine', 'football', 'baseball', 'azerty', 'trustno', 'whatever',
  'starwars', 'princess', 'flower', 'hello', 'freedom',
  // Institution-specific predictable words.
  'nibbank', 'nib', 'bank', 'banking', 'kyc', 'ethiopia', 'addis',
]);

// Exact common passwords that meet complexity rules and are widely breached.
const COMMON_PASSWORDS = new Set([
  'admin@123', 'admin@1234', 'admin@12345', 'admin@123456', 'admin123!',
  'password@123', 'password1!', 'password123!', 'p@ssw0rd', 'p@ssword1',
  'p@ssword123', 'welcome@123', 'welcome1!', 'welcome123!', 'welcome@2024',
  'welcome@2025', 'qwerty@123', 'qwerty123!', 'changeme@123', 'admin@2024',
  'admin@2025', 'nibbank@123', 'nib@1234', 'kyc@1234', 'abcd@1234',
  'test@1234', 'user@1234', 'root@1234',
]);

/**
 * Returns true when the password is a well-known weak credential or is a
 * common base word padded with a predictable digit/symbol pattern.
 */
export function isCommonPassword(password: string): boolean {
  if (typeof password !== 'string') return false;

  const lower = password.toLowerCase().trim();
  if (lower.length === 0) return false;

  // 1. Exact match against the known-weak list.
  if (COMMON_PASSWORDS.has(lower)) return true;

  // 2. Strip symbols and any leading/trailing run of digits, then test the
  //    remaining alphabetic core against the common base words. This catches
  //    "Admin@123", "Welcome2024!", "123Password" and similar variants.
  const core = lower
    .replace(/[^a-z0-9]/g, '') // drop all symbols
    .replace(/\d+$/, '')        // drop a trailing run of digits
    .replace(/^\d+/, '');       // drop a leading run of digits

  if (core.length >= 3 && COMMON_BASE_WORDS.has(core)) return true;

  return false;
}
