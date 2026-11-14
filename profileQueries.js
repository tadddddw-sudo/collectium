/**
 * Reading profile rows, tolerating a database that hasn't run
 * supabase/profile-editing.sql yet (no banner_url / featured_collection_ids).
 */

export const BASE_PROFILE_COLUMNS = 'id, username, display_name, bio, avatar_url, created_at';
export const PROFILE_COLUMNS = `${BASE_PROFILE_COLUMNS}, banner_url, featured_collection_ids`;

/**
 * True when another profile already uses this handle, ignoring case, so
 * "Alice" can't impersonate "alice". `exceptId` skips the caller's own row.
 */
export async function isUsernameTaken(client, username, exceptId = null) {
  // ILIKE treats _ and % as wildcards; escape them so they match literally.
  const pattern = username.replace(/[\\%_]/g, (c) => `\\${c}`);
  let query = client.from('profiles').select('id').ilike('username', pattern).limit(1);
  if (exceptId) query = query.neq('id', exceptId);
  const { data, error } = await query;
  if (error) throw error;
  return data.length > 0;
}

/** Postgres "column does not exist", or PostgREST's schema-cache version of it. */
export function isMissingColumn(error) {
  return error?.code === '42703' || error?.code === 'PGRST204';
}

/**
 * Run `build(columns)` (a Supabase query ending in .single()/.maybeSingle())
 * with every profile column, falling back to the original columns if the new
 * ones don't exist yet.
 */
export async function selectProfile(build) {
  const result = await build(PROFILE_COLUMNS);
  if (!isMissingColumn(result.error)) return result;
  return build(BASE_PROFILE_COLUMNS);
}
