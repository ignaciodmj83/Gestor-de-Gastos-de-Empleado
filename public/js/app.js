// SPA shell + hash router — Labore ERP RRHH
(function () {
  const root = document.getElementById('app');

  // ---- SVG icon set (inline, brand-consistent) ----
  const ICONS = {
    home: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    tickets: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/></svg>`,
    mileage: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/><path d="M5.3 5.3 2 2"/></svg>`,
    vacations: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    timeclock: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    admin: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    logout: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
    settings: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  };

  function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  }

  function shell(hash, viewName, viewRender) {
    const user = API.getUser();
    if (!user) { LoginView.render(root); return; }

    const navItems = [
      { hash: '#/', label: 'Inicio', icon: 'home' },
      { hash: '#/tickets', label: 'Tickets', icon: 'tickets' },
      { hash: '#/mileage', label: 'Viajes / Km', icon: 'mileage' },
      { hash: '#/vacations', label: 'Vacaciones', icon: 'vacations' },
      { hash: '#/timeclock', label: 'Fichaje', icon: 'timeclock' },
    ];
    if (user.role === 'admin' || user.role === 'manager') {
      navItems.push({ hash: '#/admin', label: 'Admin', icon: 'admin' });
    }

    const isActive = (h) => {
      if (h === '#/') return hash === '#/' || hash === '' || hash === '#';
      return hash.startsWith(h);
    };

    const roleLabel = { admin: 'Administrador', manager: 'Manager', employee: 'Empleado' }[user.role] || user.role;

    root.innerHTML = `
      <div class="app-shell">
        <aside class="sidebar">
          <div class="brand">
            <span class="brand-logo">L</span>
            <div>
              Labore
              <small>ERP RRHH</small>
            </div>
          </div>
          <nav>
            ${navItems.map(n => `
              <a href="${n.hash}" class="${isActive(n.hash) ? 'active' : ''}">
                ${ICONS[n.icon] || ''}
                ${n.label}
              </a>`).join('')}
          </nav>
          <div class="user-box">
            <div class="user-avatar">${getInitials(user.full_name)}</div>
            <div class="user-info">
              <div class="name">${UI.escapeHtml(user.full_name)}</div>
              <div class="role">${roleLabel}</div>
            </div>
            <div class="user-actions">
              ${user.role === 'admin' ? `<a href="#/admin" class="user-action-btn" title="Configuración">${ICONS.settings}</a>` : ''}
              <button class="user-action-btn" id="logout" title="Cerrar sesión">${ICONS.logout}</button>
            </div>
          </div>
        </aside>
        <main id="main-content"></main>
      </div>
    `;

    document.getElementById('logout').addEventListener('click', () => {
      API.logout();
      location.hash = '#/';
      route();
    });

    const main = document.getElementById('main-content');
    viewRender(main);
  }

  function route() {
    const user = API.getUser();
    const hash = location.hash || '#/';

    if (hash.match(/^#\/invite\//)) {
      LoginView.render(root);
      return;
    }
    if (!user) { LoginView.render(root); return; }

    if (hash === '#/' || hash === '#') {
      shell(hash, 'dashboard', (c) => DashboardView.render(c));
      return;
    }
    if (hash === '#/tickets') {
      shell(hash, 'tickets', (c) => TicketsView.render(c));
      return;
    }
    const tm = hash.match(/^#\/tickets\/(\d+)$/);
    if (tm) { shell(hash, 'tickets', (c) => TicketsView.renderDetail(c, tm[1])); return; }

    if (hash === '#/mileage') {
      shell(hash, 'mileage', (c) => MileageView.render(c));
      return;
    }
    const mm = hash.match(/^#\/mileage\/(\d+)$/);
    if (mm) { shell(hash, 'mileage', (c) => MileageView.renderDetail(c, mm[1])); return; }

    if (hash === '#/vacations') {
      shell(hash, 'vacations', (c) => VacationsView.render(c));
      return;
    }
    if (hash === '#/timeclock') {
      shell(hash, 'timeclock', (c) => TimeClockView.render(c));
      return;
    }
    if (hash === '#/admin') {
      shell(hash, 'admin', (c) => AdminView.render(c));
      return;
    }
    location.hash = '#/';
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('auth:changed', route);
  window.addEventListener('auth:expired', route);
  route();
})();
