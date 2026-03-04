/**
 * Institutional Security Registry (Client-Side).
 * Stores temporary passwords generated during the active session.
 * This allows the hover tooltips in the Personnel Directory to display
 * credentials issued in the dedicated Reset page.
 */

let registry: Record<string, string> = {};

export const tempPasswordRegistry = {
  /**
   * Registers a temporary password for a specific user email.
   */
  add: (email: string, password: string) => {
    if (!email) return;
    registry[email.toLowerCase().trim()] = password;
  },

  /**
   * Retrieves a temporary password if it exists in the active session.
   */
  get: (email: string) => {
    if (!email) return null;
    return registry[email.toLowerCase().trim()] || null;
  },

  /**
   * Returns all registered temporary credentials.
   */
  getAll: () => ({ ...registry })
};
