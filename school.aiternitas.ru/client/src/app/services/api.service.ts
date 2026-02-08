import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';

export const API_BASE = '/api';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  private headers(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders(token ? { Authorization: `Bearer ${token}` } : {});
  }

  get<T>(path: string) {
    return this.http.get<T>(`${API_BASE}${path}`, { headers: this.headers() });
  }

  post<T>(path: string, body: unknown) {
    return this.http.post<T>(`${API_BASE}${path}`, body, { headers: this.headers() });
  }

  put<T>(path: string, body: unknown) {
    return this.http.put<T>(`${API_BASE}${path}`, body, { headers: this.headers() });
  }

  delete<T>(path: string) {
    return this.http.delete<T>(`${API_BASE}${path}`, { headers: this.headers() });
  }
}
