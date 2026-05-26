const mongoose = require('mongoose');

// SLA response-time targets in minutes
const SLA_TARGETS = {
  urgent: 60,      // 1 hour
  high: 240,       // 4 hours
  medium: 1440,    // 24 hours
  low: 4320,       // 72 hours
};

const ticketSchema = new mongoose.Schema(
  {
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    customerEmail: {
      type: String,
      required: [true, 'Customer email is required'],
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Must be a valid email address'],
    },
    priority: {
      type: String,
      enum: {
        values: ['low', 'medium', 'high', 'urgent'],
        message: 'Priority must be one of: low, medium, high, urgent',
      },
      required: [true, 'Priority is required'],
    },
    status: {
      type: String,
      enum: {
        values: ['open', 'in_progress', 'resolved', 'closed'],
        message: 'Status must be one of: open, in_progress, resolved, closed',
      },
      default: 'open',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: false }
);

// Compute derived fields on every JSON serialization
ticketSchema.set('toJSON', {
  transform(doc, ret) {
    const now = new Date();
    const createdAt = new Date(ret.createdAt);

    // ageMinutes: frozen at resolvedAt for resolved/closed tickets
    const endTime =
      (ret.status === 'resolved' || ret.status === 'closed') && ret.resolvedAt
        ? new Date(ret.resolvedAt)
        : now;

    ret.ageMinutes = Math.max(0, Math.floor((endTime - createdAt) / 60_000));

    // slaBreached
    const target = SLA_TARGETS[ret.priority];

    if (ret.status === 'open' || ret.status === 'in_progress') {
      // Compare against NOW for unresolved tickets
      const currentAge = Math.floor((now - createdAt) / 60_000);
      ret.slaBreached = currentAge > target;
    } else {
      // resolved / closed — compare against resolvedAt
      const resolvedAge = ret.resolvedAt
        ? Math.floor((new Date(ret.resolvedAt) - createdAt) / 60_000)
        : ret.ageMinutes;
      ret.slaBreached = resolvedAge > target;
    }

    return ret;
  },
});

module.exports = mongoose.model('Ticket', ticketSchema);
