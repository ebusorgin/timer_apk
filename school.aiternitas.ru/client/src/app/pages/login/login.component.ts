import { Component, HostListener } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'school-login',
  standalone: true,
  imports: [RouterLink, FormsModule, TranslateModule],
  template: `
    <div class="auth-overlay" (click)="close()">
      <div class="auth-card" (click)="$event.stopPropagation()">
        <button type="button" class="auth-close" (click)="close()" aria-label="Close">&times;</button>
        <h1>{{ 'auth.login' | translate }}</h1>
        <form (ngSubmit)="submit()">
          <input type="email" [(ngModel)]="email" name="email" [placeholder]="'auth.email' | translate" required />
          <input type="password" [(ngModel)]="password" name="password" [placeholder]="'auth.password' | translate" required />
          @if (error) { <p class="error">{{ error }}</p> }
          <button type="submit" [disabled]="loading">{{ (loading ? 'auth.submitLoginLoading' : 'auth.submitLogin') | translate }}</button>
        </form>
        <p><a routerLink="/register">{{ 'auth.toRegister' | translate }}</a></p>
      </div>
    </div>
  `,
  styles: [`
    .auth-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
      padding-top: max(1rem, env(safe-area-inset-top));
      padding-bottom: max(1rem, env(safe-area-inset-bottom));
      cursor: pointer;
    }
    .auth-card {
      position: relative;
      width: 100%;
      max-width: 400px;
      padding: 2rem;
      background: var(--color-bg-alt);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      cursor: default;
    }
    .auth-close {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      font-size: 2rem;
      line-height: 1;
      color: var(--color-muted);
      cursor: pointer;
      transition: color var(--transition);
    }
    .auth-close:hover { color: var(--color-text); }
    .auth-card h1 { text-align: center; margin-bottom: 1.5rem; font-size: 1.5rem; }
    input {
      width: 100%;
      padding: 0.875rem 1rem;
      margin-bottom: 1rem;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      font-size: 1rem;
      min-height: 48px;
    }
    button[type="submit"] {
      width: 100%;
      padding: 0.875rem;
      min-height: 48px;
      background: var(--color-primary);
      color: white;
      border: none;
      border-radius: var(--radius);
      font-size: 1rem;
      cursor: pointer;
    }
    button:disabled { opacity: 0.7; }
    .error { color: var(--color-error); font-size: 0.9rem; margin-bottom: 0.5rem; }
    .auth-card > p { text-align: center; margin-top: 1rem; }
  `],
})
export class LoginComponent {
  email = '';
  password = '';
  error = '';
  loading = false;

  constructor(
    private auth: AuthService,
    private router: Router,
    private translate: TranslateService,
  ) {}

  @HostListener('document:keydown.escape') closeOnEscape() {
    this.close();
  }

  close() {
    this.router.navigate(['/']);
  }

  async submit() {
    this.error = '';
    this.loading = true;
    try {
      await this.auth.login(this.email, this.password);
      this.router.navigate(['/cabinet']);
    } catch (e: unknown) {
      this.error = (e as Error)?.message || this.translate.instant('auth.loginError');
    } finally {
      this.loading = false;
    }
  }
}
