// DEPRECATED: temp-password-registry removed for security.
// Never persist plaintext passwords to client storage.
// Use server-driven token-based reset flow instead.
// This shim prevents import errors during refactor.

export const tempPasswordRegistry = {
  add: (_email: string, _password: string) => {
    // no-op
  },
  get: (_email: string) => {
    return null;
  },
  remove: (_email: string) => {
    // no-op
  },
  getAll: () => ({}),
};
