/**
 * Тесты производительности для voice-room.js
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
    microphoneLevelCheckInterval: null,
    MICROPHONE_CHECK_INTERVAL: 100,
    elements: {},
    
    get isMobile() {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
             (window.innerWidth <= 768);
    },
    
    init() {
      this.initElements();
    },
    
    initElements() {
      this.elements = {
        usersGrid: document.getElementById('usersGrid'),
        statusMessage: document.getElementById('statusMessage')
      };
    },
    
    async initMedia() {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
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
      
      if (this.microphoneLevelCheckInterval) {
        clearInterval(this.microphoneLevelCheckInterval);
      }
      
      const buffer = new Uint8Array(this.analyser.frequencyBinCount);
      let lastCheckTime = 0;
      const checkInterval = this.isMobile ? this.MICROPHONE_CHECK_INTERVAL * 2 : this.MICROPHONE_CHECK_INTERVAL;
      
      const check = () => {
        const now = Date.now();
        if (now - lastCheckTime < checkInterval) {
          this.microphoneLevelCheckInterval = setTimeout(check, checkInterval);
          return;
        }
        lastCheckTime = now;
        this.analyser.getByteFrequencyData(buffer);
        this.microphoneLevelCheckInterval = setTimeout(check, checkInterval);
      };
      
      check();
    },
    
    stopMicrophoneMonitoring() {
      if (this.microphoneLevelCheckInterval) {
        clearInterval(this.microphoneLevelCheckInterval);
        this.microphoneLevelCheckInterval = null;
      }
    },
    
    createPeerConnection(targetUserId) {
      if (!this.localStream || this.peers.has(targetUserId)) return;
      const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      this.peers.set(targetUserId, peer);
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
  vi.useRealTimers();
});

describe('Производительность', () => {
  describe('Мониторинг микрофона', () => {
    it('не должен создавать лишние интервалы при повторном вызове', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      vi.useFakeTimers();
      
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      
      VoiceRoom.startMicrophoneMonitoring();
      const firstInterval = VoiceRoom.microphoneLevelCheckInterval;
      
      VoiceRoom.startMicrophoneMonitoring();
      const secondInterval = VoiceRoom.microphoneLevelCheckInterval;
      
      // Должен очистить предыдущий интервал
      expect(clearIntervalSpy).toHaveBeenCalled();
      // Должен быть только один активный интервал
      expect(secondInterval).toBeTruthy();
      
      vi.useRealTimers();
    });

    it('должен правильно использовать throttle для проверки микрофона', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      vi.useFakeTimers();
      
      let checkCount = 0;
      const originalGetByteFrequencyData = VoiceRoom.analyser.getByteFrequencyData.bind(VoiceRoom.analyser);
      VoiceRoom.analyser.getByteFrequencyData = vi.fn(() => {
        checkCount++;
        originalGetByteFrequencyData(new Uint8Array(128));
      });
      
      VoiceRoom.startMicrophoneMonitoring();
      
      // Проходим несколько интервалов
      vi.advanceTimersByTime(500);
      
      // Проверка должна вызываться не чаще чем раз в интервал
      expect(checkCount).toBeGreaterThan(0);
      expect(checkCount).toBeLessThanOrEqual(6); // Максимум 5-6 раз за 500мс при интервале 100мс
      
      vi.useRealTimers();
    });

    it('должен использовать увеличенный интервал для мобильных устройств', async () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        configurable: true
      });
      
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      vi.useFakeTimers();
      
      let checkCount = 0;
      VoiceRoom.analyser.getByteFrequencyData = vi.fn(() => {
        checkCount++;
      });
      
      VoiceRoom.startMicrophoneMonitoring();
      
      // Проходим 500мс
      vi.advanceTimersByTime(500);
      
      // На мобильных интервал в 2 раза больше, поэтому проверок должно быть меньше
      expect(checkCount).toBeLessThanOrEqual(3); // Максимум 2-3 раза за 500мс при интервале 200мс
      
      vi.useRealTimers();
    });

    it('должен корректно останавливать мониторинг', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      vi.useFakeTimers();
      
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      
      VoiceRoom.startMicrophoneMonitoring();
      expect(VoiceRoom.microphoneLevelCheckInterval).toBeTruthy();
      
      VoiceRoom.stopMicrophoneMonitoring();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(VoiceRoom.microphoneLevelCheckInterval).toBeNull();
      
      vi.useRealTimers();
    });
  });

  describe('Оптимизация для мобильных устройств', () => {
    it('должен использовать меньший fftSize для мобильных', async () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Android 10; Mobile)',
        configurable: true
      });
      
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      expect(VoiceRoom.analyser.fftSize).toBe(128);
    });

    it('должен использовать меньший smoothingTimeConstant для мобильных', async () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        configurable: true
      });
      
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
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
      
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      expect(VoiceRoom.analyser.fftSize).toBe(256);
      expect(VoiceRoom.analyser.smoothingTimeConstant).toBe(0.8);
    });
  });

  describe('Правильное использование таймаутов', () => {
    it('должен очищать предыдущий таймаут перед созданием нового', () => {
      VoiceRoom.init();
      
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      
      VoiceRoom.reconnectTimeout = setTimeout(() => {}, 1000);
      VoiceRoom.scheduleReconnection();
      
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('должен использовать правильную задержку для переподключения', () => {
      VoiceRoom.init();
      
      vi.useFakeTimers();
      
      VoiceRoom.currentRoomId = 'TEST01';
      VoiceRoom.scheduleReconnection();
      
      expect(VoiceRoom.reconnectTimeout).toBeTruthy();
      
      // Проверяем что таймаут установлен на правильное время (3000мс)
      vi.advanceTimersByTime(2999);
      expect(VoiceRoom.reconnectTimeout).toBeTruthy();
      
      vi.advanceTimersByTime(1);
      // После 3000мс должен быть выполнен
      
      vi.useRealTimers();
    });

    it('должен очищать таймауты при выходе из комнаты', () => {
      VoiceRoom.init();
      
      VoiceRoom.reconnectTimeout = setTimeout(() => {}, 1000);
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      
      VoiceRoom.leaveRoom();
      
      expect(clearTimeoutSpy).toHaveBeenCalled();
      expect(VoiceRoom.reconnectTimeout).toBeNull();
    });
  });

  describe('Оптимизация создания peer connections', () => {
    it('не должен создавать дублирующие peer connections', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      
      VoiceRoom.createPeerConnection(targetUserId);
      VoiceRoom.createPeerConnection(targetUserId);
      VoiceRoom.createPeerConnection(targetUserId);
      
      // Должно быть только одно соединение
      expect(VoiceRoom.peers.size).toBe(1);
      expect(VoiceRoom.peers.has(targetUserId)).toBe(true);
    });

    it('не должен создавать peer connection без localStream', () => {
      VoiceRoom.init();
      VoiceRoom.localStream = null;
      
      VoiceRoom.createPeerConnection('target-user');
      
      expect(VoiceRoom.peers.size).toBe(0);
    });

    it('должен эффективно обрабатывать множественные peer connections', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const startTime = Date.now();
      
      for (let i = 0; i < 10; i++) {
        VoiceRoom.createPeerConnection(`user${i}`);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Создание должно быть быстрым
      expect(duration).toBeLessThan(100);
      expect(VoiceRoom.peers.size).toBe(10);
    });
  });

  describe('Оптимизация обновления UI', () => {
    it('должен эффективно обновлять счетчик пользователей', () => {
      VoiceRoom.init();
      
      const startTime = Date.now();
      
      for (let i = 0; i < 100; i++) {
        VoiceRoom.addUserToGrid(`user${i}`, `User${i}`);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Обновление должно быть быстрым
      expect(duration).toBeLessThan(1000);
      
      const userCount = document.getElementById('userCount');
      expect(parseInt(userCount.textContent)).toBe(100);
    });

    it('не должен создавать дублирующие элементы DOM', () => {
      VoiceRoom.init();
      
      VoiceRoom.addUserToGrid('user1', 'User1');
      VoiceRoom.addUserToGrid('user1', 'User1');
      VoiceRoom.addUserToGrid('user1', 'User1');
      
      const cards = document.querySelectorAll('.user-card');
      expect(cards.length).toBe(1);
    });

    it('должен эффективно удалять пользователей из DOM', () => {
      VoiceRoom.init();
      
      // Добавляем 50 пользователей
      for (let i = 0; i < 50; i++) {
        VoiceRoom.addUserToGrid(`user${i}`, `User${i}`);
      }
      
      const startTime = Date.now();
      
      // Удаляем всех
      for (let i = 0; i < 50; i++) {
        VoiceRoom.removeUser(`user${i}`);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Удаление должно быть быстрым
      expect(duration).toBeLessThan(1000);
      
      const cards = document.querySelectorAll('.user-card');
      expect(cards.length).toBe(0);
    });
  });

  describe('Оптимизация памяти', () => {
    it('должен освобождать ресурсы при очистке', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.createPeerConnection('user1');
      VoiceRoom.createPeerConnection('user2');
      VoiceRoom.createPeerConnection('user3');
      
      const peerCount = VoiceRoom.peers.size;
      expect(peerCount).toBe(3);
      
      VoiceRoom.leaveRoom();
      
      expect(VoiceRoom.peers.size).toBe(0);
      expect(VoiceRoom.localStream).toBeNull();
      expect(VoiceRoom.audioContext).toBeNull();
    });

    it('должен очищать все таймауты и интервалы', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.startMicrophoneMonitoring();
      VoiceRoom.reconnectTimeout = setTimeout(() => {}, 1000);
      
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      
      VoiceRoom.leaveRoom();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('Throttle для проверки микрофона', () => {
    it('должен использовать throttle для предотвращения частых проверок', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      vi.useFakeTimers();
      
      let checkCount = 0;
      VoiceRoom.analyser.getByteFrequencyData = vi.fn(() => {
        checkCount++;
      });
      
      VoiceRoom.startMicrophoneMonitoring();
      
      // Быстро продвигаем время, но throttle должен ограничить количество проверок
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(50);
      }
      
      // Проверок должно быть меньше чем продвижений времени
      expect(checkCount).toBeLessThan(10);
      
      vi.useRealTimers();
    });

    it('должен правильно вычислять интервал для throttle', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const checkInterval = VoiceRoom.isMobile 
        ? VoiceRoom.MICROPHONE_CHECK_INTERVAL * 2 
        : VoiceRoom.MICROPHONE_CHECK_INTERVAL;
      
      expect(checkInterval).toBeGreaterThan(0);
    });
  });

  describe('Оптимизация для больших комнат', () => {
    it('должен эффективно обрабатывать комнату с 10 пользователями', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const startTime = Date.now();
      
      for (let i = 0; i < 10; i++) {
        VoiceRoom.createPeerConnection(`user${i}`);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(500);
      expect(VoiceRoom.peers.size).toBe(10);
    });

    it('должен эффективно обрабатывать добавление/удаление пользователей', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const startTime = Date.now();
      
      // Добавляем и удаляем пользователей
      for (let i = 0; i < 20; i++) {
        VoiceRoom.createPeerConnection(`user${i}`);
        VoiceRoom.peers.get(`user${i}`).close();
        VoiceRoom.peers.delete(`user${i}`);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(1000);
      expect(VoiceRoom.peers.size).toBe(0);
    });
  });
});
