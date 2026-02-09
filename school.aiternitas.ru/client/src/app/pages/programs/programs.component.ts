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
  level?: string;
  isNew?: boolean;
  imageUrl?: string | null;
  price?: number | null;
  schedule?: string | null;
}

interface SchoolType {
  id: string;
  title: string;
  description?: string;
}

@Component({
  selector: 'school-programs',
  standalone: true,
  imports: [RouterLink, TranslateModule],
  template: `
    <div class="container page">
      @if (!schoolType() && !showAll()) {
        <div class="selection-header">
          <h1>{{ 'nav.schools' | translate }}</h1>
          <p class="subtitle">{{ 'section.aboutText1' | translate }}</p>
        </div>
        <div class="school-selection-grid">
          @for (st of schoolTypes(); track st.id) {
            <a [routerLink]="['/programs']" [queryParams]="{school_type: st.id}" class="school-hero-card" [class]="st.id">
              <div class="school-hero-bg" [style.background-image]="'url(' + getSchoolImg(st.id) + ')'"></div>
              <div class="school-hero-content">
                <span class="school-icon">{{ st.id === 'tech' ? '⚡' : '🎨' }}</span>
                <h2>{{ st.title }}</h2>
                <p>{{ st.description }}</p>
                <div class="school-hero-footer">
                  <span>{{ 'hero.viewPrograms' | translate }}</span>
                  <span class="arrow">→</span>
                </div>
              </div>
            </a>
          }
        </div>
      } @else {
        <div class="catalog-header">
          <a [routerLink]="['/programs']" [queryParams]="{}" class="back-to-schools">← {{ 'nav.schools' | translate }}</a>
          <h1>{{ (schoolType() ? getSchoolTitle(schoolType()!) : ('programs.title' | translate)) }}</h1>
          
          <div class="catalog-toolbar">
            <div class="school-tabs-mini">
              <a [routerLink]="['/programs']" [queryParams]="{all: true}" [class.active]="showAll()" class="tab-mini">{{ 'programs.all' | translate }}</a>
              @for (st of schoolTypes(); track st.id) {
                <a [routerLink]="['/programs']" [queryParams]="{school_type: st.id}" [class.active]="schoolType() === st.id" class="tab-mini">{{ st.title }}</a>
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
          </div>
        </div>

        @if (loading()) {
          <div class="loading-state">
            <div class="spinner"></div>
            <p>{{ 'programs.loading' | translate }}</p>
          </div>
        } @else {
          <div class="grid">
            @for (p of programs(); track p.id) {
              <a [routerLink]="['/programs', p.id]" class="card" [class.new]="p.isNew">
                @if (p.imageUrl) {
                  <div class="card-image">
                    <img [src]="p.imageUrl" [alt]="p.title" loading="lazy" />
                    @if (p.isNew) { <span class="badge-float">{{ 'programs.badgeNew' | translate }}</span> }
                  </div>
                }
                <div class="card-body">
                  <div class="card-top">
                    <span class="age-tag">{{ p.ageMin }}–{{ p.ageMax }} {{ 'programs.years' | translate }}</span>
                    <span class="type-tag" [class]="p.schoolType">{{ p.schoolType === 'tech' ? '⚡' : '🎨' }}</span>
                  </div>
                  <h3>{{ p.title }}</h3>
                  <p class="desc">{{ p.description }}</p>
                  <div class="card-footer">
                    <div class="meta-info">
                      <span class="duration">{{ p.durationWeeks }} {{ 'programDetail.weeks' | translate }}</span>
                      @if (p.price != null) {
                        <span class="price">{{ p.price }} ₽</span>
                      }
                    </div>
                    <span class="btn-more">→</span>
                  </div>
                </div>
              </a>
            }
          </div>
          
          @if (!loading() && programs().length === 0) {
            <div class="empty-state">
              <p>{{ 'admin.noPrograms' | translate }}</p>
              <a [routerLink]="['/programs']" [queryParams]="{all: true}" class="btn-hero btn-secondary">{{ 'programs.all' | translate }}</a>
            </div>
          }
        }
      }
    </div>
  `,
  styles: [`
    .page { padding: 3rem 0; min-height: 80vh; }
    
    /* Selection Mode */
    .selection-header { text-align: center; margin-bottom: 3rem; }
    .selection-header h1 { font-size: 3rem; font-weight: 800; margin-bottom: 0.5rem; }
    .subtitle { color: var(--color-muted); font-size: 1.1rem; max-width: 600px; margin: 0 auto; }
    
    .school-selection-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
    .school-hero-card {
      position: relative;
      min-height: 400px;
      border-radius: var(--radius-lg);
      overflow: hidden;
      display: flex;
      align-items: flex-end;
      text-decoration: none;
      color: white;
      transition: transform var(--transition), box-shadow var(--transition);
      border: 1px solid var(--color-border);
    }
    .school-hero-card:hover { transform: translateY(-8px); box-shadow: var(--shadow-lg); }
    .school-hero-bg {
      position: absolute;
      inset: 0;
      background-size: cover;
      background-position: center;
      transition: transform 0.6s ease;
    }
    .school-hero-card:hover .school-hero-bg { transform: scale(1.05); }
    .school-hero-bg::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(to top, rgba(15,15,26,0.95) 0%, rgba(15,15,26,0.6) 40%, transparent 100%);
    }
    .school-hero-content { position: relative; z-index: 1; padding: 2.5rem; width: 100%; }
    .school-icon { font-size: 3rem; display: block; margin-bottom: 1rem; }
    .school-hero-card.tech { border-color: rgba(99,102,241,0.3); }
    .school-hero-card.art { border-color: rgba(168,85,247,0.3); }
    
    .school-hero-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.1); }
    .school-hero-footer span:first-child { font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.9rem; }
    .school-hero-footer .arrow { font-size: 1.5rem; transition: transform var(--transition); }
    .school-hero-card:hover .arrow { transform: translateX(8px); }

    /* Catalog Mode */
    .catalog-header { margin-bottom: 3rem; }
    .back-to-schools { color: var(--color-muted); font-size: 0.9rem; display: block; margin-bottom: 1rem; }
    .catalog-header h1 { font-size: 2.5rem; margin-bottom: 1.5rem; }
    
    .catalog-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 2rem; flex-wrap: wrap; }
    .school-tabs-mini { display: flex; gap: 0.5rem; background: var(--color-bg-alt); padding: 0.4rem; border-radius: 2rem; border: 1px solid var(--color-border); }
    .tab-mini { padding: 0.5rem 1.25rem; border-radius: 1.5rem; font-size: 0.9rem; font-weight: 500; color: var(--color-muted); transition: all var(--transition); }
    .tab-mini.active { background: var(--color-primary); color: white; }
    .filters select { padding: 0.6rem 1.25rem; border-radius: var(--radius); border: 1px solid var(--color-border); background: var(--color-bg-alt); color: var(--color-text); cursor: pointer; }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 2rem; }
    .card { background: var(--color-bg-alt); border-radius: var(--radius-lg); overflow: hidden; display: flex; flex-direction: column; transition: transform var(--transition), box-shadow var(--transition); border: 1px solid var(--color-border); }
    .card:hover { transform: translateY(-6px); box-shadow: var(--shadow-lg); border-color: var(--color-primary); }
    .card-image { position: relative; aspect-ratio: 16/10; overflow: hidden; }
    .card-image img { width: 100%; height: 100%; object-fit: cover; }
    .badge-float { position: absolute; top: 1rem; left: 1rem; background: var(--color-primary); color: white; padding: 0.25rem 0.75rem; border-radius: 2rem; font-size: 0.8rem; font-weight: 700; }
    
    .card-body { padding: 1.5rem; flex: 1; display: flex; flex-direction: column; }
    .card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
    .age-tag { font-size: 0.8rem; color: var(--color-muted); background: rgba(99,102,241,0.1); padding: 0.2rem 0.6rem; border-radius: 4px; }
    .type-tag.tech { color: var(--color-primary); }
    .type-tag.art { color: var(--color-accent); }
    
    .card h3 { font-size: 1.25rem; margin-bottom: 0.75rem; line-height: 1.3; }
    .card .desc { color: var(--color-muted); font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.5rem; flex: 1; }
    
    .card-footer { display: flex; justify-content: space-between; align-items: flex-end; padding-top: 1.5rem; border-top: 1px solid var(--color-border); }
    .meta-info { display: flex; flex-direction: column; gap: 0.25rem; }
    .duration { font-size: 0.85rem; color: var(--color-muted); }
    .price { font-weight: 700; color: var(--color-accent); font-size: 1.1rem; }
    .btn-more { font-size: 1.5rem; color: var(--color-primary); transition: transform var(--transition); }
    .card:hover .btn-more { transform: translateX(5px); }

    .loading-state { text-align: center; padding: 5rem 0; }
    .spinner { width: 40px; height: 40px; border: 3px solid rgba(99,102,241,0.1); border-top-color: var(--color-primary); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1.5rem; }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 800px) {
      .school-selection-grid { grid-template-columns: 1fr; }
      .catalog-toolbar { flex-direction: column; align-items: stretch; gap: 1rem; }
    }
  `],
})
export class ProgramsComponent implements OnInit {
  programs = signal<Program[]>([]);
  loading = signal(true);
  schoolTypes = signal<SchoolType[]>([]);
  schoolType = signal<string | null>(null);
  showAll = signal(false);

  constructor(private api: ApiService, private route: ActivatedRoute) { }

  ngOnInit() {
    this.api.get<{ success: boolean; schoolTypes: SchoolType[] }>('/programs/meta/school-types').subscribe({
      next: (r) => { if (r.success) this.schoolTypes.set(r.schoolTypes); },
    });
    this.route.queryParams.subscribe((qp) => {
      const st = qp['school_type'] || null;
      const all = qp['all'] === 'true';
      const ageMin = qp['age_min'] != null ? parseInt(qp['age_min'], 10) : undefined;
      const ageMax = qp['age_max'] != null ? parseInt(qp['age_max'], 10) : undefined;
      this.schoolType.set(st);
      this.showAll.set(all);
      this.load(ageMin, ageMax, st, all);
    });
  }

  load(ageMin?: number, ageMax?: number, schoolType?: string | null, all?: boolean) {
    if (!schoolType && !all) {
      this.loading.set(false);
      return;
    }
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

  getSchoolImg(id: string): string {
    return id === 'tech' ? 'gallery-tech-class.png' : 'gallery-art-class.png';
  }

  getSchoolTitle(id: string): string {
    return this.schoolTypes().find(s => s.id === id)?.title || id;
  }

  onAgeChange(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    if (!v) {
      this.load(undefined, undefined, this.schoolType(), this.showAll());
      return;
    }
    const [min, max] = v.split('-').map(Number);
    this.load(min, max, this.schoolType(), this.showAll());
  }
}
