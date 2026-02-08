import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../services/api.service';

interface Stats {
  students: number;
  enrollments: number;
  programs: number;
  popularPrograms: { id: string; title: string; slug: string; count: number }[];
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
  durationWeeks: number;
  lessonsPerWeek?: number;
  format?: string;
  schoolType?: string;
  imageUrl?: string | null;
  price?: number | null;
  schedule?: string | null;
  curriculum?: Lesson[];
}

interface SchoolType {
  id: string;
  title: string;
  description?: string;
  sortOrder?: number;
}

interface Student {
  id: string;
  email: string;
  name: string;
  role: string;
}

@Component({
  selector: 'school-admin',
  standalone: true,
  imports: [FormsModule, TranslateModule],
  template: `
    <div class="container page">
      <h1>{{ 'admin.title' | translate }}</h1>
      <div class="tabs">
        <button [class.active]="tab() === 'stats'" (click)="tab.set('stats')">{{ 'admin.tabStats' | translate }}</button>
        <button [class.active]="tab() === 'programs'" (click)="tab.set('programs'); loadPrograms(); loadSchoolTypes()">{{ 'admin.tabPrograms' | translate }}</button>
        <button [class.active]="tab() === 'schoolTypes'" (click)="tab.set('schoolTypes'); loadSchoolTypes()">{{ 'admin.tabSchoolTypes' | translate }}</button>
        <button [class.active]="tab() === 'students'" (click)="tab.set('students'); loadStudents()">{{ 'admin.tabStudents' | translate }}</button>
      </div>

      @if (tab() === 'stats') {
        @if (stats(); as s) {
          <div class="stats-grid">
            <div class="stat-card"><span class="num">{{ s.students }}</span><span>{{ 'admin.students' | translate }}</span></div>
            <div class="stat-card"><span class="num">{{ s.enrollments }}</span><span>{{ 'admin.enrollments' | translate }}</span></div>
            <div class="stat-card"><span class="num">{{ s.programs }}</span><span>{{ 'admin.programs' | translate }}</span></div>
          </div>
          <h3>{{ 'admin.popularPrograms' | translate }}</h3>
          <ul>
            @for (p of s.popularPrograms; track p.id) {
              <li>{{ p.title }} — {{ p.count }} {{ 'admin.enrollments' | translate }}</li>
            }
          </ul>
        }
      }

      @if (tab() === 'programs') {
        <div class="programs-toolbar">
          <select (change)="onProgramFilter($event)">
            <option value="">{{ 'admin.allSchoolTypes' | translate }}</option>
            @for (st of schoolTypes(); track st.id) {
              <option [value]="st.id">{{ st.title }}</option>
            }
          </select>
          <button (click)="openProgramForm()" class="btn-add">{{ 'admin.addProgram' | translate }}</button>
        </div>
        <div class="list">
          @for (p of filteredPrograms(); track p.id) {
            <div class="row">
              <div class="row-content">
                <strong>{{ p.title }}</strong>
                <span class="age">{{ p.ageMin }}–{{ p.ageMax }} {{ 'programs.years' | translate }}</span>
                <span>{{ getSchoolTypeTitle(p.schoolType || '') }}</span>
              </div>
              <div class="row-actions">
                <button (click)="editProgram(p)">{{ 'admin.edit' | translate }}</button>
                <button (click)="deleteProgram(p)" class="btn-danger">{{ 'admin.delete' | translate }}</button>
              </div>
            </div>
          }
        </div>
        @if (showProgramForm()) {
          <div class="modal-overlay" (click)="closeProgramForm()">
            <div class="modal" (click)="$event.stopPropagation()">
              <h3>{{ (editingProgram() ? 'admin.editProgram' : 'admin.newProgram') | translate }}</h3>
              @if (errorMessage()) {
                <div class="form-error">{{ errorMessage() }}</div>
              }
              @if (successMessage()) {
                <div class="form-success">{{ successMessage() }}</div>
              }
              <form (ngSubmit)="saveProgram()">
                <div class="form-tabs">
                  <button type="button" [class.active]="programFormLang() === 'ru'" (click)="programFormLang.set('ru')">RU</button>
                  <button type="button" [class.active]="programFormLang() === 'sr'" (click)="programFormLang.set('sr')">SR</button>
                  <button type="button" [class.active]="programFormLang() === 'en'" (click)="programFormLang.set('en')">EN</button>
                </div>
                @if (programFormLang() === 'ru') {
                  <label>{{ 'admin.programTitle' | translate }} (RU) <input [(ngModel)]="programForm.titleRu" name="titleRu" required /></label>
                  <label>{{ 'admin.description' | translate }} (RU) <textarea [(ngModel)]="programForm.descriptionRu" name="descRu" rows="3"></textarea></label>
                  <label>{{ 'admin.curriculum' | translate }} (RU) <textarea [(ngModel)]="programForm.curriculumRuJson" name="currRu" rows="6" [placeholder]="'admin.curriculumPlaceholder' | translate"></textarea></label>
                }
                @if (programFormLang() === 'sr') {
                  <label>{{ 'admin.programTitle' | translate }} (SR) <input [(ngModel)]="programForm.titleSr" name="titleSr" /></label>
                  <label>{{ 'admin.description' | translate }} (SR) <textarea [(ngModel)]="programForm.descriptionSr" name="descSr" rows="3"></textarea></label>
                  <label>{{ 'admin.curriculum' | translate }} (SR) <textarea [(ngModel)]="programForm.curriculumSrJson" name="currSr" rows="6"></textarea></label>
                }
                @if (programFormLang() === 'en') {
                  <label>{{ 'admin.programTitle' | translate }} (EN) <input [(ngModel)]="programForm.titleEn" name="titleEn" /></label>
                  <label>{{ 'admin.description' | translate }} (EN) <textarea [(ngModel)]="programForm.descriptionEn" name="descEn" rows="3"></textarea></label>
                  <label>{{ 'admin.curriculum' | translate }} (EN) <textarea [(ngModel)]="programForm.curriculumEnJson" name="currEn" rows="6"></textarea></label>
                }
                <hr />
                <label>{{ 'admin.slug' | translate }} <input [(ngModel)]="programForm.slug" name="slug" /></label>
                <label>{{ 'admin.ageFrom' | translate }} <input type="number" [(ngModel)]="programForm.ageMin" name="ageMin" min="5" max="18" /></label>
                <label>{{ 'admin.ageTo' | translate }} <input type="number" [(ngModel)]="programForm.ageMax" name="ageMax" min="5" max="18" /></label>
                <label>{{ 'admin.schoolType' | translate }}
                  <select [(ngModel)]="programForm.schoolType" name="schoolType">
                    @for (st of schoolTypes(); track st.id) {
                      <option [value]="st.id">{{ st.title }}</option>
                    }
                  </select>
                </label>
                <label>{{ 'admin.weeks' | translate }} <input type="number" [(ngModel)]="programForm.durationWeeks" name="weeks" min="1" /></label>
                <label>{{ 'admin.lessonsPerWeek' | translate }} <input type="number" [(ngModel)]="programForm.lessonsPerWeek" name="lessonsPerWeek" min="1" max="7" /></label>
                <label>{{ 'admin.format' | translate }} <input [(ngModel)]="programForm.format" name="format" /></label>
                <label>{{ 'admin.imageUrl' | translate }} <input [(ngModel)]="programForm.imageUrl" name="imageUrl" placeholder="https://..." /></label>
                <label>{{ 'admin.price' | translate }} <input type="number" [(ngModel)]="programForm.price" name="price" [placeholder]="'admin.pricePlaceholder' | translate" /></label>
                <label>{{ 'admin.schedule' | translate }} <input [(ngModel)]="programForm.schedule" name="schedule" /></label>
                <div class="modal-actions">
                  <button type="button" (click)="closeProgramForm()">{{ 'admin.cancel' | translate }}</button>
                  <button type="submit">{{ 'admin.save' | translate }}</button>
                </div>
              </form>
            </div>
          </div>
        }
      }

      @if (tab() === 'schoolTypes') {
        <div class="list">
          @for (st of adminSchoolTypes(); track st.id) {
            <div class="row">
              <div class="row-content">
                <strong>{{ st.title }}</strong>
                @if (st.description) {
                  <span class="muted">{{ st.description }}</span>
                }
              </div>
              <div class="row-actions">
                <button (click)="editSchoolType(st)">{{ 'admin.edit' | translate }}</button>
              </div>
            </div>
          }
        </div>
        @if (showSchoolTypeForm()) {
          <div class="modal-overlay" (click)="closeSchoolTypeForm()">
            <div class="modal" (click)="$event.stopPropagation()">
              <h3>{{ 'admin.editSchoolType' | translate }}</h3>
              @if (schoolTypeError()) {
                <div class="form-error">{{ schoolTypeError() }}</div>
              }
              @if (schoolTypeSuccess()) {
                <div class="form-success">{{ schoolTypeSuccess() }}</div>
              }
              <form (ngSubmit)="saveSchoolType()">
                <div class="form-tabs">
                  <button type="button" [class.active]="schoolTypeFormLang() === 'ru'" (click)="schoolTypeFormLang.set('ru')">RU</button>
                  <button type="button" [class.active]="schoolTypeFormLang() === 'sr'" (click)="schoolTypeFormLang.set('sr')">SR</button>
                  <button type="button" [class.active]="schoolTypeFormLang() === 'en'" (click)="schoolTypeFormLang.set('en')">EN</button>
                </div>
                @if (schoolTypeFormLang() === 'ru') {
                  <label>{{ 'admin.programTitle' | translate }} (RU) <input [(ngModel)]="schoolTypeForm.titleRu" name="titleRu" required /></label>
                  <label>{{ 'admin.description' | translate }} (RU) <textarea [(ngModel)]="schoolTypeForm.descriptionRu" name="descRu" rows="2"></textarea></label>
                }
                @if (schoolTypeFormLang() === 'sr') {
                  <label>{{ 'admin.programTitle' | translate }} (SR) <input [(ngModel)]="schoolTypeForm.titleSr" name="titleSr" /></label>
                  <label>{{ 'admin.description' | translate }} (SR) <textarea [(ngModel)]="schoolTypeForm.descriptionSr" name="descSr" rows="2"></textarea></label>
                }
                @if (schoolTypeFormLang() === 'en') {
                  <label>{{ 'admin.programTitle' | translate }} (EN) <input [(ngModel)]="schoolTypeForm.titleEn" name="titleEn" /></label>
                  <label>{{ 'admin.description' | translate }} (EN) <textarea [(ngModel)]="schoolTypeForm.descriptionEn" name="descEn" rows="2"></textarea></label>
                }
                <div class="modal-actions">
                  <button type="button" (click)="closeSchoolTypeForm()">{{ 'admin.cancel' | translate }}</button>
                  <button type="submit">{{ 'admin.save' | translate }}</button>
                </div>
              </form>
            </div>
          </div>
        }
      }

      @if (tab() === 'students') {
        <input type="search" [placeholder]="'admin.searchStudents' | translate" (input)="onSearch($event)" />
        <div class="students-list">
          @for (s of adminStudents(); track s.id) {
            <div class="student-row">
              <span>{{ s.name }}</span>
              <span>{{ s.email }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 2rem 0; }
    .tabs { display: flex; gap: 0.5rem; margin-bottom: 2rem; flex-wrap: wrap; }
    .tabs button {
      padding: 0.5rem 1rem;
      border: 1px solid var(--color-border);
      background: var(--color-bg-alt);
      border-radius: var(--radius);
      cursor: pointer;
    }
    .tabs button.active { background: var(--color-primary); color: white; border-color: var(--color-primary); }
    .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 2rem; }
    .stat-card {
      padding: 1.5rem;
      background: var(--color-bg-alt);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      text-align: center;
    }
    .stat-card .num { display: block; font-size: 2rem; font-weight: 700; color: var(--color-primary); }
    .btn-add { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: var(--radius); cursor: pointer; }
    .programs-toolbar { display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; }
    .programs-toolbar select { padding: 0.5rem 1rem; border-radius: var(--radius); border: 1px solid var(--color-border); }
    .list, .students-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .row, .student-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.75rem;
      background: var(--color-bg-alt);
      border-radius: var(--radius);
    }
    .row-content { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
    .row-actions { display: flex; gap: 0.5rem; }
    .age, .muted { color: var(--color-muted); font-size: 0.9rem; }
    .btn-danger { background: var(--color-error); color: white; }
    input[type="search"] {
      width: 100%;
      max-width: 400px;
      padding: 0.5rem 1rem;
      margin-bottom: 1rem;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
    }
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal {
      background: var(--color-bg-alt);
      padding: 2rem;
      border-radius: var(--radius);
      max-width: 500px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
    }
    .modal label { display: block; margin-bottom: 1rem; }
    .modal input, .modal textarea, .modal select { width: 100%; padding: 0.5rem; margin-top: 0.25rem; }
    .modal-actions { display: flex; gap: 0.5rem; margin-top: 1.5rem; }
    .form-error { color: var(--color-error); margin-bottom: 1rem; }
    .form-success { color: var(--color-primary); margin-bottom: 1rem; }
    .hint { display: block; font-size: 0.8rem; color: var(--color-muted); margin-top: 0.25rem; }
    .form-tabs { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
    .form-tabs button { padding: 0.4rem 0.8rem; border-radius: var(--radius); border: 1px solid var(--color-border); background: var(--color-bg-alt); cursor: pointer; }
    .form-tabs button.active { background: var(--color-primary); color: white; border-color: var(--color-primary); }
    .modal hr { margin: 1rem 0; border: none; border-top: 1px solid var(--color-border); }
  `],
})
export class AdminComponent implements OnInit {
  tab = signal<'stats' | 'programs' | 'schoolTypes' | 'students'>('stats');
  stats = signal<Stats | null>(null);
  adminPrograms = signal<Program[]>([]);
  programFilter = signal<string>('');
  schoolTypes = signal<SchoolType[]>([]);
  adminSchoolTypes = signal<SchoolType[]>([]);
  adminStudents = signal<Student[]>([]);
  showProgramForm = signal(false);
  showSchoolTypeForm = signal(false);
  editingProgram = signal<Program | null>(null);
  editingSchoolType = signal<SchoolType | null>(null);
  schoolTypeError = signal<string | null>(null);
  schoolTypeSuccess = signal<string | null>(null);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  programForm = {
    titleRu: '',
    titleSr: '',
    titleEn: '',
    slug: '',
    descriptionRu: '',
    descriptionSr: '',
    descriptionEn: '',
    ageMin: 5,
    ageMax: 18,
    schoolType: 'tech',
    durationWeeks: 12,
    lessonsPerWeek: 1,
    format: '',
    imageUrl: '' as string | null,
    price: null as number | string | null,
    schedule: '',
    curriculumRuJson: '',
    curriculumSrJson: '',
    curriculumEnJson: '',
  };
  schoolTypeForm = { titleRu: '', titleSr: '', titleEn: '', descriptionRu: '', descriptionSr: '', descriptionEn: '' };
  programFormLang = signal<'ru' | 'sr' | 'en'>('ru');
  schoolTypeFormLang = signal<'ru' | 'sr' | 'en'>('ru');
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private api: ApiService,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.loadStats();
    this.api.get<{ success: boolean; schoolTypes: SchoolType[] }>('/programs/meta/school-types').subscribe({
      next: (r) => { if (r.success) this.schoolTypes.set(r.schoolTypes); },
    });
  }

  loadSchoolTypes() {
    this.api.get<{ success: boolean; schoolTypes: SchoolType[] }>('/admin/school-types').subscribe({
      next: (r) => { if (r.success) this.adminSchoolTypes.set(r.schoolTypes); },
      error: () => {
        this.api.get<{ success: boolean; schoolTypes: SchoolType[] }>('/programs/meta/school-types').subscribe({
          next: (res) => { if (res.success) this.adminSchoolTypes.set(res.schoolTypes); },
        });
      },
    });
  }

  loadStats() {
    this.api.get<{ success: boolean; stats: Stats }>('/admin/stats').subscribe({
      next: (res) => { if (res.success) this.stats.set(res.stats); },
    });
  }

  loadPrograms() {
    this.api.get<{ success: boolean; programs: Program[] }>('/admin/programs').subscribe({
      next: (res) => { if (res.success) this.adminPrograms.set(res.programs); },
    });
  }

  filteredPrograms = computed(() => {
    const filter = this.programFilter();
    const list = this.adminPrograms();
    if (!filter) return list;
    return list.filter((p) => (p.schoolType || 'tech') === filter);
  });

  onProgramFilter(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    this.programFilter.set(v);
  }

  getSchoolTypeTitle(id: string): string {
    const st = this.schoolTypes().find((s) => s.id === id);
    return st?.title || id || '';
  }

  loadStudents(search?: string) {
    let path = '/admin/students';
    if (search) path += '?search=' + encodeURIComponent(search);
    this.api.get<{ success: boolean; students: Student[] }>(path).subscribe({
      next: (res) => { if (res.success) this.adminStudents.set(res.students); },
    });
  }

  openProgramForm() {
    this.editingProgram.set(null);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.programFormLang.set('ru');
    this.programForm = {
      titleRu: '',
      titleSr: '',
      titleEn: '',
      slug: '',
      descriptionRu: '',
      descriptionSr: '',
      descriptionEn: '',
      ageMin: 5,
      ageMax: 18,
      schoolType: 'tech',
      durationWeeks: 12,
      lessonsPerWeek: 1,
      format: '',
      imageUrl: null,
      price: null,
      schedule: '',
      curriculumRuJson: '',
      curriculumSrJson: '',
      curriculumEnJson: '',
    };
    this.showProgramForm.set(true);
  }

  editProgram(p: Program) {
    this.editingProgram.set(p);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.programFormLang.set('ru');
    this.api.get<{ success: boolean; program: Program & { titleRu?: string; titleSr?: string; titleEn?: string; descriptionRu?: string; descriptionSr?: string; descriptionEn?: string; curriculumRu?: Lesson[]; curriculumSr?: Lesson[]; curriculumEn?: Lesson[] } }>(`/admin/programs/raw/${p.id}`).subscribe({
      next: (res) => {
        if (res.success && res.program) {
          const prog = res.program as any;
          this.programForm = {
            titleRu: prog.titleRu ?? prog.title ?? '',
            titleSr: prog.titleSr ?? '',
            titleEn: prog.titleEn ?? '',
            slug: prog.slug ?? '',
            descriptionRu: prog.descriptionRu ?? prog.description ?? '',
            descriptionSr: prog.descriptionSr ?? '',
            descriptionEn: prog.descriptionEn ?? '',
            ageMin: prog.ageMin ?? prog.age_min ?? 5,
            ageMax: prog.ageMax ?? prog.age_max ?? 18,
            schoolType: prog.schoolType ?? prog.school_type ?? 'tech',
            durationWeeks: prog.durationWeeks ?? prog.duration_weeks ?? 12,
            lessonsPerWeek: prog.lessonsPerWeek ?? prog.lessons_per_week ?? 1,
            format: prog.format ?? '',
            imageUrl: prog.imageUrl ?? prog.image_url ?? null,
            price: prog.price ?? null,
            schedule: prog.schedule ?? '',
            curriculumRuJson: Array.isArray(prog.curriculumRu) ? JSON.stringify(prog.curriculumRu, null, 2) : '',
            curriculumSrJson: Array.isArray(prog.curriculumSr) ? JSON.stringify(prog.curriculumSr, null, 2) : '',
            curriculumEnJson: Array.isArray(prog.curriculumEn) ? JSON.stringify(prog.curriculumEn, null, 2) : '',
          };
        }
        this.showProgramForm.set(true);
      },
      error: () => {
        this.programForm = {
          titleRu: p.title,
          titleSr: '',
          titleEn: '',
          slug: p.slug,
          descriptionRu: p.description,
          descriptionSr: '',
          descriptionEn: '',
          ageMin: p.ageMin,
          ageMax: p.ageMax,
          schoolType: p.schoolType || 'tech',
          durationWeeks: p.durationWeeks,
          lessonsPerWeek: p.lessonsPerWeek ?? 1,
          format: p.format || '',
          imageUrl: p.imageUrl ?? null,
          price: p.price ?? null,
          schedule: p.schedule ?? '',
          curriculumRuJson: p.curriculum?.length ? JSON.stringify(p.curriculum, null, 2) : '',
          curriculumSrJson: '',
          curriculumEnJson: '',
        };
        this.showProgramForm.set(true);
      },
    });
  }

  closeProgramForm() {
    this.showProgramForm.set(false);
    this.editingProgram.set(null);
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  saveProgram() {
    this.errorMessage.set(null);
    const titleRu = this.programForm.titleRu?.trim() ?? '';
    if (!titleRu) {
      this.errorMessage.set(this.translate.instant('admin.titleRequired'));
      return;
    }
    if (this.programForm.ageMin > this.programForm.ageMax) {
      this.errorMessage.set(this.translate.instant('admin.ageError'));
      return;
    }
    let curriculumRu: Lesson[] = [];
    let curriculumSr: Lesson[] = [];
    let curriculumEn: Lesson[] = [];
    try {
      if (this.programForm.curriculumRuJson?.trim()) {
        curriculumRu = JSON.parse(this.programForm.curriculumRuJson);
      }
      if (this.programForm.curriculumSrJson?.trim()) {
        curriculumSr = JSON.parse(this.programForm.curriculumSrJson);
      }
      if (this.programForm.curriculumEnJson?.trim()) {
        curriculumEn = JSON.parse(this.programForm.curriculumEnJson);
      }
    } catch {
      this.errorMessage.set(this.translate.instant('admin.curriculumJsonError'));
      return;
    }
    const slug = this.programForm.slug?.trim() || titleRu.toLowerCase().replace(/\s+/g, '-').replace(/[^a-zа-яё0-9-]/gi, '');
    const body = {
      titleRu,
      titleSr: this.programForm.titleSr?.trim() ?? titleRu,
      titleEn: this.programForm.titleEn?.trim() ?? titleRu,
      slug,
      descriptionRu: this.programForm.descriptionRu?.trim() ?? '',
      descriptionSr: this.programForm.descriptionSr?.trim() ?? this.programForm.descriptionRu?.trim() ?? '',
      descriptionEn: this.programForm.descriptionEn?.trim() ?? this.programForm.descriptionRu?.trim() ?? '',
      curriculumRu,
      curriculumSr,
      curriculumEn,
      ageMin: this.programForm.ageMin,
      ageMax: this.programForm.ageMax,
      schoolType: this.programForm.schoolType,
      durationWeeks: this.programForm.durationWeeks,
      lessonsPerWeek: this.programForm.lessonsPerWeek ?? 1,
      format: this.programForm.format || '',
      imageUrl: this.programForm.imageUrl?.trim() || null,
      price: (this.programForm.price != null && String(this.programForm.price).trim() !== '' && !Number.isNaN(Number(this.programForm.price))) ? Number(this.programForm.price) : null,
      schedule: this.programForm.schedule?.trim() || null,
    };
    const ed = this.editingProgram();
    if (ed) {
      this.api.put<{ success: boolean }>(`/admin/programs/${ed.id}`, body).subscribe({
        next: () => {
          this.successMessage.set(this.translate.instant('admin.saved'));
          setTimeout(() => {
            this.closeProgramForm();
            this.loadPrograms();
          }, 500);
        },
        error: (err) => {
          this.errorMessage.set(err.error?.error || this.translate.instant('admin.saveError'));
        },
      });
    } else {
      this.api.post<{ success: boolean }>('/admin/programs', body).subscribe({
        next: () => {
          this.successMessage.set(this.translate.instant('admin.saved'));
          setTimeout(() => {
            this.closeProgramForm();
            this.loadPrograms();
          }, 500);
        },
        error: (err) => {
          this.errorMessage.set(err.error?.error || this.translate.instant('admin.saveError'));
        },
      });
    }
  }

  deleteProgram(p: Program) {
    if (!confirm(this.translate.instant('admin.deleteProgramConfirm', { title: p.title }))) return;
    this.api.delete<{ success: boolean }>(`/admin/programs/${p.id}`).subscribe({
      next: () => this.loadPrograms(),
    });
  }

  editSchoolType(st: SchoolType) {
    this.editingSchoolType.set(st);
    this.schoolTypeError.set(null);
    this.schoolTypeSuccess.set(null);
    this.schoolTypeFormLang.set('ru');
    this.api.get<{ success: boolean; schoolType: { titleRu?: string; titleSr?: string; titleEn?: string; descriptionRu?: string; descriptionSr?: string; descriptionEn?: string } }>(`/admin/school-types/raw/${st.id}`).subscribe({
      next: (res) => {
        if (res.success && res.schoolType) {
          const s = res.schoolType as any;
          this.schoolTypeForm = {
            titleRu: s.titleRu ?? st.title ?? '',
            titleSr: s.titleSr ?? '',
            titleEn: s.titleEn ?? '',
            descriptionRu: s.descriptionRu ?? st.description ?? '',
            descriptionSr: s.descriptionSr ?? '',
            descriptionEn: s.descriptionEn ?? '',
          };
        }
        this.showSchoolTypeForm.set(true);
      },
      error: () => {
        this.schoolTypeForm = { titleRu: st.title ?? '', titleSr: '', titleEn: '', descriptionRu: st.description ?? '', descriptionSr: '', descriptionEn: '' };
        this.showSchoolTypeForm.set(true);
      },
    });
  }

  closeSchoolTypeForm() {
    this.showSchoolTypeForm.set(false);
    this.editingSchoolType.set(null);
    this.schoolTypeError.set(null);
    this.schoolTypeSuccess.set(null);
  }

  saveSchoolType() {
    const st = this.editingSchoolType();
    if (!st) return;
    this.schoolTypeError.set(null);
    const titleRu = this.schoolTypeForm.titleRu?.trim() ?? '';
    if (!titleRu) {
      this.schoolTypeError.set(this.translate.instant('admin.titleRequired'));
      return;
    }
    this.api.put<{ success: boolean; schoolType: SchoolType }>(`/admin/school-types/${st.id}`, {
      titleRu,
      titleSr: this.schoolTypeForm.titleSr?.trim() ?? titleRu,
      titleEn: this.schoolTypeForm.titleEn?.trim() ?? titleRu,
      descriptionRu: this.schoolTypeForm.descriptionRu?.trim() ?? '',
      descriptionSr: this.schoolTypeForm.descriptionSr?.trim() ?? this.schoolTypeForm.descriptionRu?.trim() ?? '',
      descriptionEn: this.schoolTypeForm.descriptionEn?.trim() ?? this.schoolTypeForm.descriptionRu?.trim() ?? '',
    }).subscribe({
      next: () => {
        this.schoolTypeSuccess.set(this.translate.instant('admin.saved'));
        this.loadSchoolTypes();
        this.api.get<{ success: boolean; schoolTypes: SchoolType[] }>('/programs/meta/school-types').subscribe({
          next: (r) => { if (r.success) this.schoolTypes.set(r.schoolTypes); },
        });
        setTimeout(() => this.closeSchoolTypeForm(), 800);
      },
      error: (err) => this.schoolTypeError.set(err.error?.error || this.translate.instant('admin.saveError')),
    });
  }

  onSearch(e: Event) {
    const v = (e.target as HTMLInputElement).value.trim();
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.loadStudents(v || undefined), 300);
  }
}
