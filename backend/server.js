// Fix: force Google DNS for MongoDB Atlas SRV record resolution
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const ticketRoutes = require('./routes/tickets');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '1mb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'DeskFlow API', version: '1.0.0' });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/tickets', ticketRoutes);

// ── 404 fallback ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

global.useMockDB = false;

console.log('🔄 Attempting to connect to MongoDB Atlas...');
mongoose
  .connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 4000, // Fail fast locally to jump to fallback database quickly
    socketTimeoutMS: 30000,
    family: 4, // Force IPv4
  })
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    global.useMockDB = false;
    app.listen(PORT, () =>
      console.log(`🚀 DeskFlow API running on port ${PORT} (Connected to MongoDB Atlas)`)
    );
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    console.warn('💡 Switching dynamically to premium In-Memory Fallback DB to keep local dev 100% active!');
    global.useMockDB = true;
    app.listen(PORT, () =>
      console.log(`🚀 DeskFlow API running on port ${PORT} (In-Memory Fallback DB Mode)`)
    );
  });
