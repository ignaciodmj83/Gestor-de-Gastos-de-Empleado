const DashboardView = {
  async render(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Inicio</h1>
          <div class="sub">Resumen de actividad y pendientes</div>
        </div>
      </div>
      <div id="dash-content">Cargando...</div>
    `;
    const content = container.querySelector('#dash-content');
    try {
      const user = API.getUser();
      const [inbox, balance, status] = await Promise.all([
        API.get('/admin/inbox').catch(() => ({ tickets: [], mileage: [], leaves: [], corrections: [] })),
        API.get('/vacations/balance').catch(() => null),
        API.get('/time/status').catch(() => null),
      ]);

      const totalPending =
        (inbox.tickets?.length || 0) +
        (inbox.mileage?.length || 0) +
        (inbox.leaves?.length || 0) +
        (inbox.corrections?.length || 0);

      const lastEvent = status?.last;
      const isWorking = lastEvent && (lastEvent.event_type === 'IN' || lastEvent.event_type === 'BREAK_END');

      content.innerHTML = `
        <div class="card-grid">
          <div class="card kpi">
            <div class="label">Tu jornada hoy</div>
            <div class="num">${isWorking ? 'Trabajando' : (lastEvent ? 'Fuera' : 'Sin fichaje')}</div>
            <div style="font-size:12px;color:var(--text-dim);">
              ${lastEvent ? 'Último: ' + lastEvent.event_type + ' a las ' + UI.formatDateTime(lastEvent.ts) : 'Aún no has fichado'}
            </div>
          </div>
          <div class="card kpi">
            <div class="label">Vacaciones</div>
            <div class="num">${balance ? balance.remaining : '-'}</div>
            <div style="font-size:12px;color:var(--text-dim);">
              ${balance ? `${balance.used} usados / ${balance.allocated} totales (${balance.pending} pendientes)` : ''}
            </div>
          </div>
          <div class="card kpi">
            <div class="label">Pendientes de aprobar</div>
            <div class="num">${totalPending}</div>
            <div style="font-size:12px;color:var(--text-dim);">
              ${user.role === 'employee' ? 'Solo managers/admin' : `${inbox.tickets.length} tickets · ${inbox.mileage.length} km · ${inbox.leaves.length} vac · ${inbox.corrections.length} fich.`}
            </div>
          </div>
        </div>

        ${user.role !== 'employee' ? `
          <div style="margin-top:24px;">
            <div class="card">
              <h2>Bandeja de aprobación</h2>
              ${this.renderInbox(inbox)}
            </div>
          </div>
        ` : ''}
      `;
    } catch (e) {
      content.innerHTML = `<div class="error-msg">${UI.escapeHtml(e.message)}</div>`;
    }
  },

  renderInbox(inbox) {
    const sections = [];
    if (inbox.tickets?.length) {
      sections.push(`<h3 style="font-size:13px;color:var(--text-dim);margin:16px 0 8px;text-transform:uppercase;">Tickets (${inbox.tickets.length})</h3>` +
        inbox.tickets.map(t => `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
          <a href="#/tickets/${t.id}">${UI.escapeHtml(t.subject)}</a> — <span style="color:var(--text-dim);">${UI.escapeHtml(t.requester_name)}</span>
        </div>`).join(''));
    }
    if (inbox.mileage?.length) {
      sections.push(`<h3 style="font-size:13px;color:var(--text-dim);margin:16px 0 8px;text-transform:uppercase;">Viajes/Km (${inbox.mileage.length})</h3>` +
        inbox.mileage.map(m => `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
          <a href="#/mileage/${m.id}">${UI.escapeHtml(m.title)}</a> — <span style="color:var(--text-dim);">${UI.escapeHtml(m.employee_name)}</span> — ${UI.formatMoney(m.total_amount)}
        </div>`).join(''));
    }
    if (inbox.leaves?.length) {
      sections.push(`<h3 style="font-size:13px;color:var(--text-dim);margin:16px 0 8px;text-transform:uppercase;">Vacaciones (${inbox.leaves.length})</h3>` +
        inbox.leaves.map(l => `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
          <a href="#/vacations">${UI.formatDate(l.start_date)} → ${UI.formatDate(l.end_date)}</a> — ${l.days} días — <span style="color:var(--text-dim);">${UI.escapeHtml(l.employee_name)}</span>
        </div>`).join(''));
    }
    if (inbox.corrections?.length) {
      sections.push(`<h3 style="font-size:13px;color:var(--text-dim);margin:16px 0 8px;text-transform:uppercase;">Correcciones de fichaje (${inbox.corrections.length})</h3>` +
        inbox.corrections.map(c => `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
          <a href="#/timeclock">${UI.escapeHtml(c.employee_name)}</a> — ${c.requested_event_type} — ${UI.formatDate(c.target_date)} — <span style="color:var(--text-dim);">${UI.escapeHtml(c.reason)}</span>
        </div>`).join(''));
    }
    return sections.length ? sections.join('') : UI.emptyState('Sin pendientes');
  },
};
