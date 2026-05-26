const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');

const STATUS_ORDER = ['open', 'in_progress', 'resolved', 'closed'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const VALID_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const SLA_TARGETS = { urgent: 60, high: 240, medium: 1440, low: 4320 };

// Setup persistent Mock Data for local development fallback
if (!global.mockTickets) {
  global.mockTickets = [
    {
      _id: "650c1f8279860b001c900001",
      subject: "Cannot access premium features",
      description: "Paid for the premium plan but account is still showing free tier.",
      customerEmail: "john.doe@example.com",
      priority: "high",
      status: "open",
      createdAt: new Date(Date.now() - 5 * 3600000), // 5 hours ago (breached SLA)
      resolvedAt: null
    },
    {
      _id: "650c1f8279860b001c900002",
      subject: "App crashes on launch",
      description: "The iOS app crashes immediately after the splash screen appears.",
      customerEmail: "sarah.smith@example.com",
      priority: "urgent",
      status: "in_progress",
      createdAt: new Date(Date.now() - 45 * 60000), // 45 mins ago (within SLA)
      resolvedAt: null
    },
    {
      _id: "650c1f8279860b001c900003",
      subject: "Typo in API documentation",
      description: "Found a typo on /endpoints/auth page under headers section.",
      customerEmail: "developer@example.com",
      priority: "low",
      status: "resolved",
      createdAt: new Date(Date.now() - 2 * 24 * 3600000), // 2 days ago
      resolvedAt: new Date(Date.now() - 1 * 24 * 3600000) // 1 day ago
    },
    {
      _id: "650c1f8279860b001c900004",
      subject: "Billing invoice request",
      description: "Need the invoice for April 2026 for tax submission.",
      customerEmail: "finance@company.com",
      priority: "medium",
      status: "open",
      createdAt: new Date(Date.now() - 30 * 3600000), // 30 hours ago (breached SLA)
      resolvedAt: null
    }
  ];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function applySLAFields(ret) {
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
}

function formatTicket(t) {
  return applySLAFields({
    ...t,
    _id: t._id.toString(),
    createdAt: t.createdAt.toISOString ? t.createdAt.toISOString() : new Date(t.createdAt).toISOString(),
    resolvedAt: t.resolvedAt ? (t.resolvedAt.toISOString ? t.resolvedAt.toISOString() : new Date(t.resolvedAt).toISOString()) : null
  });
}

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
    let jsonTickets;
    if (global.useMockDB) {
      jsonTickets = global.mockTickets.map(t => formatTicket(t));
    } else {
      const tickets = await Ticket.find({}).lean();
      jsonTickets = tickets.map((t) => new (require('../models/Ticket'))(t).toJSON());
    }

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

    res.json({ statusCounts, priorityCounts, breachedCount, _database: global.useMockDB ? "in-memory-fallback" : "mongodb-atlas" });
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

    if (global.useMockDB) {
      const newTicket = {
        _id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
        subject: subject.trim(),
        description: description.trim(),
        customerEmail: customerEmail.trim().toLowerCase(),
        priority,
        status: 'open',
        createdAt: new Date(),
        resolvedAt: null
      };
      global.mockTickets.push(newTicket);
      return res.status(201).json(formatTicket(newTicket));
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

    if (global.useMockDB) {
      let filtered = [...global.mockTickets];
      if (status) {
        if (!VALID_STATUSES.includes(status)) {
          return res.status(400).json({ error: `Invalid status filter: "${status}". Must be one of: ${VALID_STATUSES.join(', ')}` });
        }
        filtered = filtered.filter(t => t.status === status);
      }

      if (priority) {
        if (!VALID_PRIORITIES.includes(priority)) {
          return res.status(400).json({ error: `Invalid priority filter: "${priority}". Must be one of: ${VALID_PRIORITIES.join(', ')}` });
        }
        filtered = filtered.filter(t => t.priority === priority);
      }

      let result = filtered.map(t => formatTicket(t));
      if (breached === 'true') {
        result = result.filter((t) => t.slaBreached);
      }
      result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return res.json(result);
    }

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
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: '"status" is required in request body' });
    }

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status: "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    if (global.useMockDB) {
      const ticket = global.mockTickets.find(t => t._id.toString() === req.params.id);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

      if (status === ticket.status) {
        return res.json(formatTicket(ticket));
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
        ticket.resolvedAt = null;
      }

      return res.json(formatTicket(ticket));
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

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
    if (global.useMockDB) {
      const index = global.mockTickets.findIndex(t => t._id.toString() === req.params.id);
      if (index === -1) return res.status(404).json({ error: 'Ticket not found' });
      const id = global.mockTickets[index]._id;
      global.mockTickets.splice(index, 1);
      return res.json({ message: 'Ticket deleted successfully', id });
    }

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
