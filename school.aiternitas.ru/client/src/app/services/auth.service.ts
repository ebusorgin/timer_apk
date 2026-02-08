import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from './api.service';

function getErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse && err.error?.error) return err.error.error;
  if (err instanceof Error) return err.message;
  return 'Ошибка';
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'admin';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private userSignal = signal<User | null>(null);
  private loadedSignal = signal(false);

  user = this.userSignal.asReadonly();
  isLoaded = this.loadedSignal.asReadonly();
  isLoggedIn = computed(() => !!this.userSignal());

  constructor(private api: ApiService, private router: Router) {
    this.loadUser();
  }

  async loadUser() {
    const token = localStorage.getItem('token');
    if (!token) {
      this.loadedSignal.set(true);
      return;
    }
    try {
      const res = await firstValueFrom(this.api.get<{ success: boolean; user: User }>('/me'));
      if (res?.success && res.user) {
        this.userSignal.set(res.user);
      } else {
        this.logout();
      }
    } catch {
      this.logout();
    } finally {
      this.loadedSignal.set(true);
    }
  }

  async login(email: string, password: string) {
    try {
      const res = await firstValueFrom(this.api.post<{ success: boolean; token: string; user: User }>('/auth/login', { email, password }));
      if (!res?.success || !res.token) throw new Error('Ошибка входа');
      localStorage.setItem('token', res.token);
      this.userSignal.set(res.user);
    } catch (e) {
      throw new Error(getErrorMessage(e));
    }
  }

  async register(email: string, name: string, password: string) {
    try {
      const res = await firstValueFrom(this.api.post<{ success: boolean; token: string; user: User }>('/auth/register', { email, name, password }));
      if (!res?.success || !res.token) throw new Error('Ошибка регистрации');
      localStorage.setItem('token', res.token);
      this.userSignal.set(res.user);
    } catch (e) {
      throw new Error(getErrorMessage(e));
    }
  }

  logout() {
    localStorage.removeItem('token');
    this.userSignal.set(null);
    this.router.navigate(['/']);
  }

  isAdmin() {
    return this.userSignal()?.role === 'admin';
  }
}
