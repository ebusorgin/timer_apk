import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ParticleCanvasComponent } from '../../components/particle-canvas/particle-canvas.component';
import { ScrollRevealDirective } from '../../directives/scroll-reveal.directive';

@Component({
  selector: 'school-landing',
  standalone: true,
  imports: [RouterLink, ParticleCanvasComponent, ScrollRevealDirective],
  template: `
    <section class="hero">
      <div class="hero-bg">
        <img src="hero-dynamic.png" alt="" class="hero-img" />
        <div class="hero-overlay"></div>
        <div class="hero-glow"></div>
        <school-particle-canvas></school-particle-canvas>
      </div>
      <div class="container hero-content">
        <p class="hero-badge">Код и кисть</p>
        <h1 class="hero-title">
          <span class="hero-title-line">Программируй.</span>
          <span class="hero-title-line">Рисуй.</span>
          <span class="hero-title-accent">Твори.</span>
        </h1>
        <p class="hero-subtitle">
          Где технологии встречаются с искусством
        </p>
        <div class="hero-actions">
          <a routerLink="/programs" class="btn-hero btn-primary">
            <span>Смотреть программы</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </a>
          <a routerLink="/register" class="btn-hero btn-ghost">Записаться</a>
        </div>
      </div>
    </section>
    <section class="directions">
      <div class="container">
        <h2 class="section-title" schoolScrollReveal>Выберите направление</h2>
        <div class="school-types">
          <a routerLink="/programs" [queryParams]="{school_type: 'tech'}" class="school-card tech" schoolScrollReveal>
            <div class="school-card-bg" [style.background-image]="'url(' + techBg + ')'"></div>
            <div class="school-card-body">
              <div class="school-card-icon">⚡</div>
              <h3>Техническая школа</h3>
              <p>Программирование, робототехника, микроконтроллеры, нейросети, радиотехника</p>
              <span class="school-card-arrow">→</span>
            </div>
          </a>
          <a routerLink="/programs" [queryParams]="{school_type: 'art'}" class="school-card art" schoolScrollReveal>
            <div class="school-card-bg" [style.background-image]="'url(' + artBg + ')'"></div>
            <div class="school-card-body">
              <div class="school-card-icon">🎨</div>
              <h3>Художественная школа</h3>
              <p>Рисование, живопись, графика, декоративно-прикладное искусство, дизайн</p>
              <span class="school-card-arrow">→</span>
            </div>
          </a>
        </div>
        <div class="grid">
          @for (d of directions; track d) {
            <div class="card" schoolScrollReveal>{{ d }}</div>
          }
        </div>
      </div>
    </section>
    <section class="cta" schoolScrollReveal>
      <div class="container">
        <div class="cta-content">
          <h2>Готовы начать?</h2>
          <p>Зарегистрируйтесь и запишитесь на программу</p>
          <a routerLink="/register" class="btn-hero btn-primary btn-lg">
            <span>Регистрация</span>
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
      background: linear-gradient(to top, rgba(15,15,26,0.95) 0%, rgba(15,15,26,0.6) 40%, transparent 70%);
    }
    .school-card.tech .school-card-bg::after {
      background: linear-gradient(to top, rgba(15,15,26,0.95) 0%, rgba(99,102,241,0.2) 40%, transparent 70%);
    }
    .school-card.art .school-card-bg::after {
      background: linear-gradient(to top, rgba(15,15,26,0.95) 0%, rgba(168,85,247,0.2) 40%, transparent 70%);
    }
    .school-card-body {
      position: relative;
      z-index: 1;
      padding: 2.5rem;
      width: 100%;
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
    }
    .school-card p {
      margin: 0;
      color: var(--color-muted);
      line-height: 1.6;
    }
    .school-card-arrow {
      position: absolute;
      bottom: 2rem;
      right: 2rem;
      font-size: 1.5rem;
      opacity: 0.6;
      transition: transform var(--transition);
    }
    .school-card:hover .school-card-arrow {
      transform: translateX(6px);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 1rem;
    }
    .card {
      padding: 1.5rem;
      background: var(--color-bg-card);
      border-radius: var(--radius);
      text-align: center;
      font-weight: 600;
      border: 1px solid var(--color-border);
      transition: transform var(--transition), border-color var(--transition);
    }
    .card:hover {
      transform: translateY(-4px);
      border-color: var(--color-primary);
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
    .grid .card[schoolScrollReveal] { transition-duration: 0.5s; }
    .grid .card:nth-child(1) { transition-delay: 0.05s; }
    .grid .card:nth-child(2) { transition-delay: 0.1s; }
    .grid .card:nth-child(3) { transition-delay: 0.15s; }
    .grid .card:nth-child(4) { transition-delay: 0.2s; }
    .grid .card:nth-child(5) { transition-delay: 0.25s; }
    .grid .card:nth-child(6) { transition-delay: 0.3s; }
    @media (max-width: 600px) {
      .hero { min-height: 70vh; }
      .hero-title { font-size: 2rem; }
      .hero-subtitle { font-size: 1rem; }
      .hero-actions { flex-direction: column; }
      .btn-hero { justify-content: center; }
      .grid { grid-template-columns: repeat(2, 1fr); }
    }
  `],
})
export class LandingComponent {
  directions = ['Программирование', 'Робототехника', 'Нейросети', 'Рисование', 'Живопись', 'Дизайн'];
  techBg = 'tech-class.png';
  artBg = 'art-class.png';
}
