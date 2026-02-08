import { Component, OnInit, signal } from '@angular/core';
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
  format?: string;
  schoolType?: string;
}

interface Direction {
  id: number;
  name: string;
  sortOrder: number;
}

interface SchoolType {
  id: string;
  title: string;
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
        <button [class.active]="tab() === 'programs'" (click)="tab.set('programs'); loadPrograms()">Программы</button>
        <button [class.active]="tab() === 'directions'" (click)="tab.set('directions'); loadDirections()">Направления</button>
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
        <button (click)="openProgramForm()" class="btn-add">+ Добавить программу</button>
        <div class="list">
          @for (p of adminPrograms(); track p.id) {
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
              <form (ngSubmit)="saveProgram()">
                <label>Название <input [(ngModel)]="programForm.title" name="title" required /></label>
                <label>Slug <input [(ngModel)]="programForm.slug" name="slug" /></label>
                <label>Описание <textarea [(ngModel)]="programForm.description" name="desc" rows="3"></textarea></label>
                <label>Возраст от <input type="number" [(ngModel)]="programForm.ageMin" name="ageMin" min="5" max="18" /></label>
                <label>Возраст до <input type="number" [(ngModel)]="programForm.ageMax" name="ageMax" min="5" max="18" /></label>
                <label>Направления (через запятую) <input [(ngModel)]="programForm.directionsStr" name="dirs" placeholder="программирование, робототехника" /></label>
                <label>Тип школы
                  <select [(ngModel)]="programForm.schoolType" name="schoolType">
                    @for (st of schoolTypes(); track st.id) {
                      <option [value]="st.id">{{ st.title }}</option>
                    }
                  </select>
                </label>
                <label>Недель <input type="number" [(ngModel)]="programForm.durationWeeks" name="weeks" min="1" /></label>
                <label>Формат <input [(ngModel)]="programForm.format" name="format" placeholder="модульный, годовой" /></label>
                <div class="modal-actions">
                  <button type="button" (click)="closeProgramForm()">Отмена</button>
                  <button type="submit">Сохранить</button>
                </div>
              </form>
            </div>
          </div>
        }
      }

      @if (tab() === 'directions') {
        <button (click)="openDirectionForm()" class="btn-add">+ Добавить направление</button>
        <div class="list">
          @for (d of adminDirections(); track d.id) {
            <div class="row">
              <span>{{ d.name }}</span>
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
    .btn-add { margin-bottom: 1rem; padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: var(--radius); cursor: pointer; }
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
    .age { color: var(--color-muted); }
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
  `],
})
export class AdminComponent implements OnInit {
  tab = signal<'stats' | 'programs' | 'directions' | 'students'>('stats');
  stats = signal<Stats | null>(null);
  adminPrograms = signal<Program[]>([]);
  adminDirections = signal<Direction[]>([]);
  schoolTypes = signal<SchoolType[]>([]);
  adminStudents = signal<Student[]>([]);
  showProgramForm = signal(false);
  showDirectionForm = signal(false);
  editingProgram = signal<Program | null>(null);
  editingDirection = signal<Direction | null>(null);
  programForm = {
    title: '',
    slug: '',
    description: '',
    ageMin: 5,
    ageMax: 18,
    directionsStr: '',
    schoolType: 'tech',
    durationWeeks: 12,
    format: '',
  };
  directionForm = { name: '' };
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadStats();
    this.api.get<{ success: boolean; schoolTypes: SchoolType[] }>('/programs/meta/school-types').subscribe({
      next: (r) => { if (r.success) this.schoolTypes.set(r.schoolTypes); },
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
    this.programForm = { title: '', slug: '', description: '', ageMin: 5, ageMax: 18, directionsStr: '', schoolType: 'tech', durationWeeks: 12, format: '' };
    this.showProgramForm.set(true);
  }

  editProgram(p: Program) {
    this.editingProgram.set(p);
    this.programForm = {
      title: p.title,
      slug: p.slug,
      description: p.description,
      ageMin: p.ageMin,
      ageMax: p.ageMax,
      directionsStr: (p.directions || [p.direction]).join(', '),
      schoolType: p.schoolType || 'tech',
      durationWeeks: p.durationWeeks,
      format: p.format || '',
    };
    this.showProgramForm.set(true);
  }

  closeProgramForm() {
    this.showProgramForm.set(false);
    this.editingProgram.set(null);
  }

  saveProgram() {
    const dirs = this.programForm.directionsStr.split(',').map((s) => s.trim()).filter(Boolean);
    const body = {
      title: this.programForm.title,
      slug: this.programForm.slug || this.programForm.title.toLowerCase().replace(/\s+/g, '-'),
      description: this.programForm.description,
      ageMin: this.programForm.ageMin,
      ageMax: this.programForm.ageMax,
      directions: dirs.length ? dirs : ['программирование'],
      schoolType: this.programForm.schoolType,
      durationWeeks: this.programForm.durationWeeks,
      format: this.programForm.format,
    };
    const ed = this.editingProgram();
    if (ed) {
      this.api.put<{ success: boolean }>(`/admin/programs/${ed.id}`, body).subscribe({
        next: () => { this.closeProgramForm(); this.loadPrograms(); },
      });
    } else {
      this.api.post<{ success: boolean }>('/admin/programs', body).subscribe({
        next: () => { this.closeProgramForm(); this.loadPrograms(); },
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
    this.directionForm = { name: '' };
    this.showDirectionForm.set(true);
  }

  editDirection(d: Direction) {
    this.editingDirection.set(d);
    this.directionForm = { name: d.name };
    this.showDirectionForm.set(true);
  }

  closeDirectionForm() {
    this.showDirectionForm.set(false);
    this.editingDirection.set(null);
  }

  saveDirection() {
    const ed = this.editingDirection();
    if (ed) {
      this.api.put<{ success: boolean }>(`/admin/directions/${ed.id}`, { name: this.directionForm.name }).subscribe({
        next: () => { this.closeDirectionForm(); this.loadDirections(); },
      });
    } else {
      this.api.post<{ success: boolean }>('/admin/directions', { name: this.directionForm.name }).subscribe({
        next: () => { this.closeDirectionForm(); this.loadDirections(); },
      });
    }
  }

  deleteDirection(d: Direction) {
    if (!confirm('Удалить направление «' + d.name + '»?')) return;
    this.api.delete<{ success: boolean }>(`/admin/directions/${d.id}`).subscribe({
      next: () => this.loadDirections(),
    });
  }

  onSearch(e: Event) {
    const v = (e.target as HTMLInputElement).value.trim();
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.loadStudents(v || undefined), 300);
  }
}
