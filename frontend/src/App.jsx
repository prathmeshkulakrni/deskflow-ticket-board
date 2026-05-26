import { useState, useEffect, useCallback, useRef } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { getTickets, getStats, patchTicket, deleteTicket } from './api/tickets'
import StatsStrip from './components/StatsStrip'
import Filters from './components/Filters'
import Board from './components/Board'
import TicketCard from './components/TicketCard'
import CreateTicketModal from './components/CreateTicketModal'

const STATUS_ORDER = ['open', 'in_progress', 'resolved', 'closed']

function isValidTransition(from, to) {
  const fi = STATUS_ORDER.indexOf(from)
  const ti = STATUS_ORDER.indexOf(to)
  const diff = ti - fi
  return diff === 1 || diff === -1
}

export default function App() {
  const [tickets, setTickets] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [globalError, setGlobalError] = useState(null)
  const [filters, setFilters] = useState({ priority: '', breached: false })
  const [showModal, setShowModal] = useState(false)
  const [activeTicket, setActiveTicket] = useState(null) // for DnD overlay
  const [toasts, setToasts] = useState([])

  // ── Helpers ──────────────────────────────────────────────────────────────
  const addToast = useCallback((msg, type = 'error') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000)
  }, [])

  // ── Data Fetching ─────────────────────────────────────────────────────────
  const loadTickets = useCallback(async () => {
    try {
      const data = await getTickets(filters)
      setTickets(data)
      setGlobalError(null)
    } catch (err) {
      setGlobalError(err.message)
    }
  }, [filters])

  const loadStats = useCallback(async () => {
    try {
      const data = await getStats()
      setStats(data)
    } catch { /* stats are non-critical */ }
  }, [])

  const refresh = useCallback(async () => {
    await Promise.all([loadTickets(), loadStats()])
  }, [loadTickets, loadStats])

  useEffect(() => {
    setLoading(true)
    refresh().finally(() => setLoading(false))
  }, [refresh])

  // ── Status change (from card buttons or drag-and-drop) ───────────────────
  const handleStatusChange = useCallback(async (ticketId, newStatus) => {
    const ticket = tickets.find(t => t._id === ticketId)
    if (!ticket) return

    if (!isValidTransition(ticket.status, newStatus)) {
      addToast(`Invalid transition: ${ticket.status} → ${newStatus}`)
      return false
    }

    // Optimistic update
    setTickets(prev => prev.map(t =>
      t._id === ticketId ? { ...t, status: newStatus } : t
    ))

    try {
      const updated = await patchTicket(ticketId, newStatus)
      setTickets(prev => prev.map(t => t._id === ticketId ? updated : t))
      loadStats()
      return true
    } catch (err) {
      // Rollback
      setTickets(prev => prev.map(t => t._id === ticketId ? ticket : t))
      addToast(err.message)
      return false
    }
  }, [tickets, addToast, loadStats])

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (ticketId) => {
    if (!window.confirm('Delete this ticket? This cannot be undone.')) return
    setTickets(prev => prev.filter(t => t._id !== ticketId))
    try {
      await deleteTicket(ticketId)
      loadStats()
    } catch (err) {
      addToast(err.message)
      refresh()
    }
  }, [addToast, loadStats, refresh])

  // ── Create ────────────────────────────────────────────────────────────────
  const handleCreate = useCallback((newTicket) => {
    setTickets(prev => [newTicket, ...prev])
    loadStats()
  }, [loadStats])

  // ── Drag-and-Drop ─────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const handleDragStart = useCallback(({ active }) => {
    const ticket = tickets.find(t => t._id === active.id)
    setActiveTicket(ticket || null)
  }, [tickets])

  const handleDragEnd = useCallback(async ({ active, over }) => {
    setActiveTicket(null)
    if (!over) return

    const ticket = tickets.find(t => t._id === active.id)
    if (!ticket) return

    const targetStatus = over.id  // column id = status string
    if (targetStatus === ticket.status) return

    if (!STATUS_ORDER.includes(targetStatus)) return

    const ok = await handleStatusChange(ticket._id, targetStatus)
    if (!ok) {
      addToast(`Cannot move ticket here — invalid transition`, 'error')
    }
  }, [tickets, handleStatusChange, addToast])

  // ── Render ────────────────────────────────────────────────────────────────
  const boardTickets = tickets // already filtered server-side

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="app">
        {/* Header */}
        <header className="header">
          <div className="header-brand">
            <div className="header-logo">🎫</div>
            <div>
              <div className="header-title">DeskFlow</div>
              <div className="header-sub">Support Ticket Triage Board</div>
            </div>
          </div>
          <button className="btn-primary" id="open-create-modal" onClick={() => setShowModal(true)}>
            <span>＋</span> New Ticket
          </button>
        </header>

        {/* Stats */}
        <StatsStrip stats={stats} />

        {/* Toolbar */}
        <Filters filters={filters} setFilters={setFilters} onRefresh={refresh} loading={loading} />

        {/* Error banner */}
        {globalError && (
          <div className="error-banner">
            <span>⚠️ {globalError}</span>
            <button className="error-close" onClick={() => setGlobalError(null)}>✕</button>
          </div>
        )}

        {/* Board */}
        {loading ? (
          <div className="loading-overlay">
            <div className="spinner" />
            <span>Loading tickets…</span>
          </div>
        ) : (
          <div className="board-container">
            <Board
              tickets={boardTickets}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              activeId={activeTicket?._id}
            />
          </div>
        )}

        {/* Drag Overlay */}
        <DragOverlay>
          {activeTicket && (
            <div className="drag-overlay-card">
              <TicketCard
                ticket={activeTicket}
                onStatusChange={() => {}}
                onDelete={() => {}}
                isDragging
              />
            </div>
          )}
        </DragOverlay>

        {/* Create Modal */}
        {showModal && (
          <CreateTicketModal
            onClose={() => setShowModal(false)}
            onCreate={handleCreate}
          />
        )}

        {/* Toasts */}
        <div className="toast-container">
          {toasts.map(t => (
            <div key={t.id} className={`toast ${t.type}`}>
              {t.type === 'error' ? '⚠️' : '✅'} {t.msg}
            </div>
          ))}
        </div>
      </div>
    </DndContext>
  )
}
