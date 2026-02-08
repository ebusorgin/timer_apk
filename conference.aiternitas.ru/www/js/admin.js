(function () {
  const TOKEN_KEY = 'conference:token';
  const API = window.location.origin;

  const $ = (id) => document.getElementById(id);

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch {
      return '';
    }
  }

  function headers() {
    const token = getToken();
    return token ? { 'Authorization': 'Bearer ' + token } : {};
  }

  async function fetchOnline() {
    const res = await fetch(API + '/api/admin/online', { headers: headers() });
    if (res.status === 401 || res.status === 403) {
      window.location.href = '/';
      return null;
    }
    return res.json();
  }

  async function fetchStats() {
    const res = await fetch(API + '/api/admin/stats', { headers: headers() });
    if (res.status === 401 || res.status === 403) {
      window.location.href = '/';
      return null;
    }
    return res.json();
  }

  async function fetchJwtTtl() {
    const res = await fetch(API + '/api/admin/settings/jwt-ttl', { headers: headers() });
    if (res.status === 401 || res.status === 403) {
      window.location.href = '/';
      return null;
    }
    const data = await res.json();
    return data.success ? data.ttlSeconds : null;
  }

  async function saveJwtTtl(ttlSeconds) {
    const res = await fetch(API + '/api/admin/settings/jwt-ttl', {
      method: 'PUT',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttlSeconds }),
    });
    if (res.status === 401 || res.status === 403) {
      window.location.href = '/';
      return false;
    }
    const data = await res.json();
    return data.success;
  }

  function renderOnline(data) {
    const list = $('adminOnlineList');
    const source = $('adminSource');
    if (!data || !data.success) return;
    const online = data.online || [];
    list.innerHTML = online.length === 0
      ? '<div class="admin-online-item" style="color:var(--text-muted);">Нет пользователей в сети</div>'
      : online.map((u) => {
          const avatar = u.avatarUrl
            ? `<img src="${escapeAttr(u.avatarUrl)}" alt="">`
            : (u.name || '?').charAt(0).toUpperCase();
          return `
            <div class="admin-online-item">
              <div class="admin-online-avatar">${avatar}</div>
              <div>
                <div class="admin-online-name">${escapeHtml(u.name || u.id)}</div>
                <div class="admin-online-id">${escapeHtml(u.id)}</div>
              </div>
              <span class="admin-badge">онлайн</span>
            </div>`;
        }).join('');
    source.textContent = 'Источник: ' + (data.source === 'redis' ? 'Redis' : 'память процесса');
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;');
  }

  async function refresh() {
    const [onlineData, statsData] = await Promise.all([fetchOnline(), fetchStats()]);
    if (onlineData) renderOnline(onlineData);
    if (statsData && statsData.success) {
      $('statOnline').textContent = statsData.onlineCount ?? 0;
      $('statConnections').textContent = statsData.socketConnections ?? 0;
      $('statRedis').textContent = statsData.redisAvailable ? '✓' : '—';
    }
  }

  const JWT_TTL_OPTIONS = [300, 3600, 36000, 86400, 604800, 2592000, 12960000, 31536000];

  function loadJwtTtlUi() {
    fetchJwtTtl().then((sec) => {
      if (sec != null) {
        const sel = $('adminJwtTtlSelect');
        if (!sel) return;
        sel.value = JWT_TTL_OPTIONS.includes(sec) ? String(sec) : '86400';
      }
    });
  }

  function setupJwtTtlUi() {
    const sel = $('adminJwtTtlSelect');
    const btn = $('adminBtnSaveJwtTtl');
    const status = $('adminJwtTtlStatus');
    if (!sel || !btn) return;
    btn.addEventListener('click', async () => {
      const val = parseInt(sel.value, 10);
      if (!Number.isFinite(val)) return;
      btn.disabled = true;
      status.textContent = '';
      const ok = await saveJwtTtl(val);
      btn.disabled = false;
      status.textContent = ok ? 'Сохранено' : 'Ошибка';
      if (ok) setTimeout(() => { status.textContent = ''; }, 2000);
    });
  }

  if (!getToken()) {
    window.location.href = '/';
  } else {
    refresh();
    loadJwtTtlUi();
    setupJwtTtlUi();
  }

  $('adminBtnRefresh').addEventListener('click', () => refresh());
})();
