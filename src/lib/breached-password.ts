/**
 * Security Utility: Breached Password Verification
 * Uses the HIBP (Have I Been Pwned) API with anonymity (k-Anonymity)
 */

/**
 * Checks if a password has been leaked in a known data breach.
 * Uses SHA-1 hashing and sends only the first 5 characters to the API.
 * 
 * @param password The plain text password to check
 * @returns boolean True if the password is known to be breached
 */
export async function isBreachedPassword(password: string): Promise<boolean> {
  if (!password || password.length < 3) return false;

  try {
    // 1. Generate SHA-1 hash of the password
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

    // 2. Use k-Anonymity: Send only the first 5 characters
    const prefix = hashHex.substring(0, 5);
    const suffix = hashHex.substring(5);

    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      method: 'GET',
      headers: { 'Accept': 'application/vnd.pwnedpasswords.v2+json' }
    });

    if (!response.ok) {
      console.warn('[Security Tool] Breached password service unavailable');
      return false; // Fail safe (allow password if service is down)
    }

    const data = await response.text();
    const lines = data.split('\n');
    
    // 3. Check if the remaining hash suffix is in the results
    return lines.some(line => line.split(':')[0] === suffix);
  } catch (error) {
    console.error('[Security Tool] Error checking breached passwords:', error);
    return false;
  }
}
