/**
 * Institutional Security Registry (Client-Side).
 * Stores temporary passwords generated during the active session.
 * Persists to sessionStorage so refresh/navigation won't wipe them.
 */

const STORAGE_KEY = "nib-temp-passwords";
let registry: Record<string, string> = {};
let hydrated = false;

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      registry = { ...registry, ...parsed };
    }
  } catch {}
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
  } catch {}
}

export const tempPasswordRegistry = {
  /**
   * Registers a temporary password for a specific user email.
   */
  add: (email: string, password: string) => {
    hydrate();
    if (!email) return;
    registry[email.toLowerCase().trim()] = password;
    persist();
  },

  /**
   * Retrieves a temporary password if it exists in the active session.
   */
  get: (email: string) => {
    hydrate();
    if (!email) return null;
    return registry[email.toLowerCase().trim()] || null;
  },

  /**
   * Removes a temporary password from the active session registry.
   */
  remove: (email: string) => {
    hydrate();
    if (!email) return;
    delete registry[email.toLowerCase().trim()];
    persist();
  },

  /**
   * Returns all registered temporary credentials.
   */
  getAll: () => {
    hydrate();
    return { ...registry };
  }
};
