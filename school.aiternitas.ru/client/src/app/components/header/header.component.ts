import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';
import { LocaleService } from '../../services/locale.service';

@Component({
  selector: 'school-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslateModule],
  template: `
    <header class="header">
      <a routerLink="/" class="logo">School</a>
      <button type="button" class="nav-toggle" (click)="menuOpen.set(!menuOpen())" [attr.aria-expanded]="menuOpen()" aria-label="Menu">
        <span class="nav-toggle-bar"></span>
        <span class="nav-toggle-bar"></span>
        <span class="nav-toggle-bar"></span>
      </button>
      <nav class="nav" [class.nav-open]="menuOpen()" (click)="menuOpen.set(false)">
        <div class="lang-wrap">
          <span class="lang-label">{{ 'nav.language' | translate }}</span>
          <select class="lang-select" [value]="locale.locale()" (change)="onLangChange($event)" [attr.aria-label]="'nav.language' | translate">
            @for (l of locale.getLocales(); track l) {
              <option [value]="l">{{ l === 'ru' ? 'Русский' : l === 'sr' ? 'Српски' : 'English' }}</option>
            }
          </select>
        </div>
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">{{ 'nav.home' | translate }}</a>
        <a routerLink="/programs" [queryParams]="{}" routerLinkActive="active">{{ 'nav.schools' | translate }}</a>
        <a routerLink="/programs" [queryParams]="{all: true}" routerLinkActive="active" class="nav-secondary">{{ 'nav.programs' | translate }}</a>
        @if (auth.user(); as u) {
          <a routerLink="/cabinet" routerLinkActive="active">{{ 'nav.cabinet' | translate }}</a>
          @if (auth.isAdmin()) {
            <a routerLink="/admin" routerLinkActive="active">{{ 'nav.admin' | translate }}</a>
          }
          <span class="user">{{ u.name }}</span>
          <button type="button" (click)="auth.logout()">{{ 'nav.logout' | translate }}</button>
        } @else {
          <a routerLink="/login">{{ 'nav.login' | translate }}</a>
          <a routerLink="/register" class="btn-register">{{ 'nav.register' | translate }}</a>
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
      color: var(--color-text);
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
    .nav-secondary { font-size: 0.9rem; opacity: 0.8; }
    .nav-secondary:hover { opacity: 1; }
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
    .lang-wrap {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .lang-label {
      font-size: 0.85rem;
      color: var(--color-muted);
    }
    .lang-select {
      padding: 0.4rem 0.75rem;
      border-radius: var(--radius);
      border: 1px solid var(--color-border);
      background: var(--color-bg-card);
      color: var(--color-text);
      font-size: 0.9rem;
      cursor: pointer;
      min-height: var(--touch-min);
    }
    .lang-select option {
      background: var(--color-bg);
      color: var(--color-text);
    }
    .nav-toggle {
      display: none;
      flex-direction: column;
      justify-content: center;
      gap: 5px;
      width: var(--touch-min);
      height: var(--touch-min);
      padding: 0.75rem;
      background: none;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      cursor: pointer;
      color: var(--color-text);
    }
    .nav-toggle-bar {
      display: block;
      width: 20px;
      height: 2px;
      background: currentColor;
      border-radius: 1px;
      transition: transform var(--transition);
    }
    .nav-toggle[aria-expanded="true"] .nav-toggle-bar:nth-child(1) {
      transform: translateY(7px) rotate(45deg);
    }
    .nav-toggle[aria-expanded="true"] .nav-toggle-bar:nth-child(2) { opacity: 0; }
    .nav-toggle[aria-expanded="true"] .nav-toggle-bar:nth-child(3) {
      transform: translateY(-7px) rotate(-45deg);
    }
    @media (max-width: 768px) {
      .nav-toggle { display: flex; }
      .nav {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 1.5rem;
        padding: 2rem;
        background: rgba(15,15,26,0.98);
        backdrop-filter: blur(8px);
        z-index: 999;
        opacity: 0;
        visibility: hidden;
        transition: opacity var(--transition), visibility var(--transition);
      }
      .nav.nav-open {
        opacity: 1;
        visibility: visible;
      }
      .nav a, .nav button { font-size: 1.25rem; min-height: var(--touch-min); display: flex; align-items: center; }
      .lang-select { font-size: 1rem; }
    }
    @media (max-width: 600px) {
      .header { padding: 0.75rem 1rem; }
      .nav { gap: 0.75rem; }
    }
  `],
})
export class HeaderComponent {
  menuOpen = signal(false);
  constructor(
    public auth: AuthService,
    public locale: LocaleService,
    private translate: TranslateService,
  ) { }

  onLangChange(e: Event) {
    const v = (e.target as HTMLSelectElement).value as 'ru' | 'sr' | 'en';
    this.locale.setLocale(v);
    this.translate.use(v);
  }
}
