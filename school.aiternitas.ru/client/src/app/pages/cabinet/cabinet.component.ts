import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
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
  imports: [RouterLink, TranslateModule],
  template: `
    <div class="container page">
      <h1>{{ 'cabinet.title' | translate }}</h1>
      @if (auth.user(); as u) {
        <p class="user-name">{{ 'cabinet.greeting' | translate:{name: u.name} }}</p>
      }
      <h2>{{ 'cabinet.myEnrollments' | translate }}</h2>
      @if (loading()) {
        <p>{{ 'programs.loading' | translate }}</p>
      } @else if (enrollments().length === 0) {
        <p>{{ 'cabinet.noEnrollments' | translate }} <a routerLink="/programs">{{ 'cabinet.chooseProgram' | translate }}</a></p>
      } @else {
        <div class="list">
          @for (e of enrollments(); track e.id) {
            <a [routerLink]="['/programs', e.programId]" class="card">
              <h3>{{ e.programTitle }}</h3>
              <p>{{ 'cabinet.status' | translate }}: {{ e.status }}, {{ 'cabinet.progress' | translate }}: {{ e.progress }}%</p>
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
    @media (max-width: 600px) {
      .page { padding: 1.5rem 0; }
      .card { padding: 1rem; min-height: 60px; display: flex; flex-direction: column; justify-content: center; }
    }
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
