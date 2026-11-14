import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { attachSession } from './sessions.js';
import { apiLimiter } from './rateLimits.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profiles.js';
import collectionRoutes from './routes/collections.js';
import itemRoutes from './routes/items.js';
import seoRoutes from './routes/seo.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, 'dist');
const hasBuild = fs.existsSync(path.join(dist, 'index.html'));
const app = express();

// Behind a reverse proxy (nginx, a PaaS router, Cloudflare...) set TRUST_PROXY
// to the number of proxy hops, e.g. TRUST_PROXY=1, so req.ip is the visitor's
// address and rate limits apply per visitor. Leave it unset when Node is
// exposed directly, or clients could spoof X-Forwarded-For.
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isInteger(hops) ? hops : process.env.TRUST_PROXY);
}

// Security headers (HSTS, nosniff, frame protection, referrer policy, no X-Powered-By).
// CSP is off: the image tools load @huggingface/transformers and its WASM/model
// files from CDNs at runtime, so a policy needs testing against that flow first.
app.use(helmet({ contentSecurityPolicy: false }));

// The SPA is same-origin (Express serves it; the Vite dev server proxies /api),
// so it needs no CORS at all. Only origins listed in CORS_ORIGINS
// (comma-separated, exact match) may make credentialed cross-origin requests.
const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => callback(null, Boolean(origin) && corsOrigins.includes(origin)),
    credentials: true,
  })
);
app.use(express.json({ limit: '100kb' }));

app.use('/api', apiLimiter);

// Resolve the bearer header or the session cookie before any route runs.
app.use(attachSession);

// Liveness probe.
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'collectium-api' });
});

// Modular REST API Routes
app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/items', itemRoutes);

// Any other /api path is a real 404, not the SPA fallback.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// JSON errors for the API instead of Express's default HTML page, which
// includes a stack trace outside production.
// eslint-disable-next-line no-unused-vars
app.use('/api', (err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON.' });
  }
  if (err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Request is too large.' });
  }
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: 'Invalid upload.' });
  }
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// robots.txt + sitemap.xml (rate limited like the API: the sitemap queries the database).
app.use(['/robots.txt', '/sitemap.xml'], apiLimiter);
app.use(seoRoutes);

// Pages the SPA actually has. Anything else still boots the app (which shows
// its 404 page) but answers with a real 404 status, so search engines and
// link checkers don't index made-up URLs. Keep in sync with src/routes/.
const SPA_ROUTES = new Set([
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/profile',
  '/collection',
  '/settings',
  '/terms',
  '/privacy',
]);

if (hasBuild) {
  // Hashed SvelteKit assets are safe to cache for a year. Everything else under
  // /_app (notably version.json) must stay revalidated.
  app.use(
    '/_app/immutable',
    express.static(path.join(dist, '_app', 'immutable'), { immutable: true, maxAge: '1y' })
  );
  app.use(express.static(dist));

  // SPA fallback: every non-API route boots the client router.
  app.get('*', (req, res) => {
    const known = SPA_ROUTES.has(req.path.replace(/\/+$/, '') || '/');
    res.status(known ? 200 : 404).sendFile(path.join(dist, 'index.html'));
  });
} else {
  // Before the first `npm run build` there is nothing to serve but the API.
  app.get('/', (req, res) => {
    res
      .status(503)
      .type('text')
      .send('The Collectium app has not been built yet. Run "npm run build" and restart the server.');
  });
}

const PORT = Number(process.env.PORT) || 5000;

const server = app.listen(PORT, () => {
  console.log('');
  console.log(`  Collectium   http://localhost:${PORT}`);
  if (!hasBuild) {
    console.log('  No build found — run "npm run build" to create dist/.');
  }
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\nPort ${PORT} is already in use. Something else (probably another copy of this server) is running.\n` +
        `Stop it with:  lsof -ti tcp:${PORT} | xargs kill\n` +
        `Or run this copy on another port:  PORT=5001 node index.js\n`
    );
    process.exit(1);
  }
  throw err;
});
