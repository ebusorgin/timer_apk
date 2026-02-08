import { Component } from '@angular/core';
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
    <div class="container auth-page">
      <div class="auth-card">
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
    .auth-page { padding: 3rem 0; display: flex; justify-content: center; }
    .auth-card {
      width: 100%;
      max-width: 400px;
      padding: 2rem;
      background: var(--color-bg-alt);
      border-radius: var(--radius);
      box-shadow: var(--shadow-lg);
    }
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
