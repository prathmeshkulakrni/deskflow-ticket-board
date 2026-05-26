/**
 * DeskFlow — Netlify Serverless Function
 * Wraps the full Express API. All /tickets/* requests are redirected here
 * by netlify.toml. The function strips the Netlify path prefix so Express
 * sees clean routes like /tickets, /tickets/:id, etc.
 */

// ── Fix DNS for MongoDB Atlas SRV lookups ─────────────────────────────────────
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const mongoose   = require('mongoose');
const serverless = require('serverless-http');

// ═══════════════════════════════════════════════════════════════════════════════
// TICKET MODEL (inlined for serverless — avoids relative path issues)
// ═══════════════════════════════════════════════════════════════════════════════

const SLA_TARGETS = { urgent: 60, high: 240, medium: 1440, low: 4320 };

const ticketSchema = new mongoose.Schema(
  {
    subject:       { type: String, required: [true, 'Subject is required'],        trim: true },
    description:   { type: String, required: [true, 'Description is required'],    trim: true },
    customerEmail: {
      type: String, required: [true, 'Customer email is required'],
      trim: true, lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Must be a valid email'],
    },
    priority: {
      type: String,
      enum: { values: ['low','medium','high','urgent'], message: 'Invalid priority' },
      required: [true, 'Priority is required'],
    },
    status: {
      type: String,
      enum: { values: ['open','in_progress','resolved','closed'], message: 'Invalid status' },
      default: 'open',
    },
    createdAt:  { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: false }
);

ticketSchema.set('toJSON', {
  transform(doc, ret) {
    const now       = new Date();
    const createdAt = new Date(ret.createdAt);
    const endTime   =
      (ret.status === 'resolved' || ret.status === 'closed') && ret.resolvedAt
        ? new Date(ret.resolvedAt)
        : now;

    ret.ageMinutes = Math.max(0, Math.floor((endTime - createdAt) / 60_000));

    const target = SLA_TARGETS[ret.priority];
    if (ret.status === 'open' || ret.status === 'in_progress') {
      ret.slaBreached = Math.floor((now - createdAt) / 60_000) > target;
    } else {
      const resolvedAge = ret.resolvedAt
        ? Math.floor((new Date(ret.resolvedAt) - createdAt) / 60_000)
        : ret.ageMinutes;
      ret.slaBreached = resolvedAge > target;
    }
    return ret;
  },
});

// Use existing model if already compiled (hot-reload / connection caching)
const Ticket = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

const STATUS_ORDER    = ['open', 'in_progress', 'resolved', 'closed'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const VALID_STATUSES   = ['open', 'in_progress', 'resolved', 'closed'];

function isValidTransition(from, to) {
  const diff = STATUS_ORDER.indexOf(to) - STATUS_ORDER.indexOf(from);
  return diff === 1 || diff === -1;
}
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const router = express.Router();

// GET /tickets/stats  ← MUST be before /:id
router.get('/stats', async (req, res) => {
  try {
    const tickets     = await Ticket.find({});
    const jsonTickets = tickets.map(t => t.toJSON());

    const statusCounts   = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
    const priorityCounts = { low: 0, medium: 0, high: 0, urgent: 0 };
    let breachedCount    = 0;

    for (const t of jsonTickets) {
      statusCounts[t.status]     = (statusCounts[t.status]   || 0) + 1;
      priorityCounts[t.priority] = (priorityCounts[t.priority] || 0) + 1;
      if (t.slaBreached && (t.status === 'open' || t.status === 'in_progress')) breachedCount++;
    }
    res.json({ statusCounts, priorityCounts, breachedCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /tickets
router.post('/', async (req, res) => {
  try {
    const { subject, description, customerEmail, priority } = req.body;
    const errors = [];

    if (!subject?.trim())       errors.push('subject is required');
    if (!description?.trim())   errors.push('description is required');
    if (!customerEmail?.trim()) errors.push('customerEmail is required');
    else if (!validateEmail(customerEmail.trim())) errors.push('customerEmail must be a valid email address');
    if (!priority)              errors.push('priority is required');
    else if (!VALID_PRIORITIES.includes(priority)) errors.push(`priority must be one of: ${VALID_PRIORITIES.join(', ')}`);

    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

    const ticket = new Ticket({
      subject: subject.trim(),
      description: description.trim(),
      customerEmail: customerEmail.trim().toLowerCase(),
      priority,
    });
    await ticket.save();
    res.status(201).json(ticket.toJSON());
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: 'Validation failed', details: Object.values(err.errors).map(e => e.message) });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /tickets
router.get('/', async (req, res) => {
  try {
    const { status, priority, breached } = req.query;
    const query = {};

    if (status) {
      if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: `Invalid status: "${status}"` });
      query.status = status;
    }
    if (priority) {
      if (!VALID_PRIORITIES.includes(priority)) return res.status(400).json({ error: `Invalid priority: "${priority}"` });
      query.priority = priority;
    }

    const tickets = await Ticket.find(query).sort({ createdAt: -1 });
    let result    = tickets.map(t => t.toJSON());
    if (breached === 'true') result = result.filter(t => t.slaBreached);

    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /tickets/:id
router.patch('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const { status } = req.body;
    if (!status)                         return res.status(400).json({ error: '"status" is required' });
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: `Invalid status: "${status}"` });
    if (status === ticket.status)         return res.json(ticket.toJSON());

    if (!isValidTransition(ticket.status, status)) {
      return res.status(400).json({
        error: `Invalid transition: "${ticket.status}" → "${status}". Only one step forward or one step backward allowed.`,
      });
    }

    const prev  = ticket.status;
    ticket.status = status;

    if (status === 'resolved')                              ticket.resolvedAt = new Date();
    else if (prev === 'resolved' && status === 'in_progress') ticket.resolvedAt = null;

    await ticket.save();
    res.json(ticket.toJSON());
  } catch (err) {
    if (err.name === 'CastError') return res.status(404).json({ error: 'Ticket not found' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /tickets/:id
router.delete('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findByIdAndDelete(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ message: 'Ticket deleted successfully', id: req.params.id });
  } catch (err) {
    if (err.name === 'CastError') return res.status(404).json({ error: 'Ticket not found' });
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXPRESS APP
// ═══════════════════════════════════════════════════════════════════════════════

const app = express();
app.use(cors({ origin: '*', methods: ['GET','POST','PATCH','DELETE','OPTIONS'] }));
app.use(express.json({ limit: '1mb' }));
app.get('/', (req, res) => res.json({ status: 'ok', service: 'DeskFlow API' }));
app.use('/tickets', router);
app.use((req, res) => res.status(404).json({ error: `${req.method} ${req.path} not found` }));

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE (cached connection — critical for serverless cold starts)
// ═══════════════════════════════════════════════════════════════════════════════

let dbPromise = null;

function connectDB() {
  if (dbPromise) return dbPromise;
  dbPromise = mongoose
    .connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
    })
    .catch(err => {
      dbPromise = null; // allow retry on next invocation
      throw err;
    });
  return dbPromise;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NETLIFY HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

const wrappedHandler = serverless(app);

module.exports.handler = async (event, context) => {
  // Prevent Lambda/Netlify from waiting for the event loop to drain
  context.callbackWaitsForEmptyEventLoop = false;

  // Strip the Netlify function path prefix so Express sees clean routes
  // e.g. /.netlify/functions/api/tickets → /tickets
  const PREFIX = '/.netlify/functions/api';
  if (event.path && event.path.startsWith(PREFIX)) {
    event.path = event.path.slice(PREFIX.length) || '/';
  }

  // Connect to MongoDB (uses cached connection on warm invocations)
  await connectDB();

  return wrappedHandler(event, context);
};
