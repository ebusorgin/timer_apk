import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';

@Component({
  selector: 'school-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent],
  template: `
    <school-header />
    <main class="main">
      <router-outlet />
    </main>
    <footer class="footer">
      <p>&copy; {{ year }} School.aiternitas.ru</p>
    </footer>
  `,
  styles: [`
    .main { min-height: calc(100vh - 140px); }
    .footer {
      text-align: center;
      padding: 1rem;
      color: var(--color-muted);
      font-size: 0.9rem;
    }
  `],
})
export class AppComponent {
  year = new Date().getFullYear();
}
