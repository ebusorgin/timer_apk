import { Injectable, signal, computed } from '@angular/core';

const LOCALE_KEY = 'school_locale';
const LOCALES = ['ru', 'sr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly storage = typeof localStorage !== 'undefined' ? localStorage : null;
  private readonly localeSignal = signal<Locale>(this.loadStored());

  locale = computed(() => this.localeSignal());

  getLocale(): Locale {
    return this.localeSignal();
  }

  setLocale(lang: Locale) {
    if (!LOCALES.includes(lang)) return;
    this.localeSignal.set(lang);
    this.storage?.setItem(LOCALE_KEY, lang);
  }

  private loadStored(): Locale {
    const stored = this.storage?.getItem(LOCALE_KEY);
    return stored && LOCALES.includes(stored as Locale) ? (stored as Locale) : 'ru';
  }

  getLocales(): readonly Locale[] {
    return LOCALES;
  }
}
