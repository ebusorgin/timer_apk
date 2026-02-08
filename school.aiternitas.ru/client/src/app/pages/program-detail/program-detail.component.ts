import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

interface Program {
  id: string;
  title: string;
  slug: string;
  description: string;
  ageMin: number;
  ageMax: number;
  direction: string;
  durationWeeks: number;
  lessonsPerWeek?: number;
  format?: string;
}

@Component({
  selector: 'school-program-detail',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="container page">
      @if (loading()) {
        <p>Загрузка...</p>
      } @else if (program()) {
        @let p = program()!;
        <a routerLink="/programs" class="back">← Назад к программам</a>
        <h1>{{ p.title }}</h1>
        <div class="meta">
          <span class="age">{{ p.ageMin }}–{{ p.ageMax }} лет</span>
          <span class="badge">{{ p.direction }}</span>
          <span>{{ p.durationWeeks }} недель</span>
        </div>
        <p class="desc">{{ p.description }}</p>
        @if (auth.isLoggedIn() && auth.user()?.role === 'student') {
          <button (click)="enroll()" [disabled]="enrolling()">
            {{ enrolling() ? 'Записываю...' : 'Записаться' }}
          </button>
        } @else if (!auth.isLoggedIn()) {
          <a routerLink="/register" class="btn-register">Регистрация для записи</a>
        }
      } @else {
        <p>Программа не найдена</p>
      }
    </div>
  `,
  styles: [`
    .page { padding: 2rem 0; }
    .back { display: inline-block; margin-bottom: 1rem; color: var(--color-muted); text-decoration: none; }
    .meta { display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .badge {
      background: var(--color-primary);
      color: white;
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      font-size: 0.9rem;
    }
    .desc { margin-bottom: 2rem; }
    button, .btn-register {
      background: var(--color-primary);
      color: white;
      padding: 0.6rem 1.2rem;
      border: none;
      border-radius: var(--radius);
      cursor: pointer;
      font-size: 1rem;
    }
    .btn-register { text-decoration: none; display: inline-block; }
  `],
})
export class ProgramDetailComponent implements OnInit {
  program = signal<Program | null>(null);
  loading = signal(true);
  enrolling = signal(false);

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    public auth: AuthService,
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.api.get<{ success: boolean; program: Program }>(`/programs/${id}`).subscribe({
      next: (res) => {
        if (res.success) this.program.set(res.program);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  enroll() {
    const p = this.program();
    if (!p) return;
    this.enrolling.set(true);
    this.api.post<{ success: boolean }>('/me/enrollments', { programId: p.id }).subscribe({
      next: (res) => {
        if (res.success) alert('Вы записаны!');
        this.enrolling.set(false);
      },
      error: () => this.enrolling.set(false),
    });
  }
}
