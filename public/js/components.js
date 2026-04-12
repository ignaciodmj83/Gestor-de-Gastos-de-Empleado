// Shared UI helpers
const UI = (function () {
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v !== null && v !== undefined) node.setAttribute(k, v);
    }
    if (!Array.isArray(children)) children = [children];
    for (const c of children) {
      if (c == null) continue;
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }

  function statusChip(status) {
    const map = {
      draft: 'Borrador',
      submitted: 'Pendiente',
      approved: 'Aprobado',
      rejected: 'Rechazado',
      cancelled: 'Cancelado',
      exported: 'Exportado',
    };
    return `<span class="chip chip-${status}">${map[status] || status}</span>`;
  }

  function formatDate(s) {
    if (!s) return '';
    const d = new Date(s.length === 10 ? s + 'T00:00:00' : s.replace(' ', 'T'));
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatDateTime(s) {
    if (!s) return '';
    const d = new Date(s.replace(' ', 'T'));
    if (isNaN(d.getTime())) return s;
    return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function formatMoney(n) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0);
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[m]));
  }

  function showModal({ title, body, footer }) {
    const backdrop = el('div', { class: 'modal-backdrop' });
    const modal = el('div', { class: 'modal' });
    const close = () => backdrop.remove();
    const headerEl = el('div', { class: 'modal-header' }, [
      el('h3', {}, title),
      el('button', { class: 'close', onclick: close, type: 'button' }, '×'),
    ]);
    modal.appendChild(headerEl);
    const bodyEl = el('div', { class: 'modal-body' });
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else bodyEl.appendChild(body);
    modal.appendChild(bodyEl);
    if (footer) {
      const footerEl = el('div', { class: 'modal-footer' });
      if (typeof footer === 'function') footer(footerEl, close);
      else footerEl.appendChild(footer);
      modal.appendChild(footerEl);
    }
    backdrop.appendChild(modal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    document.body.appendChild(backdrop);
    return { close, modal };
  }

  function alertError(err) {
    alert('Error: ' + (err && err.message ? err.message : err));
  }

  function emptyState(msg) {
    return `<div class="empty-state">${escapeHtml(msg || 'Sin datos')}</div>`;
  }

  return { el, statusChip, formatDate, formatDateTime, formatMoney, escapeHtml, showModal, alertError, emptyState };
})();
