export const INSTITUTIONAL_LOGIN_DOMAIN = 'nibbank.com.et';

function sanitizeInstitutionalLogin(value: string, trimTrailingDots: boolean) {
  const sanitized = value
    .toLowerCase()
    .trim()
    .replace(`@${INSTITUTIONAL_LOGIN_DOMAIN}`, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9.]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/g, '');

  return trimTrailingDots ? sanitized.replace(/\.+$/g, '') : sanitized;
}

export function getInstitutionalLoginInputValue(value: string) {
  return sanitizeInstitutionalLogin(value, false);
}

export function getInstitutionalLoginLocalPart(value: string) {
  return sanitizeInstitutionalLogin(value, true);
}

export function getInstitutionalLoginFullAddress(value: string) {
  const localPart = getInstitutionalLoginLocalPart(value);
  return localPart ? `${localPart}@${INSTITUTIONAL_LOGIN_DOMAIN}` : '';
}

export function normalizeInstitutionalLogin(value: string) {
  const localPart = getInstitutionalLoginLocalPart(value);
  return localPart ? `${localPart}@${INSTITUTIONAL_LOGIN_DOMAIN}` : '';
}

export function isValidInstitutionalLoginInput(value: string) {
  const trimmed = value.trim();
  const localPart = getInstitutionalLoginLocalPart(trimmed);

  if (!localPart) {
    return false;
  }

  return /^[a-z0-9]+(?:\.[a-z0-9]+)+$/.test(localPart);
}
