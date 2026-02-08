import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';

interface Program {
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
}

interface SchoolType {
  id: string;
  title: string;
  description?: string;
}

@Component({
  selector: 'school-school-type-detail',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="container page">
      @if (loading()) {
        <p>Загрузка...</p>
      } @else if (schoolType()) {
        <a routerLink="/" class="back">← На главную</a>
        <div class="school-type-header">
          <h1>{{ schoolType()!.title }}</h1>
          @if (schoolType()!.description) {
            <p class="description">{{ schoolType()!.description }}</p>
          }
        </div>
        <h2 class="programs-title">Программы</h2>
        <div class="grid">
          @for (p of programs(); track p.id) {
            <a [routerLink]="['/programs', p.id]" [queryParams]="{from: schoolType()!.id}" class="card">
              @if (p.imageUrl) {
                <div class="card-image"><img [src]="p.imageUrl" [alt]="p.title" /></div>
              }
              <div class="card-body">
                <h3>{{ p.title }}</h3>
                <p class="age">{{ p.ageMin }}–{{ p.ageMax }} лет</p>
                <p class="desc">{{ p.description }}</p>
                @if (p.price != null) {
                  <span class="price">{{ p.price }} ₽</span>
                }
              </div>
            </a>
          }
        </div>
      } @else {
        <p>Тип школы не найден</p>
      }
    </div>
  `,
  styles: [`
    .page { padding: 2rem 0; }
    .back { display: inline-block; margin-bottom: 1rem; color: var(--color-muted); text-decoration: none; }
    .school-type-header { margin-bottom: 2rem; }
    .school-type-header h1 { margin: 0 0 0.5rem; }
    .description { color: var(--color-muted); margin: 0; }
    .programs-title { margin-bottom: 1.5rem; font-size: 1.25rem; }
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
    .card h3 { margin: 0 0 0.5rem; }
    .age { color: var(--color-muted); font-size: 0.9rem; margin: 0 0 0.5rem; }
    .desc { margin: 0 0 1rem; font-size: 0.95rem; }
    .price { color: var(--color-accent); font-weight: 600; }
    @media (max-width: 600px) {
      .grid { grid-template-columns: 1fr; }
    }
  `],
})
export class SchoolTypeDetailComponent implements OnInit {
  schoolType = signal<SchoolType | null>(null);
  programs = signal<Program[]>([]);
  loading = signal(true);

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.api.get<{ success: boolean; schoolType: SchoolType; programs: Program[] }>(`/school-types/${id}`).subscribe({
      next: (res) => {
        if (res.success) {
          this.schoolType.set(res.schoolType);
          this.programs.set(res.programs);
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
