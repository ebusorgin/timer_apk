import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';

export default function Dashboard() {
  const { token, userId, logout } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [inputText, setInputText] = useState('');
  const [addNodeId, setAddNodeId] = useState('');
  const [addBoxKey, setAddBoxKey] = useState('');
  const [addName, setAddName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [relayOnline, setRelayOnline] = useState(null);
  const [bleAvailable, setBleAvailable] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);

  const loadContacts = useCallback(async () => {
    if (!token) return;
    try {
      const list = await api.getContacts(token);
      setContacts(list);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  const loadMessages = useCallback(async () => {
    if (!token) return;
    try {
      const list = await api.getMessages(token);
      setMessages(list);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    loadMessages();
    const t = setInterval(loadMessages, 5000);
    return () => clearInterval(t);
  }, [loadMessages]);

  const checkRelay = useCallback(async () => {
    const { online } = await api.getRelayHealth();
    setRelayOnline(online);
  }, []);
  useEffect(() => {
    checkRelay();
    const tr = setInterval(checkRelay, 15000);
    return () => clearInterval(tr);
  }, [checkRelay]);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.bluetooth?.getAvailability) {
      navigator.bluetooth.getAvailability().then((a) => setBleAvailable(a)).catch(() => setBleAvailable(false));
    } else {
      setBleAvailable(false);
    }
  }, []);

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setInstallPrompt(() => e);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) setInstalled(true);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  };

  const handleAddContact = async (e) => {
    e.preventDefault();
    if (!addNodeId.trim() || !addBoxKey.trim()) return;
    setError('');
    setLoading(true);
    try {
      await api.addContact(token, addNodeId.trim(), addBoxKey.trim(), addName.trim());
      setAddNodeId('');
      setAddBoxKey('');
      setAddName('');
      loadContacts();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedContact) return;
    setError('');
    setLoading(true);
    try {
      const msg = await api.buildMessage(token, inputText.trim(), selectedContact.nodeId, 86400);
      await api.postMessageToRelay(msg);
      setInputText('');
      loadMessages();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredMessages = selectedContact
    ? messages.filter((m) => m.sender_id === selectedContact.nodeId)
    : [];

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <h1 className="dashboard-title">Личный кабинет</h1>
          <span className="me" title={userId}>NodeID: {userId?.slice(0, 16)}…</span>
        </div>
        <button type="button" className="btn-logout" onClick={logout}>Выйти</button>
      </header>

      <section className="app-ways app-ways-card" aria-label="Установить или скачать">
        <h2 className="app-ways-heading">Установить или скачать приложение</h2>
        <p className="app-ways-desc">Веб в браузере, программа на компьютер, APK на телефон или расширение Chrome.</p>
        <div className="app-ways-buttons">
          {installed ? (
            <span className="app-way-btn app-way-done">✓ Установлено</span>
          ) : installPrompt ? (
            <button type="button" className="app-way-btn app-way-btn-install" onClick={handleInstall}>
              Установить приложение
            </button>
          ) : (
            <span className="app-way-btn app-way-hint-btn" title="В Chrome: меню ⋮ → «Установить net.aiternitas.ru»">
              Установить (Chrome: меню ⋮)
            </span>
          )}
          <a href="/apk/net.aiternitas.ru.apk" className="app-way-btn app-way-btn-download" download>
            Скачать APK (Android)
          </a>
          <a href="/extension.zip" className="app-way-btn app-way-btn-extension" download>
            Скачать расширение Chrome
          </a>
        </div>
        <p className="app-ways-extra">Расширение: распакуйте архив → chrome://extensions → Режим разработчика → Загрузить распакованное → выбрать папку</p>
      </section>

      <section className="channels-block channels-card" aria-label="Каналы доставки">
        <h3>Каналы доставки</h3>
        <ul className="channels-list">
          <li>
            <span className="channel-name">Релей (интернет)</span>
            <span className="channel-status">
              {relayOnline === null ? '…' : relayOnline ? '✅ подключен' : '❌ нет'}
            </span>
          </li>
          <li>
            <span className="channel-name">Bluetooth / Wi‑Fi</span>
            <span className="channel-status channel-unavailable">в браузере недоступны (нужна APK)</span>
          </li>
        </ul>
      </section>

      <div className="contacts-list contacts-card">
        <h3>Контакты</h3>
        {contacts.map((c) => (
          <div
            key={c.nodeId}
            className={`contact-row ${selectedContact?.nodeId === c.nodeId ? 'selected' : ''}`}
            onClick={() => setSelectedContact(c)}
          >
            <div>
              <span className="name">{c.name || c.nodeId.slice(0, 12)}</span>
              <div className="node-id">{c.nodeId.slice(0, 24)}…</div>
            </div>
          </div>
        ))}
        <form className="add-contact" onSubmit={handleAddContact}>
          <input
            placeholder="NodeID (hex)"
            value={addNodeId}
            onChange={(e) => setAddNodeId(e.target.value)}
          />
          <input
            placeholder="Box public key (base64)"
            value={addBoxKey}
            onChange={(e) => setAddBoxKey(e.target.value)}
          />
          <input
            placeholder="Имя"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
          />
          <button type="submit" disabled={loading}>Добавить</button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="chat">
        {!selectedContact ? (
          <div className="empty">Выберите контакт</div>
        ) : (
          <>
            <div className="messages">
              {filteredMessages.map((m) => (
                <div key={m.message_id} className={`msg in`}>
                  <div className="meta">{new Date(m.created_at * 1000).toLocaleString()}</div>
                  {m.plaintext}
                </div>
              ))}
            </div>
            <form className="send-row" onSubmit={handleSend}>
              <input
                placeholder="Сообщение"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
              <button type="submit" disabled={loading}>Отправить</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
