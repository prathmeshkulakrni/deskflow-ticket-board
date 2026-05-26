import { useDroppable } from '@dnd-kit/core'
import TicketCard from './TicketCard'

const COLUMN_META = {
  open:        { label: 'Open',        icon: '🔵', emptyIcon: '📭' },
  in_progress: { label: 'In Progress', icon: '🟡', emptyIcon: '⚙️' },
  resolved:    { label: 'Resolved',    icon: '🟢', emptyIcon: '🎉' },
  closed:      { label: 'Closed',      icon: '⚫', emptyIcon: '🗂️' },
}

export default function Column({ status, tickets, onStatusChange, onDelete, activeId }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const meta = COLUMN_META[status]

  return (
    <div
      ref={setNodeRef}
      className={`column col-${status} ${isOver ? 'drop-over' : ''}`}
    >
      <div className="column-header">
        <span className="col-dot" />
        <span className="column-title">{meta.label}</span>
        <span className="column-count">{tickets.length}</span>
      </div>

      <div className="column-body">
        {tickets.length === 0 ? (
          <div className="column-empty">
            <div className="column-empty-icon">{meta.emptyIcon}</div>
            No tickets here
          </div>
        ) : (
          tickets.map(ticket => (
            <TicketCard
              key={ticket._id}
              ticket={ticket}
              onStatusChange={onStatusChange}
              onDelete={onDelete}
              isDragging={ticket._id === activeId}
            />
          ))
        )}
      </div>
    </div>
  )
}
