import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { ApiService } from './api.service';

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

  constructor(private api: ApiService, private router: Router, private translate: TranslateService) {}

  async loadUser(): Promise<void> {
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
        localStorage.removeItem('token');
        this.userSignal.set(null);
      }
    } catch {
      localStorage.removeItem('token');
      this.userSignal.set(null);
    } finally {
      this.loadedSignal.set(true);
    }
  }

  async login(email: string, password: string) {
    try {
      const res = await firstValueFrom(this.api.post<{ success: boolean; token: string; user: User }>('/auth/login', { email, password }));
      if (!res?.success || !res.token) throw new Error(this.translate.instant('auth.loginError'));
      localStorage.setItem('token', res.token);
      this.userSignal.set(res.user);
    } catch (e) {
      throw new Error(this.getErrorMessage(e));
    }
  }

  private getErrorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse && err.error?.error) return err.error.error;
    if (err instanceof Error) return err.message;
    return this.translate.instant('auth.genericError');
  }

  async register(email: string, name: string, password: string) {
    try {
      const res = await firstValueFrom(this.api.post<{ success: boolean; token: string; user: User }>('/auth/register', { email, name, password }));
      if (!res?.success || !res.token) throw new Error(this.translate.instant('auth.registerError'));
      localStorage.setItem('token', res.token);
      this.userSignal.set(res.user);
    } catch (e) {
      throw new Error(this.getErrorMessage(e));
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
