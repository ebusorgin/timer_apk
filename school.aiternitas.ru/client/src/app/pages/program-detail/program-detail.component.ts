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
          <div class="curriculum-section">
            <h2 class="section-title">{{ 'programDetail.curriculum' | translate }}</h2>
            <div class="timeline">
              @for (lesson of p.curriculum; track lesson.n) {
                <div class="timeline-item">
                  <div class="timeline-marker">
                    <div class="marker-disk"></div>
                    @if (!$last) { <div class="marker-line"></div> }
                  </div>
                  <div class="lesson-card">
                    <div class="lesson-header">
                      <span class="lesson-n">{{ lesson.n < 10 ? '0' + lesson.n : lesson.n }}</span>
                      <h4>{{ lesson.topic }}</h4>
                    </div>
                    <div class="lesson-body">
                      @if (lesson.description) {
                        <div class="detail-block">
                          <label>{{ 'programDetail.onLesson' | translate }}</label>
                          <p>{{ lesson.description }}</p>
                        </div>
                      }
                      <div class="detail-row">
                        @if (lesson.conclusions) {
                          <div class="detail-block">
                            <label>{{ 'programDetail.conclusions' | translate }}</label>
                            <p>{{ lesson.conclusions }}</p>
                          </div>
                        }
                        @if (lesson.result) {
                          <div class="detail-block">
                            <label>{{ 'programDetail.result' | translate }}</label>
                            <p>{{ lesson.result }}</p>
                          </div>
                        }
                      </div>
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>
        }
        @if (auth.isLoggedIn() && auth.user()?.role === 'student') {
          <div class="enroll-section">
            <h3>{{ 'programDetail.selectGroup' | translate }}</h3>
            @if (groups().length > 0) {
              <div class="groups-grid">
                @for (g of groups(); track g.id) {
                  <div class="group-card" [class.selected]="selectedGroupId === g.id" (click)="selectedGroupId = g.id">
                    <div class="group-card-icon">🕒</div>
                    <div class="group-card-info">
                      <span class="group-title">{{ g.title || g.schedule }}</span>
                      <span class="group-schedule">{{ g.schedule }}</span>
                    </div>
                    <div class="group-card-radio"></div>
                  </div>
                }
              </div>
            } @else {
              <p class="muted">{{ 'admin.noGroups' | translate }}</p>
            }
            <div class="enroll-actions">
              <button class="btn-enroll-main" (click)="enroll()" [disabled]="enrolling() || !selectedGroupId">
                {{ (enrolling() ? 'programDetail.enrolling' : 'programDetail.enroll') | translate }}
              </button>
            </div>
          </div>
        } @else if (!auth.isLoggedIn()) {
          <div class="enroll-cta-simple">
            <a routerLink="/register" class="btn-register-lg">{{ 'programDetail.registerToEnroll' | translate }}</a>
          </div>
        }
      } @else {
        <p>{{ 'programDetail.notFound' | translate }}</p>
      }
    </div>
  `,
  styles: [`
    .page { padding: 3rem 0; }
    
    .back { display: inline-block; margin-bottom: 2rem; color: var(--color-muted); text-decoration: none; font-weight: 500; transition: color var(--transition); }
    .back:hover { color: var(--color-primary); }
    
    .program-image {
      max-width: 800px;
      aspect-ratio: 21/9;
      border-radius: var(--radius-lg);
      overflow: hidden;
      margin-bottom: 2.5rem;
      box-shadow: var(--shadow-lg);
    }
    .program-image img { width: 100%; height: 100%; object-fit: cover; }
    
    h1 { font-size: 3rem; font-weight: 800; margin-bottom: 1.5rem; }
    
    .meta { display: flex; gap: 1.5rem; margin-bottom: 2rem; flex-wrap: wrap; align-items: center; }
    .meta > span { display: flex; align-items: center; gap: 0.5rem; font-size: 1rem; color: var(--color-muted); }
    .price { color: var(--color-accent) !important; font-weight: 700; font-size: 1.25rem !important; }
    
    .badge {
      background: var(--color-primary);
      color: white;
      padding: 0.35rem 0.85rem;
      border-radius: 2rem;
      font-size: 0.85rem;
      font-weight: 600;
    }
    
    .desc { font-size: 1.15rem; line-height: 1.7; color: var(--color-text); opacity: 0.9; max-width: 800px; margin-bottom: 4rem; }
    
    .curriculum-section { margin-top: 5rem; margin-bottom: 5rem; }
    .section-title { font-size: 2.25rem; font-weight: 800; margin-bottom: 3rem; background: linear-gradient(135deg, #fff 0%, var(--color-muted) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    
    .timeline { display: flex; flex-direction: column; gap: 0; padding-left: 1rem; }
    .timeline-item { display: grid; grid-template-columns: 40px 1fr; gap: 2rem; position: relative; }
    
    .timeline-marker { display: flex; flex-direction: column; align-items: center; padding-top: 1.5rem; }
    .marker-disk { width: 12px; height: 12px; border-radius: 50%; background: var(--color-primary); box-shadow: 0 0 15px var(--color-primary); z-index: 2; }
    .marker-line { width: 2px; flex: 1; background: linear-gradient(to bottom, var(--color-primary), var(--color-border)); opacity: 0.3; margin-top: 0.5rem; }
    
    .lesson-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: 2rem;
      margin-bottom: 2rem;
      transition: all var(--transition);
      backdrop-filter: blur(10px);
    }
    .lesson-card:hover { transform: translateX(10px); background: rgba(255, 255, 255, 0.05); border-color: var(--color-primary); }
    
    .lesson-header { display: flex; align-items: baseline; gap: 1.5rem; margin-bottom: 1.5rem; }
    .lesson-n { font-size: 1.25rem; font-weight: 900; color: var(--color-primary); opacity: 0.5; font-family: monospace; }
    .lesson-header h4 { font-size: 1.5rem; margin: 0; color: var(--color-text); }
    
    .lesson-body { display: flex; flex-direction: column; gap: 1.5rem; }
    .detail-row { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
    .detail-block { display: flex; flex-direction: column; gap: 0.5rem; }
    .detail-block label { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--color-accent); opacity: 0.8; }
    .detail-block p { font-size: 1rem; margin: 0; color: var(--color-text); line-height: 1.6; }

    .enroll-section { background: var(--color-bg-alt); padding: 3rem; border-radius: var(--radius-lg); border: 1px solid var(--color-border); box-shadow: var(--shadow); }
    .enroll-section h3 { margin-bottom: 2rem; font-size: 1.5rem; }
    
    .groups-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 2.5rem; }
    .group-card {
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      padding: 1.25rem;
      border-radius: var(--radius);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 1rem;
      transition: all var(--transition);
      position: relative;
    }
    .group-card:hover { border-color: var(--color-primary); }
    .group-card.selected { border-color: var(--color-primary); background: rgba(99,102,241,0.1); }
    .group-card-icon { font-size: 1.5rem; opacity: 0.5; }
    .group-card-info { flex: 1; display: flex; flex-direction: column; }
    .group-title { font-weight: 600; font-size: 1rem; }
    .group-schedule { font-size: 0.85rem; color: var(--color-muted); }
    .group-card-radio { width: 20px; height: 20px; border: 2px solid var(--color-border); border-radius: 50%; position: relative; }
    .group-card.selected .group-card-radio { border-color: var(--color-primary); }
    .group-card.selected .group-card-radio::after { content: ''; position: absolute; inset: 4px; background: var(--color-primary); border-radius: 50%; }

    .btn-enroll-main {
      width: 100%;
      max-width: 400px;
      padding: 1rem 2rem;
      background: var(--color-primary);
      color: white;
      border: none;
      border-radius: var(--radius);
      font-size: 1.1rem;
      font-weight: 700;
      cursor: pointer;
      transition: all var(--transition);
      box-shadow: 0 10px 30px rgba(99,102,241,0.3);
    }
    .btn-enroll-main:hover:not(:disabled) { transform: translateY(-3px); box-shadow: 0 15px 40px rgba(99,102,241,0.4); }
    .btn-enroll-main:disabled { opacity: 0.5; cursor: not-allowed; }

    .enroll-cta-simple { text-align: center; padding: 3rem; background: var(--color-bg-alt); border-radius: var(--radius-lg); }
    .btn-register-lg { display: inline-block; padding: 1rem 2.5rem; background: var(--color-primary); color: white; border-radius: var(--radius); font-weight: 700; text-decoration: none; }

    @media (max-width: 800px) {
      h1 { font-size: 2.25rem; }
      .lesson-card { grid-template-columns: 1fr; gap: 0.5rem; }
      .enroll-section { padding: 1.5rem; }
    }
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
  ) { }

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
