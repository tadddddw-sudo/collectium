/** Small input checks shared by the API routes. */

// Usernames (handles) end up in profile URLs and share links, so keep them to a
// safe set. Keep in sync with the pattern on the signup and profile forms.
export const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,30}$/;

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Detect PNG/WebP/JPEG from a file's first bytes. Client-supplied mimetypes are
 * not trusted: files are served publicly with the Content-Type we store, so an
 * "image" that is really HTML or SVG would be a stored XSS vector.
 */
export function detectImageType(buffer, { allowJpeg = false } = {}) {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  if (allowJpeg && buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  return null;
}

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
