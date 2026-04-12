const TimeClockView = {
  clockTimer: null,

  async render(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Fichaje laboral</h1>
          <div class="sub">Registro diario de jornada (cumplimiento art. 34.9 ET — conservación 4 años)</div>
        </div>
      </div>
      <div id="tc-content">Cargando...</div>
    `;
    await this.load(container);
  },

  async load(container) {
    const wrap = container.querySelector('#tc-content');
    try {
      const status = await API.get('/time/status');
      const todayShifts = await API.get('/time/shifts?from=' + new Date().toISOString().slice(0,10));
      const today = todayShifts[0] || { events: [], worked_minutes: 0 };
      const last = status.last;
      const isWorking = last && last.event_type === 'IN';
      const onBreak = last && last.event_type === 'BREAK_START';
      const off = !last || last.event_type === 'OUT';

      wrap.innerHTML = `
        <div class="card">
          <div style="text-align:center;">
            <div style="font-size:13px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;">
              ${isWorking ? 'Trabajando' : onBreak ? 'En pausa' : off ? 'Fuera de jornada' : ''}
            </div>
            <div class="clock-display" id="live-clock">--:--:--</div>
            <div style="color:var(--text-dim);font-size:13px;">
              Trabajado hoy: <strong style="color:var(--text);">${this.fmtMinutes(today.worked_minutes)}</strong>
            </div>
          </div>
          <div class="clock-actions" style="margin-top:18px;">
            <button class="btn btn-success" id="in-btn" ${isWorking || onBreak ? 'disabled' : ''}>▶ Entrada</button>
            <button class="btn btn-secondary" id="break-start-btn" ${!isWorking ? 'disabled' : ''}>⏸ Pausa</button>
            <button class="btn btn-secondary" id="break-end-btn" ${!onBreak ? 'disabled' : ''}>▶ Reanudar</button>
            <button class="btn btn-danger" id="out-btn" ${!isWorking && !onBreak ? 'disabled' : ''}>⏹ Salida</button>
          </div>
          <div style="text-align:center;">
            <button class="btn btn-sm btn-secondary" id="correction-btn">Solicitar corrección</button>
          </div>
        </div>

        <div class="card" style="margin-top:18px;">
          <h2>Eventos de hoy</h2>
          ${today.events?.length ? `
            <table>
              <thead><tr><th>Hora</th><th>Tipo</th><th>Origen</th></tr></thead>
              <tbody>
                ${today.events.map(e => `<tr>
                  <td>${e.ts.slice(11, 16)}</td>
                  <td>${this.eventLabel(e.event_type)}</td>
                  <td>${e.source}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          ` : UI.emptyState('Sin eventos hoy')}
        </div>

        <div class="card" style="margin-top:18px;">
          <h2>Histórico (últimos 30 días)</h2>
          <div id="history-list">Cargando...</div>
          <div style="margin-top:12px;">
            <a class="btn btn-sm btn-secondary" href="/api/time/export.csv?from=${this.lastMonth()}&to=${new Date().toISOString().slice(0,10)}" download>Exportar CSV</a>
          </div>
        </div>

        <div class="card" style="margin-top:18px;">
          <h2>Solicitudes de corrección</h2>
          <div id="corrections-list">Cargando...</div>
        </div>
      `;

      this.startClock(container);

      const post = async (event_type) => {
        try { await API.post('/time/event', { event_type }); this.load(container); }
        catch (e) { UI.alertError(e); }
      };
      container.querySelector('#in-btn').addEventListener('click', () => post('IN'));
      container.querySelector('#out-btn').addEventListener('click', () => post('OUT'));
      container.querySelector('#break-start-btn').addEventListener('click', () => post('BREAK_START'));
      container.querySelector('#break-end-btn').addEventListener('click', () => post('BREAK_END'));
      container.querySelector('#correction-btn').addEventListener('click', () => this.openCorrectionModal(container));

      // load history
      const shifts = await API.get('/time/shifts?from=' + this.lastMonth());
      const histList = container.querySelector('#history-list');
      if (!shifts.length) histList.innerHTML = UI.emptyState('Sin histórico');
      else {
        histList.innerHTML = `<table>
          <thead><tr><th>Día</th><th>Eventos</th><th>Trabajado</th></tr></thead>
          <tbody>
            ${shifts.reverse().map(s => `<tr>
              <td>${UI.formatDate(s.date)}</td>
              <td>${s.events.length}</td>
              <td>${this.fmtMinutes(s.worked_minutes)}</td>
            </tr>`).join('')}
          </tbody>
        </table>`;
      }

      // load corrections
      const corrections = await API.get('/time/corrections');
      const cList = container.querySelector('#corrections-list');
      const user = API.getUser();
      if (!corrections.length) cList.innerHTML = UI.emptyState('Sin solicitudes');
      else {
        cList.innerHTML = `<table>
          <thead><tr><th>Empleado</th><th>Fecha</th><th>Evento</th><th>TS solicitado</th><th>Motivo</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            ${corrections.map(c => {
              const canDecide = (user.role === 'admin' || user.role === 'manager') && c.status === 'submitted' && c.employee_id !== user.id;
              return `<tr>
                <td>${UI.escapeHtml(c.employee_name)}</td>
                <td>${UI.formatDate(c.target_date)}</td>
                <td>${this.eventLabel(c.requested_event_type)}</td>
                <td>${UI.formatDateTime(c.requested_ts)}</td>
                <td>${UI.escapeHtml(c.reason)}</td>
                <td>${UI.statusChip(c.status)}</td>
                <td>${canDecide ? `<button class="btn btn-sm btn-success" data-approve="${c.id}">✓</button> <button class="btn btn-sm btn-danger" data-reject="${c.id}">×</button>` : ''}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`;
        cList.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', async () => {
          try { await API.post(`/time/corrections/${b.dataset.approve}/decision`, { action: 'approve' }); this.load(container); }
          catch (e) { UI.alertError(e); }
        }));
        cList.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', async () => {
          const comment = prompt('Motivo del rechazo (opcional):') || '';
          try { await API.post(`/time/corrections/${b.dataset.reject}/decision`, { action: 'reject', comment }); this.load(container); }
          catch (e) { UI.alertError(e); }
        }));
      }
    } catch (e) {
      wrap.innerHTML = `<div class="error-msg">${UI.escapeHtml(e.message)}</div>`;
    }
  },

  startClock(container) {
    if (this.clockTimer) clearInterval(this.clockTimer);
    const update = () => {
      const el = container.querySelector('#live-clock');
      if (!el) { clearInterval(this.clockTimer); return; }
      const now = new Date();
      el.textContent = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    update();
    this.clockTimer = setInterval(update, 1000);
  },

  fmtMinutes(min) {
    if (!min) return '0h 0m';
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return `${h}h ${m}m`;
  },

  eventLabel(t) {
    return ({
      IN: 'Entrada',
      OUT: 'Salida',
      BREAK_START: 'Inicio pausa',
      BREAK_END: 'Fin pausa',
    })[t] || t;
  },

  lastMonth() {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  },

  openCorrectionModal(container) {
    const form = UI.el('form', {}, []);
    const today = new Date().toISOString().slice(0, 10);
    const nowDt = new Date().toISOString().slice(0, 16);
    form.innerHTML = `
      <p style="color:var(--text-dim);font-size:12px;">Solicita una corrección de fichaje (olvido, error). El manager o admin debe aprobarla y queda auditada.</p>
      <div class="field"><label>Día afectado</label><input type="date" name="target_date" value="${today}" required /></div>
      <div class="field">
        <label>Tipo de evento</label>
        <select name="requested_event_type">
          <option value="IN">Entrada</option>
          <option value="OUT">Salida</option>
          <option value="BREAK_START">Inicio pausa</option>
          <option value="BREAK_END">Fin pausa</option>
        </select>
      </div>
      <div class="field"><label>Hora solicitada</label><input type="datetime-local" name="requested_ts" value="${nowDt}" required /></div>
      <div class="field"><label>Motivo</label><textarea name="reason" required></textarea></div>
    `;
    UI.showModal({
      title: 'Solicitar corrección de fichaje',
      body: form,
      footer: (footer, close) => {
        const cancel = UI.el('button', { class: 'btn btn-secondary', type: 'button', onclick: close }, 'Cancelar');
        const submit = UI.el('button', { class: 'btn', type: 'button' }, 'Solicitar');
        submit.addEventListener('click', async () => {
          const fd = new FormData(form);
          const data = Object.fromEntries(fd);
          // convert datetime-local to "YYYY-MM-DD HH:MM:SS"
          if (data.requested_ts) {
            data.requested_ts = data.requested_ts.replace('T', ' ') + ':00';
          }
          try { await API.post('/time/corrections', data); close(); this.load(container); }
          catch (e) { UI.alertError(e); }
        });
        footer.appendChild(cancel);
        footer.appendChild(submit);
      },
    });
  },
};
