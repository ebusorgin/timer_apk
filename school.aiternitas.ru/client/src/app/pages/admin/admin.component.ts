import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

interface Stats {
  students: number;
  enrollments: number;
  programs: number;
  popularPrograms: { id: string; title: string; slug: string; count: number }[];
}

interface Program {
  id: string;
  title: string;
  slug: string;
  description: string;
  ageMin: number;
  ageMax: number;
  direction: string;
  directions?: string[];
  durationWeeks: number;
  lessonsPerWeek?: number;
  format?: string;
  schoolType?: string;
  imageUrl?: string | null;
  price?: number | null;
  schedule?: string | null;
}

interface Direction {
  id: number;
  name: string;
  sortOrder: number;
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
  imports: [FormsModule],
  template: `
    <div class="container page">
      <h1>Админ-панель</h1>
      <div class="tabs">
        <button [class.active]="tab() === 'stats'" (click)="tab.set('stats')">Дашборд</button>
        <button [class.active]="tab() === 'programs'" (click)="tab.set('programs'); loadPrograms(); loadDirections()">Программы</button>
        <button [class.active]="tab() === 'schoolTypes'" (click)="tab.set('schoolTypes'); loadSchoolTypes()">Типы школ</button>
        <button [class.active]="tab() === 'directions'" (click)="tab.set('directions'); directionError.set(null); loadDirections()">Направления</button>
        <button [class.active]="tab() === 'students'" (click)="tab.set('students'); loadStudents()">Ученики</button>
      </div>

      @if (tab() === 'stats') {
        @if (stats(); as s) {
          <div class="stats-grid">
            <div class="stat-card"><span class="num">{{ s.students }}</span><span>Учеников</span></div>
            <div class="stat-card"><span class="num">{{ s.enrollments }}</span><span>Записей</span></div>
            <div class="stat-card"><span class="num">{{ s.programs }}</span><span>Программ</span></div>
          </div>
          <h3>Популярные программы</h3>
          <ul>
            @for (p of s.popularPrograms; track p.id) {
              <li>{{ p.title }} — {{ p.count }} записей</li>
            }
          </ul>
        }
      }

      @if (tab() === 'programs') {
        <div class="programs-toolbar">
          <select (change)="onProgramFilter($event)">
            <option value="">Все направления</option>
            @for (st of schoolTypes(); track st.id) {
              <option [value]="st.id">{{ st.title }}</option>
            }
          </select>
          <button (click)="openProgramForm()" class="btn-add">+ Добавить программу</button>
        </div>
        <div class="list">
          @for (p of filteredPrograms(); track p.id) {
            <div class="row">
              <div class="row-content">
                <strong>{{ p.title }}</strong>
                <span class="age">{{ p.ageMin }}–{{ p.ageMax }} лет</span>
                <span>{{ p.direction }}</span>
                <span>{{ p.schoolType || 'tech' }}</span>
              </div>
              <div class="row-actions">
                <button (click)="editProgram(p)">Изменить</button>
                <button (click)="deleteProgram(p)" class="btn-danger">Удалить</button>
              </div>
            </div>
          }
        </div>
        @if (showProgramForm()) {
          <div class="modal-overlay" (click)="closeProgramForm()">
            <div class="modal" (click)="$event.stopPropagation()">
              <h3>{{ editingProgram() ? 'Редактировать программу' : 'Новая программа' }}</h3>
              @if (errorMessage()) {
                <div class="form-error">{{ errorMessage() }}</div>
              }
              @if (successMessage()) {
                <div class="form-success">{{ successMessage() }}</div>
              }
              <form (ngSubmit)="saveProgram()">
                <label>Название <input [(ngModel)]="programForm.title" name="title" required /></label>
                <label>Slug <input [(ngModel)]="programForm.slug" name="slug" /></label>
                <label>Описание <textarea [(ngModel)]="programForm.description" name="desc" rows="3"></textarea></label>
                <label>Возраст от <input type="number" [(ngModel)]="programForm.ageMin" name="ageMin" min="5" max="18" /></label>
                <label>Возраст до <input type="number" [(ngModel)]="programForm.ageMax" name="ageMax" min="5" max="18" /></label>
                <label>Направления
                  <div class="directions-checkboxes">
                    @for (d of adminDirections(); track d.id) {
                      <label class="checkbox-label">
                        <input type="checkbox" [checked]="isDirectionSelected(d.name)" (change)="toggleDirection(d.name)" />
                        {{ d.name }}
                      </label>
                    }
                  </div>
                  <input [(ngModel)]="programForm.directionsExtra" name="dirsExtra" placeholder="Дополнительно (через запятую)" class="mt-1" />
                </label>
                <label>Тип школы
                  <select [(ngModel)]="programForm.schoolType" name="schoolType">
                    @for (st of schoolTypes(); track st.id) {
                      <option [value]="st.id">{{ st.title }}</option>
                    }
                  </select>
                </label>
                <label>Недель <input type="number" [(ngModel)]="programForm.durationWeeks" name="weeks" min="1" /></label>
                <label>Занятий в неделю <input type="number" [(ngModel)]="programForm.lessonsPerWeek" name="lessonsPerWeek" min="1" max="7" /></label>
                <label>Формат <input [(ngModel)]="programForm.format" name="format" placeholder="модульный, годовой" /></label>
                <label>Изображение (URL) <input [(ngModel)]="programForm.imageUrl" name="imageUrl" placeholder="https://..." /></label>
                <label>Цена (руб) <input type="number" [(ngModel)]="programForm.price" name="price" placeholder="пусто = бесплатно" /></label>
                <label>Расписание <input [(ngModel)]="programForm.schedule" name="schedule" placeholder="Вт, Чт 16:00" /></label>
                <div class="modal-actions">
                  <button type="button" (click)="closeProgramForm()">Отмена</button>
                  <button type="submit">Сохранить</button>
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
                <button (click)="editSchoolType(st)">Изменить</button>
              </div>
            </div>
          }
        </div>
        @if (showSchoolTypeForm()) {
          <div class="modal-overlay" (click)="closeSchoolTypeForm()">
            <div class="modal" (click)="$event.stopPropagation()">
              <h3>Редактировать тип школы</h3>
              @if (schoolTypeError()) {
                <div class="form-error">{{ schoolTypeError() }}</div>
              }
              @if (schoolTypeSuccess()) {
                <div class="form-success">{{ schoolTypeSuccess() }}</div>
              }
              <form (ngSubmit)="saveSchoolType()">
                <label>Название <input [(ngModel)]="schoolTypeForm.title" name="title" required /></label>
                <label>Описание <textarea [(ngModel)]="schoolTypeForm.description" name="desc" rows="2" placeholder="Краткое описание для карточки"></textarea></label>
                <div class="modal-actions">
                  <button type="button" (click)="closeSchoolTypeForm()">Отмена</button>
                  <button type="submit">Сохранить</button>
                </div>
              </form>
            </div>
          </div>
        }
      }

      @if (tab() === 'directions') {
        <div class="programs-toolbar">
          <button (click)="openDirectionForm()" class="btn-add">+ Добавить направление</button>
        </div>
        @if (directionError()) {
          <div class="form-error mb-1">{{ directionError() }}</div>
        }
        <div class="list">
          @for (d of adminDirections(); track d.id) {
            <div class="row">
              <div class="row-content">
                <strong>{{ d.name }}</strong>
              </div>
              <div class="row-actions">
                <button (click)="editDirection(d)">Изменить</button>
                <button (click)="deleteDirection(d)" class="btn-danger">Удалить</button>
              </div>
            </div>
          }
        </div>
        @if (showDirectionForm()) {
          <div class="modal-overlay" (click)="closeDirectionForm()">
            <div class="modal" (click)="$event.stopPropagation()">
              <h3>{{ editingDirection() ? 'Редактировать направление' : 'Новое направление' }}</h3>
              @if (directionError()) {
                <div class="form-error">{{ directionError() }}</div>
              }
              <form (ngSubmit)="saveDirection()">
                <label>Название <input [(ngModel)]="directionForm.name" name="name" required /></label>
                <div class="modal-actions">
                  <button type="button" (click)="closeDirectionForm()">Отмена</button>
                  <button type="submit">Сохранить</button>
                </div>
              </form>
            </div>
          </div>
        }
      }

      @if (tab() === 'students') {
        <input type="search" placeholder="Поиск по имени или email" (input)="onSearch($event)" />
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
    .mb-1 { margin-bottom: 1rem; }
    .form-success { color: var(--color-primary); margin-bottom: 1rem; }
    .directions-checkboxes { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; margin: 0.25rem 0; }
    .checkbox-label { display: inline-flex; align-items: center; gap: 0.35rem; margin: 0; font-weight: normal; cursor: pointer; }
    .checkbox-label input { width: auto; margin: 0; }
    .mt-1 { margin-top: 0.25rem; }
  `],
})
export class AdminComponent implements OnInit {
  tab = signal<'stats' | 'programs' | 'schoolTypes' | 'directions' | 'students'>('stats');
  stats = signal<Stats | null>(null);
  adminPrograms = signal<Program[]>([]);
  programFilter = signal<string>('');
  adminDirections = signal<Direction[]>([]);
  schoolTypes = signal<SchoolType[]>([]);
  adminSchoolTypes = signal<SchoolType[]>([]);
  adminStudents = signal<Student[]>([]);
  showProgramForm = signal(false);
  showDirectionForm = signal(false);
  showSchoolTypeForm = signal(false);
  editingProgram = signal<Program | null>(null);
  editingDirection = signal<Direction | null>(null);
  editingSchoolType = signal<SchoolType | null>(null);
  schoolTypeError = signal<string | null>(null);
  schoolTypeSuccess = signal<string | null>(null);
  directionError = signal<string | null>(null);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  selectedDirections = signal<Set<string>>(new Set());
  programForm = {
    title: '',
    slug: '',
    description: '',
    ageMin: 5,
    ageMax: 18,
    directionsExtra: '',
    schoolType: 'tech',
    durationWeeks: 12,
    lessonsPerWeek: 1,
    format: '',
    imageUrl: '' as string | null,
    price: null as number | string | null,
    schedule: '',
  };
  directionForm = { name: '' };
  schoolTypeForm = { title: '', description: '' };
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private api: ApiService) {}

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

  loadDirections() {
    this.api.get<{ success: boolean; directions: Direction[] }>('/admin/directions').subscribe({
      next: (res) => { if (res.success) this.adminDirections.set(res.directions); },
    });
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
    this.selectedDirections.set(new Set());
    this.programForm = {
      title: '',
      slug: '',
      description: '',
      ageMin: 5,
      ageMax: 18,
      directionsExtra: '',
      schoolType: 'tech',
      durationWeeks: 12,
      lessonsPerWeek: 1,
      format: '',
      imageUrl: null,
      price: null,
      schedule: '',
    };
    this.showProgramForm.set(true);
  }

  editProgram(p: Program) {
    this.editingProgram.set(p);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const dirs = p.directions || [p.direction];
    const known = new Set(this.adminDirections().map((d) => d.name));
    const selected = new Set<string>();
    const extra: string[] = [];
    for (const d of dirs) {
      if (known.has(d)) selected.add(d);
      else if (d.trim()) extra.push(d.trim());
    }
    this.selectedDirections.set(selected);
    this.programForm = {
      title: p.title,
      slug: p.slug,
      description: p.description,
      ageMin: p.ageMin,
      ageMax: p.ageMax,
      directionsExtra: extra.join(', '),
      schoolType: p.schoolType || 'tech',
      durationWeeks: p.durationWeeks,
      lessonsPerWeek: p.lessonsPerWeek ?? 1,
      format: p.format || '',
      imageUrl: p.imageUrl ?? null,
      price: p.price ?? null,
      schedule: p.schedule ?? '',
    };
    this.showProgramForm.set(true);
  }

  isDirectionSelected(name: string): boolean {
    return this.selectedDirections().has(name);
  }

  toggleDirection(name: string) {
    const next = new Set(this.selectedDirections());
    if (next.has(name)) next.delete(name);
    else next.add(name);
    this.selectedDirections.set(next);
  }

  closeProgramForm() {
    this.showProgramForm.set(false);
    this.editingProgram.set(null);
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  saveProgram() {
    this.errorMessage.set(null);
    if (!this.programForm.title?.trim()) {
      this.errorMessage.set('Название обязательно');
      return;
    }
    if (this.programForm.ageMin > this.programForm.ageMax) {
      this.errorMessage.set('Возраст «от» не может быть больше «до»');
      return;
    }
    const fromCheckboxes = Array.from(this.selectedDirections());
    const fromExtra = this.programForm.directionsExtra.split(',').map((s) => s.trim()).filter(Boolean);
    const dirs = fromCheckboxes.length || fromExtra.length ? [...fromCheckboxes, ...fromExtra] : ['программирование'];

    const body = {
      title: this.programForm.title.trim(),
      slug: this.programForm.slug?.trim() || this.programForm.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-zа-яё0-9-]/gi, ''),
      description: this.programForm.description || '',
      ageMin: this.programForm.ageMin,
      ageMax: this.programForm.ageMax,
      directions: dirs,
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
          this.successMessage.set('Сохранено');
          setTimeout(() => {
            this.closeProgramForm();
            this.loadPrograms();
          }, 500);
        },
        error: (err) => {
          this.errorMessage.set(err.error?.error || 'Ошибка сохранения');
        },
      });
    } else {
      this.api.post<{ success: boolean }>('/admin/programs', body).subscribe({
        next: () => {
          this.successMessage.set('Сохранено');
          setTimeout(() => {
            this.closeProgramForm();
            this.loadPrograms();
          }, 500);
        },
        error: (err) => {
          this.errorMessage.set(err.error?.error || 'Ошибка сохранения');
        },
      });
    }
  }

  deleteProgram(p: Program) {
    if (!confirm('Удалить программу «' + p.title + '»?')) return;
    this.api.delete<{ success: boolean }>(`/admin/programs/${p.id}`).subscribe({
      next: () => this.loadPrograms(),
    });
  }

  openDirectionForm() {
    this.editingDirection.set(null);
    this.directionError.set(null);
    this.directionForm = { name: '' };
    this.showDirectionForm.set(true);
  }

  editDirection(d: Direction) {
    this.editingDirection.set(d);
    this.directionError.set(null);
    this.directionForm = { name: d.name };
    this.showDirectionForm.set(true);
  }

  closeDirectionForm() {
    this.showDirectionForm.set(false);
    this.editingDirection.set(null);
    this.directionError.set(null);
  }

  saveDirection() {
    this.directionError.set(null);
    const name = this.directionForm.name?.trim();
    if (!name) {
      this.directionError.set('Название обязательно');
      return;
    }
    const ed = this.editingDirection();
    if (ed) {
      this.api.put<{ success: boolean }>(`/admin/directions/${ed.id}`, { name }).subscribe({
        next: () => { this.closeDirectionForm(); this.loadDirections(); },
        error: (err) => this.directionError.set(err.error?.error || 'Ошибка сохранения'),
      });
    } else {
      this.api.post<{ success: boolean }>('/admin/directions', { name }).subscribe({
        next: () => { this.closeDirectionForm(); this.loadDirections(); },
        error: (err) => this.directionError.set(err.error?.error || 'Ошибка создания'),
      });
    }
  }

  deleteDirection(d: Direction) {
    if (!confirm('Удалить направление «' + d.name + '»?')) return;
    this.directionError.set(null);
    this.api.delete<{ success: boolean; error?: string }>(`/admin/directions/${d.id}`).subscribe({
      next: () => { this.directionError.set(null); this.loadDirections(); },
      error: (err) => this.directionError.set(err.error?.error || 'Не удалось удалить'),
    });
  }

  editSchoolType(st: SchoolType) {
    this.editingSchoolType.set(st);
    this.schoolTypeError.set(null);
    this.schoolTypeSuccess.set(null);
    this.schoolTypeForm = { title: st.title, description: st.description || '' };
    this.showSchoolTypeForm.set(true);
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
    this.api.put<{ success: boolean; schoolType: SchoolType }>(`/admin/school-types/${st.id}`, {
      title: this.schoolTypeForm.title.trim(),
      description: this.schoolTypeForm.description?.trim() || '',
    }).subscribe({
      next: () => {
        this.schoolTypeSuccess.set('Сохранено');
        this.loadSchoolTypes();
        this.api.get<{ success: boolean; schoolTypes: SchoolType[] }>('/programs/meta/school-types').subscribe({
          next: (r) => { if (r.success) this.schoolTypes.set(r.schoolTypes); },
        });
        setTimeout(() => this.closeSchoolTypeForm(), 800);
      },
      error: (err) => this.schoolTypeError.set(err.error?.error || 'Ошибка сохранения'),
    });
  }

  onSearch(e: Event) {
    const v = (e.target as HTMLInputElement).value.trim();
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.loadStudents(v || undefined), 300);
  }
}
