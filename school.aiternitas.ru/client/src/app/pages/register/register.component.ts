import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'school-register',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <div class="container auth-page">
      <div class="auth-card">
        <h1>Регистрация</h1>
        <form (ngSubmit)="submit()">
          <input type="email" [(ngModel)]="email" name="email" placeholder="Email" required />
          <input type="text" [(ngModel)]="name" name="name" placeholder="Имя" required />
          <input type="password" [(ngModel)]="password" name="password" placeholder="Пароль (мин. 4 символа)" required minlength="4" />
          @if (error) { <p class="error">{{ error }}</p> }
          <button type="submit" [disabled]="loading">{{ loading ? 'Регистрация...' : 'Зарегистрироваться' }}</button>
        </form>
        <p><a routerLink="/login">Вход</a></p>
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
export class RegisterComponent {
  email = '';
  name = '';
  password = '';
  error = '';
  loading = false;

  constructor(private auth: AuthService, private router: Router) {}

  async submit() {
    this.error = '';
    this.loading = true;
    try {
      await this.auth.register(this.email, this.name, this.password);
      this.router.navigate(['/cabinet']);
    } catch (e: unknown) {
      this.error = (e as Error)?.message || 'Ошибка регистрации';
    } finally {
      this.loading = false;
    }
  }
}
