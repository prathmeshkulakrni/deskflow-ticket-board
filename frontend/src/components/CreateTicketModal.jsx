import { useState } from 'react'
import { createTicket } from '../api/tickets'

const INITIAL = { subject: '', description: '', customerEmail: '', priority: '' }

export default function CreateTicketModal({ onClose, onCreate }) {
  const [form, setForm] = useState(INITIAL)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState(null)

  const set = (field, val) => {
    setForm(f => ({ ...f, [field]: val }))
    setErrors(e => ({ ...e, [field]: null }))
  }

  const validate = () => {
    const e = {}
    if (!form.subject.trim())        e.subject = 'Subject is required'
    if (!form.description.trim())    e.description = 'Description is required'
    if (!form.customerEmail.trim())  e.customerEmail = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail))
                                     e.customerEmail = 'Must be a valid email'
    if (!form.priority)              e.priority = 'Please select a priority'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSubmitting(true)
    setServerError(null)
    try {
      const ticket = await createTicket(form)
      onCreate(ticket)
      onClose()
    } catch (err) {
      setServerError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-heading">
        <div className="modal-header">
          <h2 className="modal-title" id="modal-heading">Create New Ticket</h2>
          <button className="modal-close" id="close-modal" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            {serverError && (
              <div className="error-banner" style={{ margin: 0 }}>
                <span>⚠️ {serverError}</span>
              </div>
            )}

            {/* Subject */}
            <div className="form-group">
              <label className="form-label" htmlFor="ticket-subject">
                Subject <span>*</span>
              </label>
              <input
                id="ticket-subject"
                className={`form-input ${errors.subject ? 'err' : ''}`}
                type="text"
                placeholder="Brief description of the issue"
                value={form.subject}
                onChange={e => set('subject', e.target.value)}
                autoFocus
              />
              {errors.subject && <span className="field-error">⚠ {errors.subject}</span>}
            </div>

            {/* Description */}
            <div className="form-group">
              <label className="form-label" htmlFor="ticket-description">
                Description <span>*</span>
              </label>
              <textarea
                id="ticket-description"
                className={`form-textarea ${errors.description ? 'err' : ''}`}
                placeholder="Provide detailed information about the issue"
                value={form.description}
                onChange={e => set('description', e.target.value)}
                rows={3}
              />
              {errors.description && <span className="field-error">⚠ {errors.description}</span>}
            </div>

            {/* Customer Email */}
            <div className="form-group">
              <label className="form-label" htmlFor="ticket-email">
                Customer Email <span>*</span>
              </label>
              <input
                id="ticket-email"
                className={`form-input ${errors.customerEmail ? 'err' : ''}`}
                type="email"
                placeholder="customer@example.com"
                value={form.customerEmail}
                onChange={e => set('customerEmail', e.target.value)}
              />
              {errors.customerEmail && <span className="field-error">⚠ {errors.customerEmail}</span>}
            </div>

            {/* Priority */}
            <div className="form-group">
              <label className="form-label" htmlFor="ticket-priority">
                Priority <span>*</span>
              </label>
              <select
                id="ticket-priority"
                className={`form-select ${errors.priority ? 'err' : ''}`}
                value={form.priority}
                onChange={e => set('priority', e.target.value)}
              >
                <option value="">Select priority…</option>
                <option value="low">🟢 Low — 72h SLA</option>
                <option value="medium">🟡 Medium — 24h SLA</option>
                <option value="high">🟠 High — 4h SLA</option>
                <option value="urgent">🔴 Urgent — 1h SLA</option>
              </select>
              {errors.priority && <span className="field-error">⚠ {errors.priority}</span>}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-cancel" id="cancel-create" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              id="submit-create"
              className="btn-primary"
              disabled={submitting}
            >
              {submitting ? '⏳ Creating…' : '🎫 Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
