import { Component, OnInit, signal } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ApiService } from '../../services/api.service';

export interface Program {
  id: string;
  title: string;
  slug: string;
  description: string;
  ageMin: number;
  ageMax: number;
  durationWeeks: number;
  format?: string;
  schoolType?: string;
  imageUrl?: string | null;
  price?: number | null;
  schedule?: string | null;
}

interface SchoolType {
  id: string;
  title: string;
}

@Component({
  selector: 'school-programs',
  standalone: true,
  imports: [RouterLink, TranslateModule],
  template: `
    <div class="container page">
      <h1>{{ 'programs.title' | translate }}</h1>
      <div class="school-tabs">
        <a [routerLink]="['/programs']" [queryParams]="{}" [class.active]="!schoolType()" class="tab">{{ 'programs.all' | translate }}</a>
        @for (st of schoolTypes(); track st.id) {
          <a [routerLink]="['/programs']" [queryParams]="{school_type: st.id}" [class.active]="schoolType() === st.id" class="tab">{{ st.title }}</a>
        }
      </div>
      <div class="filters">
        <select (change)="onAgeChange($event)">
          <option value="">{{ 'programs.allAges' | translate }}</option>
          <option value="5-7">{{ 'programs.age50' | translate }}</option>
          <option value="8-10">{{ 'programs.age810' | translate }}</option>
          <option value="11-13">{{ 'programs.age1113' | translate }}</option>
          <option value="14-18">{{ 'programs.age1418' | translate }}</option>
        </select>
      </div>
      @if (loading()) {
        <p>{{ 'programs.loading' | translate }}</p>
      } @else {
        <div class="grid">
          @for (p of programs(); track p.id) {
            <a [routerLink]="['/programs', p.id]" class="card">
              @if (p.imageUrl) {
                <div class="card-image"><img [src]="p.imageUrl" [alt]="p.title" /></div>
              }
              <div class="card-body">
                <h3>{{ p.title }}</h3>
                <p class="age">{{ p.ageMin }}–{{ p.ageMax }} {{ 'programs.years' | translate }}</p>
                <p class="desc">{{ p.description }}</p>
                <div class="card-meta">
                  @if (p.price != null) {
                    <span class="price">{{ p.price }} ₽</span>
                  }
                </div>
              </div>
            </a>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 2rem 0; }
    .school-tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
      overflow-x: auto;
      padding-bottom: 0.25rem;
      -webkit-overflow-scrolling: touch;
    }
    .school-tabs .tab {
      padding: 0.5rem 1rem;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      white-space: nowrap;
      border-radius: var(--radius);
      background: var(--color-bg-alt);
      text-decoration: none;
      color: var(--color-text);
      border: 1px solid var(--color-border);
      transition: all var(--transition);
    }
    .school-tabs .tab:hover, .school-tabs .tab.active {
      background: var(--color-primary);
      color: white;
      border-color: var(--color-primary);
    }
    .filters { display: flex; gap: 1rem; margin-bottom: 2rem; }
    .filters select {
      padding: 0.5rem 1rem;
      min-height: 44px;
      border-radius: var(--radius);
      border: 1px solid var(--color-border);
      background: var(--color-bg-alt);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1.5rem;
    }
    .card {
      display: flex;
      flex-direction: column;
      padding: 0;
      background: var(--color-bg-alt);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      text-decoration: none;
      color: inherit;
      transition: transform var(--transition), box-shadow var(--transition);
      overflow: hidden;
    }
    .card-image {
      aspect-ratio: 16/9;
      overflow: hidden;
    }
    .card-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .card-body { padding: 1.5rem; }
    .card:hover {
      transform: translateY(-4px);
      box-shadow: var(--shadow-lg);
    }
    @media (max-width: 600px) {
      .filters { flex-direction: column; }
      .grid { grid-template-columns: 1fr; }
    }
    .card h3 { margin: 0 0 0.5rem; }
    .age { color: var(--color-muted); font-size: 0.9rem; margin: 0 0 0.5rem; }
    .desc { margin: 0 0 1rem; font-size: 0.95rem; }
    .card-meta { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
    .price { color: var(--color-accent); font-weight: 600; }
    .badge {
      display: inline-block;
      background: var(--color-primary);
      color: white;
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      font-size: 0.8rem;
    }
  `],
})
export class ProgramsComponent implements OnInit {
  programs = signal<Program[]>([]);
  loading = signal(true);
  schoolTypes = signal<SchoolType[]>([]);
  schoolType = signal<string | null>(null);

  constructor(private api: ApiService, private route: ActivatedRoute) {}

  ngOnInit() {
    this.api.get<{ success: boolean; schoolTypes: SchoolType[] }>('/programs/meta/school-types').subscribe({
      next: (r) => { if (r.success) this.schoolTypes.set(r.schoolTypes); },
    });
    this.route.queryParams.subscribe((qp) => {
      const st = qp['school_type'] || null;
      this.schoolType.set(st);
      this.load(undefined, undefined, st);
    });
  }

  load(ageMin?: number, ageMax?: number, schoolType?: string | null) {
    this.loading.set(true);
    let path = '/programs';
    const params: string[] = [];
    if (ageMin != null) params.push(`age_min=${ageMin}`);
    if (ageMax != null) params.push(`age_max=${ageMax}`);
    if (schoolType) params.push(`school_type=${encodeURIComponent(schoolType)}`);
    if (params.length) path += '?' + params.join('&');

    this.api.get<{ success: boolean; programs: Program[] }>(path).subscribe({
      next: (res) => {
        if (res.success) this.programs.set(res.programs);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onAgeChange(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    if (!v) {
      this.load(undefined, undefined, this.schoolType());
      return;
    }
    const [min, max] = v.split('-').map(Number);
    this.load(min, max, this.schoolType());
  }
}
