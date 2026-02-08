import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(() => {
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthService,
        ApiService,
        { provide: Router, useValue: routerSpy },
      ],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('loadUser should set user when token valid', async () => {
    localStorage.setItem('token', 'fake-token');
    const loadPromise = service.loadUser();
    const req = httpMock.expectOne('/api/me');
    expect(req.request.headers.has('Authorization')).toBe(true);
    req.flush({ success: true, user: { id: '1', email: 'a@b.com', name: 'Test', role: 'student' } });
    await loadPromise;
    expect(service.user()).toBeTruthy();
    expect(service.user()?.email).toBe('a@b.com');
  });

  it('loadUser should clear token when request fails', async () => {
    localStorage.setItem('token', 'fake-token');
    const loadPromise = service.loadUser();
    const req = httpMock.expectOne('/api/me');
    req.flush({ error: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    await loadPromise;
    expect(service.user()).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('logout should clear token and user', () => {
    localStorage.setItem('token', 'x');
    service.logout();
    expect(localStorage.getItem('token')).toBeNull();
    expect(service.user()).toBeNull();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/']);
  });
});
