const LoginView = {
  async render(container) {
    const hash = location.hash || '';
    const inviteMatch = hash.match(/^#\/invite\/(.+)$/);
    if (inviteMatch) {
      await this.renderAcceptInvite(container, decodeURIComponent(inviteMatch[1]));
      return;
    }
    this.renderAuth(container, 'login');
  },

  renderAuth(container, mode) {
    container.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <h1>Gestor Contable Empleado</h1>
          <div class="sub">ERP de RRHH y contabilidad operativa</div>

          <div class="auth-tabs">
            <button type="button" class="auth-tab ${mode === 'login' ? 'active' : ''}" data-mode="login">Iniciar sesión</button>
            <button type="button" class="auth-tab ${mode === 'register' ? 'active' : ''}" data-mode="register">Crear organización</button>
            <button type="button" class="auth-tab ${mode === 'join' ? 'active' : ''}" data-mode="join">Unirme con código</button>
          </div>

          <div id="auth-error"></div>
          <div id="auth-body"></div>

          <div class="demo-creds">
            <strong>Demo:</strong> admin@demo.local / admin123
          </div>
        </div>
      </div>
    `;
    container.querySelectorAll('.auth-tab').forEach(b => b.addEventListener('click', () => {
      this.renderAuth(container, b.dataset.mode);
    }));
    if (mode === 'login') this.renderLoginForm(container);
    else if (mode === 'register') this.renderRegisterForm(container);
    else this.renderJoinForm(container);
  },

  renderLoginForm(container) {
    const body = container.querySelector('#auth-body');
    const errBox = container.querySelector('#auth-error');
    body.innerHTML = `
      <form id="login-form">
        <div class="field">
          <label>Email</label>
          <input type="email" name="email" required autofocus />
        </div>
        <div class="field">
          <label>Contraseña</label>
          <input type="password" name="password" required />
        </div>
        <button type="submit" class="btn" style="width:100%; justify-content:center;">Iniciar sesión</button>
      </form>
    `;
    body.querySelector('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.innerHTML = '';
      const fd = new FormData(e.target);
      try {
        await API.login(fd.get('email'), fd.get('password'));
        window.dispatchEvent(new CustomEvent('auth:changed'));
      } catch (err) {
        errBox.innerHTML = `<div class="error-msg">${UI.escapeHtml(err.message)}</div>`;
      }
    });
  },

  renderRegisterForm(container) {
    const body = container.querySelector('#auth-body');
    const errBox = container.querySelector('#auth-error');
    body.innerHTML = `
      <p style="color:var(--text-dim);font-size:12px;margin:0 0 10px;">
        Crea una organización nueva. Tu cuenta será la del administrador.
      </p>
      <form id="register-form">
        <div class="field">
          <label>Nombre de la organización</label>
          <input type="text" name="company_name" required autofocus placeholder="p. ej. Mi Empresa S.L." />
        </div>
        <div class="field">
          <label>Tu nombre</label>
          <input type="text" name="full_name" required />
        </div>
        <div class="field">
          <label>Email</label>
          <input type="email" name="email" required />
        </div>
        <div class="field">
          <label>Contraseña (mín. 6 caracteres)</label>
          <input type="password" name="password" required minlength="6" />
        </div>
        <button type="submit" class="btn" style="width:100%; justify-content:center;">Crear organización</button>
      </form>
    `;
    body.querySelector('#register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.innerHTML = '';
      const fd = new FormData(e.target);
      try {
        await API.register(Object.fromEntries(fd));
        window.dispatchEvent(new CustomEvent('auth:changed'));
      } catch (err) {
        errBox.innerHTML = `<div class="error-msg">${UI.escapeHtml(err.message)}</div>`;
      }
    });
  },

  renderJoinForm(container) {
    const body = container.querySelector('#auth-body');
    const errBox = container.querySelector('#auth-error');
    body.innerHTML = `
      <p style="color:var(--text-dim);font-size:12px;margin:0 0 10px;">
        Pide a tu administrador el <strong>código de organización</strong> (p. ej. <code>ACM-3F8K</code>) e introdúcelo aquí.
      </p>
      <form id="join-lookup-form">
        <div class="field">
          <label>Código de organización</label>
          <input type="text" name="code" required autofocus placeholder="ACM-3F8K"
                 style="text-transform:uppercase;letter-spacing:2px;font-family:ui-monospace,Menlo,monospace;" />
        </div>
        <button type="submit" class="btn" style="width:100%; justify-content:center;">Buscar organización</button>
      </form>
      <div id="join-step-2"></div>
    `;
    body.querySelector('#join-lookup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.innerHTML = '';
      const fd = new FormData(e.target);
      const code = String(fd.get('code') || '').trim().toUpperCase();
      try {
        const org = await API.get('/auth/org/' + encodeURIComponent(code));
        this.renderJoinRequestForm(container, org);
      } catch (err) {
        errBox.innerHTML = `<div class="error-msg">${UI.escapeHtml(err.message)}</div>`;
      }
    });
  },

  renderJoinRequestForm(container, org) {
    const body = container.querySelector('#auth-body');
    const errBox = container.querySelector('#auth-error');
    body.innerHTML = `
      <div class="card" style="background:rgba(255,255,255,0.03);padding:14px;margin-bottom:14px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);">Organización encontrada</div>
        <div style="font-size:18px;font-weight:700;margin-top:4px;">${UI.escapeHtml(org.name)}</div>
        <div style="margin-top:8px;"><span class="code-badge">${UI.escapeHtml(org.code)}</span></div>
      </div>
      <p style="color:var(--text-dim);font-size:12px;margin:0 0 10px;">
        Envía una solicitud de acceso. Cuando un administrador la apruebe, podrás iniciar sesión con el email y la contraseña que indiques aquí.
      </p>
      <form id="join-request-form">
        <input type="hidden" name="code" value="${UI.escapeHtml(org.code)}" />
        <div class="field">
          <label>Tu nombre</label>
          <input type="text" name="full_name" required autofocus />
        </div>
        <div class="field">
          <label>Email</label>
          <input type="email" name="email" required />
        </div>
        <div class="field">
          <label>Contraseña (mín. 6 caracteres)</label>
          <input type="password" name="password" required minlength="6" />
        </div>
        <div class="field">
          <label>Mensaje al administrador (opcional)</label>
          <textarea name="message" rows="2" placeholder="Soy el nuevo comercial del equipo norte..."></textarea>
        </div>
        <div style="display:flex;gap:8px;">
          <button type="button" class="btn btn-secondary" id="join-back" style="flex:0 0 auto;">← Volver</button>
          <button type="submit" class="btn" style="flex:1;justify-content:center;">Enviar solicitud</button>
        </div>
      </form>
    `;
    body.querySelector('#join-back').addEventListener('click', () => this.renderJoinForm(container));
    body.querySelector('#join-request-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.innerHTML = '';
      const fd = new FormData(e.target);
      try {
        const result = await API.post('/auth/request-access', Object.fromEntries(fd));
        this.renderJoinSuccess(container, result.company_name || org.name);
      } catch (err) {
        errBox.innerHTML = `<div class="error-msg">${UI.escapeHtml(err.message)}</div>`;
      }
    });
  },

  renderJoinSuccess(container, companyName) {
    const body = container.querySelector('#auth-body');
    container.querySelector('#auth-error').innerHTML = '';
    body.innerHTML = `
      <div class="card" style="text-align:center;padding:24px 16px;">
        <div style="font-size:42px;line-height:1;margin-bottom:10px;">✓</div>
        <h3 style="margin:0 0 6px;">Solicitud enviada</h3>
        <p style="color:var(--text-dim);font-size:13px;margin:0 0 16px;">
          Hemos enviado tu solicitud a los administradores de <strong>${UI.escapeHtml(companyName)}</strong>.
          Cuando la aprueben, podrás iniciar sesión con el email y contraseña que has indicado.
        </p>
        <button type="button" class="btn" id="join-done" style="width:100%;justify-content:center;">Volver al inicio de sesión</button>
      </div>
    `;
    body.querySelector('#join-done').addEventListener('click', () => this.renderAuth(container, 'login'));
  },

  async renderAcceptInvite(container, token) {
    container.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <h1>Aceptar invitación</h1>
          <div class="sub">Únete a una organización existente</div>
          <div id="invite-info" style="margin:14px 0;">Cargando invitación...</div>
          <div id="auth-error"></div>
          <div id="auth-body"></div>
          <div style="text-align:center;margin-top:14px;">
            <a href="#/" style="color:var(--text-dim);font-size:12px;">Volver al inicio</a>
          </div>
        </div>
      </div>
    `;
    const errBox = container.querySelector('#auth-error');
    const info = container.querySelector('#invite-info');
    const body = container.querySelector('#auth-body');
    let inv;
    try {
      inv = await API.get('/auth/invite/' + encodeURIComponent(token));
    } catch (err) {
      info.innerHTML = `<div class="error-msg">${UI.escapeHtml(err.message)}</div>`;
      return;
    }
    info.innerHTML = `
      <div class="card" style="background:rgba(255,255,255,0.03);padding:12px;">
        <div><strong>${UI.escapeHtml(inv.company_name)}</strong></div>
        <div style="font-size:12px;color:var(--text-dim);">
          Rol asignado: <strong>${UI.escapeHtml(inv.role)}</strong>
          ${inv.inviter_name ? ` · invitado por ${UI.escapeHtml(inv.inviter_name)}` : ''}
        </div>
      </div>
    `;
    body.innerHTML = `
      <form id="accept-form">
        <div class="field">
          <label>Tu nombre</label>
          <input type="text" name="full_name" required autofocus />
        </div>
        <div class="field">
          <label>Email</label>
          <input type="email" name="email" ${inv.email ? `value="${UI.escapeHtml(inv.email)}" readonly` : 'required'} />
        </div>
        <div class="field">
          <label>Contraseña (mín. 6 caracteres)</label>
          <input type="password" name="password" required minlength="6" />
        </div>
        <button type="submit" class="btn" style="width:100%; justify-content:center;">Unirme a ${UI.escapeHtml(inv.company_name)}</button>
      </form>
    `;
    body.querySelector('#accept-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.innerHTML = '';
      const fd = new FormData(e.target);
      try {
        await API.acceptInvite(token, Object.fromEntries(fd));
        location.hash = '#/';
        window.dispatchEvent(new CustomEvent('auth:changed'));
      } catch (err) {
        errBox.innerHTML = `<div class="error-msg">${UI.escapeHtml(err.message)}</div>`;
      }
    });
  },
};
