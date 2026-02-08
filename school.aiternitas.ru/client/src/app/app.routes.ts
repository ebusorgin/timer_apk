import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/landing/landing.component').then(m => m.LandingComponent) },
  { path: 'school-types/:id', loadComponent: () => import('./pages/school-type-detail/school-type-detail.component').then(m => m.SchoolTypeDetailComponent) },
  { path: 'programs', loadComponent: () => import('./pages/programs/programs.component').then(m => m.ProgramsComponent) },
  { path: 'programs/:id', loadComponent: () => import('./pages/program-detail/program-detail.component').then(m => m.ProgramDetailComponent) },
  { path: 'login', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
  { path: 'register', loadComponent: () => import('./pages/register/register.component').then(m => m.RegisterComponent) },
  { path: 'cabinet', loadComponent: () => import('./pages/cabinet/cabinet.component').then(m => m.CabinetComponent), canActivate: [authGuard] },
  { path: 'admin', loadComponent: () => import('./pages/admin/admin.component').then(m => m.AdminComponent), canActivate: [authGuard, adminGuard] },
  { path: '**', redirectTo: '' },
];
