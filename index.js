import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { attachSession } from './sessions.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profiles.js';
import collectionRoutes from './routes/collections.js';
import itemRoutes from './routes/items.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, 'dist');
const hasBuild = fs.existsSync(path.join(dist, 'index.html'));
const app = express();

// credentials: true lets the httpOnly session cookie flow when the client is on
// another origin (the Vite dev server proxies /api, so production is same-origin).
app.use(
  cors({
    origin: (origin, callback) => callback(null, origin || false),
    credentials: true,
  })
);
app.use(express.json());

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
    res.sendFile(path.join(dist, 'index.html'));
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
