const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');

const STATUS_ORDER = ['open', 'in_progress', 'resolved', 'closed'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const VALID_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function isValidTransition(from, to) {
  const fromIdx = STATUS_ORDER.indexOf(from);
  const toIdx = STATUS_ORDER.indexOf(to);
  const diff = toIdx - fromIdx;
  // One step forward OR one step backward only
  return diff === 1 || diff === -1;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── GET /tickets/stats  (MUST be before /:id) ────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const tickets = await Ticket.find({}).lean();
    const jsonTickets = tickets.map((t) => new (require('../models/Ticket'))(t).toJSON());

    const statusCounts = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
    const priorityCounts = { low: 0, medium: 0, high: 0, urgent: 0 };
    let breachedCount = 0;

    for (const t of jsonTickets) {
      statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
      priorityCounts[t.priority] = (priorityCounts[t.priority] ?? 0) + 1;
      if (t.slaBreached && (t.status === 'open' || t.status === 'in_progress')) {
        breachedCount++;
      }
    }

    res.json({ statusCounts, priorityCounts, breachedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /tickets ─────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { subject, description, customerEmail, priority } = req.body;
    const errors = [];

    if (!subject || !subject.trim()) errors.push('subject is required');
    if (!description || !description.trim()) errors.push('description is required');
    if (!customerEmail || !customerEmail.trim()) {
      errors.push('customerEmail is required');
    } else if (!validateEmail(customerEmail.trim())) {
      errors.push('customerEmail must be a valid email address');
    }
    if (!priority) {
      errors.push('priority is required');
    } else if (!VALID_PRIORITIES.includes(priority)) {
      errors.push(`priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

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
      const details = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ error: 'Validation failed', details });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── GET /tickets ──────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, priority, breached } = req.query;
    const query = {};

    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid status filter: "${status}". Must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      query.status = status;
    }

    if (priority) {
      if (!VALID_PRIORITIES.includes(priority)) {
        return res.status(400).json({ error: `Invalid priority filter: "${priority}". Must be one of: ${VALID_PRIORITIES.join(', ')}` });
      }
      query.priority = priority;
    }

    const tickets = await Ticket.find(query).sort({ createdAt: -1 });
    let result = tickets.map((t) => t.toJSON());

    // breached filter is derived — must apply in-memory
    if (breached === 'true') {
      result = result.filter((t) => t.slaBreached);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /tickets/:id ────────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: '"status" is required in request body' });
    }

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status: "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    if (status === ticket.status) {
      return res.json(ticket.toJSON());
    }

    if (!isValidTransition(ticket.status, status)) {
      return res.status(400).json({
        error: `Invalid transition: "${ticket.status}" → "${status}". Only one step forward or one step backward is allowed.`,
      });
    }

    const prevStatus = ticket.status;
    ticket.status = status;

    // Manage resolvedAt
    if (status === 'resolved') {
      ticket.resolvedAt = new Date();
    } else if (prevStatus === 'resolved' && status === 'in_progress') {
      ticket.resolvedAt = null; // Clear when moving back from resolved
    }

    await ticket.save();
    res.json(ticket.toJSON());
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /tickets/:id ───────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findByIdAndDelete(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ message: 'Ticket deleted successfully', id: req.params.id });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
