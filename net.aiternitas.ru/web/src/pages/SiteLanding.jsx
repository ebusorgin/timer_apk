import React from 'react';
import { Link } from 'react-router-dom';
import WaveNetwork from '../components/WaveNetwork';

export default function SiteLanding() {
  return (
    <div className="site-landing">
      <header className="site-header">
        <div className="site-header-inner">
          <span className="site-logo">net.aiternitas.ru</span>
          <nav>
            <Link to="/app" className="btn btn-ghost">Войти</Link>
            <Link to="/app" className="btn btn-primary">Открыть приложение</Link>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="hero-bg">
          <WaveNetwork width={320} height={240} className="hero-wave" />
        </div>
        <div className="hero-content">
          <h1>Децентрализованный мессенджер</h1>
          <p className="hero-tagline">
            Один тип участника — узел. Супер безопасная связь на случай отключения интернета и любых событий.
          </p>
          <div className="hero-cta">
            <Link to="/app" className="btn btn-primary btn-lg">Войти в приложение</Link>
            <a href="#download" className="btn btn-outline btn-lg">Скачать для Android</a>
          </div>
        </div>
      </section>

      <section className="how-it-works">
        <h2>Как это работает</h2>
        <div className="how-grid">
          <div className="how-card">
            <div className="how-icon">
              <WaveNetwork width={80} height={80} />
            </div>
            <h3>Узлы, не серверы</h3>
            <p>Каждый участник — узел. Сообщения создаются, хранятся и пересылаются между узлами. Нет центрального сервера.</p>
          </div>
          <div className="how-card">
            <div className="how-icon how-icon-wave">〰</div>
            <h3>Волна распространения</h3>
            <p>Сообщение уходит во все доступные каналы: интернет, локальная сеть, офлайн-маршруты. Связь не зависит от одного канала.</p>
          </div>
          <div className="how-card">
            <div className="how-icon">🔐</div>
            <h3>Шифрование и время жизни</h3>
            <p>Сообщения шифруются end-to-end. Ключ привязан ко времени — после истечения TTL расшифровать нельзя.</p>
          </div>
        </div>
      </section>

      <section className="features">
        <h2>Почему net.aiternitas.ru</h2>
        <ul className="features-list">
          <li>Работает при обрыве интернета — сообщения пойдут через соседние узлы</li>
          <li>Один дизайн веб-версии, отдельная сборка под Android (APK)</li>
          <li>Личный кабинет, контакты, переписка — всё в одном приложении</li>
          <li>Подходит для рабочих сценариев: оповещения, рассылки (в т.ч. для МЧС и служб)</li>
        </ul>
      </section>

      <section id="download" className="cta-block">
        <h2>Начните пользоваться</h2>
        <p>Зарегистрируйтесь и войдите — в личном кабинете доступны: <strong>веб-версия</strong>, <strong>установка приложения</strong> (как программа) и <strong>скачать APK</strong> для Android.</p>
        <div className="cta-buttons">
          <Link to="/app" className="btn btn-primary btn-lg">Войти в приложение</Link>
          <a href="/apk/net.aiternitas.ru.apk" className="btn btn-outline btn-lg" download>Скачать APK</a>
        </div>
        <p className="cta-note">После входа: веб в браузере, «Установить» (PWA) или скачать APK.</p>
      </section>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <span>net.aiternitas.ru</span>
          <Link to="/app">Войти</Link>
        </div>
      </footer>
    </div>
  );
}
