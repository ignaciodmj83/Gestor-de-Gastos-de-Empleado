// SPA shell + hash router
(function () {
  const root = document.getElementById('app');

  function renderShell(viewRender, hash) {
    const user = API.getUser();
    if (!user) {
      LoginView.render(root);
      return;
    }
    const isAdmin = user.role === 'admin';
    const navItems = [
      { hash: '#/', label: 'Inicio' },
      { hash: '#/tickets', label: 'Tickets' },
      { hash: '#/mileage', label: 'Viajes/Km' },
      { hash: '#/vacations', label: 'Vacaciones' },
      { hash: '#/timeclock', label: 'Fichaje' },
    ];
    if (isAdmin) navItems.push({ hash: '#/admin', label: 'Admin' });

    root.innerHTML = `
      <div class="app-shell">
        <aside class="sidebar">
          <div class="brand">
            Gestor Contable
            <small>Empleado · ERP RRHH</small>
          </div>
          <nav>
            ${navItems.map(n => `<a href="${n.hash}" class="${this.matchActive(n.hash, hash) ? 'active' : ''}">${n.label}</a>`).join('')}
          </nav>
          <div class="user-box">
            <div class="name">${UI.escapeHtml(user.full_name)}</div>
            <div class="role">${user.role}</div>
            <button class="logout-btn" id="logout">Cerrar sesión</button>
          </div>
        </aside>
        <main id="main-content"></main>
      </div>
    `;
    document.getElementById('logout').addEventListener('click', () => {
      API.logout();
      location.hash = '#/';
      window.dispatchEvent(new CustomEvent('auth:changed'));
    });

    const main = document.getElementById('main-content');
    viewRender(main);
  }

  // helper as method since referenced via this in renderShell
  renderShell.prototype = {};
  function matchActive(navHash, currentHash) {
    if (navHash === '#/') return currentHash === '#/' || currentHash === '';
    return currentHash.startsWith(navHash);
  }
  renderShell.matchActive = matchActive;
  // bind
  renderShell.matchActive = matchActive;
  // Replace 'this.matchActive' calls — easier: rebuild approach
  // (we'll just inline it; rewriting):

  function shell(hash, viewName, viewRender) {
    const user = API.getUser();
    if (!user) { LoginView.render(root); return; }
    const isAdmin = user.role === 'admin';
    const navItems = [
      { hash: '#/', label: 'Inicio' },
      { hash: '#/tickets', label: 'Tickets' },
      { hash: '#/mileage', label: 'Viajes/Km' },
      { hash: '#/vacations', label: 'Vacaciones' },
      { hash: '#/timeclock', label: 'Fichaje' },
    ];
    if (isAdmin) navItems.push({ hash: '#/admin', label: 'Admin' });

    const isActive = (h) => {
      if (h === '#/') return hash === '#/' || hash === '' || hash === '#';
      return hash.startsWith(h);
    };

    root.innerHTML = `
      <div class="app-shell">
        <aside class="sidebar">
          <div class="brand">
            Gestor Contable
            <small>Empleado · ERP RRHH</small>
          </div>
          <nav>
            ${navItems.map(n => `<a href="${n.hash}" class="${isActive(n.hash) ? 'active' : ''}">${n.label}</a>`).join('')}
          </nav>
          <div class="user-box">
            <div class="name">${UI.escapeHtml(user.full_name)}</div>
            <div class="role">${user.role}</div>
            <button class="logout-btn" id="logout">Cerrar sesión</button>
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
    // Public route: accept invite
    if (hash.match(/^#\/invite\//)) {
      LoginView.render(root);
      return;
    }
    if (!user) { LoginView.render(root); return; }

    // simple route matching
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
    // fallback
    location.hash = '#/';
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('auth:changed', route);
  window.addEventListener('auth:expired', route);

  // initial render
  route();
})();
