const TicketsView = {
  async render(container) {
    const user = API.getUser();
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Tickets</h1>
          <div class="sub">Solicitudes internas (RRHH, IT, finanzas, reembolsos)</div>
        </div>
        <button class="btn" id="new-ticket">+ Nuevo ticket</button>
      </div>
      <div class="card">
        <div id="tickets-list">Cargando...</div>
      </div>
    `;
    container.querySelector('#new-ticket').addEventListener('click', () => this.openCreateModal(container));
    await this.loadList(container);
  },

  async loadList(container) {
    const list = container.querySelector('#tickets-list');
    try {
      const rows = await API.get('/tickets');
      if (!rows.length) { list.innerHTML = UI.emptyState('No hay tickets'); return; }
      list.innerHTML = `
        <table>
          <thead><tr>
            <th>#</th><th>Asunto</th><th>Solicitante</th><th>Categoría</th><th>Prioridad</th><th>Estado</th><th>Creado</th>
          </tr></thead>
          <tbody>
            ${rows.map(t => `
              <tr class="clickable" data-id="${t.id}">
                <td>#${t.id}</td>
                <td>${UI.escapeHtml(t.subject)}</td>
                <td>${UI.escapeHtml(t.requester_name)}</td>
                <td>${UI.escapeHtml(t.category)}</td>
                <td>${UI.escapeHtml(t.priority)}</td>
                <td>${UI.statusChip(t.status)}</td>
                <td>${UI.formatDate(t.created_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      list.querySelectorAll('tr.clickable').forEach(row => {
        row.addEventListener('click', () => location.hash = '#/tickets/' + row.dataset.id);
      });
    } catch (e) { list.innerHTML = `<div class="error-msg">${UI.escapeHtml(e.message)}</div>`; }
  },

  openCreateModal(container) {
    const form = UI.el('form', { id: 'ticket-form' }, []);
    form.innerHTML = `
      <div class="field">
        <label>Categoría</label>
        <select name="category" required>
          <option value="reembolso">Reembolso</option>
          <option value="rrhh">RRHH</option>
          <option value="it">IT</option>
          <option value="incidencia_fichaje">Incidencia fichaje</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div class="field">
        <label>Prioridad</label>
        <select name="priority">
          <option value="low">Baja</option>
          <option value="normal" selected>Normal</option>
          <option value="high">Alta</option>
        </select>
      </div>
      <div class="field">
        <label>Asunto</label>
        <input type="text" name="subject" required />
      </div>
      <div class="field">
        <label>Descripción</label>
        <textarea name="description"></textarea>
      </div>
    `;
    OCR.attachScanButton(form, {
      kind: 'ticket',
      onResult: (parsed) => {
        const subj = form.querySelector('[name="subject"]');
        const desc = form.querySelector('[name="description"]');
        const cat = form.querySelector('[name="category"]');
        if (subj && parsed.subject) subj.value = parsed.subject;
        if (desc && parsed.description) desc.value = parsed.description;
        if (cat && parsed.total != null) cat.value = 'reembolso';
      },
    });
    UI.showModal({
      title: 'Nuevo ticket',
      body: form,
      footer: (footer, close) => {
        const cancel = UI.el('button', { class: 'btn btn-secondary', type: 'button', onclick: close }, 'Cancelar');
        const submit = UI.el('button', { class: 'btn', type: 'button' }, 'Crear');
        submit.addEventListener('click', async () => {
          const fd = new FormData(form);
          try {
            await API.post('/tickets', Object.fromEntries(fd));
            close();
            await this.loadList(container);
          } catch (e) { UI.alertError(e); }
        });
        footer.appendChild(cancel);
        footer.appendChild(submit);
      },
    });
  },

  async renderDetail(container, id) {
    container.innerHTML = `<div class="page-header"><div><h1>Ticket #${id}</h1><div class="sub"><a href="#/tickets">← Volver al listado</a></div></div></div><div id="detail">Cargando...</div>`;
    const detail = container.querySelector('#detail');
    try {
      const t = await API.get('/tickets/' + id);
      const user = API.getUser();
      const canDecide = (user.role === 'admin' || user.role === 'manager') && t.status === 'submitted' && t.requester_id !== user.id;
      const isOwner = t.requester_id === user.id;

      detail.innerHTML = `
        <div class="detail-grid">
          <div>
            <div class="card">
              <h2>${UI.escapeHtml(t.subject)} ${UI.statusChip(t.status)}</h2>
              <p style="white-space:pre-wrap;">${UI.escapeHtml(t.description) || '<em style="color:var(--text-dim);">Sin descripción</em>'}</p>

              ${t.attachments?.length ? `
                <div style="margin-top:18px;">
                  <h2>Adjuntos</h2>
                  <div class="attachments-grid">
                    ${t.attachments.map(a => `
                      <div class="attachment-card">
                        ${a.mime.startsWith('image/') ? `<img src="/api/attachments/${a.id}" alt="">` : '<div style="height:90px;display:flex;align-items:center;justify-content:center;">📄</div>'}
                        <div class="filename">${UI.escapeHtml(a.original_name)}</div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}

              ${isOwner ? `
                <div style="margin-top:18px;">
                  <input type="file" id="file-input" accept="image/*,application/pdf" />
                  <button class="btn btn-sm" id="upload-btn" style="margin-top:8px;">Subir adjunto</button>
                </div>
              ` : ''}
            </div>

            <div class="card" style="margin-top:18px;">
              <h2>Comentarios</h2>
              <div id="comments-list">
                ${t.comments?.length ? t.comments.map(c => `
                  <div class="comment">
                    <span class="author">${UI.escapeHtml(c.author_name)}</span>
                    <span class="ts">${UI.formatDateTime(c.created_at)}</span>
                    <div class="body">${UI.escapeHtml(c.body)}</div>
                  </div>
                `).join('') : UI.emptyState('Sin comentarios')}
              </div>
              <div style="margin-top:14px;">
                <textarea id="new-comment" placeholder="Añadir comentario..."></textarea>
                <button class="btn btn-sm" id="add-comment" style="margin-top:8px;">Comentar</button>
              </div>
            </div>
          </div>

          <div>
            <div class="card">
              <h2>Detalles</h2>
              <dl class="meta">
                <dt>Solicitante</dt><dd>${UI.escapeHtml(t.requester_name)}</dd>
                <dt>Categoría</dt><dd>${UI.escapeHtml(t.category)}</dd>
                <dt>Prioridad</dt><dd>${UI.escapeHtml(t.priority)}</dd>
                <dt>Creado</dt><dd>${UI.formatDateTime(t.created_at)}</dd>
                ${t.approver_name ? `<dt>Decidido por</dt><dd>${UI.escapeHtml(t.approver_name)}</dd>` : ''}
                ${t.decided_at ? `<dt>Decidido el</dt><dd>${UI.formatDateTime(t.decided_at)}</dd>` : ''}
                ${t.decision_comment ? `<dt>Comentario</dt><dd>${UI.escapeHtml(t.decision_comment)}</dd>` : ''}
              </dl>
            </div>
            ${canDecide ? `
              <div class="card" style="margin-top:18px;">
                <h2>Decisión</h2>
                <textarea id="decision-comment" placeholder="Comentario (opcional)"></textarea>
                <div style="display:flex;gap:8px;margin-top:10px;">
                  <button class="btn btn-success" id="approve-btn">Aprobar</button>
                  <button class="btn btn-danger" id="reject-btn">Rechazar</button>
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `;

      detail.querySelector('#add-comment')?.addEventListener('click', async () => {
        const body = detail.querySelector('#new-comment').value.trim();
        if (!body) return;
        try { await API.post(`/tickets/${id}/comments`, { body }); this.renderDetail(container, id); }
        catch (e) { UI.alertError(e); }
      });

      detail.querySelector('#upload-btn')?.addEventListener('click', async () => {
        const input = detail.querySelector('#file-input');
        if (!input.files[0]) return;
        const fd = new FormData();
        fd.append('file', input.files[0]);
        fd.append('object_type', 'ticket');
        fd.append('object_id', id);
        try { await API.upload('/attachments', fd); this.renderDetail(container, id); }
        catch (e) { UI.alertError(e); }
      });

      const decide = async (action) => {
        const comment = detail.querySelector('#decision-comment').value.trim();
        try { await API.post(`/tickets/${id}/decision`, { action, comment }); this.renderDetail(container, id); }
        catch (e) { UI.alertError(e); }
      };
      detail.querySelector('#approve-btn')?.addEventListener('click', () => decide('approve'));
      detail.querySelector('#reject-btn')?.addEventListener('click', () => decide('reject'));
    } catch (e) {
      detail.innerHTML = `<div class="error-msg">${UI.escapeHtml(e.message)}</div>`;
    }
  },
};
