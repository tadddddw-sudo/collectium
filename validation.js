/** Small input checks shared by the API routes. */

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Copy only the allowed fields from a request body, checking each one.
 * `rules` maps field name -> (value) => boolean.
 * Returns `{ updates }`, or `{ error }` naming the first bad or unknown field.
 */
export function pickFields(body, rules) {
  if (!isPlainObject(body)) return { error: 'Request body must be a JSON object.' };

  const updates = {};
  for (const [key, value] of Object.entries(body)) {
    const check = Object.hasOwn(rules, key) ? rules[key] : null;
    if (!check) return { error: `Field "${key}" cannot be changed.` };
    if (!check(value)) return { error: `Invalid value for "${key}".` };
    updates[key] = value;
  }
  if (!Object.keys(updates).length) return { error: 'Nothing to update.' };
  return { updates };
}

/**
 * Parse an optional JSON-object form field (multipart bodies are all strings).
 * Returns the object, null when the field is absent, or undefined when it is invalid.
 */
export function parseJsonField(raw) {
  if (raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') return undefined;
  try {
    const value = JSON.parse(raw);
    return isPlainObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
