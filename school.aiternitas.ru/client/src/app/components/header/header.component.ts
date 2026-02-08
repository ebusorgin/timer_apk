import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'school-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="header">
      <a routerLink="/" class="logo">School</a>
      <nav class="nav">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">Главная</a>
        <a routerLink="/programs" routerLinkActive="active">Программы</a>
        @if (auth.user(); as u) {
          <a routerLink="/cabinet" routerLinkActive="active">Кабинет</a>
          @if (auth.isAdmin()) {
            <a routerLink="/admin" routerLinkActive="active">Админ</a>
          }
          <span class="user">{{ u.name }}</span>
          <button type="button" (click)="auth.logout()">Выход</button>
        } @else {
          <a routerLink="/login">Вход</a>
          <a routerLink="/register" class="btn-register">Регистрация</a>
        }
      </nav>
    </header>
  `,
  styles: [`
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 2rem;
      background: var(--color-bg-alt);
      border-bottom: 1px solid var(--color-border);
      box-shadow: var(--shadow);
    }
    .logo {
      font-weight: 700;
      font-size: 1.25rem;
      color: var(--color-primary);
      text-decoration: none;
      transition: color var(--transition);
    }
    .logo:hover { color: var(--color-primary-hover); }
    .nav {
      display: flex;
      align-items: center;
      gap: 1.5rem;
      flex-wrap: wrap;
    }
    .nav a {
      text-decoration: none;
      color: var(--color-text);
      transition: color var(--transition);
    }
    .nav a:hover, .nav a.active { color: var(--color-primary); }
    .btn-register {
      background: var(--color-primary);
      color: white;
      padding: 0.4rem 0.8rem;
      border-radius: var(--radius);
      transition: background var(--transition);
    }
    .btn-register:hover { background: var(--color-primary-hover); }
    .user { color: var(--color-muted); font-size: 0.9rem; }
    button {
      background: none;
      border: 1px solid var(--color-border);
      padding: 0.4rem 0.8rem;
      border-radius: var(--radius);
      cursor: pointer;
      transition: border-color var(--transition), background var(--transition);
    }
    button:hover { background: var(--color-bg); }
    @media (max-width: 600px) {
      .header { padding: 1rem; }
      .nav { gap: 0.75rem; }
    }
  `],
})
export class HeaderComponent {
  constructor(public auth: AuthService) {}
}
