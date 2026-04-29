/**
 * Security Utility: Breached Password Verification
 * Uses the HIBP (Have I Been Pwned) API with anonymity (k-Anonymity)
 */

const MIN_PASSWORD_LENGTH_FOR_BREACH_CHECK = 3;
const MAX_PASSWORD_LENGTH_FOR_BREACH_CHECK = 1024;

async function sha1HexForPwnedPasswordLookup(password: string): Promise<string> {
  // HIBP's k-anonymity range API is defined over SHA-1 prefixes/suffixes.
  // This hash is NOT used for password storage, only to query the breach corpus.
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Checks if a password has been leaked in a known data breach.
 * Uses SHA-1 hashing and sends only the first 5 characters to the API.
 * 
 * @param password The plain text password to check
 * @returns boolean True if the password is known to be breached
 */
export async function isBreachedPassword(password: string): Promise<boolean> {
  if (
    typeof password !== 'string' ||
    password.length < MIN_PASSWORD_LENGTH_FOR_BREACH_CHECK ||
    password.length > MAX_PASSWORD_LENGTH_FOR_BREACH_CHECK
  ) {
    return false;
  }

  try {
    // 1. Generate the protocol-required SHA-1 hash for HIBP range lookup
    const hashHex = await sha1HexForPwnedPasswordLookup(password);

    // 2. Use k-Anonymity: Send only the first 5 characters
    const prefix = hashHex.substring(0, 5);
    const suffix = hashHex.substring(5);

    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      method: 'GET',
      headers: {
        'Accept': 'text/plain',
        'Add-Padding': 'true',
      }
    });

    if (!response.ok) {
      return false; // Fail safe (allow password if service is down)
    }

    const data = await response.text();
    const lines = data.split(/\r?\n/);
    
    // 3. Check if the remaining hash suffix is in the results
    return lines.some((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex <= 0) return false;
      return line.slice(0, separatorIndex).trim().toUpperCase() === suffix;
    });
  } catch (error) {
    return false;
  }
}
