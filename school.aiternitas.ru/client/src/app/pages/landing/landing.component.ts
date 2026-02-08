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
        <p class="hero-badge">Образование будущего</p>
        <h1 class="hero-title">
          <span class="hero-title-line">Школа для</span>
          <span class="hero-title-accent">творческих умов</span>
        </h1>
        <p class="hero-subtitle">
          Техническая школа: программирование, робототехника, нейросети. Художественная школа: рисование, живопись, дизайн. Гибкие программы для детей 5–18 лет.
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
    <section class="about">
      <div class="container">
        <div class="about-grid" schoolScrollReveal>
          <div class="about-image">
            <img src="hero-school.png" alt="Занятия в школе" />
          </div>
          <div class="about-text">
            <h2 class="section-title">О школе</h2>
            <p>Мы объединяем техническое и художественное образование под одной крышей. Дети учатся программировать, собирать роботов и работать с нейросетями — а также рисовать, лепить и создавать дизайн.</p>
            <p>Небольшие группы, внимательные педагоги, современное оборудование. Программы построены по принципу «от простого к сложному» и учитывают индивидуальный темп каждого ребёнка.</p>
            <ul class="about-list">
              <li>Опытные преподаватели с практикой в IT и искусстве</li>
              <li>Гибкое расписание и форматы занятий</li>
              <li>Доступ к материалам и проектам после курса</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
    <section class="benefits">
      <div class="container">
        <h2 class="section-title" schoolScrollReveal>Почему выбирают нас</h2>
        <div class="benefits-grid">
          @for (b of benefits; track b.icon) {
            <div class="benefit-card" schoolScrollReveal>
              <span class="benefit-icon">{{ b.icon }}</span>
              <h3>{{ b.title }}</h3>
              <p>{{ b.text }}</p>
            </div>
          }
        </div>
      </div>
    </section>
    <section class="ages">
      <div class="container">
        <h2 class="section-title" schoolScrollReveal>Программы по возрастам</h2>
        <div class="ages-grid">
          @for (a of ageGroups; track a.range) {
            <div class="age-card" schoolScrollReveal>
              <div class="age-image" [style.background-image]="'url(' + a.img + ')'"></div>
              <div class="age-body">
                <span class="age-range">{{ a.range }} лет</span>
                <h3>{{ a.title }}</h3>
                <p>{{ a.desc }}</p>
              </div>
            </div>
          }
        </div>
      </div>
    </section>
    <section class="how">
      <div class="container">
        <h2 class="section-title" schoolScrollReveal>Как записаться</h2>
        <div class="steps">
          @for (s of steps; track s.title; let i = $index) {
            <div class="step" schoolScrollReveal>
              <span class="step-num">{{ i + 1 }}</span>
              <h3>{{ s.title }}</h3>
              <p>{{ s.text }}</p>
            </div>
          }
        </div>
      </div>
    </section>
    <section class="gallery">
      <div class="container">
        <h2 class="section-title" schoolScrollReveal>Жизнь школы</h2>
        <div class="gallery-grid" schoolScrollReveal>
          <div class="gallery-item"><img src="tech-class.png" alt="Технические занятия" /></div>
          <div class="gallery-item"><img src="art-class.png" alt="Художественные занятия" /></div>
          <div class="gallery-item"><img src="hero-dynamic.png" alt="Обучение" /></div>
          <div class="gallery-item"><img src="hero-school.png" alt="Школа" /></div>
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
    .grid .card[schoolScrollReveal] { transition-duration: 0.5s; }
    .grid .card:nth-child(1) { transition-delay: 0.05s; }
    .grid .card:nth-child(2) { transition-delay: 0.1s; }
    .grid .card:nth-child(3) { transition-delay: 0.15s; }
    .grid .card:nth-child(4) { transition-delay: 0.2s; }
    .grid .card:nth-child(5) { transition-delay: 0.25s; }
    .grid .card:nth-child(6) { transition-delay: 0.3s; }
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
      .grid { grid-template-columns: repeat(2, 1fr); }
    }
  `],
})
export class LandingComponent {
  directions = ['Программирование', 'Робототехника', 'Нейросети', 'Рисование', 'Живопись', 'Дизайн'];
  techBg = 'tech-class.png';
  artBg = 'art-class.png';
  benefits = [
    { icon: '🎯', title: 'Практика с первого дня', text: 'Минимум теории — максимум проектов. Дети сразу создают игры, роботов и рисунки.' },
    { icon: '📈', title: 'Пошаговое развитие', text: 'Программы выстроены от основ к сложным темам. Учёт возраста и предыдущего опыта.' },
    { icon: '👥', title: 'Небольшие группы', text: 'До 8–10 человек в группе. Каждому ребёнку уделяется внимание.' },
    { icon: '🔧', title: 'Современные инструменты', text: 'Scratch, Python, Arduino, нейросети, акварель, цифровой дизайн.' },
  ];
  ageGroups = [
    { range: '5–7', title: 'Младшие', desc: 'Логика, творчество, первые конструкции и эксперименты с цветом.', img: 'tech-class.png' },
    { range: '8–11', title: 'Средние', desc: 'Scratch, робототехника, Python, рисование, основы дизайна.', img: 'art-class.png' },
    { range: '12–18', title: 'Старшие', desc: 'Веб-разработка, нейросети, Arduino, ESP32, профессиональная графика.', img: 'hero-dynamic.png' },
  ];
  steps = [
    { title: 'Регистрация', text: 'Создайте аккаунт на сайте и заполните данные ребёнка.' },
    { title: 'Выбор программы', text: 'Изучите каталог и выберите подходящий курс по возрасту и интересам.' },
    { title: 'Запись на программу', text: 'Оформите заявку — мы свяжемся для уточнения деталей.' },
  ];
}
