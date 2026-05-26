import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

const STATUS_ORDER = ['open', 'in_progress', 'resolved', 'closed']

const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

function formatAge(minutes) {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`
}

export default function TicketCard({ ticket, onStatusChange, onDelete, isDragging }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: ticket._id,
  })

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined

  const idx = STATUS_ORDER.indexOf(ticket.status)
  const canForward  = idx < STATUS_ORDER.length - 1
  const canBackward = idx > 0
  const nextStatus  = canForward  ? STATUS_ORDER[idx + 1] : null
  const prevStatus  = canBackward ? STATUS_ORDER[idx - 1] : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`ticket-card priority-${ticket.priority} ${isDragging ? 'dragging' : ''}`}
    >
      {/* Header: subject + priority badge */}
      <div className="card-header">
        <span className="card-subject">{ticket.subject}</span>
        <span className={`priority-badge ${ticket.priority}`}>
          {ticket.priority}
        </span>
      </div>

      {/* Age + SLA */}
      <div className="card-meta">
        <span className="card-age">🕐 {formatAge(ticket.ageMinutes)}</span>
        {ticket.slaBreached && (
          <span className="sla-badge">⚠️ SLA Breached</span>
        )}
      </div>

      {/* Email */}
      <div className="card-email" title={ticket.customerEmail}>
        ✉️ {ticket.customerEmail}
      </div>

      {/* Action buttons */}
      <div className="card-actions" onClick={e => e.stopPropagation()}>
        {prevStatus && (
          <button
            className="card-btn backward"
            onClick={() => onStatusChange(ticket._id, prevStatus)}
            title={`Move back to ${STATUS_LABELS[prevStatus]}`}
          >
            ← {STATUS_LABELS[prevStatus]}
          </button>
        )}
        {nextStatus && (
          <button
            className="card-btn forward"
            onClick={() => onStatusChange(ticket._id, nextStatus)}
            title={`Move to ${STATUS_LABELS[nextStatus]}`}
          >
            {STATUS_LABELS[nextStatus]} →
          </button>
        )}
        <button
          className="card-btn danger"
          onClick={() => onDelete(ticket._id)}
          title="Delete ticket"
        >
          🗑
        </button>
      </div>
    </div>
  )
}
