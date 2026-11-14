import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { attachSession } from './sessions.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profiles.js';
import collectionRoutes from './routes/collections.js';
import itemRoutes from './routes/items.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// credentials: true lets the httpOnly session cookie cross the dev origin.
// (The Vite proxy makes requests same-origin anyway; this covers direct calls.)
app.use(
  cors({
    origin: (origin, callback) => callback(null, origin || false),
    credentials: true,
  })
);
app.use(express.json());
// Absolute path so `node index.js` works from any working directory.
app.use(express.static(path.join(here, 'public')));

// Resolve the bearer header or the session cookie before any route runs.
app.use(attachSession);

// Liveness probe. The SPA proxy surfaces a readable error when this is missing.
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'collectium-api' });
});

// Modular REST API Routes
app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/items', itemRoutes);

const PORT = Number(process.env.PORT) || 5000;

const server = app.listen(PORT, () => {
  console.log('');
  console.log(`  Collectium API   http://localhost:${PORT}`);
  console.log(`  Legacy pages     http://localhost:${PORT}/index.html`);
  console.log('');
  console.log('  The SvelteKit app runs separately:');
  console.log('    cd frontend && npm run dev   ->  http://localhost:5173');
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
