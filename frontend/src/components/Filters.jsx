export default function Filters({ filters, setFilters, onRefresh, loading }) {
  return (
    <div className="toolbar">
      <span className="filter-label">Filter:</span>

      <select
        id="filter-priority"
        className="filter-select"
        value={filters.priority}
        onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))}
      >
        <option value="">All Priorities</option>
        <option value="urgent">🔴 Urgent</option>
        <option value="high">🟠 High</option>
        <option value="medium">🟡 Medium</option>
        <option value="low">🟢 Low</option>
      </select>

      <button
        id="filter-breached"
        className={`toggle-btn ${filters.breached ? 'active' : ''}`}
        onClick={() => setFilters(f => ({ ...f, breached: !f.breached }))}
      >
        ⚠️ SLA Breached Only
      </button>

      {(filters.priority || filters.breached) && (
        <button
          className="toggle-btn"
          onClick={() => setFilters({ priority: '', breached: false })}
        >
          ✕ Clear Filters
        </button>
      )}

      <button
        className="btn-icon"
        id="refresh-btn"
        onClick={onRefresh}
        disabled={loading}
        title="Refresh"
        style={{ marginLeft: 'auto' }}
      >
        {loading ? '⏳' : '↻'}
      </button>
    </div>
  )
}
