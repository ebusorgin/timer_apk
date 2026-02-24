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

  // ===== API helpers =====

  async function apiFetch(path, opts = {}) {
    const res = await fetch(API + path, {
      ...opts,
      headers: { ...headers(), ...(opts.headers || {}) },
    });
    if (res.status === 401 || res.status === 403) {
      window.location.href = '/';
      return null;
    }
    return res.json();
  }

  async function fetchOnline() {
    return apiFetch('/api/admin/online');
  }

  async function fetchStats() {
    return apiFetch('/api/admin/stats');
  }

  async function fetchJwtTtl() {
    const data = await apiFetch('/api/admin/settings/jwt-ttl');
    return data?.success ? data.ttlSeconds : null;
  }

  async function saveJwtTtl(ttlSeconds) {
    const data = await apiFetch('/api/admin/settings/jwt-ttl', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttlSeconds }),
    });
    return data?.success;
  }

  let currentPage = 1;
  const limit = 20;

  async function fetchSubscribers(page = 1) {
    return apiFetch(`/api/admin/subscribers?page=${page}&limit=${limit}`);
  }

  async function fetchSubscriberById(id) {
    return apiFetch(`/api/admin/subscribers/${id}`);
  }

  async function updateSubscriber(id, body) {
    return apiFetch(`/api/admin/subscribers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function deleteSubscriber(id) {
    return apiFetch(`/api/admin/subscribers/${id}`, { method: 'DELETE' });
  }

  async function createSubscriber(body) {
    return apiFetch('/api/admin/subscribers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // ===== Render helpers =====

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;');
  }

  function avatarHtml(url, name, size = 24) {
    if (url) {
      return `<img src="${escapeAttr(url)}" alt="" style="width:${size}px; height:${size}px; border-radius:50%; object-fit:cover; vertical-align:middle;">`;
    }
    return `<div style="width:${size}px; height:${size}px; border-radius:50%; background:var(--bg-input); display:inline-flex; align-items:center; justify-content:center; font-size:${Math.round(size * 0.35)}px; font-weight:600; color:var(--text-secondary); vertical-align:middle;">${(name || '?').charAt(0).toUpperCase()}</div>`;
  }

  // ===== Dashboard rendering =====

  function renderOnline(data) {
    const list = $('adminOnlineList');
    const source = $('adminSource');
    if (!data || !data.success) return;
    const online = data.online || [];
    list.innerHTML = online.length === 0
      ? '<div class="admin-online-item" style="color:var(--text-muted); cursor:default;">Нет пользователей в сети</div>'
      : online.map((u) => {
        const avatar = u.avatarUrl
          ? `<img src="${escapeAttr(u.avatarUrl)}" alt="">`
          : (u.name || '?').charAt(0).toUpperCase();
        return `
            <div class="admin-online-item" onclick="window._adminOpenProfile('${escapeAttr(u.id)}')">
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

  function renderSubscribers(data) {
    const list = $('adminAllUsersList');
    const totalCount = $('adminTotalUsersCount');
    if (!data || !data.success) return;

    const subs = data.subscribers || [];
    totalCount.textContent = `Всего: ${data.total}`;

    if (subs.length === 0) {
      list.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding: 24px;">Нет пользователей</td></tr>';
      return;
    }

    list.innerHTML = subs.map(s => {
      const date = s.createdAt ? new Date(s.createdAt).toLocaleString('ru-RU') : '—';
      const avatar = avatarHtml(s.avatarUrl, s.name, 24);

      return `
        <tr onclick="window._adminOpenProfile('${escapeAttr(s.id)}')">
          <td>${avatar} <span class="admin-online-name" style="margin-left:8px;">${escapeHtml(s.name)}</span></td>
          <td>
            <div style="font-size:0.85rem;">${escapeHtml(s.login)}</div>
            <div style="font-size:0.7rem; color:var(--text-muted);">ID: ${escapeHtml(s.id)}</div>
          </td>
          <td><span style="font-size:0.8rem; color:${s.role === 'admin' ? 'var(--primary)' : 'inherit'}">${escapeHtml(s.role)}</span></td>
          <td style="color:var(--text-muted); font-size:0.8rem;">${date}</td>
        </tr>
      `;
    }).join('');

    renderPagination(data);
  }

  function renderPagination(data) {
    const container = $('adminUserPagination');
    if (!data || data.pages <= 1) {
      container.innerHTML = '';
      return;
    }

    let html = '';
    html += `<button class="pagination-btn" ${data.page <= 1 ? 'disabled' : ''} onclick="window._adminGoToPage(${data.page - 1})">←</button>`;
    for (let i = 1; i <= data.pages; i++) {
      if (i === 1 || i === data.pages || (i >= data.page - 2 && i <= data.page + 2)) {
        html += `<button class="pagination-btn ${i === data.page ? 'active' : ''}" onclick="window._adminGoToPage(${i})">${i}</button>`;
      } else if (i === 2 || i === data.pages - 1) {
        html += `<span style="color:var(--text-muted)">...</span>`;
      }
    }
    html += `<button class="pagination-btn" ${data.page >= data.pages ? 'disabled' : ''} onclick="window._adminGoToPage(${data.page + 1})">→</button>`;
    container.innerHTML = html;
  }

  window._adminGoToPage = (page) => {
    currentPage = page;
    fetchSubscribers(page).then(renderSubscribers);
  };

  // ===== Screens =====

  function showDashboard() {
    $('adminDashboardScreen').classList.remove('hidden');
    $('adminProfileScreen').classList.add('hidden');
  }

  function showProfile() {
    $('adminDashboardScreen').classList.add('hidden');
    $('adminProfileScreen').classList.remove('hidden');
  }

  // ===== Profile screen =====

  let currentProfileId = null;

  window._adminOpenProfile = async (id) => {
    currentProfileId = id;
    const data = await fetchSubscriberById(id);
    if (!data || !data.success) return;
    const s = data.subscriber;

    $('profileScreenTitle').textContent = `Профиль: ${s.name}`;

    // Avatar
    const avatarEl = $('profileAvatar');
    if (s.avatarUrl) {
      avatarEl.innerHTML = `<img src="${escapeAttr(s.avatarUrl)}" alt="">`;
    } else {
      avatarEl.textContent = (s.name || '?').charAt(0).toUpperCase();
    }

    $('profileDisplayName').textContent = s.name;
    const meta = [];
    meta.push(`Логин: ${s.login}`);
    meta.push(`ID: ${s.id}`);
    if (s.createdAt) meta.push(`Создан: ${new Date(s.createdAt).toLocaleString('ru-RU')}`);
    if (s.updatedAt) meta.push(`Обновлён: ${new Date(s.updatedAt).toLocaleString('ru-RU')}`);
    $('profileMeta').innerHTML = meta.join(' &nbsp;·&nbsp; ');

    $('profileName').value = s.name;
    $('profileRole').value = s.role || 'user';
    $('profilePassword').value = '';
    $('profileStatus').textContent = '';
    $('profileStatus').className = 'admin-form-status';

    showProfile();
  };

  // Save profile
  $('adminBtnSaveProfile').addEventListener('click', async () => {
    if (!currentProfileId) return;
    const body = {};
    const name = $('profileName').value.trim();
    const role = $('profileRole').value;
    const password = $('profilePassword').value;

    if (!name) {
      $('profileStatus').textContent = 'Имя не может быть пустым';
      $('profileStatus').className = 'admin-form-status error';
      return;
    }

    body.name = name;
    body.role = role;
    if (password) body.password = password;

    $('adminBtnSaveProfile').disabled = true;
    const data = await updateSubscriber(currentProfileId, body);
    $('adminBtnSaveProfile').disabled = false;

    if (data?.success) {
      $('profileStatus').textContent = '✓ Сохранено';
      $('profileStatus').className = 'admin-form-status success';
      $('profileDisplayName').textContent = data.subscriber.name;
      $('profileScreenTitle').textContent = `Профиль: ${data.subscriber.name}`;
      setTimeout(() => { $('profileStatus').textContent = ''; }, 2500);
    } else {
      $('profileStatus').textContent = data?.error || 'Ошибка сохранения';
      $('profileStatus').className = 'admin-form-status error';
    }
  });

  // Delete user
  $('adminBtnDeleteUser').addEventListener('click', async () => {
    if (!currentProfileId) return;
    const name = $('profileDisplayName').textContent;
    if (!confirm(`Удалить пользователя «${name}» (ID: ${currentProfileId})? Это действие необратимо.`)) return;

    $('adminBtnDeleteUser').disabled = true;
    const data = await deleteSubscriber(currentProfileId);
    $('adminBtnDeleteUser').disabled = false;

    if (data?.success) {
      showDashboard();
      refresh();
    } else {
      $('profileStatus').textContent = data?.error || 'Ошибка удаления';
      $('profileStatus').className = 'admin-form-status error';
    }
  });

  // Back button
  $('adminBtnBack').addEventListener('click', () => {
    showDashboard();
    refresh();
  });

  // ===== Create user modal =====

  function openCreateModal() {
    $('newUserLogin').value = '';
    $('newUserName').value = '';
    $('newUserPassword').value = '';
    $('newUserRole').value = 'user';
    $('createUserStatus').textContent = '';
    $('createUserStatus').className = 'admin-form-status';
    $('createUserModal').classList.add('active');
    $('newUserLogin').focus();
  }

  function closeCreateModal() {
    $('createUserModal').classList.remove('active');
  }

  $('adminBtnCreateUser').addEventListener('click', openCreateModal);
  $('modalBtnCancel').addEventListener('click', closeCreateModal);

  $('createUserModal').addEventListener('click', (e) => {
    if (e.target === $('createUserModal')) closeCreateModal();
  });

  $('modalBtnCreate').addEventListener('click', async () => {
    const login = $('newUserLogin').value.trim();
    const name = $('newUserName').value.trim();
    const password = $('newUserPassword').value;
    const role = $('newUserRole').value;

    if (!login || !name || !password) {
      $('createUserStatus').textContent = 'Заполните все поля';
      $('createUserStatus').className = 'admin-form-status error';
      return;
    }
    if (password.length < 4) {
      $('createUserStatus').textContent = 'Пароль минимум 4 символа';
      $('createUserStatus').className = 'admin-form-status error';
      return;
    }

    $('modalBtnCreate').disabled = true;
    const data = await createSubscriber({ login, name, password, role });
    $('modalBtnCreate').disabled = false;

    if (data?.success) {
      closeCreateModal();
      refresh();
    } else {
      $('createUserStatus').textContent = data?.error || 'Ошибка создания';
      $('createUserStatus').className = 'admin-form-status error';
    }
  });

  // ===== Dashboard refresh =====

  async function refresh() {
    const [onlineData, statsData, subsData] = await Promise.all([
      fetchOnline(),
      fetchStats(),
      fetchSubscribers(currentPage)
    ]);
    if (onlineData) renderOnline(onlineData);
    if (subsData) renderSubscribers(subsData);
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

  // ===== Init =====

  if (!getToken()) {
    window.location.href = '/';
  } else {
    refresh();
    loadJwtTtlUi();
    setupJwtTtlUi();
  }

  $('adminBtnRefresh').addEventListener('click', () => refresh());
})();
