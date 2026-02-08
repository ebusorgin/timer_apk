import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';

export default function Landing() {
  const { login, register } = useAuth();
  const [tab, setTab] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (tab === 'login') {
        await login(username, password);
      } else {
        await register(username, password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing">
      <p className="landing-back">
        <Link to="/">← На главную</Link>
      </p>
      <h1>net.aiternitas.ru</h1>
      <p>Децентрализованный мессенджер. Один тип участника — узел.</p>
      <div className="tabs">
        <button
          type="button"
          className={tab === 'login' ? 'active' : ''}
          onClick={() => { setTab('login'); setError(''); }}
        >
          Вход
        </button>
        <button
          type="button"
          className={tab === 'register' ? 'active' : ''}
          onClick={() => { setTab('register'); setError(''); }}
        >
          Регистрация
        </button>
      </div>
      <form className="form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Имя пользователя"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
          required
          minLength={6}
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {tab === 'login' ? 'Войти' : 'Зарегистрироваться'}
        </button>
      </form>
    </div>
  );
}
