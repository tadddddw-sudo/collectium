import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profiles.js';
import collectionRoutes from './routes/collections.js';
import itemRoutes from './routes/items.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Modular REST API Routes
app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/items', itemRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Collectium running at http://localhost:${PORT}`));
