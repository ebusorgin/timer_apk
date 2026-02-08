import { Component, ElementRef, AfterViewInit, OnDestroy, ViewChild } from '@angular/core';

@Component({
  selector: 'school-particle-canvas',
  standalone: true,
  template: `<canvas #canvas class="particle-canvas"></canvas>`,
  styles: [`
    :host {
      display: block;
      position: absolute;
      inset: 0;
      z-index: 2;
      pointer-events: none;
    }
    .particle-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
  `],
})
export class ParticleCanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private ctx: CanvasRenderingContext2D | null = null;
  private particles: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
  private mouse = { x: 0, y: 0 };
  private raf = 0;
  private resizeBound = () => this.resize();
  private mouseBound = (e: MouseEvent) => {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
  };

  ngAfterViewInit() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d');
    this.resize();
    this.initParticles();
    window.addEventListener('resize', this.resizeBound);
    document.addEventListener('mousemove', this.mouseBound);
    this.animate();
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resizeBound);
    document.removeEventListener('mousemove', this.mouseBound);
  }

  private resize() {
    const canvas = this.canvasRef.nativeElement;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    if (this.ctx) this.ctx.scale(dpr, dpr);
    this.initParticles();
  }

  private initParticles() {
    const w = this.canvasRef.nativeElement.offsetWidth;
    const h = this.canvasRef.nativeElement.offsetHeight;
    const count = Math.min(80, Math.floor((w * h) / 15000));
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        r: Math.random() * 1.5 + 0.5,
      });
    }
  }

  private animate = () => {
    const canvas = this.canvasRef.nativeElement;
    const ctx = this.ctx;
    if (!ctx) return;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    ctx.clearRect(0, 0, w, h);

    this.particles.forEach((p, i) => {
      p.x += p.vx;
      p.y += p.vy;
      const dx = this.mouse.x - p.x;
      const dy = this.mouse.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 150) {
        p.vx += (dx / dist) * 0.02;
        p.vy += (dy / dist) * 0.02;
      }
      p.vx *= 0.99;
      p.vy *= 0.99;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      p.x = Math.max(0, Math.min(w, p.x));
      p.y = Math.max(0, Math.min(h, p.y));

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(99, 102, 241, ${0.3 + Math.random() * 0.4})`;
      ctx.fill();

      for (let j = i + 1; j < this.particles.length; j++) {
        const other = this.particles[j];
        const dist = Math.hypot(p.x - other.x, p.y - other.y);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(other.x, other.y);
          ctx.strokeStyle = `rgba(99, 102, 241, ${0.1 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    });

    this.raf = requestAnimationFrame(this.animate);
  };
}
