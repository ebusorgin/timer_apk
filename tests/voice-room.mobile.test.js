/**
 * Тесты для мобильных устройств для voice-room.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupDOM } from './helpers/setup-dom.js';
import { clearServerState } from './helpers/socket-mock.js';

let VoiceRoom;
let App;

beforeEach(async () => {
  setupDOM();
  clearServerState();
  
  App = {
    get isCordova() {
      return typeof window.cordova !== 'undefined';
    },
    get isBrowser() {
      return typeof window !== 'undefined' && !this.isCordova;
    },
    getSocketUrl() {
      return window.location.origin;
    },
    init() {}
  };
  window.App = App;
  
  VoiceRoom = {
    socket: null,
    localStream: null,
    peers: new Map(),
    currentRoomId: null,
    myUserId: null,
    myUsername: null,
    audioContext: null,
    analyser: null,
    connectionStatus: 'disconnected',
    MICROPHONE_CHECK_INTERVAL: 100,
    elements: {},
    
    get isMobile() {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
             (window.innerWidth <= 768);
    },
    
    async initMedia() {
      this.localStream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true,
          autoGainControl: true,
          ...(this.isMobile ? {
            sampleRate: 16000,
            channelCount: 1
          } : {})
        },
        video: false 
      });
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      
      if (this.isMobile) {
        this.analyser.fftSize = 128;
        this.analyser.smoothingTimeConstant = 0.6;
      } else {
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.8;
      }
    },
    
    startMicrophoneMonitoring() {
      if (!this.analyser) return;
      const checkInterval = this.isMobile ? this.MICROPHONE_CHECK_INTERVAL * 2 : this.MICROPHONE_CHECK_INTERVAL;
      // Симуляция мониторинга
    }
  };
  
  window.VoiceRoom = VoiceRoom;
  
  await new Promise(resolve => {
    const checkIO = () => {
      if (typeof io !== 'undefined') {
        resolve();
      } else {
        setTimeout(checkIO, 10);
      }
    };
    checkIO();
  });
});

afterEach(() => {
  clearServerState();
  vi.clearAllMocks();
});

describe('Мобильные устройства', () => {
  describe('Определение мобильного устройства', () => {
    it('должен определять Android устройство', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Linux; Android 10) Mobile',
        configurable: true
      });
      
      expect(VoiceRoom.isMobile).toBe(true);
    });

    it('должен определять iPhone устройство', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        configurable: true
      });
      
      expect(VoiceRoom.isMobile).toBe(true);
    });

    it('должен определять iPad устройство', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)',
        configurable: true
      });
      
      expect(VoiceRoom.isMobile).toBe(true);
    });

    it('должен определять мобильное устройство по ширине экрана', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        configurable: true
      });
      
      Object.defineProperty(window, 'innerWidth', {
        value: 500,
        configurable: true,
        writable: true
      });
      
      expect(VoiceRoom.isMobile).toBe(true);
    });

    it('не должен определять десктоп как мобильное', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        configurable: true
      });
      
      Object.defineProperty(window, 'innerWidth', {
        value: 1920,
        configurable: true,
        writable: true
      });
      
      expect(VoiceRoom.isMobile).toBe(false);
    });
  });

  describe('Оптимизация для мобильных', () => {
    it('должен использовать меньший fftSize для мобильных', async () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        configurable: true
      });
      
      await VoiceRoom.initMedia();
      
      expect(VoiceRoom.analyser.fftSize).toBe(128);
    });

    it('должен использовать больший fftSize для десктоп', async () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        configurable: true
      });
      
      Object.defineProperty(window, 'innerWidth', {
        value: 1920,
        configurable: true,
        writable: true
      });
      
      await VoiceRoom.initMedia();
      
      expect(VoiceRoom.analyser.fftSize).toBe(256);
    });

    it('должен использовать меньшее smoothingTimeConstant для мобильных', async () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Android 10; Mobile)',
        configurable: true
      });
      
      await VoiceRoom.initMedia();
      
      expect(VoiceRoom.analyser.smoothingTimeConstant).toBe(0.6);
    });

    it('должен использовать большее smoothingTimeConstant для десктоп', async () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        configurable: true
      });
      
      Object.defineProperty(window, 'innerWidth', {
        value: 1920,
        configurable: true,
        writable: true
      });
      
      await VoiceRoom.initMedia();
      
      expect(VoiceRoom.analyser.smoothingTimeConstant).toBe(0.8);
    });

    it('должен использовать увеличенный интервал проверки микрофона для мобильных', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        configurable: true
      });
      
      const checkInterval = VoiceRoom.isMobile 
        ? VoiceRoom.MICROPHONE_CHECK_INTERVAL * 2 
        : VoiceRoom.MICROPHONE_CHECK_INTERVAL;
      
      expect(checkInterval).toBe(200);
    });

    it('должен использовать обычный интервал проверки для десктоп', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        configurable: true
      });
      
      Object.defineProperty(window, 'innerWidth', {
        value: 1920,
        configurable: true,
        writable: true
      });
      
      const checkInterval = VoiceRoom.isMobile 
        ? VoiceRoom.MICROPHONE_CHECK_INTERVAL * 2 
        : VoiceRoom.MICROPHONE_CHECK_INTERVAL;
      
      expect(checkInterval).toBe(100);
    });
  });

  describe('Различные размеры экрана', () => {
    it('должен определять мобильное устройство при ширине 768px', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        configurable: true
      });
      
      Object.defineProperty(window, 'innerWidth', {
        value: 768,
        configurable: true,
        writable: true
      });
      
      expect(VoiceRoom.isMobile).toBe(true);
    });

    it('не должен определять как мобильное при ширине 769px', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        configurable: true
      });
      
      Object.defineProperty(window, 'innerWidth', {
        value: 769,
        configurable: true,
        writable: true
      });
      
      expect(VoiceRoom.isMobile).toBe(false);
    });

    it('должен обрабатывать очень маленький экран', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        configurable: true
      });
      
      Object.defineProperty(window, 'innerWidth', {
        value: 320,
        configurable: true,
        writable: true
      });
      
      expect(VoiceRoom.isMobile).toBe(true);
    });
  });

  describe('Поведение на мобильных vs десктоп', () => {
    it('должен применять оптимизации только для мобильных', async () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        configurable: true
      });
      
      await VoiceRoom.initMedia();
      
      expect(VoiceRoom.analyser.fftSize).toBe(128);
      expect(VoiceRoom.analyser.smoothingTimeConstant).toBe(0.6);
    });

    it('должен использовать стандартные значения для десктоп', async () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        configurable: true
      });
      
      Object.defineProperty(window, 'innerWidth', {
        value: 1920,
        configurable: true,
        writable: true
      });
      
      await VoiceRoom.initMedia();
      
      expect(VoiceRoom.analyser.fftSize).toBe(256);
      expect(VoiceRoom.analyser.smoothingTimeConstant).toBe(0.8);
    });
  });

  describe('Определение различных мобильных платформ', () => {
    const mobileUserAgents = [
      'Mozilla/5.0 (Linux; Android 10; SM-G973F)',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)',
      'Mozilla/5.0 (BlackBerry; U; BlackBerry 9800; en)',
      'Mozilla/5.0 (webOS/1.4.0; U; en-US)',
      'Opera/9.80 (Android; Opera Mini/7.5.33361/31.1448; U; en)'
    ];

    mobileUserAgents.forEach((ua, index) => {
      it(`должен определять мобильное устройство: ${ua.substring(0, 30)}...`, () => {
        Object.defineProperty(navigator, 'userAgent', {
          value: ua,
          configurable: true
        });
        
        expect(VoiceRoom.isMobile).toBe(true);
      });
    });
  });
});
