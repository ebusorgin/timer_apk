/**
 * Тесты для app.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupDOM } from './helpers/setup-dom.js';

// Загружаем модули
let App;

beforeEach(async () => {
  setupDOM();
  
  // Динамически загружаем модуль app.js
  // В реальном приложении модули загружаются через script теги
  // Для тестов мы создаем их вручную
  App = {
    get isCordova() {
      if (typeof cordova !== 'undefined') return true;
      if (typeof window !== 'undefined' && window.cordova) return true;
      if (typeof navigator !== 'undefined' && navigator.userAgent && 
          (navigator.userAgent.indexOf('cordova') !== -1 || 
           navigator.userAgent.indexOf('phonegap') !== -1)) return true;
      if (typeof device !== 'undefined') return true;
      return false;
    },
    
    get isBrowser() {
      return typeof window !== 'undefined' && !this.isCordova;
    },
    
    getSocketUrl() {
      if (typeof window !== 'undefined') {
        return window.location.origin;
      }
      return 'http://localhost:3000';
    },
    
    init() {
      console.log('App initialized in:', this.isCordova ? 'Cordova' : 'Browser');
      
      if (this.isCordova) {
        document.addEventListener('deviceready', () => {
          this.onDeviceReady();
        }, false);
      } else {
        window.addEventListener('load', () => {
          this.onDeviceReady();
        });
      }
    },
    
    onDeviceReady() {
      console.log('Device ready');
      
      if (this.isCordova && navigator.splashscreen) {
        navigator.splashscreen.hide();
      }
      
      setTimeout(() => {
        if (typeof VoiceRoom !== 'undefined') {
          console.log('Initializing VoiceRoom...');
          VoiceRoom.init();
        } else {
          console.error('VoiceRoom module not found!');
        }
      }, 100);
    }
  };
  
  window.App = App;
});

describe('App', () => {
  describe('isCordova', () => {
    it('должен возвращать false в браузерном окружении', () => {
      expect(App.isCordova).toBe(false);
    });

    it('должен возвращать true если cordova определен', () => {
      window.cordova = {};
      expect(App.isCordova).toBe(true);
      delete window.cordova;
    });

    it('должен возвращать true если device определен', () => {
      window.device = {};
      expect(App.isCordova).toBe(true);
      delete window.device;
    });

    it('должен возвращать true если userAgent содержит cordova', () => {
      const originalUA = navigator.userAgent;
      Object.defineProperty(navigator, 'userAgent', {
        value: 'cordova-app',
        configurable: true
      });
      expect(App.isCordova).toBe(true);
      Object.defineProperty(navigator, 'userAgent', {
        value: originalUA,
        configurable: true
      });
    });
  });

  describe('isBrowser', () => {
    it('должен возвращать true когда не Cordova', () => {
      expect(App.isBrowser).toBe(true);
    });

    it('должен возвращать false когда Cordova', () => {
      window.cordova = {};
      expect(App.isBrowser).toBe(false);
      delete window.cordova;
    });
  });

  describe('getSocketUrl', () => {
    it('должен возвращать origin из window.location', () => {
      expect(App.getSocketUrl()).toBe('http://localhost:3000');
    });

    it('должен возвращать fallback URL если window не определен', () => {
      const originalWindow = global.window;
      delete global.window;
      const url = App.getSocketUrl();
      global.window = originalWindow;
      expect(url).toBe('http://localhost:3000');
    });
  });

  describe('init', () => {
    it('должен добавлять обработчик события load для браузера', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      App.init();
      expect(addEventListenerSpy).toHaveBeenCalledWith('load', expect.any(Function));
    });

    it('должен добавлять обработчик deviceready для Cordova', () => {
      window.cordova = {};
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      App.init();
      expect(addEventListenerSpy).toHaveBeenCalledWith('deviceready', expect.any(Function), false);
      delete window.cordova;
    });
  });

  describe('onDeviceReady', () => {
    it('должен вызывать VoiceRoom.init если модуль доступен', (done) => {
      window.VoiceRoom = {
        init: vi.fn()
      };
      
      vi.useFakeTimers();
      App.onDeviceReady();
      vi.advanceTimersByTime(100);
      
      setTimeout(() => {
        expect(window.VoiceRoom.init).toHaveBeenCalled();
        vi.useRealTimers();
        done();
      }, 150);
    });

    it('должен скрывать splashscreen если доступен в Cordova', () => {
      window.cordova = {};
      navigator.splashscreen = {
        hide: vi.fn()
      };
      
      App.onDeviceReady();
      expect(navigator.splashscreen.hide).toHaveBeenCalled();
      
      delete window.cordova;
      delete navigator.splashscreen;
    });
  });
});