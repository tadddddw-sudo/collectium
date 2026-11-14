/**
 * Rate limits for the API.
 *
 * Counters live in memory, so they are per process and reset on restart. That
 * is enough for a single server. If you run several instances, give every
 * limiter a shared store (e.g. rate-limit-redis) so the limits add up.
 *
 * Behind a reverse proxy, set TRUST_PROXY (see index.js) or every visitor will
 * share the proxy's IP address and one bad actor will lock everyone out.
 */
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function limiter({ windowMs, limit, message, keyGenerator, ...rest }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8', // RateLimit + RateLimit-Policy headers
    legacyHeaders: false,
    message: { error: message, code: 'RATE_LIMITED' },
    ...(keyGenerator ? { keyGenerator } : {}),
    ...rest,
  });
}

const byIp = (req) => ipKeyGenerator(req.ip);

/** Normalised email from the JSON body, or null. Used to limit per account as well as per IP. */
function bodyEmail(req) {
  const email = req.body?.email;
  if (typeof email !== 'string') return null;
  const normalised = email.trim().toLowerCase();
  return normalised && normalised.length <= 254 ? normalised : null;
}

const byEmailOrIp = (req) => {
  const email = bodyEmail(req);
  return email ? `email:${email}` : `ip:${byIp(req)}`;
};

/** Every /api request: a ceiling against scraping and floods. */
export const apiLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 600,
  message: 'Too many requests. Please slow down and try again in a few minutes.',
});

/** Failed sign-ins per IP. Successful logins do not count. */
export const loginIpLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  skipSuccessfulRequests: true,
  message: 'Too many failed sign-in attempts. Try again in 15 minutes.',
});

/**
 * Failed sign-ins per account, from any IP. Stops a password being guessed from
 * many addresses. Set higher than the IP limit so a stranger can't easily lock
 * a real user out of their own account.
 */
export const loginAccountLimiter = limiter({
  windowMs: HOUR,
  limit: 30,
  skipSuccessfulRequests: true,
  keyGenerator: byEmailOrIp,
  message: 'Too many failed sign-in attempts for this account. Try again later or reset your password.',
});

export const signupLimiter = limiter({
  windowMs: HOUR,
  limit: 5,
  message: 'Too many accounts created from this network. Try again in an hour.',
});

/** Reset emails per IP. */
export const forgotPasswordIpLimiter = limiter({
  windowMs: HOUR,
  limit: 5,
  message: 'Too many password reset requests. Try again in an hour.',
});

/** Reset emails per address, so nobody can flood a victim's inbox. */
export const forgotPasswordEmailLimiter = limiter({
  windowMs: HOUR,
  limit: 3,
  keyGenerator: byEmailOrIp,
  message: 'Too many password reset requests. Try again in an hour.',
});

export const resetPasswordLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  message: 'Too many password reset attempts. Try again in 15 minutes.',
});

/** Account deletion re-checks the password, so it needs a brute-force limit too. */
export const sensitiveActionLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 5,
  message: 'Too many attempts. Try again in 15 minutes.',
});

/** Image uploads: each one writes to storage. */
export const uploadLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 60,
  message: 'Too many uploads. Try again in a few minutes.',
});

/** Creates, edits and deletes of collections and items. */
export const writeLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 300,
  message: 'Too many changes in a short time. Try again in a few minutes.',
});
