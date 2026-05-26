export default function StatsStrip({ stats }) {
  if (!stats) return null

  const { statusCounts, priorityCounts, breachedCount } = stats

  const statusDots = {
    open:        '#818cf8',
    in_progress: '#f59e0b',
    resolved:    '#10b981',
    closed:      '#475569',
  }

  const statusLabels = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    closed: 'Closed',
  }

  return (
    <div className="stats-strip">
      {Object.entries(statusCounts).map(([status, count]) => (
        <div className="stat-pill" key={status}>
          <span className="dot" style={{ background: statusDots[status] }} />
          <span>{statusLabels[status]}</span>
          <span className="count">{count}</span>
        </div>
      ))}

      <div className="stats-divider" />

      <div className={`stat-pill ${breachedCount > 0 ? 'breached' : ''}`}>
        <span>⚠️</span>
        <span>SLA Breached</span>
        <span className="count">{breachedCount}</span>
      </div>
    </div>
  )
}
