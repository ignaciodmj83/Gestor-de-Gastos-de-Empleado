const MileageView = {
  async render(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Viajes / Kilometraje</h1>
          <div class="sub">Partes de km con justificantes (cámara o galería)</div>
        </div>
        <button class="btn" id="new-report">+ Nuevo parte</button>
      </div>
      <div class="card">
        <div id="reports-list">Cargando...</div>
      </div>
    `;
    container.querySelector('#new-report').addEventListener('click', () => this.openCreateModal(container));
    await this.loadList(container);
  },

  async loadList(container) {
    const list = container.querySelector('#reports-list');
    try {
      const rows = await API.get('/mileage');
      if (!rows.length) { list.innerHTML = UI.emptyState('Sin partes'); return; }
      list.innerHTML = `
        <table>
          <thead><tr>
            <th>#</th><th>Título</th><th>Empleado</th><th>Periodo</th><th>Km</th><th>Importe</th><th>Estado</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr class="clickable" data-id="${r.id}">
                <td>#${r.id}</td>
                <td>${UI.escapeHtml(r.title)}</td>
                <td>${UI.escapeHtml(r.employee_name)}</td>
                <td>${UI.formatDate(r.period_start)} → ${UI.formatDate(r.period_end)}</td>
                <td>${r.total_km.toFixed(1)} km</td>
                <td>${UI.formatMoney(r.total_amount)}</td>
                <td>${UI.statusChip(r.status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      list.querySelectorAll('tr.clickable').forEach(row => {
        row.addEventListener('click', () => location.hash = '#/mileage/' + row.dataset.id);
      });
    } catch (e) { list.innerHTML = `<div class="error-msg">${UI.escapeHtml(e.message)}</div>`; }
  },

  openCreateModal(container) {
    const today = new Date().toISOString().slice(0, 10);
    const form = UI.el('form', {}, []);
    form.innerHTML = `
      <div class="field">
        <label>Título</label>
        <input type="text" name="title" required placeholder="Ej. Visitas comerciales abril" />
      </div>
      <div class="form-row">
        <div class="field">
          <label>Inicio</label>
          <input type="date" name="period_start" value="${today}" required />
        </div>
        <div class="field">
          <label>Fin</label>
          <input type="date" name="period_end" value="${today}" required />
        </div>
      </div>
    `;
    UI.showModal({
      title: 'Nuevo parte de km',
      body: form,
      footer: (footer, close) => {
        const cancel = UI.el('button', { class: 'btn btn-secondary', type: 'button', onclick: close }, 'Cancelar');
        const submit = UI.el('button', { class: 'btn', type: 'button' }, 'Crear');
        submit.addEventListener('click', async () => {
          const fd = new FormData(form);
          try {
            const res = await API.post('/mileage', Object.fromEntries(fd));
            close();
            location.hash = '#/mileage/' + res.id;
          } catch (e) { UI.alertError(e); }
        });
        footer.appendChild(cancel);
        footer.appendChild(submit);
      },
    });
  },

  async renderDetail(container, id) {
    container.innerHTML = `<div class="page-header"><div><h1>Parte #${id}</h1><div class="sub"><a href="#/mileage">← Volver</a></div></div></div><div id="detail">Cargando...</div>`;
    const detail = container.querySelector('#detail');
    try {
      const r = await API.get('/mileage/' + id);
      const user = API.getUser();
      const isOwner = r.employee_id === user.id;
      const canEdit = isOwner && r.status === 'draft';
      const canDecide = (user.role === 'admin' || user.role === 'manager') && r.status === 'submitted' && !isOwner;

      detail.innerHTML = `
        <div class="detail-grid">
          <div>
            <div class="card">
              <h2>${UI.escapeHtml(r.title)} ${UI.statusChip(r.status)}</h2>

              <h2 style="margin-top:18px;">Trayectos</h2>
              ${r.trips?.length ? `
                <table>
                  <thead><tr><th>Fecha</th><th>Origen</th><th>Destino</th><th>Km</th><th>Importe</th>${canEdit ? '<th></th>' : ''}</tr></thead>
                  <tbody>
                    ${r.trips.map(t => `
                      <tr>
                        <td>${UI.formatDate(t.trip_date)}</td>
                        <td>${UI.escapeHtml(t.origin)}</td>
                        <td>${UI.escapeHtml(t.destination)}</td>
                        <td>${t.km}</td>
                        <td>${UI.formatMoney(t.amount)}</td>
                        ${canEdit ? `<td><button class="btn btn-sm btn-danger" data-trip="${t.id}">×</button></td>` : ''}
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : UI.emptyState('Sin trayectos')}

              ${canEdit ? `
                <details style="margin-top:14px;">
                  <summary style="cursor:pointer;color:var(--accent);font-size:13px;">+ Añadir trayecto</summary>
                  <form id="trip-form" style="margin-top:14px;">
                    <div class="form-row">
                      <div class="field"><label>Fecha</label><input type="date" name="trip_date" required value="${new Date().toISOString().slice(0,10)}" /></div>
                      <div class="field"><label>Km</label><input type="number" name="km" step="0.1" min="0" required /></div>
                    </div>
                    <div class="form-row">
                      <div class="field"><label>Origen</label><input type="text" name="origin" required /></div>
                      <div class="field"><label>Destino</label><input type="text" name="destination" required /></div>
                    </div>
                    <div class="field"><label>Notas</label><input type="text" name="notes" /></div>
                    <button type="button" class="btn btn-sm" id="add-trip">Añadir</button>
                  </form>
                </details>
              ` : ''}

              <h2 style="margin-top:24px;">Adjuntos (cámara/galería)</h2>
              ${r.attachments?.length ? `
                <div class="attachments-grid">
                  ${r.attachments.map(a => `
                    <div class="attachment-card">
                      ${a.mime.startsWith('image/') ? `<img src="/api/attachments/${a.id}" alt="">` : '<div style="height:90px;display:flex;align-items:center;justify-content:center;">📄</div>'}
                      <div class="filename">${UI.escapeHtml(a.original_name)}</div>
                    </div>
                  `).join('')}
                </div>
              ` : UI.emptyState('Sin adjuntos')}

              ${canEdit ? `
                <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">
                  <label class="btn btn-secondary btn-sm" for="cam-input">📷 Tomar foto</label>
                  <input id="cam-input" type="file" accept="image/*" capture="environment" style="display:none;" />
                  <label class="btn btn-secondary btn-sm" for="gal-input">🖼 Galería</label>
                  <input id="gal-input" type="file" accept="image/*,application/pdf" style="display:none;" />
                </div>
              ` : ''}
            </div>
          </div>

          <div>
            <div class="card">
              <h2>Resumen</h2>
              <dl class="meta">
                <dt>Empleado</dt><dd>${UI.escapeHtml(r.employee_name)}</dd>
                <dt>Periodo</dt><dd>${UI.formatDate(r.period_start)} → ${UI.formatDate(r.period_end)}</dd>
                <dt>Total km</dt><dd>${r.total_km.toFixed(1)}</dd>
                <dt>Total importe</dt><dd><strong>${UI.formatMoney(r.total_amount)}</strong></dd>
                ${r.approver_name ? `<dt>Decidido por</dt><dd>${UI.escapeHtml(r.approver_name)}</dd>` : ''}
                ${r.decided_at ? `<dt>Decidido el</dt><dd>${UI.formatDateTime(r.decided_at)}</dd>` : ''}
                ${r.decision_comment ? `<dt>Comentario</dt><dd>${UI.escapeHtml(r.decision_comment)}</dd>` : ''}
              </dl>
              <div style="margin-top:14px;display:flex;flex-direction:column;gap:8px;">
                ${canEdit && r.trips?.length ? `<button class="btn" id="submit-btn">Enviar a aprobación</button>` : ''}
                ${canDecide ? `
                  <textarea id="decision-comment" placeholder="Comentario (opcional)"></textarea>
                  <button class="btn btn-success" id="approve-btn">Aprobar</button>
                  <button class="btn btn-danger" id="reject-btn">Rechazar</button>
                ` : ''}
                <a class="btn btn-secondary" href="/api/mileage/${id}/export.csv" download>Exportar CSV</a>
              </div>
            </div>
          </div>
        </div>
      `;

      const tripForm = detail.querySelector('#trip-form');
      if (tripForm && window.OCR) {
        OCR.attachScanButton(tripForm, {
          kind: 'mileage',
          onResult: (parsed) => {
            const set = (name, val) => { const el = tripForm.querySelector(`[name="${name}"]`); if (el && val !== '' && val != null) el.value = val; };
            set('trip_date', parsed.trip_date);
            set('origin', parsed.origin);
            set('destination', parsed.destination);
            set('km', parsed.km);
            set('notes', parsed.notes);
          },
        });
      }

      detail.querySelector('#add-trip')?.addEventListener('click', async () => {
        const form = detail.querySelector('#trip-form');
        const fd = new FormData(form);
        const data = Object.fromEntries(fd);
        data.km = parseFloat(data.km);
        try { await API.post(`/mileage/${id}/trips`, data); this.renderDetail(container, id); }
        catch (e) { UI.alertError(e); }
      });

      detail.querySelectorAll('button[data-trip]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('¿Eliminar trayecto?')) return;
          try { await API.del(`/mileage/${id}/trips/${btn.dataset.trip}`); this.renderDetail(container, id); }
          catch (e) { UI.alertError(e); }
        });
      });

      const uploadFromInput = async (input) => {
        if (!input.files[0]) return;
        const fd = new FormData();
        fd.append('file', input.files[0]);
        fd.append('object_type', 'mileage_report');
        fd.append('object_id', id);
        try { await API.upload('/attachments', fd); this.renderDetail(container, id); }
        catch (e) { UI.alertError(e); }
      };
      detail.querySelector('#cam-input')?.addEventListener('change', (e) => uploadFromInput(e.target));
      detail.querySelector('#gal-input')?.addEventListener('change', (e) => uploadFromInput(e.target));

      detail.querySelector('#submit-btn')?.addEventListener('click', async () => {
        try { await API.post(`/mileage/${id}/submit`, {}); this.renderDetail(container, id); }
        catch (e) { UI.alertError(e); }
      });

      const decide = async (action) => {
        const comment = detail.querySelector('#decision-comment').value.trim();
        try { await API.post(`/mileage/${id}/decision`, { action, comment }); this.renderDetail(container, id); }
        catch (e) { UI.alertError(e); }
      };
      detail.querySelector('#approve-btn')?.addEventListener('click', () => decide('approve'));
      detail.querySelector('#reject-btn')?.addEventListener('click', () => decide('reject'));
    } catch (e) {
      detail.innerHTML = `<div class="error-msg">${UI.escapeHtml(e.message)}</div>`;
    }
  },
};
