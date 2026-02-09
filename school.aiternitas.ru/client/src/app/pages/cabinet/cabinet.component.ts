import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

interface Enrollment {
  id: string;
  programId: string;
  programTitle: string;
  programSlug: string;
  groupId?: string | null;
  groupTitle?: string;
  groupSchedule?: string;
  status: string;
  progress: number;
  enrolledAt: number;
  nextLessonN?: number | null;
  nextLessonTopic?: string | null;
}

interface Homework {
  id: string;
  groupId: string;
  lessonN: number;
  title: string;
  description: string;
  dueAt?: number | null;
  groupTitle?: string;
  programTitle?: string;
}

@Component({
  selector: 'school-cabinet',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslateModule],
  template: `
    <div class="container page">
      <h1>{{ 'cabinet.title' | translate }}</h1>
      @if (auth.user(); as u) {
        <div class="profile-row">
          <p class="user-name">{{ 'cabinet.greeting' | translate:{name: u.name} }}</p>
          @if (editingProfile()) {
            <form class="profile-form" (ngSubmit)="saveProfile()">
              <input type="text" class="form-input" [(ngModel)]="editName" name="name" [placeholder]="'auth.name' | translate" required />
              <button type="submit" [disabled]="savingProfile()">{{ 'cabinet.save' | translate }}</button>
              <button type="button" (click)="editingProfile.set(false)">{{ 'cabinet.cancel' | translate }}</button>
            </form>
          } @else {
            <button type="button" class="btn-edit" (click)="openProfileEdit()">{{ 'cabinet.editProfile' | translate }}</button>
          }
        </div>
      }
      <h2>{{ 'cabinet.announcements' | translate }}</h2>
      @if (announcements().length === 0) {
        <p class="muted">{{ 'cabinet.noAnnouncements' | translate }}</p>
      } @else {
        <div class="announcement-list">
          @for (a of announcements(); track a.id) {
            <div class="announcement-card">
              <h4>{{ a.title }}</h4>
              <p class="ann-meta">{{ a.programTitle }} {{ a.groupTitle ? '· ' + a.groupTitle : '' }}</p>
              <p class="ann-body">{{ a.body }}</p>
              <span class="ann-date">{{ formatDate(a.createdAt) }}</span>
            </div>
          }
        </div>
      }
      <h2>{{ 'cabinet.myEnrollments' | translate }}</h2>
      @if (loading()) {
        <p>{{ 'programs.loading' | translate }}</p>
      } @else if (enrollments().length === 0) {
        <p>{{ 'cabinet.noEnrollments' | translate }} <a routerLink="/programs">{{ 'cabinet.chooseProgram' | translate }}</a></p>
      } @else {
        <div class="list">
          @for (e of enrollments(); track e.id) {
            <div class="card enrollment-card">
              <a [routerLink]="['/programs', e.programId]" class="card-title-link">
                <h3>{{ e.programTitle }}</h3>
              </a>
              @if (e.groupTitle || e.groupSchedule) {
                <div class="card-meta">
                  <span class="meta-label">{{ 'cabinet.myGroup' | translate }}:</span> {{ e.groupTitle || '—' }}
                  @if (e.groupSchedule) {
                    <span class="meta-schedule">{{ 'cabinet.schedule' | translate }}: {{ e.groupSchedule }}</span>
                  }
                </div>
              }
              @if (e.nextLessonN && e.nextLessonTopic) {
                <div class="next-lesson">
                  {{ 'cabinet.nextLesson' | translate }}: {{ 'programDetail.lesson' | translate }} {{ e.nextLessonN }} — {{ e.nextLessonTopic }}
                </div>
              }
              <p class="card-status">{{ 'cabinet.status' | translate }}: {{ e.status }}, {{ 'cabinet.progress' | translate }}: {{ e.progress }}%</p>
            </div>
          }
        </div>
        <h2>{{ 'cabinet.homework' | translate }}</h2>
        @if (homework().length === 0) {
          <p class="muted">{{ 'cabinet.noHomework' | translate }}</p>
        } @else {
          <div class="homework-list">
            @for (hw of homework(); track hw.id) {
              <div class="homework-card">
                <h4>{{ hw.title }}</h4>
                <p class="hw-meta">{{ hw.programTitle }} · {{ 'programDetail.lesson' | translate }} {{ hw.lessonN }}</p>
                <p class="hw-desc">{{ hw.description }}</p>
                @if (hw.dueAt) {
                  <span class="hw-due">{{ 'cabinet.dueDate' | translate }}: {{ formatDate(hw.dueAt) }}</span>
                }
              </div>
            }
          </div>
        }
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
    .card-title-link { text-decoration: none; color: inherit; }
    .card-meta { font-size: 0.9rem; margin: 0.25rem 0; }
    .meta-label { color: var(--color-muted); }
    .meta-schedule { display: block; margin-top: 0.15rem; }
    .next-lesson { font-size: 0.9rem; color: var(--color-primary); margin: 0.5rem 0; }
    .card-status { margin-top: 0.25rem; }
    .homework-list { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem; }
    .homework-card { padding: 1rem; background: var(--color-bg-alt); border-radius: var(--radius); border-left: 4px solid var(--color-primary); }
    .homework-card h4 { margin: 0 0 0.25rem; font-size: 1rem; }
    .hw-meta { font-size: 0.85rem; color: var(--color-muted); margin: 0 0 0.5rem; }
    .hw-desc { margin: 0; font-size: 0.9rem; }
    .hw-due { font-size: 0.85rem; color: var(--color-accent); }
    .muted { color: var(--color-muted); }
    .profile-row { display: flex; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 2rem; }
    .profile-form { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
    .profile-form input { padding: 0.4rem 0.75rem; border-radius: var(--radius); border: 1px solid var(--color-border); }
    .profile-form button { padding: 0.4rem 0.75rem; border-radius: var(--radius); cursor: pointer; font-size: 0.9rem; }
    .profile-form button[type="submit"] { background: var(--color-primary); color: white; border: none; }
    .profile-form button[type="button"] { background: var(--color-bg-alt); border: 1px solid var(--color-border); }
    .btn-edit { padding: 0.25rem 0.6rem; font-size: 0.85rem; background: transparent; border: 1px solid var(--color-border); border-radius: var(--radius); cursor: pointer; }
    .announcement-list { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 2rem; }
    .announcement-card { padding: 1rem; background: var(--color-bg-alt); border-radius: var(--radius); border-left: 4px solid var(--color-primary); }
    .announcement-card h4 { margin: 0 0 0.25rem; font-size: 1rem; }
    .ann-meta { font-size: 0.85rem; color: var(--color-muted); margin: 0 0 0.5rem; }
    .ann-body { margin: 0; font-size: 0.9rem; white-space: pre-wrap; }
    .ann-date { font-size: 0.8rem; color: var(--color-muted); }
    @media (max-width: 600px) {
      .page { padding: 1.5rem 0; }
      .card { padding: 1rem; min-height: 60px; display: flex; flex-direction: column; justify-content: center; }
    }
  `],
})
export class CabinetComponent implements OnInit {
  enrollments = signal<Enrollment[]>([]);
  homework = signal<Homework[]>([]);
  announcements = signal<{ id: string; title: string; body: string; programTitle: string; groupTitle: string; createdAt: number }[]>([]);
  loading = signal(true);
  editingProfile = signal(false);
  editName = '';
  savingProfile = signal(false);

  constructor(public auth: AuthService, private api: ApiService) {}

  openProfileEdit() {
    const u = this.auth.user();
    this.editName = u?.name ?? '';
    this.editingProfile.set(true);
  }

  saveProfile() {
    if (!this.editName.trim()) return;
    this.savingProfile.set(true);
    this.api.put<{ success: boolean; user: { id: string; email: string; name: string; role: string } }>('/me/profile', { name: this.editName.trim() }).subscribe({
      next: (res) => {
        if (res.success && res.user) this.auth.updateUserData(res.user as { id: string; email: string; name: string; role: 'student' | 'admin' });
        this.editingProfile.set(false);
        this.savingProfile.set(false);
      },
      error: () => this.savingProfile.set(false),
    });
  }

  ngOnInit() {
    this.api.get<{ success: boolean; enrollments: Enrollment[] }>('/me/enrollments').subscribe({
      next: (res) => {
        if (res.success) this.enrollments.set(res.enrollments);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.api.get<{ success: boolean; homework: Homework[] }>('/me/homework').subscribe({
      next: (res) => {
        if (res.success) this.homework.set(res.homework);
      },
    });
    this.api.get<{ success: boolean; announcements: { id: string; title: string; body: string; programTitle: string; groupTitle: string; createdAt: number }[] }>('/me/announcements').subscribe({
      next: (res) => {
        if (res.success) this.announcements.set(res.announcements || []);
      },
    });
  }

  formatDate(ts: number): string {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
