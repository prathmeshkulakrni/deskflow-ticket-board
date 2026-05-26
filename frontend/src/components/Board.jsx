import Column from './Column'

const STATUSES = ['open', 'in_progress', 'resolved', 'closed']

export default function Board({ tickets, onStatusChange, onDelete, activeId }) {
  const byStatus = STATUSES.reduce((acc, s) => {
    acc[s] = tickets.filter(t => t.status === s)
    return acc
  }, {})

  return (
    <div className="board">
      {STATUSES.map(status => (
        <Column
          key={status}
          status={status}
          tickets={byStatus[status]}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
          activeId={activeId}
        />
      ))}
    </div>
  )
}
