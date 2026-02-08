const API = '/api';
const MESSAGES = '/messages';

async function parseJson(res) {
  const ct = res.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) {
    const t = await res.text();
    if (t.trimStart().startsWith('<')) throw new Error('Сервер API не отвечает. Запустите бэкенд: в корне net.aiternitas.ru выполните npm start (порт 3000).');
    try { return JSON.parse(t); } catch { throw new Error('Ответ сервера не JSON.'); }
  }
  return res.json();
}

export async function register(username, password) {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || 'Register failed');
  return data;
}

export async function login(username, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

export function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

export async function getContacts(token) {
  const res = await fetch(`${API}/contacts`, { headers: authHeaders(token) });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || 'Failed to load contacts');
  return data.contacts;
}

export async function addContact(token, nodeId, boxPublicKey, name = '') {
  const res = await fetch(`${API}/contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ nodeId, boxPublicKey, name }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || 'Failed to add contact');
  return data;
}

export async function removeContact(token, nodeId) {
  const res = await fetch(`${API}/contacts/${encodeURIComponent(nodeId)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || 'Failed to remove contact');
  return data;
}

export async function buildMessage(token, plaintext, receiverId, ttl_seconds = 86400) {
  const res = await fetch(`${API}/messages/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ plaintext, receiverId, ttl_seconds }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || 'Build failed');
  return data;
}

export async function postMessageToRelay(message) {
  const res = await fetch(MESSAGES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const data = await parseJson(res);
    throw new Error(data.error || 'Send failed');
  }
}

export async function getMessages(token) {
  const res = await fetch(`${API}/messages`, { headers: authHeaders(token) });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || 'Failed to load messages');
  return data.messages;
}

/** Проверка доступности релея (интернет). */
export async function getRelayHealth() {
  try {
    const res = await fetch('/health', { method: 'GET' });
    const data = res.ok ? await res.json().catch(() => ({})) : {};
    return { online: res.ok && data.ok === true };
  } catch {
    return { online: false };
  }
}
