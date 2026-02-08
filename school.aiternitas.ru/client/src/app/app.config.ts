import { ApplicationConfig, provideZoneChangeDetection, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { AuthService } from './services/auth.service';
import { LocaleService } from './services/locale.service';
import { TranslateService } from '@ngx-translate/core';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    provideTranslateHttpLoader({ prefix: 'i18n/', suffix: '.json' }),
    provideTranslateService({ defaultLanguage: 'ru' }),
    {
      provide: APP_INITIALIZER,
      useFactory: (auth: AuthService) => () => auth.loadUser(),
      deps: [AuthService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: (locale: LocaleService, translate: TranslateService) => () => {
        const lang = locale.getLocale();
        return firstValueFrom(translate.use(lang));
      },
      deps: [LocaleService, TranslateService],
      multi: true,
    },
  ],
};
