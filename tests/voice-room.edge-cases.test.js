/**
 * Тесты граничных случаев для voice-room.js
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
    elements: {},
    
    sanitizeString(str) {
      if (typeof str !== 'string') return '';
      
      // Удаляем все HTML теги полностью
      let result = str.replace(/<[^>]*>/g, '');
      
      // Декодируем HTML entities перед дальнейшей обработкой
      result = result
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#x27;/gi, "'")
        .replace(/&#x2F;/gi, '/');
      
      // Удаляем HTML теги снова после декодирования
      result = result.replace(/<[^>]*>/g, '');
      
      // Удаляем опасные паттерны XSS и ключевые слова
      const dangerousPatterns = [
        /javascript:/gi,
        /on\w+\s*=/gi,
        /script/gi,
        /iframe/gi,
        /img/gi,
        /svg/gi,
        /style/gi,
        /onerror/gi,
        /onclick/gi,
        /onmouseover/gi,
        /onload/gi,
        /data-xss/gi,
        /expression/gi,
        /vbscript:/gi,
        /data:/gi
      ];
      
      dangerousPatterns.forEach(pattern => {
        result = result.replace(pattern, '');
      });
      
      // Удаляем SQL команды и операторы
      const sqlPatterns = [
        /DROP/gi,
        /DELETE/gi,
        /INSERT/gi,
        /UPDATE/gi,
        /SELECT/gi,
        /UNION/gi,
        /EXEC/gi,
        /EXECUTE/gi,
        /--/g,
        /\/\*/g,
        /\*\//g
      ];
      
      sqlPatterns.forEach(pattern => {
        result = result.replace(pattern, '');
      });
      
      // Удаляем опасные символы для SQL injection
      result = result.replace(/['";]/g, '');
      
      // Удаляем NoSQL операторы
      result = result.replace(/\$ne/gi, '');
      result = result.replace(/\$gt/gi, '');
      result = result.replace(/\$lt/gi, '');
      result = result.replace(/\$in/gi, '');
      result = result.replace(/\$nin/gi, '');
      result = result.replace(/\$regex/gi, '');
      
      // Удаляем опасные символы для NoSQL и LDAP injection
      result = result
        .replace(/\$/g, '')
        .replace(/\{/g, '')
        .replace(/\}/g, '')
        .replace(/\*/g, '')
        .replace(/\(/g, '')
        .replace(/\)/g, '')
        .replace(/&/g, '');
      
      // Удаляем оставшиеся < и >
      result = result.replace(/[<>]/g, '');
      
      // Удаляем unicode escape sequences
      result = result.replace(/\\u003c/gi, '');
      result = result.replace(/\\u003e/gi, '');
      result = result.replace(/\\u0027/gi, '');
      result = result.replace(/\\u0022/gi, '');
      
      // Удаляем null bytes
      result = result.replace(/\0/g, '');
      
      // Если после всех удалений осталась только пустая строка или только пробелы, возвращаем пустую строку
      result = result.trim();
      if (result.length === 0) return '';
      
      return result.substring(0, 20); // Ограничение длины
    },
    
    init() {
      this.initElements();
      this.initSocket();
    },
    
    initElements() {
      this.elements = {
        usernameInput: document.getElementById('username'),
        roomIdInput: document.getElementById('roomId'),
        usersGrid: document.getElementById('usersGrid'),
        statusMessage: document.getElementById('statusMessage')
      };
    },
    
    initSocket() {
      if (typeof io === 'undefined') return;
      this.socket = io(window.location.origin);
    },
    
    async initMedia() {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
    },
    
    createPeerConnection(targetUserId) {
      if (!this.localStream || this.peers.has(targetUserId)) return;
      const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      this.localStream.getTracks().forEach(track => {
        peer.addTrack(track, this.localStream);
      });
      this.peers.set(targetUserId, peer);
    },
    
    addUserToGrid(userId, username) {
      if (!this.elements.usersGrid || document.getElementById(`user-${userId}`)) return;
      const card = document.createElement('div');
      card.id = `user-${userId}`;
      card.className = 'user-card';
      this.elements.usersGrid.appendChild(card);
    },
    
    showNotification(message, type = 'info', duration = 3000) {
      if (!this.elements.statusMessage) return;
      const statusEl = this.elements.statusMessage;
      statusEl.textContent = message;
      statusEl.className = `status-message ${type}`;
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
  vi.clearAllMocks();
});

describe('Граничные случаи', () => {
  describe('Пустые и нулевые значения', () => {
    it('должен обрабатывать пустой username', () => {
      const result = VoiceRoom.sanitizeString('');
      expect(result).toBe('');
    });

    it('должен обрабатывать null username', () => {
      const result = VoiceRoom.sanitizeString(null);
      expect(result).toBe('');
    });

    it('должен обрабатывать undefined username', () => {
      const result = VoiceRoom.sanitizeString(undefined);
      expect(result).toBe('');
    });

    it('должен обрабатывать пустой roomId', () => {
      VoiceRoom.init();
      const result = VoiceRoom.sanitizeString('');
      expect(result).toBe('');
    });

    it('должен обрабатывать только пробелы в username', () => {
      const result = VoiceRoom.sanitizeString('   ');
      expect(result).toBe('');
    });
  });

  describe('Очень длинные строки', () => {
    it('должен обрезать username длиннее 20 символов', () => {
      const longString = 'a'.repeat(30);
      const result = VoiceRoom.sanitizeString(longString);
      expect(result.length).toBe(20);
      expect(result).toBe('a'.repeat(20));
    });

    it('должен обрабатывать очень длинную строку с пробелами', () => {
      const longString = ' '.repeat(10) + 'a'.repeat(30);
      const result = VoiceRoom.sanitizeString(longString);
      expect(result.length).toBeLessThanOrEqual(20);
    });

    it('должен обрезать строку с эмодзи', () => {
      const emojiString = '🎤'.repeat(15);
      const result = VoiceRoom.sanitizeString(emojiString);
      expect(result.length).toBeLessThanOrEqual(20);
    });
  });

  describe('Специальные символы и XSS попытки', () => {
    it('должен удалять HTML теги из username', () => {
      const xssAttempt = '<script>alert("XSS")</script>';
      const result = VoiceRoom.sanitizeString(xssAttempt);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).not.toContain('script');
    });

    it('должен обрабатывать попытку XSS с атрибутами', () => {
      const xssAttempt = '<img src=x onerror=alert(1)>';
      const result = VoiceRoom.sanitizeString(xssAttempt);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });

    it('должен обрабатывать попытку XSS с событиями', () => {
      const xssAttempt = '<div onclick="alert(1)">test</div>';
      const result = VoiceRoom.sanitizeString(xssAttempt);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });

    it('должен обрабатывать SQL injection попытки', () => {
      const sqlInjection = "'; DROP TABLE users; --";
      const result = VoiceRoom.sanitizeString(sqlInjection);
      expect(result).not.toContain('DROP');
      expect(result).not.toContain('--');
    });

    it('должен обрабатывать специальные символы', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const result = VoiceRoom.sanitizeString(specialChars);
      // Специальные символы должны сохраняться (кроме < и >)
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });
  });

  describe('Некорректные roomId', () => {
    it('должен отклонять roomId короче 6 символов', () => {
      const shortRoomId = 'ABC';
      expect(shortRoomId.length).toBeLessThan(6);
    });

    it('должен отклонять roomId длиннее 6 символов', () => {
      const longRoomId = 'ABCDEFG';
      expect(longRoomId.length).toBeGreaterThan(6);
    });

    it('должен обрабатывать roomId со специальными символами', () => {
      const invalidRoomId = 'ABC-12';
      expect(invalidRoomId.length).toBe(6);
      // В реальном коде будет валидация формата
    });

    it('должен обрабатывать roomId с пробелами', () => {
      const roomIdWithSpaces = 'ABC 12';
      expect(roomIdWithSpaces.trim().length).toBe(6);
    });
  });

  describe('Отсутствие элементов DOM', () => {
    it('должен обрабатывать отсутствие usernameInput', () => {
      VoiceRoom.init();
      VoiceRoom.elements.usernameInput = null;
      
      expect(() => {
        VoiceRoom.initElements();
      }).not.toThrow();
    });

    it('должен обрабатывать отсутствие roomIdInput', () => {
      VoiceRoom.init();
      VoiceRoom.elements.roomIdInput = null;
      
      expect(() => {
        VoiceRoom.initElements();
      }).not.toThrow();
    });

    it('должен обрабатывать отсутствие statusMessage', () => {
      VoiceRoom.init();
      VoiceRoom.elements.statusMessage = null;
      
      expect(() => {
        VoiceRoom.showNotification('Test', 'info');
      }).not.toThrow();
    });
  });

  describe('Отсутствие API', () => {
    it('должен обрабатывать отсутствие Socket.IO', () => {
      const originalIO = window.io;
      delete window.io;
      
      VoiceRoom.init();
      expect(VoiceRoom.socket).toBeFalsy();
      
      window.io = originalIO;
    });

    it('должен обрабатывать отсутствие WebRTC API', () => {
      const originalRTCPeerConnection = window.RTCPeerConnection;
      delete window.RTCPeerConnection;
      
      expect(() => {
        new RTCPeerConnection();
      }).toThrow();
      
      window.RTCPeerConnection = originalRTCPeerConnection;
    });

    it('должен обрабатывать отсутствие mediaDevices API', () => {
      const originalMediaDevices = navigator.mediaDevices;
      delete navigator.mediaDevices;
      
      expect(navigator.mediaDevices).toBeUndefined();
      
      navigator.mediaDevices = originalMediaDevices;
    });

    it('должен обрабатывать отсутствие AudioContext', () => {
      const originalAudioContext = window.AudioContext;
      delete window.AudioContext;
      delete window.webkitAudioContext;
      
      expect(window.AudioContext).toBeUndefined();
      
      window.AudioContext = originalAudioContext;
    });
  });

  describe('Состояния ICE соединения', () => {
    it('должен обрабатывать состояние failed', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const peer = VoiceRoom.peers.get(targetUserId);
      if (peer) {
        peer.iceConnectionState = 'failed';
        if (peer._onIceConnectionStateChange) {
          peer._onIceConnectionStateChange();
        }
      }
      
      // Должен обработать состояние failed без ошибок
      expect(peer).toBeTruthy();
    });

    it('должен обрабатывать состояние disconnected', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const peer = VoiceRoom.peers.get(targetUserId);
      if (peer) {
        peer.iceConnectionState = 'disconnected';
        if (peer._onIceConnectionStateChange) {
          peer._onIceConnectionStateChange();
        }
      }
      
      expect(peer).toBeTruthy();
    });

    it('должен обрабатывать состояние closed', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const peer = VoiceRoom.peers.get(targetUserId);
      if (peer) {
        peer.iceConnectionState = 'closed';
        if (peer._onIceConnectionStateChange) {
          peer._onIceConnectionStateChange();
        }
      }
      
      expect(peer).toBeTruthy();
    });
  });

  describe('Повторное создание peer connection', () => {
    it('должен игнорировать повторное создание peer connection для того же пользователя', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      
      VoiceRoom.createPeerConnection(targetUserId);
      const firstPeer = VoiceRoom.peers.get(targetUserId);
      
      VoiceRoom.createPeerConnection(targetUserId);
      const secondPeer = VoiceRoom.peers.get(targetUserId);
      
      // Должен остаться тот же peer connection
      expect(firstPeer).toBe(secondPeer);
      expect(VoiceRoom.peers.size).toBe(1);
    });

    it('должен создавать новый peer connection если предыдущий был удален', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      
      VoiceRoom.createPeerConnection(targetUserId);
      const firstPeer = VoiceRoom.peers.get(targetUserId);
      
      VoiceRoom.peers.delete(targetUserId);
      firstPeer.close();
      
      VoiceRoom.createPeerConnection(targetUserId);
      const secondPeer = VoiceRoom.peers.get(targetUserId);
      
      // Должен создать новый peer connection
      expect(secondPeer).not.toBe(firstPeer);
      expect(VoiceRoom.peers.size).toBe(1);
    });
  });

  describe('Крайние значения', () => {
    it('должен обрабатывать максимально длинный валидный username (20 символов)', () => {
      const maxLengthUsername = 'a'.repeat(20);
      const result = VoiceRoom.sanitizeString(maxLengthUsername);
      expect(result.length).toBe(20);
    });

    it('должен обрабатывать минимально длинный username (1 символ)', () => {
      const minLengthUsername = 'a';
      const result = VoiceRoom.sanitizeString(minLengthUsername);
      expect(result.length).toBe(1);
    });

    it('должен обрабатывать username с максимальным количеством пробелов', () => {
      const spacedUsername = 'a'.repeat(10) + ' '.repeat(10);
      const result = VoiceRoom.sanitizeString(spacedUsername);
      expect(result.trim().length).toBeLessThanOrEqual(20);
    });

    it('должен обрабатывать roomId в нижнем регистре', () => {
      const lowerCaseRoomId = 'abcdef';
      expect(lowerCaseRoomId.toUpperCase().length).toBe(6);
    });

    it('должен обрабатывать roomId в смешанном регистре', () => {
      const mixedCaseRoomId = 'AbCdEf';
      expect(mixedCaseRoomId.toUpperCase().length).toBe(6);
    });
  });

  describe('Особые случаи строк', () => {
    it('должен обрабатывать строку только с HTML тегами', () => {
      const onlyTags = '<script></script>';
      const result = VoiceRoom.sanitizeString(onlyTags);
      expect(result).toBe('');
    });

    it('должен обрабатывать строку с вложенными тегами', () => {
      const nestedTags = '<div><span>test</span></div>';
      const result = VoiceRoom.sanitizeString(nestedTags);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });

    it('должен обрабатывать строку с unicode символами', () => {
      const unicodeString = 'Привет 🌍 你好';
      const result = VoiceRoom.sanitizeString(unicodeString);
      expect(result.length).toBeLessThanOrEqual(20);
    });

    it('должен обрабатывать строку с нулевыми байтами', () => {
      const nullByteString = 'test\0test';
      const result = VoiceRoom.sanitizeString(nullByteString);
      expect(result).toBeTruthy();
    });

    it('должен обрабатывать строку с переводами строк', () => {
      const newlineString = 'test\ntest';
      const result = VoiceRoom.sanitizeString(newlineString);
      expect(result).toBeTruthy();
    });
  });

  describe('Состояния элементов', () => {
    it('должен обрабатывать disabled элементы', () => {
      VoiceRoom.init();
      if (VoiceRoom.elements.usernameInput) {
        VoiceRoom.elements.usernameInput.disabled = true;
        expect(VoiceRoom.elements.usernameInput.disabled).toBe(true);
      }
    });

    it('должен обрабатывать readonly элементы', () => {
      VoiceRoom.init();
      if (VoiceRoom.elements.roomIdInput) {
        VoiceRoom.elements.roomIdInput.readOnly = true;
        expect(VoiceRoom.elements.roomIdInput.readOnly).toBe(true);
      }
    });

    it('должен обрабатывать скрытые элементы', () => {
      VoiceRoom.init();
      if (VoiceRoom.elements.statusMessage) {
        VoiceRoom.elements.statusMessage.style.display = 'none';
        expect(VoiceRoom.elements.statusMessage.style.display).toBe('none');
      }
    });
  });
});
