import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ParticleCanvasComponent } from '../../components/particle-canvas/particle-canvas.component';
import { ScrollRevealDirective } from '../../directives/scroll-reveal.directive';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'school-landing',
  standalone: true,
  imports: [RouterLink, TranslateModule, ParticleCanvasComponent, ScrollRevealDirective],
  template: `
    <section class="hero">
      <div class="hero-bg">
        <img src="hero-dynamic.png" alt="" class="hero-img" />
        <div class="hero-overlay"></div>
        <div class="hero-glow"></div>
        <school-particle-canvas></school-particle-canvas>
      </div>
      <div class="container hero-content">
        <p class="hero-badge">{{ 'hero.badge' | translate }}</p>
        <h1 class="hero-title">
          <span class="hero-title-line">{{ 'hero.title1' | translate }}</span>
          <span class="hero-title-accent">{{ 'hero.title2' | translate }}</span>
        </h1>
        <p class="hero-subtitle">{{ 'hero.subtitle' | translate }}</p>
        <div class="hero-actions">
          <a routerLink="/programs" class="btn-hero btn-primary">
            <span>{{ 'hero.viewPrograms' | translate }}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </a>
          <a routerLink="/register" class="btn-hero btn-ghost">{{ 'hero.signUp' | translate }}</a>
        </div>
      </div>
    </section>
    <section class="directions">
      <div class="container">
        <h2 class="section-title" schoolScrollReveal>{{ 'section.schoolType' | translate }}</h2>
        <div class="school-types">
          @for (st of schoolTypes(); track st.id) {
            <a [routerLink]="['/school-types', st.id]" class="school-card" [class.tech]="st.id === 'tech'" [class.art]="st.id === 'art'" schoolScrollReveal>
              <div class="school-card-bg" [style.background-image]="'url(' + getBg(st.id) + ')'"></div>
              <div class="school-card-body">
                <div class="school-card-icon">{{ st.id === 'tech' ? '⚡' : '🎨' }}</div>
                <h3>{{ st.title }}</h3>
                <p>{{ st.description || '' }}</p>
                <span class="school-card-arrow">→</span>
              </div>
            </a>
          }
        </div>
      </div>
    </section>
    <section class="about">
      <div class="container">
        <div class="about-grid" schoolScrollReveal>
          <div class="about-image">
            <img src="hero-school.png" alt="Занятия в школе" />
          </div>
          <div class="about-text">
            <h2 class="section-title">{{ 'section.about' | translate }}</h2>
            <p>{{ 'section.aboutText1' | translate }}</p>
            <p>{{ 'section.aboutText2' | translate }}</p>
            <ul class="about-list">
              <li>{{ 'section.aboutItem1' | translate }}</li>
              <li>{{ 'section.aboutItem2' | translate }}</li>
              <li>{{ 'section.aboutItem3' | translate }}</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
    <section class="benefits">
      <div class="container">
        <h2 class="section-title" schoolScrollReveal>{{ 'section.whyUs' | translate }}</h2>
        <div class="benefits-grid">
          @for (b of benefits; track b.icon) {
            <div class="benefit-card" schoolScrollReveal>
              <span class="benefit-icon">{{ b.icon }}</span>
              <h3>{{ b.titleKey | translate }}</h3>
              <p>{{ b.textKey | translate }}</p>
            </div>
          }
        </div>
      </div>
    </section>
    <section class="ages">
      <div class="container">
        <h2 class="section-title" schoolScrollReveal>{{ 'section.ages' | translate }}</h2>
        <div class="ages-grid">
          @for (a of ageGroups; track a.rangeKey) {
            <div class="age-card" schoolScrollReveal>
              <div class="age-image" [style.background-image]="'url(' + a.img + ')'"></div>
              <div class="age-body">
                <span class="age-range">{{ a.rangeKey | translate }} {{ 'programs.years' | translate }}</span>
                <h3>{{ a.titleKey | translate }}</h3>
                <p>{{ a.descKey | translate }}</p>
              </div>
            </div>
          }
        </div>
      </div>
    </section>
    <section class="how">
      <div class="container">
        <h2 class="section-title" schoolScrollReveal>{{ 'section.how' | translate }}</h2>
        <div class="steps">
          @for (s of steps; track s.titleKey; let i = $index) {
            <div class="step" schoolScrollReveal>
              <span class="step-num">{{ i + 1 }}</span>
              <h3>{{ s.titleKey | translate }}</h3>
              <p>{{ s.textKey | translate }}</p>
            </div>
          }
        </div>
      </div>
    </section>
    <section class="gallery">
      <div class="container">
        <h2 class="section-title" schoolScrollReveal>{{ 'section.gallery' | translate }}</h2>
        <div class="gallery-grid" schoolScrollReveal>
          <div class="gallery-item"><img src="gallery-tech-class.png" alt="Технические занятия" /></div>
          <div class="gallery-item"><img src="gallery-art-class.png" alt="Художественные занятия" /></div>
          <div class="gallery-item"><img src="gallery-robotics.png" alt="Робототехника" /></div>
          <div class="gallery-item"><img src="gallery-creative.png" alt="Творческие проекты" /></div>
        </div>
      </div>
    </section>
    <section class="cta" schoolScrollReveal>
      <div class="container">
        <div class="cta-content">
          <h2>{{ 'cta.title' | translate }}</h2>
          <p>{{ 'cta.subtitle' | translate }}</p>
          <a routerLink="/register" class="btn-hero btn-primary btn-lg">
            <span>{{ 'cta.register' | translate }}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </a>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .hero {
      position: relative;
      min-height: 85vh;
      display: flex;
      align-items: center;
      overflow: hidden;
    }
    .hero-bg {
      position: absolute;
      inset: 0;
      z-index: 0;
    }
    .hero-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0.4;
    }
    .hero-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(15,15,26,0.95) 0%, rgba(26,26,46,0.85) 50%, rgba(99,102,241,0.2) 100%);
    }
    .hero-glow {
      position: absolute;
      top: -50%;
      right: -20%;
      width: 80%;
      height: 100%;
      background: radial-gradient(ellipse, rgba(99,102,241,0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .hero-content {
      position: relative;
      z-index: 1;
      text-align: center;
      padding: 4rem 1.5rem;
    }
    .hero-badge {
      display: inline-block;
      padding: 0.4rem 1rem;
      background: rgba(99,102,241,0.2);
      border: 1px solid rgba(99,102,241,0.4);
      border-radius: 2rem;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--color-accent);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 1.5rem;
      animation: fadeInUp 0.6s ease;
    }
    .hero-title {
      font-family: var(--font-display);
      font-size: clamp(2.5rem, 6vw, 4.5rem);
      font-weight: 800;
      line-height: 1.1;
      margin: 0 0 1.5rem;
      letter-spacing: -0.02em;
      animation: fadeInUp 0.6s ease 0.1s both;
    }
    .hero-title-line {
      display: block;
      color: var(--color-text);
    }
    .hero-title-accent {
      display: block;
      background: linear-gradient(135deg, #6366f1, #a855f7, #06b6d4, #6366f1);
      background-size: 300% 300%;
      animation: gradientShift 4s ease infinite;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    @keyframes gradientShift {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }
    .hero-subtitle {
      font-size: 1.15rem;
      color: var(--color-muted);
      max-width: 560px;
      margin: 0 auto 2.5rem;
      line-height: 1.7;
      animation: fadeInUp 0.6s ease 0.2s both;
    }
    .hero-actions {
      display: flex;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
      animation: fadeInUp 0.6s ease 0.3s both;
    }
    .btn-hero {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.9rem 1.75rem;
      border-radius: var(--radius);
      font-weight: 600;
      font-size: 1rem;
      text-decoration: none;
      transition: transform var(--transition), box-shadow var(--transition);
    }
    .btn-hero:hover {
      transform: translateY(-3px);
    }
    .btn-hero svg {
      transition: transform var(--transition);
    }
    .btn-hero:hover svg {
      transform: translateX(4px);
    }
    .btn-primary {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white;
      box-shadow: 0 10px 40px -10px rgba(99,102,241,0.5);
    }
    .btn-primary:hover {
      box-shadow: 0 20px 50px -15px rgba(99,102,241,0.6);
    }
    .btn-ghost {
      background: rgba(255,255,255,0.08);
      color: var(--color-text);
      border: 1px solid rgba(255,255,255,0.2);
    }
    .btn-ghost:hover {
      background: rgba(255,255,255,0.12);
    }
    .btn-lg {
      padding: 1rem 2rem;
      font-size: 1.1rem;
    }
    .directions {
      padding: 6rem 0;
      background: var(--color-bg-alt);
    }
    .section-title {
      font-family: var(--font-display);
      font-size: 2.25rem;
      font-weight: 700;
      text-align: center;
      margin: 0 0 3rem;
      color: var(--color-text);
    }
    .school-types {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 2rem;
      margin-bottom: 3rem;
    }
    .school-card {
      position: relative;
      min-height: 320px;
      border-radius: var(--radius-lg);
      text-decoration: none;
      color: inherit;
      overflow: hidden;
      transition: transform var(--transition), box-shadow var(--transition);
      border: 1px solid var(--color-border);
      display: flex;
      align-items: flex-end;
    }
    .school-card:hover {
      transform: translateY(-6px) scale(1.01);
      box-shadow: var(--shadow-lg);
    }
    .school-card-bg {
      position: absolute;
      inset: 0;
      background-size: cover;
      background-position: center;
      transition: transform 0.6s ease;
    }
    .school-card:hover .school-card-bg {
      transform: scale(1.08);
    }
    .school-card-bg::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(to top, rgba(15,15,26,0.98) 0%, rgba(15,15,26,0.85) 35%, rgba(15,15,26,0.4) 60%, transparent 80%);
    }
    .school-card.tech .school-card-bg::after {
      background: linear-gradient(to top, rgba(15,15,26,0.98) 0%, rgba(15,15,26,0.85) 35%, rgba(99,102,241,0.3) 60%, transparent 80%);
    }
    .school-card.art .school-card-bg::after {
      background: linear-gradient(to top, rgba(15,15,26,0.98) 0%, rgba(15,15,26,0.85) 35%, rgba(168,85,247,0.3) 60%, transparent 80%);
    }
    .school-card-body {
      position: relative;
      z-index: 1;
      padding: 2.5rem;
      width: 100%;
      color: #fff;
      text-shadow: 0 1px 3px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6);
    }
    .school-card.tech {
      background: linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(6,182,212,0.1) 100%);
      border-color: rgba(99,102,241,0.3);
    }
    .school-card.art {
      background: linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(236,72,153,0.1) 100%);
      border-color: rgba(168,85,247,0.3);
    }
    .school-card-icon {
      font-size: 2.5rem;
      margin-bottom: 1rem;
    }
    .school-card h3 {
      font-family: var(--font-display);
      font-size: 1.5rem;
      margin: 0 0 0.5rem;
      color: inherit;
      font-weight: 700;
    }
    .school-card p {
      margin: 0;
      color: rgba(255,255,255,0.95);
      line-height: 1.6;
    }
    .school-card-arrow {
      position: absolute;
      bottom: 2rem;
      right: 2rem;
      font-size: 1.5rem;
      opacity: 0.9;
      color: #fff;
      text-shadow: 0 1px 3px rgba(0,0,0,0.8);
      transition: transform var(--transition);
    }
    .school-card:hover .school-card-arrow {
      transform: translateX(6px);
    }
    .cta {
      padding: 6rem 0;
      text-align: center;
    }
    .cta-content {
      max-width: 560px;
      margin: 0 auto;
    }
    .cta h2 {
      font-family: var(--font-display);
      font-size: 2rem;
      margin: 0 0 0.5rem;
    }
    .cta p {
      color: var(--color-muted);
      margin: 0 0 2rem;
    }
    .about {
      padding: 6rem 0;
      background: var(--color-bg);
    }
    .about-grid {
      display: grid;
      grid-template-columns: 1fr 1.2fr;
      gap: 3rem;
      align-items: center;
    }
    .about-image {
      border-radius: var(--radius-lg);
      overflow: hidden;
      box-shadow: var(--shadow-lg);
    }
    .about-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      min-height: 280px;
    }
    .about-text .section-title { text-align: left; margin-bottom: 1.5rem; }
    .about-text p { color: var(--color-muted); line-height: 1.7; margin: 0 0 1rem; }
    .about-list {
      margin: 1.5rem 0 0;
      padding: 0;
      list-style: none;
    }
    .about-list li {
      padding: 0.5rem 0 0.5rem 1.75rem;
      position: relative;
      color: var(--color-muted);
    }
    .about-list li::before {
      content: '✓';
      position: absolute;
      left: 0;
      color: var(--color-accent);
      font-weight: 700;
    }
    .benefits {
      padding: 6rem 0;
      background: var(--color-bg-alt);
    }
    .benefits-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1.5rem;
    }
    .benefit-card {
      padding: 2rem;
      background: var(--color-bg-card);
      border-radius: var(--radius);
      border: 1px solid var(--color-border);
      transition: transform var(--transition), border-color var(--transition);
    }
    .benefit-card:hover {
      transform: translateY(-4px);
      border-color: var(--color-primary);
    }
    .benefit-icon { font-size: 2rem; display: block; margin-bottom: 1rem; }
    .benefit-card h3 { font-size: 1.1rem; margin: 0 0 0.5rem; }
    .benefit-card p { margin: 0; font-size: 0.95rem; color: var(--color-muted); line-height: 1.6; }
    .ages {
      padding: 6rem 0;
      background: var(--color-bg);
    }
    .ages-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
    }
    .age-card {
      border-radius: var(--radius-lg);
      overflow: hidden;
      border: 1px solid var(--color-border);
      transition: transform var(--transition), box-shadow var(--transition);
    }
    .age-card:hover {
      transform: translateY(-4px);
      box-shadow: var(--shadow-lg);
    }
    .age-image {
      height: 140px;
      background-size: cover;
      background-position: center;
    }
    .age-body { padding: 1.5rem; }
    .age-range {
      display: inline-block;
      padding: 0.25rem 0.6rem;
      background: rgba(99,102,241,0.2);
      border-radius: 1rem;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--color-accent);
      margin-bottom: 0.75rem;
    }
    .age-card h3 { font-size: 1.25rem; margin: 0 0 0.5rem; }
    .age-card p { margin: 0; font-size: 0.9rem; color: var(--color-muted); line-height: 1.5; }
    .how {
      padding: 6rem 0;
      background: var(--color-bg-alt);
    }
    .steps {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 2rem;
      max-width: 900px;
      margin: 0 auto;
    }
    .step {
      text-align: center;
      padding: 2rem 1.5rem;
      position: relative;
    }
    .step-num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border-radius: 50%;
      font-weight: 800;
      font-size: 1.25rem;
      margin-bottom: 1rem;
    }
    .step h3 { font-size: 1.1rem; margin: 0 0 0.5rem; }
    .step p { margin: 0; font-size: 0.95rem; color: var(--color-muted); line-height: 1.6; }
    .gallery {
      padding: 6rem 0;
      background: var(--color-bg);
    }
    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
    }
    .gallery-item {
      border-radius: var(--radius);
      overflow: hidden;
      aspect-ratio: 4/3;
      transition: transform var(--transition);
    }
    .gallery-item:hover { transform: scale(1.02); }
    .gallery-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(24px); }
      to { opacity: 1; transform: translateY(0); }
    }
    [schoolScrollReveal] {
      opacity: 0;
      transform: translateY(40px);
      transition: opacity 0.7s ease, transform 0.7s ease;
    }
    [schoolScrollReveal].revealed {
      opacity: 1;
      transform: translateY(0);
    }
    .school-card[schoolScrollReveal].revealed { transition-delay: 0.1s; }
    @media (max-width: 768px) {
      .about-grid { grid-template-columns: 1fr; }
      .about-image { order: -1; }
      .ages-grid { grid-template-columns: 1fr; }
      .steps { grid-template-columns: 1fr; }
      .gallery-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 600px) {
      .hero { min-height: 70vh; }
      .hero-title { font-size: 2rem; }
      .hero-subtitle { font-size: 1rem; }
      .hero-actions { flex-direction: column; }
      .btn-hero { justify-content: center; }
    }
  `],
})
export class LandingComponent implements OnInit {
  schoolTypes = signal<{ id: string; title: string; description?: string }[]>([]);

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.get<{ success: boolean; schoolTypes: { id: string; title: string; description?: string }[] }>('/programs/meta/school-types').subscribe({
      next: (r) => { if (r.success) this.schoolTypes.set(r.schoolTypes); },
    });
  }

  getBg(id: string): string {
    return id === 'tech' ? 'tech-class.png' : id === 'art' ? 'art-class.png' : 'hero-dynamic.png';
  }
  benefits = [
    { icon: '🎯', titleKey: 'benefit1.title', textKey: 'benefit1.text' },
    { icon: '📈', titleKey: 'benefit2.title', textKey: 'benefit2.text' },
    { icon: '👥', titleKey: 'benefit3.title', textKey: 'benefit3.text' },
    { icon: '🔧', titleKey: 'benefit4.title', textKey: 'benefit4.text' },
  ];
  ageGroups = [
    { rangeKey: 'age1.range', titleKey: 'age1.title', descKey: 'age1.desc', img: 'tech-class.png' },
    { rangeKey: 'age2.range', titleKey: 'age2.title', descKey: 'age2.desc', img: 'art-class.png' },
    { rangeKey: 'age3.range', titleKey: 'age3.title', descKey: 'age3.desc', img: 'teens-coding.png' },
  ];
  steps = [
    { titleKey: 'step1.title', textKey: 'step1.text' },
    { titleKey: 'step2.title', textKey: 'step2.text' },
    { titleKey: 'step3.title', textKey: 'step3.text' },
  ];
}
