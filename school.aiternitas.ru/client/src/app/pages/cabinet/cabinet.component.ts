import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

interface Enrollment {
  id: string;
  programId: string;
  programTitle: string;
  programSlug: string;
  status: string;
  progress: number;
  enrolledAt: number;
}

@Component({
  selector: 'school-cabinet',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="container page">
      <h1>Личный кабинет</h1>
      @if (auth.user(); as u) {
        <p class="user-name">Здравствуйте, {{ u.name }}!</p>
      }
      <h2>Мои записи</h2>
      @if (loading()) {
        <p>Загрузка...</p>
      } @else if (enrollments().length === 0) {
        <p>У вас пока нет записей. <a routerLink="/programs">Выберите программу</a></p>
      } @else {
        <div class="list">
          @for (e of enrollments(); track e.id) {
            <a [routerLink]="['/programs', e.programId]" class="card">
              <h3>{{ e.programTitle }}</h3>
              <p>Статус: {{ e.status }}, прогресс: {{ e.progress }}%</p>
            </a>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 2rem 0; }
    .user-name { font-size: 1.1rem; margin-bottom: 2rem; }
    .list { display: flex; flex-direction: column; gap: 1rem; }
    .card {
      display: block;
      padding: 1rem 1.5rem;
      background: var(--color-bg-alt);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      text-decoration: none;
      color: inherit;
    }
    .card h3 { margin: 0 0 0.5rem; }
    .card p { margin: 0; font-size: 0.9rem; color: var(--color-muted); }
  `],
})
export class CabinetComponent implements OnInit {
  enrollments = signal<Enrollment[]>([]);
  loading = signal(true);

  constructor(public auth: AuthService, private api: ApiService) {}

  ngOnInit() {
    this.api.get<{ success: boolean; enrollments: Enrollment[] }>('/me/enrollments').subscribe({
      next: (res) => {
        if (res.success) this.enrollments.set(res.enrollments);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
