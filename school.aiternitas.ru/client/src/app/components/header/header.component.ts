import { Component } from '@angular/core';
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
      <nav class="nav">
        <select class="lang-select" [value]="locale.locale()" (change)="onLangChange($event)">
          @for (l of locale.getLocales(); track l) {
            <option [value]="l">{{ l.toUpperCase() }}</option>
          }
        </select>
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">{{ 'nav.home' | translate }}</a>
        <a routerLink="/programs" routerLinkActive="active">{{ 'nav.programs' | translate }}</a>
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
    .lang-select {
      padding: 0.25rem 0.5rem;
      border-radius: var(--radius);
      border: 1px solid var(--color-border);
      background: var(--color-bg-alt);
      font-size: 0.85rem;
      cursor: pointer;
    }
    @media (max-width: 600px) {
      .header { padding: 1rem; }
      .nav { gap: 0.75rem; }
    }
  `],
})
export class HeaderComponent {
  constructor(
    public auth: AuthService,
    public locale: LocaleService,
    private translate: TranslateService,
  ) {}

  onLangChange(e: Event) {
    const v = (e.target as HTMLSelectElement).value as 'ru' | 'sr' | 'en';
    this.locale.setLocale(v);
    this.translate.use(v);
  }
}
