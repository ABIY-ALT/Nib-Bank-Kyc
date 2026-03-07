/**
 * @fileOverview Institutional URL Security Framework.
 * Prevents Open Redirect vulnerabilities by enforcing strict allow-lists 
 * and rejecting complex URI structures.
 */

const ALLOWED_INTERNAL_ROOTS = [
  '',
  'login',
  'unauthorized',
  'submissions',
  'reports',
  'performance',
  'kyc-fq-reference',
  'head-office',
  'admin'
];

/**
 * Validates if a URL is a safe internal destination.
 * 
 * Rules:
 * 1. Must be relative (starts with /).
 * 2. No protocol-relative paths (//).
 * 3. No query parameters or fragments (prevents nested parameter bypass).
 * 4. No URL encoding (prevents obfuscation).
 * 5. Must belong to the institutional allow-list.
 */
export function isValidInternalRedirect(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;

  // 1. Relative Path Check
  // Must start with '/' and not be protocol-relative (//) or backslash traversal (/\)
  if (!url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) {
    return false;
  }

  // 2. Structural Integrity
  // Reject any URL containing parameters, fragments, or alternative separators.
  // This directly satisfies the "Reject callback URLs containing nested parameters" mandate.
  const forbiddenCharacters = ['?', '#', '&', '=', ':', '@', '%'];
  for (const char of forbiddenCharacters) {
    if (url.includes(char)) return false;
  }

  // 3. Institutional Allow-list Check
  // We split by '/' and check the first significant segment (the module root)
  const segments = url.split('/').filter(Boolean);
  const root = segments[0] || ''; // Empty string if root path '/'

  return ALLOWED_INTERNAL_ROOTS.includes(root);
}
