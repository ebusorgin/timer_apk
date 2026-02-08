import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { LocaleService } from './locale.service';

export const API_BASE = '/api';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(
    private http: HttpClient,
    private locale: LocaleService,
  ) {}

  private headers(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders(token ? { Authorization: `Bearer ${token}` } : {});
  }

  private withLocale(path: string): string {
    const sep = path.includes('?') ? '&' : '?';
    return `${API_BASE}${path}${sep}locale=${this.locale.getLocale()}`;
  }

  get<T>(path: string) {
    return this.http.get<T>(this.withLocale(path), { headers: this.headers() });
  }

  post<T>(path: string, body: unknown) {
    const url = `${API_BASE}${path}`;
    const bodyWithLocale = typeof body === 'object' && body !== null ? { ...body, locale: this.locale.getLocale() } : body;
    return this.http.post<T>(url, bodyWithLocale, { headers: this.headers() });
  }

  put<T>(path: string, body: unknown) {
    const url = `${API_BASE}${path}`;
    const bodyWithLocale = typeof body === 'object' && body !== null ? { ...body, locale: this.locale.getLocale() } : body;
    return this.http.put<T>(url, bodyWithLocale, { headers: this.headers() });
  }

  delete<T>(path: string) {
    return this.http.delete<T>(this.withLocale(path), { headers: this.headers() });
  }
}
