const VacationsView = {
  state: { calMonth: new Date() },

  async render(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Vacaciones</h1>
          <div class="sub">Solicitudes de ausencia y calendario de equipo</div>
        </div>
        <button class="btn" id="new-leave">+ Solicitar</button>
      </div>
      <div id="vac-content">Cargando...</div>
    `;
    container.querySelector('#new-leave').addEventListener('click', () => this.openCreateModal(container));
    await this.load(container);
  },

  async load(container) {
    const wrap = container.querySelector('#vac-content');
    try {
      const [requests, calendar, balance] = await Promise.all([
        API.get('/vacations'),
        API.get('/vacations/calendar'),
        API.get('/vacations/balance'),
      ]);
      wrap.innerHTML = `
        <div class="card-grid" style="margin-bottom:18px;">
          <div class="card kpi">
            <div class="label">Días asignados</div><div class="num">${balance.allocated}</div>
          </div>
          <div class="card kpi">
            <div class="label">Usados</div><div class="num">${balance.used}</div>
          </div>
          <div class="card kpi">
            <div class="label">Pendientes</div><div class="num">${balance.pending}</div>
          </div>
          <div class="card kpi">
            <div class="label">Restantes</div><div class="num" style="color:var(--success);">${balance.remaining}</div>
          </div>
        </div>

        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <h2 style="margin:0;">Calendario</h2>
            <div>
              <button class="btn btn-sm btn-secondary" id="prev-month">←</button>
              <span id="month-label" style="margin:0 12px;font-weight:600;"></span>
              <button class="btn btn-sm btn-secondary" id="next-month">→</button>
            </div>
          </div>
          <div id="cal"></div>
        </div>

        <div class="card" style="margin-top:18px;">
          <h2>Mis solicitudes / equipo</h2>
          <div id="requests-list"></div>
        </div>
      `;

      this.renderCalendar(container, calendar);
      this.renderRequestsTable(container, requests);

      container.querySelector('#prev-month').addEventListener('click', () => {
        this.state.calMonth = new Date(this.state.calMonth.getFullYear(), this.state.calMonth.getMonth() - 1, 1);
        this.renderCalendar(container, calendar);
      });
      container.querySelector('#next-month').addEventListener('click', () => {
        this.state.calMonth = new Date(this.state.calMonth.getFullYear(), this.state.calMonth.getMonth() + 1, 1);
        this.renderCalendar(container, calendar);
      });
    } catch (e) {
      wrap.innerHTML = `<div class="error-msg">${UI.escapeHtml(e.message)}</div>`;
    }
  },

  renderCalendar(container, leaves) {
    const cal = container.querySelector('#cal');
    const label = container.querySelector('#month-label');
    const month = this.state.calMonth;
    const year = month.getFullYear();
    const m = month.getMonth();
    label.textContent = month.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

    const first = new Date(year, m, 1);
    const last = new Date(year, m + 1, 0);
    const startDay = (first.getDay() + 6) % 7; // monday=0
    const days = last.getDate();
    const today = new Date().toISOString().slice(0, 10);

    const dayHeaders = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
    let html = '<div class="cal">';
    dayHeaders.forEach(d => html += `<div class="day-header">${d}</div>`);
    for (let i = 0; i < startDay; i++) html += '<div class="day empty"></div>';
    for (let d = 1; d <= days; d++) {
      const dateStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const overlapping = leaves.filter(l => dateStr >= l.start_date && dateStr <= l.end_date);
      const isToday = dateStr === today;
      html += `<div class="day ${isToday ? 'today' : ''}">
        <div class="date">${d}</div>
        ${overlapping.map(l => `<span class="leave-pill ${l.status === 'submitted' ? 'pending' : ''}" title="${UI.escapeHtml(l.employee_name)}">${UI.escapeHtml(l.employee_name.split(' ')[0])}</span>`).join('')}
      </div>`;
    }
    html += '</div>';
    cal.innerHTML = html;
  },

  renderRequestsTable(container, rows) {
    const list = container.querySelector('#requests-list');
    if (!rows.length) { list.innerHTML = UI.emptyState('Sin solicitudes'); return; }
    const user = API.getUser();
    list.innerHTML = `
      <table>
        <thead><tr>
          <th>Empleado</th><th>Tipo</th><th>Inicio</th><th>Fin</th><th>Días</th><th>Estado</th><th>Motivo</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.map(l => {
            const canDecide = (user.role === 'admin' || user.role === 'manager') && l.status === 'submitted' && l.employee_id !== user.id;
            const canCancel = l.employee_id === user.id && l.status === 'submitted';
            return `<tr>
              <td>${UI.escapeHtml(l.employee_name)}</td>
              <td>${UI.escapeHtml(l.leave_type)}</td>
              <td>${UI.formatDate(l.start_date)}</td>
              <td>${UI.formatDate(l.end_date)}</td>
              <td>${l.days}</td>
              <td>${UI.statusChip(l.status)}</td>
              <td>${UI.escapeHtml(l.reason || '')}</td>
              <td>
                ${canDecide ? `<button class="btn btn-sm btn-success" data-approve="${l.id}">✓</button> <button class="btn btn-sm btn-danger" data-reject="${l.id}">×</button>` : ''}
                ${canCancel ? `<button class="btn btn-sm btn-secondary" data-cancel="${l.id}">Cancelar</button>` : ''}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
    list.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', async () => {
      try { await API.post(`/vacations/${b.dataset.approve}/decision`, { action: 'approve' }); this.load(container); }
      catch (e) { UI.alertError(e); }
    }));
    list.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', async () => {
      const comment = prompt('Motivo del rechazo (opcional):') || '';
      try { await API.post(`/vacations/${b.dataset.reject}/decision`, { action: 'reject', comment }); this.load(container); }
      catch (e) { UI.alertError(e); }
    }));
    list.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('¿Cancelar la solicitud?')) return;
      try { await API.post(`/vacations/${b.dataset.cancel}/cancel`, {}); this.load(container); }
      catch (e) { UI.alertError(e); }
    }));
  },

  openCreateModal(container) {
    const today = new Date().toISOString().slice(0, 10);
    const form = UI.el('form', {}, []);
    form.innerHTML = `
      <div class="field">
        <label>Tipo</label>
        <select name="leave_type">
          <option value="vacation">Vacaciones</option>
          <option value="permit">Permiso</option>
          <option value="sick">Baja médica</option>
          <option value="remote">Teletrabajo</option>
        </select>
      </div>
      <div class="form-row">
        <div class="field"><label>Inicio</label><input type="date" name="start_date" value="${today}" required /></div>
        <div class="field"><label>Fin</label><input type="date" name="end_date" value="${today}" required /></div>
      </div>
      <div class="field"><label>Motivo</label><textarea name="reason"></textarea></div>
    `;
    UI.showModal({
      title: 'Solicitar ausencia',
      body: form,
      footer: (footer, close) => {
        const cancel = UI.el('button', { class: 'btn btn-secondary', type: 'button', onclick: close }, 'Cancelar');
        const submit = UI.el('button', { class: 'btn', type: 'button' }, 'Solicitar');
        submit.addEventListener('click', async () => {
          const fd = new FormData(form);
          try { await API.post('/vacations', Object.fromEntries(fd)); close(); this.load(container); }
          catch (e) { UI.alertError(e); }
        });
        footer.appendChild(cancel);
        footer.appendChild(submit);
      },
    });
  },
};
