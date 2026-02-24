import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

interface Group {
  id: string;
  title: string;
  schedule: string;
}

interface Lesson {
  n: number;
  topic: string;
  description?: string;
  conclusions?: string;
  result?: string;
}

interface Program {
  id: string;
  title: string;
  slug: string;
  description: string;
  ageMin: number;
  ageMax: number;
  schoolType?: string;
  durationWeeks: number;
  lessonsPerWeek?: number;
  format?: string;
  imageUrl?: string | null;
  price?: number | null;
  schedule?: string | null;
  curriculum?: Lesson[];
}

@Component({
  selector: 'school-program-detail',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslateModule],
  template: `
    <div class="container page">
      @if (loading()) {
        <p>{{ 'programs.loading' | translate }}</p>
      } @else if (program()) {
        @let p = program()!;
        <a [routerLink]="backLink()" class="back">{{ backLabel() }}</a>
        @if (p.imageUrl) {
          <div class="program-image"><img [src]="p.imageUrl" [alt]="p.title" /></div>
        }
        <h1>{{ p.title }}</h1>
        <div class="meta">
          <span class="age">{{ p.ageMin }}–{{ p.ageMax }} {{ 'programs.years' | translate }}</span>
          @if (p.schoolType) {
            <span class="badge">{{ p.schoolType === 'art' ? ('programDetail.artBadge' | translate) : ('programDetail.techBadge' | translate) }}</span>
          }
          <span>{{ p.durationWeeks }} {{ 'programDetail.weeks' | translate }}</span>
          @if (p.price != null) {
            <span class="price">{{ p.price }} ₽</span>
          }
          @if (p.schedule) {
            <span class="schedule">{{ p.schedule }}</span>
          }
        </div>
        <p class="desc">{{ p.description }}</p>
        @if (p.curriculum && p.curriculum.length > 0) {
          <div class="curriculum">
            <h3>{{ 'programDetail.curriculum' | translate }}</h3>
            @for (lesson of p.curriculum; track lesson.n) {
              <div class="lesson-card">
                <div class="lesson-num">{{ 'programDetail.lesson' | translate }} {{ lesson.n }}</div>
                <h4>{{ lesson.topic }}</h4>
                @if (lesson.description) {
                  <p><strong>{{ 'programDetail.onLesson' | translate }}:</strong> {{ lesson.description }}</p>
                }
                @if (lesson.conclusions) {
                  <p><strong>{{ 'programDetail.conclusions' | translate }}:</strong> {{ lesson.conclusions }}</p>
                }
                @if (lesson.result) {
                  <p><strong>{{ 'programDetail.result' | translate }}:</strong> {{ lesson.result }}</p>
                }
              </div>
            }
          </div>
        }
        @if (auth.isLoggedIn() && auth.user()?.role === 'student') {
          <div class="enroll-block">
            @if (groups().length > 0) {
              <div class="group-select">
                <label for="group">{{ 'programDetail.selectGroup' | translate }}</label>
                <select id="group" class="form-input" [(ngModel)]="selectedGroupId">
                  <option value="">—</option>
                  @for (g of groups(); track g.id) {
                    <option [value]="g.id">{{ g.title || g.schedule }}</option>
                  }
                </select>
              </div>
            }
            <button (click)="enroll()" [disabled]="enrolling()">
              {{ (enrolling() ? 'programDetail.enrolling' : 'programDetail.enroll') | translate }}
            </button>
          </div>
        } @else if (!auth.isLoggedIn()) {
          <a routerLink="/register" class="btn-register">{{ 'programDetail.registerToEnroll' | translate }}</a>
        }
      } @else {
        <p>{{ 'programDetail.notFound' | translate }}</p>
      }
    </div>
  `,
  styles: [`
    .page { padding: 2rem 0; }
    @media (max-width: 600px) {
      .page { padding: 1.5rem 0; }
      .meta { flex-direction: column; gap: 0.5rem; }
      .program-image { max-width: 100%; }
      button, .btn-register { min-height: 48px; padding: 0.75rem 1.5rem; }
    }
    .back { display: inline-block; margin-bottom: 1rem; color: var(--color-muted); text-decoration: none; }
    .program-image {
      max-width: 500px;
      border-radius: var(--radius);
      overflow: hidden;
      margin-bottom: 1.5rem;
    }
    .program-image img { width: 100%; height: auto; object-fit: cover; }
    .meta { display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .price { color: var(--color-accent); font-weight: 600; }
    .schedule { color: var(--color-muted); }
    .badge {
      background: var(--color-primary);
      color: white;
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      font-size: 0.9rem;
    }
    .desc { margin-bottom: 2rem; }
    .curriculum { margin-bottom: 2rem; }
    .curriculum h3 { margin: 0 0 1rem; font-size: 1.15rem; }
    .lesson-card {
      background: var(--color-bg-alt);
      padding: 1rem 1.25rem;
      border-radius: var(--radius);
      margin-bottom: 0.75rem;
      border-left: 4px solid var(--color-primary);
    }
    .lesson-num { font-size: 0.85rem; color: var(--color-muted); margin-bottom: 0.25rem; }
    .lesson-card h4 { margin: 0 0 0.5rem; font-size: 1rem; }
    .lesson-card p { margin: 0.25rem 0; font-size: 0.9rem; }
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
    .enroll-block { display: flex; flex-direction: column; gap: 1rem; margin-top: 1rem; }
    .group-select { display: flex; flex-direction: column; gap: 0.5rem; max-width: 280px; }
    .group-select label { font-size: 0.9rem; color: var(--color-muted); }
    .form-input { padding: 0.5rem 0.75rem; border-radius: var(--radius); border: 1px solid var(--color-border); font-size: 1rem; }
  `],
})
export class ProgramDetailComponent implements OnInit {
  program = signal<Program | null>(null);
  groups = signal<Group[]>([]);
  selectedGroupId = '';
  loading = signal(true);
  enrolling = signal(false);

  backLink() {
    const from = this.route.snapshot.queryParamMap.get('from');
    return from ? ['/school-types', from] : ['/programs'];
  }

  backLabel() {
    const from = this.route.snapshot.queryParamMap.get('from');
    if (from === 'art') return '← ' + this.translate.instant('programDetail.backArt');
    if (from) return '← ' + this.translate.instant('programDetail.backTech');
    return '← ' + this.translate.instant('programDetail.back');
  }

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    public auth: AuthService,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.api.get<{ success: boolean; program: Program }>(`/programs/${id}`).subscribe({
      next: (res) => {
        if (res.success) {
          this.program.set(res.program);
          if (res.program?.id) this.loadGroups(res.program.id);
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadGroups(programId: string) {
    this.api.get<{ success: boolean; groups: Group[] }>(`/programs/${programId}/groups`).subscribe({
      next: (res) => {
        if (res.success) this.groups.set(res.groups || []);
      },
    });
  }

  enroll() {
    const p = this.program();
    if (!p) return;
    this.enrolling.set(true);
    const body: { programId: string; groupId?: string } = { programId: p.id };
    if (this.selectedGroupId) body.groupId = this.selectedGroupId;
    this.api.post<{ success: boolean }>('/me/enrollments', body).subscribe({
      next: (res) => {
        if (res.success) alert(this.translate.instant('programDetail.enrolled'));
        this.enrolling.set(false);
      },
      error: () => this.enrolling.set(false),
    });
  }
}
