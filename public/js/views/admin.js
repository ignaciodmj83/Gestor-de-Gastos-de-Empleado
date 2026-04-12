const AdminView = {
  async render(container) {
    const user = API.getUser();
    if (user.role !== 'admin') {
      container.innerHTML = `<div class="page-header"><h1>Acceso denegado</h1></div><div class="card">Solo administradores.</div>`;
      return;
    }
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Administración</h1>
          <div class="sub">Usuarios, empresa, invitaciones y auditoría</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" id="new-invite">+ Invitar por enlace</button>
          <button class="btn" id="new-user">+ Nuevo usuario</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:18px;">
        <h2>Empresa</h2>
        <div id="company-section">Cargando...</div>
      </div>

      <div class="card" style="margin-bottom:18px;">
        <h2>Solicitudes de acceso</h2>
        <div id="join-requests-list">Cargando...</div>
      </div>

      <div class="card" style="margin-bottom:18px;">
        <h2>Invitaciones por enlace</h2>
        <div id="invites-list">Cargando...</div>
      </div>

      <div class="card" style="margin-bottom:18px;">
        <h2>Usuarios</h2>
        <div id="users-list">Cargando...</div>
      </div>

      <div class="card">
        <h2>Auditoría (últimas 500 acciones)</h2>
        <div id="audit-list">Cargando...</div>
      </div>
    `;

    container.querySelector('#new-user').addEventListener('click', () => this.openUserModal(container));
    container.querySelector('#new-invite').addEventListener('click', () => this.openInviteModal(container));
    await this.load(container);
  },

  inviteUrl(token) {
    return `${location.origin}/#/invite/${encodeURIComponent(token)}`;
  },

  async load(container) {
    try {
      const [company, users, audit, invites, joinRequests] = await Promise.all([
        API.get('/admin/company'),
        API.get('/admin/users'),
        API.get('/admin/audit'),
        API.get('/admin/invites'),
        API.get('/admin/join-requests'),
      ]);

      // ===== company =====
      const cs = container.querySelector('#company-section');
      cs.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;margin-bottom:16px;">
          <div>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin-bottom:6px;">Código de tu organización</div>
            <span class="code-badge">${UI.escapeHtml(company.code || '—')}</span>
          </div>
          <div style="font-size:12px;color:var(--text-dim);max-width:340px;">
            Comparte este código con quien quieras que solicite acceso. Se introduce en la pantalla "Unirme con código".
          </div>
        </div>
        <form id="company-form">
          <div class="form-row">
            <div class="field"><label>Nombre</label><input type="text" name="name" value="${UI.escapeHtml(company.name)}" required /></div>
            <div class="field"><label>Tarifa km (€)</label><input type="number" step="0.01" name="mileage_rate" value="${company.mileage_rate}" required /></div>
          </div>
          <button type="button" class="btn btn-sm" id="save-company">Guardar</button>
        </form>
      `;
      cs.querySelector('#save-company').addEventListener('click', async () => {
        const fd = new FormData(cs.querySelector('#company-form'));
        const data = Object.fromEntries(fd);
        data.mileage_rate = parseFloat(data.mileage_rate);
        try { await API.patch('/admin/company', data); alert('Guardado'); }
        catch (e) { UI.alertError(e); }
      });

      // ===== join requests =====
      const jrl = container.querySelector('#join-requests-list');
      const pending = joinRequests.filter(r => r.status === 'pending');
      if (!pending.length) {
        jrl.innerHTML = UI.emptyState('Sin solicitudes pendientes. Cuando alguien introduzca tu código de organización, aparecerá aquí.');
      } else {
        jrl.innerHTML = `
          <table>
            <thead><tr><th>Nombre</th><th>Email</th><th>Mensaje</th><th>Recibida</th><th></th></tr></thead>
            <tbody>
              ${pending.map(r => `<tr>
                <td>${UI.escapeHtml(r.full_name)}</td>
                <td>${UI.escapeHtml(r.email)}</td>
                <td style="color:var(--text-dim);font-size:12px;">${UI.escapeHtml(r.message || '—')}</td>
                <td>${UI.formatDateTime(r.created_at)}</td>
                <td style="white-space:nowrap;">
                  <button class="btn btn-sm" data-approve="${r.id}">Aprobar</button>
                  <button class="btn btn-sm btn-danger" data-reject="${r.id}">Rechazar</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        `;
        jrl.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', () => {
          const r = pending.find(x => x.id == b.dataset.approve);
          this.openApproveJoinModal(container, r, users);
        }));
        jrl.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', async () => {
          if (!confirm('¿Rechazar esta solicitud?')) return;
          try {
            await API.post('/admin/join-requests/' + b.dataset.reject + '/decision', { action: 'reject' });
            this.load(container);
          } catch (e) { UI.alertError(e); }
        }));
      }

      // ===== users =====
      const ul = container.querySelector('#users-list');
      ul.innerHTML = `
        <table>
          <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Manager</th><th>Días vac.</th><th>Activo</th><th></th></tr></thead>
          <tbody>
            ${users.map(u => `<tr>
              <td>${UI.escapeHtml(u.full_name)}</td>
              <td>${UI.escapeHtml(u.email)}</td>
              <td>${UI.escapeHtml(u.role)}</td>
              <td>${UI.escapeHtml(u.manager_name || '-')}</td>
              <td>${u.vacation_days_year}</td>
              <td>${u.active ? '✓' : '✗'}</td>
              <td><button class="btn btn-sm btn-secondary" data-edit="${u.id}">Editar</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      `;
      ul.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
        const u = users.find(x => x.id == b.dataset.edit);
        this.openUserModal(container, u, users);
      }));

      // ===== invites =====
      const il = container.querySelector('#invites-list');
      if (!invites.length) {
        il.innerHTML = UI.emptyState('No hay invitaciones. Pulsa "+ Invitar por enlace" para crear una.');
      } else {
        il.innerHTML = `
          <table>
            <thead><tr><th>Email</th><th>Rol</th><th>Estado</th><th>Caduca</th><th>Creado por</th><th>Compartir</th><th></th></tr></thead>
            <tbody>
              ${invites.map(i => {
                const used = !!i.used_at;
                const expired = !used && i.expires_at && i.expires_at < new Date().toISOString();
                const status = used
                  ? `<span class="chip chip-success">Aceptada</span>`
                  : expired
                    ? `<span class="chip chip-danger">Caducada</span>`
                    : `<span class="chip">Pendiente</span>`;
                return `<tr>
                  <td>${UI.escapeHtml(i.email || '— libre —')}</td>
                  <td>${UI.escapeHtml(i.role)}</td>
                  <td>${status}${used && i.used_by_name ? `<br><small style="color:var(--text-dim);">${UI.escapeHtml(i.used_by_name)}</small>` : ''}</td>
                  <td>${i.expires_at ? UI.formatDate(i.expires_at.slice(0,10)) : 'Sin caducidad'}</td>
                  <td>${UI.escapeHtml(i.created_by_name || '-')}</td>
                  <td>${used || expired ? '-' : `<button class="btn btn-sm btn-secondary" data-share="${i.id}">Compartir</button>`}</td>
                  <td>${used ? '' : `<button class="btn btn-sm btn-danger" data-revoke="${i.id}">Revocar</button>`}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        `;
        il.querySelectorAll('[data-share]').forEach(b => b.addEventListener('click', () => {
          const inv = invites.find(x => x.id == b.dataset.share);
          if (inv) this.showInviteLink(container, this.inviteUrl(inv.token), company);
        }));
        il.querySelectorAll('[data-revoke]').forEach(b => b.addEventListener('click', async () => {
          if (!confirm('¿Revocar esta invitación?')) return;
          try { await API.del('/admin/invites/' + b.dataset.revoke); this.load(container); }
          catch (e) { UI.alertError(e); }
        }));
      }

      // ===== audit =====
      const al = container.querySelector('#audit-list');
      if (!audit.length) al.innerHTML = UI.emptyState('Sin eventos');
      else {
        al.innerHTML = `
          <table>
            <thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Objeto</th><th>ID</th><th>Detalles</th></tr></thead>
            <tbody>
              ${audit.map(a => `<tr>
                <td>${UI.formatDateTime(a.ts)}</td>
                <td>${UI.escapeHtml(a.actor_name || '-')}</td>
                <td>${UI.escapeHtml(a.action)}</td>
                <td>${UI.escapeHtml(a.object_type)}</td>
                <td>${a.object_id || ''}</td>
                <td style="font-family:monospace;font-size:11px;color:var(--text-dim);">${UI.escapeHtml(a.details || '')}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        `;
      }
    } catch (e) {
      container.innerHTML += `<div class="error-msg">${UI.escapeHtml(e.message)}</div>`;
    }
  },

  openUserModal(container, existing = null, allUsers = []) {
    const form = UI.el('form', {}, []);
    const isEdit = !!existing;
    form.innerHTML = `
      <div class="form-row">
        <div class="field"><label>Nombre</label><input type="text" name="full_name" required value="${existing ? UI.escapeHtml(existing.full_name) : ''}" /></div>
        <div class="field"><label>Email</label><input type="email" name="email" ${isEdit ? 'disabled' : 'required'} value="${existing ? UI.escapeHtml(existing.email) : ''}" /></div>
      </div>
      <div class="form-row">
        <div class="field">
          <label>Rol</label>
          <select name="role">
            <option value="employee" ${existing?.role === 'employee' ? 'selected' : ''}>Empleado</option>
            <option value="manager" ${existing?.role === 'manager' ? 'selected' : ''}>Manager</option>
            <option value="admin" ${existing?.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
        </div>
        <div class="field">
          <label>Manager</label>
          <select name="manager_id">
            <option value="">— Sin manager —</option>
            ${allUsers.filter(u => u.role !== 'employee' && (!existing || u.id !== existing.id)).map(u =>
              `<option value="${u.id}" ${existing?.manager_id == u.id ? 'selected' : ''}>${UI.escapeHtml(u.full_name)}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="field"><label>Días vac./año</label><input type="number" name="vacation_days_year" value="${existing?.vacation_days_year || 22}" /></div>
        <div class="field"><label>${isEdit ? 'Nueva contraseña (opcional)' : 'Contraseña'}</label><input type="password" name="password" ${isEdit ? '' : 'required'} /></div>
      </div>
      ${isEdit ? `<div class="field">
        <label>Activo</label>
        <select name="active"><option value="1" ${existing.active ? 'selected' : ''}>Sí</option><option value="0" ${!existing.active ? 'selected' : ''}>No</option></select>
      </div>` : ''}
    `;
    UI.showModal({
      title: isEdit ? 'Editar usuario' : 'Nuevo usuario',
      body: form,
      footer: (footer, close) => {
        const cancel = UI.el('button', { class: 'btn btn-secondary', type: 'button', onclick: close }, 'Cancelar');
        const submit = UI.el('button', { class: 'btn', type: 'button' }, 'Guardar');
        submit.addEventListener('click', async () => {
          const fd = new FormData(form);
          const data = Object.fromEntries(fd);
          if (data.manager_id === '') data.manager_id = null;
          else if (data.manager_id) data.manager_id = parseInt(data.manager_id, 10);
          if (data.vacation_days_year) data.vacation_days_year = parseInt(data.vacation_days_year, 10);
          if (data.active !== undefined) data.active = parseInt(data.active, 10);
          if (isEdit && !data.password) delete data.password;
          try {
            if (isEdit) await API.patch('/admin/users/' + existing.id, data);
            else await API.post('/admin/users', data);
            close();
            this.load(container);
          } catch (e) { UI.alertError(e); }
        });
        footer.appendChild(cancel);
        footer.appendChild(submit);
      },
    });
  },

  openApproveJoinModal(container, request, allUsers) {
    const form = UI.el('form', {}, []);
    form.innerHTML = `
      <div class="card" style="background:rgba(255,255,255,0.03);padding:12px;margin-bottom:14px;">
        <div><strong>${UI.escapeHtml(request.full_name)}</strong> · ${UI.escapeHtml(request.email)}</div>
        ${request.message ? `<div style="font-size:12px;color:var(--text-dim);margin-top:6px;">"${UI.escapeHtml(request.message)}"</div>` : ''}
      </div>
      <div class="form-row">
        <div class="field">
          <label>Rol asignado</label>
          <select name="role">
            <option value="employee" selected>Empleado</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div class="field">
          <label>Manager</label>
          <select name="manager_id">
            <option value="">— Sin manager —</option>
            ${allUsers.filter(u => u.role !== 'employee').map(u =>
              `<option value="${u.id}">${UI.escapeHtml(u.full_name)}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="field"><label>Días vacaciones / año</label><input type="number" name="vacation_days_year" value="22" /></div>
    `;
    UI.showModal({
      title: 'Aprobar solicitud',
      body: form,
      footer: (footer, close) => {
        const cancel = UI.el('button', { class: 'btn btn-secondary', type: 'button', onclick: close }, 'Cancelar');
        const submit = UI.el('button', { class: 'btn', type: 'button' }, 'Aprobar y crear usuario');
        submit.addEventListener('click', async () => {
          const fd = new FormData(form);
          const data = Object.fromEntries(fd);
          data.action = 'approve';
          if (data.manager_id === '') data.manager_id = null;
          else if (data.manager_id) data.manager_id = parseInt(data.manager_id, 10);
          if (data.vacation_days_year) data.vacation_days_year = parseInt(data.vacation_days_year, 10);
          try {
            await API.post('/admin/join-requests/' + request.id + '/decision', data);
            close();
            this.load(container);
          } catch (e) { UI.alertError(e); }
        });
        footer.appendChild(cancel);
        footer.appendChild(submit);
      },
    });
  },

  openInviteModal(container) {
    const form = UI.el('form', {}, []);
    form.innerHTML = `
      <p style="color:var(--text-dim);font-size:12px;margin:0 0 10px;">
        Genera un enlace que podrás compartir por WhatsApp, email o cualquier mensajería. Quien lo abra podrá unirse a tu organización.
      </p>
      <div class="form-row">
        <div class="field"><label>Email (opcional)</label><input type="email" name="email" placeholder="vincula la invitación a un email" /></div>
        <div class="field">
          <label>Rol</label>
          <select name="role">
            <option value="employee">Empleado</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="field"><label>Días vac./año</label><input type="number" name="vacation_days_year" value="22" /></div>
        <div class="field"><label>Caduca en (días)</label><input type="number" name="expires_in_days" value="7" min="0" /></div>
      </div>
    `;
    UI.showModal({
      title: 'Crear invitación',
      body: form,
      footer: (footer, close) => {
        const cancel = UI.el('button', { class: 'btn btn-secondary', type: 'button', onclick: close }, 'Cancelar');
        const submit = UI.el('button', { class: 'btn', type: 'button' }, 'Generar enlace');
        submit.addEventListener('click', async () => {
          const fd = new FormData(form);
          const data = Object.fromEntries(fd);
          if (!data.email) delete data.email;
          if (data.vacation_days_year) data.vacation_days_year = parseInt(data.vacation_days_year, 10);
          if (data.expires_in_days) data.expires_in_days = parseInt(data.expires_in_days, 10);
          try {
            const result = await API.post('/admin/invites', data);
            const url = this.inviteUrl(result.token);
            close();
            // fetch fresh company so we have name for the share message
            const company = await API.get('/admin/company');
            this.showInviteLink(container, url, company);
          } catch (e) { UI.alertError(e); }
        });
        footer.appendChild(cancel);
        footer.appendChild(submit);
      },
    });
  },

  showInviteLink(container, url, company) {
    const orgName = company?.name || 'mi organización';
    const shareText = `Hola! Te invito a unirte a ${orgName} en nuestro gestor: ${url}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    const emailUrl = `mailto:?subject=${encodeURIComponent('Invitación a ' + orgName)}&body=${encodeURIComponent(shareText)}`;

    const body = UI.el('div', {}, []);
    body.innerHTML = `
      <p style="color:var(--text-dim);font-size:13px;margin:0 0 10px;">Comparte este enlace por WhatsApp, email o cualquier mensajería:</p>
      <div style="display:flex;gap:8px;align-items:center;margin-top:10px;">
        <input id="invite-link-input" type="text" readonly value="${UI.escapeHtml(url)}" style="flex:1;font-family:ui-monospace,Menlo,monospace;font-size:12px;" />
        <button class="btn btn-sm" id="invite-copy-btn" type="button">Copiar</button>
      </div>
      <div class="share-row">
        <a class="share-btn whatsapp" href="${UI.escapeHtml(whatsappUrl)}" target="_blank" rel="noopener">
          <span style="font-size:16px;">💬</span> WhatsApp
        </a>
        <a class="share-btn email" href="${UI.escapeHtml(emailUrl)}">
          <span style="font-size:16px;">✉</span> Email
        </a>
        <button type="button" class="share-btn" id="invite-native-share">
          <span style="font-size:16px;">↗</span> Más opciones
        </button>
      </div>
      <p style="color:var(--text-dim);font-size:11px;margin-top:14px;">
        Si tu app no está publicada en internet, este enlace solo funcionará en tu PC o en tu red local.
      </p>
    `;
    UI.showModal({
      title: 'Invitación creada',
      body,
      footer: (footer, close) => {
        const ok = UI.el('button', { class: 'btn', type: 'button', onclick: () => { close(); this.load(container); } }, 'Hecho');
        footer.appendChild(ok);
      },
    });
    setTimeout(() => {
      const input = document.getElementById('invite-link-input');
      const btn = document.getElementById('invite-copy-btn');
      const nativeBtn = document.getElementById('invite-native-share');
      if (input) { input.focus(); input.select(); }
      if (btn) btn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(url); btn.textContent = '¡Copiado!'; setTimeout(() => btn.textContent = 'Copiar', 1500); }
        catch (e) { input.select(); document.execCommand('copy'); }
      });
      if (nativeBtn) {
        if (navigator.share) {
          nativeBtn.addEventListener('click', async () => {
            try { await navigator.share({ title: 'Invitación a ' + orgName, text: shareText, url }); }
            catch (e) { /* user cancelled */ }
          });
        } else {
          nativeBtn.style.display = 'none';
        }
      }
    }, 50);
  },
};
