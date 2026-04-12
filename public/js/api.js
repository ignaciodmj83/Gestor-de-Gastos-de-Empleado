// Minimal fetch wrapper with token auth
const API = (function () {
  const TOKEN_KEY = 'erp_token';
  const USER_KEY = 'erp_user';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
  function getUser() {
    const u = localStorage.getItem(USER_KEY);
    return u ? JSON.parse(u) : null;
  }
  function setUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }

  async function request(method, path, body, isForm = false) {
    const headers = {};
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const opts = { method, headers };
    if (body) {
      if (isForm) {
        opts.body = body;
      } else {
        headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
    }
    const res = await fetch('/api' + path, opts);
    if (res.status === 401) {
      clearAuth();
      window.dispatchEvent(new CustomEvent('auth:expired'));
      throw new Error('No autorizado');
    }
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : await res.text();
    if (!res.ok) {
      throw new Error((data && data.error) || ('HTTP ' + res.status));
    }
    return data;
  }

  return {
    getToken, setToken, clearAuth, getUser, setUser,
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b),
    patch: (p, b) => request('PATCH', p, b),
    del: (p) => request('DELETE', p),
    upload: (p, formData) => request('POST', p, formData, true),
    async login(email, password) {
      const data = await request('POST', '/auth/login', { email, password });
      setToken(data.token);
      setUser(data.user);
      return data;
    },
    async register(payload) {
      const data = await request('POST', '/auth/register', payload);
      setToken(data.token);
      setUser(data.user);
      return data;
    },
    async acceptInvite(token, payload) {
      const data = await request('POST', '/auth/invite/' + encodeURIComponent(token) + '/accept', payload);
      setToken(data.token);
      setUser(data.user);
      return data;
    },
    logout() { clearAuth(); },
  };
})();
