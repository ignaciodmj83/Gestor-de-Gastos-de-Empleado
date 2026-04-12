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
    const user = API.getUser();
    try {
      const rows = await API.get('/mileage');
      if (!rows.length) { list.innerHTML = UI.emptyState('Sin partes'); return; }
      list.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>#</th><th>Título</th><th>Empleado</th><th>Periodo</th><th>Km</th><th>Importe</th><th>Estado</th><th></th>
            </tr></thead>
            <tbody>
              ${rows.map(r => {
                const isOwner = r.employee_id === user.id;
                const canSubmit = isOwner && r.status === 'draft';
                const canDelete = isOwner && r.status === 'draft';
                return `<tr>
                  <td><a href="#/mileage/${r.id}">#${r.id}</a></td>
                  <td>${UI.escapeHtml(r.title)}</td>
                  <td>${UI.escapeHtml(r.employee_name)}</td>
                  <td style="white-space:nowrap;">${UI.formatDate(r.period_start)} → ${UI.formatDate(r.period_end)}</td>
                  <td>${r.total_km.toFixed(1)} km</td>
                  <td>${UI.formatMoney(r.total_amount)}</td>
                  <td>${UI.statusChip(r.status)}</td>
                  <td style="white-space:nowrap;display:flex;gap:4px;padding:10px 16px;">
                    <a href="#/mileage/${r.id}" class="btn btn-sm btn-secondary">Ver</a>
                    ${canSubmit ? `<button class="btn btn-sm" data-submit="${r.id}">Enviar</button>` : ''}
                    ${canDelete ? `<button class="btn btn-sm btn-danger" data-del="${r.id}">Eliminar</button>` : ''}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
      list.querySelectorAll('[data-submit]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('¿Enviar este parte para aprobación?')) return;
          try { await API.post('/mileage/' + btn.dataset.submit + '/submit', {}); this.loadList(container); }
          catch (err) { UI.alertError(err); }
        });
      });
      list.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('¿Eliminar este parte?')) return;
          try { await API.del('/mileage/' + btn.dataset.del); this.loadList(container); }
          catch (err) { UI.alertError(err); }
        });
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
                <details style="margin-top:14px;" open>
                  <summary style="cursor:pointer;color:var(--accent);font-size:13px;font-weight:600;">+ Añadir trayecto</summary>
                  <form id="trip-form" style="margin-top:14px;">
                    <div class="form-row">
                      <div class="field"><label>Fecha</label><input type="date" name="trip_date" required value="${new Date().toISOString().slice(0,10)}" /></div>
                    </div>
                    <div class="form-row">
                      <div class="field"><label>Origen</label><input type="text" name="origin" required placeholder="Ciudad / dirección de salida" /></div>
                      <div class="field"><label>Destino</label><input type="text" name="destination" required placeholder="Ciudad / dirección de llegada" /></div>
                    </div>
                    <div style="margin:12px 0 8px;padding:12px 14px;background:var(--accent-soft);border:1px solid rgba(124,92,255,0.25);border-radius:var(--radius-sm);">
                      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--accent-2);margin-bottom:10px;">📸 Odómetro (foto)</div>
                      <div class="form-row">
                        <div class="field">
                          <label>Km inicial</label>
                          <div style="display:flex;gap:6px;">
                            <input type="number" name="km_start" step="0.1" min="0" placeholder="p. ej. 45200" style="flex:1;" />
                            <button type="button" class="btn btn-sm btn-secondary" id="scan-km-start" title="Escanear odómetro inicial">📷</button>
                          </div>
                          <input type="file" id="odo-start-file" accept="image/*" capture="environment" style="display:none;" />
                        </div>
                        <div class="field">
                          <label>Km final</label>
                          <div style="display:flex;gap:6px;">
                            <input type="number" name="km_end" step="0.1" min="0" placeholder="p. ej. 45347" style="flex:1;" />
                            <button type="button" class="btn btn-sm btn-secondary" id="scan-km-end" title="Escanear odómetro final">📷</button>
                          </div>
                          <input type="file" id="odo-end-file" accept="image/*" capture="environment" style="display:none;" />
                        </div>
                      </div>
                      <div style="display:flex;align-items:center;gap:8px;margin-top:6px;font-size:12px;color:var(--text-dim);">
                        Km del trayecto:
                        <strong id="km-calc" style="color:var(--text);font-size:14px;">—</strong>
                        <span id="odo-ocr-status"></span>
                      </div>
                    </div>
                    <div class="field"><label>Notas</label><input type="text" name="notes" placeholder="Motivo del viaje (opcional)" /></div>
                    <button type="button" class="btn btn-sm" id="add-trip">Añadir trayecto</button>
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
      if (tripForm) {
        // Helper: extract odometer reading from OCR text (largest plausible integer)
        const extractOdoReading = (text) => {
          const nums = [...text.matchAll(/\b(\d{4,7})\b/g)].map(m => parseInt(m[1], 10));
          if (!nums.length) return null;
          return nums.sort((a, b) => b - a)[0]; // largest reading
        };

        const updateKmCalc = () => {
          const start = parseFloat(tripForm.querySelector('[name="km_start"]').value);
          const end = parseFloat(tripForm.querySelector('[name="km_end"]').value);
          const calc = tripForm.querySelector('#km-calc');
          if (!isNaN(start) && !isNaN(end) && end > start) {
            calc.textContent = (Math.round((end - start) * 10) / 10) + ' km';
            calc.style.color = 'var(--success)';
          } else {
            calc.textContent = '—';
            calc.style.color = '';
          }
        };
        tripForm.querySelector('[name="km_start"]').addEventListener('input', updateKmCalc);
        tripForm.querySelector('[name="km_end"]').addEventListener('input', updateKmCalc);

        const wireOdoScan = (btnId, fileId, fieldName) => {
          const btn = tripForm.querySelector('#' + btnId);
          const fileInput = tripForm.querySelector('#' + fileId);
          const statusEl = tripForm.querySelector('#odo-ocr-status');
          if (!btn || !fileInput) return;
          btn.addEventListener('click', () => fileInput.click());
          fileInput.addEventListener('change', async () => {
            const file = fileInput.files && fileInput.files[0];
            if (!file || !window.OCR) return;
            btn.textContent = '⏳';
            if (statusEl) statusEl.innerHTML = `<span style="color:var(--accent-2);font-size:11px;">Procesando OCR...</span>`;
            try {
              const { text } = await OCR.scan(file);
              const reading = extractOdoReading(text);
              if (reading != null) {
                tripForm.querySelector(`[name="${fieldName}"]`).value = reading;
                updateKmCalc();
                if (statusEl) statusEl.innerHTML = `<span style="color:var(--success);font-size:11px;">✓ ${reading.toLocaleString()} km</span>`;
              } else {
                if (statusEl) statusEl.innerHTML = `<span style="color:var(--warning);font-size:11px;">No se encontró número</span>`;
              }
            } catch (err) {
              if (statusEl) statusEl.innerHTML = `<span style="color:var(--danger);font-size:11px;">OCR falló</span>`;
            } finally {
              btn.textContent = '📷';
              fileInput.value = '';
            }
          });
        };
        wireOdoScan('scan-km-start', 'odo-start-file', 'km_start');
        wireOdoScan('scan-km-end', 'odo-end-file', 'km_end');
      }

      detail.querySelector('#add-trip')?.addEventListener('click', async () => {
        const form = detail.querySelector('#trip-form');
        const fd = new FormData(form);
        const data = Object.fromEntries(fd);
        const kmStart = parseFloat(data.km_start);
        const kmEnd = parseFloat(data.km_end);
        if (!isNaN(kmStart) && !isNaN(kmEnd)) {
          data.km_start = kmStart;
          data.km_end = kmEnd;
          delete data.km; // let backend calculate
        } else {
          delete data.km_start;
          delete data.km_end;
          data.km = parseFloat(data.km || 0);
        }
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
