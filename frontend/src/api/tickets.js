const BASE = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      data?.error ||
      (data?.details ? data.details.join(', ') : null) ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export const getTickets = (filters = {}) => {
  const p = new URLSearchParams();
  if (filters.status) p.set('status', filters.status);
  if (filters.priority) p.set('priority', filters.priority);
  if (filters.breached) p.set('breached', 'true');
  const qs = p.toString();
  return request(`/tickets${qs ? '?' + qs : ''}`);
};

export const createTicket = (body) =>
  request('/tickets', { method: 'POST', body: JSON.stringify(body) });

export const patchTicket = (id, status) =>
  request(`/tickets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

export const deleteTicket = (id) =>
  request(`/tickets/${id}`, { method: 'DELETE' });

export const getStats = () => request('/tickets/stats');
