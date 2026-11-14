// Password policy: 8+ characters, a digit, an uppercase letter and a special character.
// Keep in sync with passwordPolicyError() in routes/auth.js (the server is the source of truth).

export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'number', label: 'A number', test: (p) => /[0-9]/.test(p) },
  { id: 'upper', label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'special', label: 'A special character', test: (p) => /[^A-Za-z0-9\s]/.test(p) },
];

export function isPasswordValid(password) {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}
