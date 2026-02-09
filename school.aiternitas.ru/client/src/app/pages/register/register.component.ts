import { Component, HostListener } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'school-register',
  standalone: true,
  imports: [RouterLink, FormsModule, TranslateModule],
  template: `
    <div class="auth-overlay" (click)="close()">
      <div class="auth-card" (click)="$event.stopPropagation()">
        <button type="button" class="auth-close" (click)="close()" aria-label="Close">&times;</button>
        <h1>{{ 'auth.register' | translate }}</h1>
        <form (ngSubmit)="submit()">
          <input type="email" [(ngModel)]="email" name="email" [placeholder]="'auth.email' | translate" required />
          <input type="text" [(ngModel)]="name" name="name" [placeholder]="'auth.name' | translate" required />
          <input type="password" [(ngModel)]="password" name="password" [placeholder]="'auth.passwordHint' | translate" required minlength="4" />
          @if (error) { <p class="error">{{ error }}</p> }
          <button type="submit" [disabled]="loading">{{ (loading ? 'auth.submitRegisterLoading' : 'auth.submitRegister') | translate }}</button>
        </form>
        <p><a routerLink="/login">{{ 'auth.toLogin' | translate }}</a></p>
      </div>
    </div>
  `,
  styles: [`
    .auth-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
      cursor: pointer;
    }
    .auth-card {
      position: relative;
      width: 100%;
      max-width: 400px;
      padding: 2rem;
      background: var(--color-bg-alt);
      border-radius: var(--radius);
      box-shadow: var(--shadow-lg);
      cursor: default;
    }
    .auth-close {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      background: none;
      border: none;
      font-size: 1.75rem;
      line-height: 1;
      color: var(--color-muted);
      cursor: pointer;
      padding: 0.25rem;
      transition: color var(--transition);
    }
    .auth-close:hover { color: var(--color-text); }
    .auth-card h1 { text-align: center; margin-bottom: 1.5rem; }
    input {
      width: 100%;
      padding: 0.75rem;
      margin-bottom: 1rem;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      font-size: 1rem;
    }
    button {
      width: 100%;
      padding: 0.75rem;
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
export class RegisterComponent {
  email = '';
  name = '';
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
      await this.auth.register(this.email, this.name, this.password);
      this.router.navigate(['/cabinet']);
    } catch (e: unknown) {
      this.error = (e as Error)?.message || this.translate.instant('auth.registerError');
    } finally {
      this.loading = false;
    }
  }
}
