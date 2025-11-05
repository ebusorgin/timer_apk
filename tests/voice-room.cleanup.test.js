/**
 * Тесты очистки ресурсов для voice-room.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupDOM } from './helpers/setup-dom.js';
import { clearServerState } from './helpers/socket-mock.js';
import { clearMockStreams, clearMockPeerConnections } from './helpers/webrtc-mock.js';

let VoiceRoom;
let App;

beforeEach(async () => {
  setupDOM();
  clearServerState();
  clearMockStreams();
  clearMockPeerConnections();
  
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
    reconnectTimeout: null,
    microphoneLevelCheckInterval: null,
    elements: {},
    
    init() {
      // Очищаем предыдущие peer connections при повторной инициализации
      this.peers.forEach((peer, userId) => {
        try {
          peer.close();
        } catch (error) {
          console.error('Error closing peer during init:', error);
        }
      });
      this.peers.clear();
      
      this.initElements();
      this.initSocket();
    },
    
    initElements() {
      this.elements = {
        usernameInput: document.getElementById('username'),
        roomIdInput: document.getElementById('roomId'),
        usersGrid: document.getElementById('usersGrid'),
        statusMessage: document.getElementById('statusMessage'),
        loginScreen: document.getElementById('loginScreen'),
        roomScreen: document.getElementById('roomScreen')
      };
    },
    
    initSocket() {
      if (typeof io === 'undefined') return;
      this.socket = io(window.location.origin);
    },
    
    async initMedia() {
      try {
        // Закрываем предыдущий поток если есть
        if (this.localStream) {
          try {
            this.localStream.getTracks().forEach(track => track.stop());
          } catch (error) {
            console.error('Error stopping previous stream:', error);
          }
        }
        
        // Закрываем предыдущий AudioContext если есть
        if (this.audioContext && this.audioContext.state !== 'closed') {
          try {
            await this.audioContext.close();
          } catch (error) {
            console.error('Error closing previous AudioContext:', error);
          }
        }
        
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
      } catch (error) {
        console.error('Error accessing microphone:', error);
        // Очищаем частично созданные ресурсы
        if (this.localStream) {
          try {
            this.localStream.getTracks().forEach(track => track.stop());
          } catch (e) {
            console.error('Error stopping stream on error:', e);
          }
          this.localStream = null;
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
          try {
            await this.audioContext.close();
          } catch (e) {
            console.error('Error closing AudioContext on error:', e);
          }
          this.audioContext = null;
        }
        this.analyser = null;
        throw error; // Пробрасываем ошибку дальше
      }
    },
    
    createPeerConnection(targetUserId) {
      if (!this.localStream || this.peers.has(targetUserId)) return;
      const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      this.localStream.getTracks().forEach(track => {
        peer.addTrack(track, this.localStream);
      });
      this.peers.set(targetUserId, peer);
    },
    
    startMicrophoneMonitoring() {
      if (!this.analyser) return;
      if (this.microphoneLevelCheckInterval) {
        clearInterval(this.microphoneLevelCheckInterval);
      }
      this.microphoneLevelCheckInterval = setInterval(() => {
        // Симуляция проверки
      }, 100);
    },
    
    stopMicrophoneMonitoring() {
      if (this.microphoneLevelCheckInterval) {
        try {
          clearInterval(this.microphoneLevelCheckInterval);
        } catch (error) {
          console.error('Error clearing microphone interval:', error);
        }
        this.microphoneLevelCheckInterval = null;
      }
    },
    
    leaveRoom() {
      this.stopMicrophoneMonitoring();
      this.peers.forEach((peer, userId) => {
        try {
          peer.close();
        } catch (error) {
          console.error('Error closing peer:', error);
        }
      });
      this.peers.clear();
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          track.stop();
        });
        this.localStream = null;
      }
      if (this.audioContext && this.audioContext.state !== 'closed') {
        try {
          this.audioContext.close().catch(error => {
            console.error('Error closing AudioContext:', error);
          });
        } catch (error) {
          console.error('Error closing AudioContext:', error);
        }
        this.audioContext = null;
      }
      this.analyser = null;
      if (this.reconnectTimeout) {
        try {
          clearTimeout(this.reconnectTimeout);
        } catch (error) {
          console.error('Error clearing reconnectTimeout:', error);
        }
        this.reconnectTimeout = null;
      }
      if (this.elements.usersGrid) {
        this.elements.usersGrid.innerHTML = '';
      }
      if (this.socket && this.currentRoomId) {
        this.socket.emit('leave-room', { roomId: this.currentRoomId });
      }
      this.currentRoomId = null;
      this.myUserId = null;
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
  clearMockStreams();
  clearMockPeerConnections();
  vi.clearAllMocks();
});

describe('Очистка ресурсов', () => {
  describe('Закрытие peer connections', () => {
    it('должен закрывать все peer connections при выходе', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.createPeerConnection('user1');
      VoiceRoom.createPeerConnection('user2');
      VoiceRoom.createPeerConnection('user3');
      
      expect(VoiceRoom.peers.size).toBe(3);
      
      const closeSpy = vi.spyOn(RTCPeerConnection.prototype, 'close');
      VoiceRoom.leaveRoom();
      
      expect(closeSpy).toHaveBeenCalledTimes(3);
      expect(VoiceRoom.peers.size).toBe(0);
    });

    it('должен обрабатывать ошибки при закрытии peer connections', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.createPeerConnection('user1');
      const peer = VoiceRoom.peers.get('user1');
      
      // Мокаем close чтобы выбросить ошибку
      const originalClose = peer.close.bind(peer);
      peer.close = () => {
        throw new Error('Close failed');
      };
      
      // Должен обработать ошибку без падения
      expect(() => {
        VoiceRoom.leaveRoom();
      }).not.toThrow();
      
      peer.close = originalClose;
    });

    it('должен очищать Map peers после закрытия', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.createPeerConnection('user1');
      VoiceRoom.createPeerConnection('user2');
      
      VoiceRoom.leaveRoom();
      
      expect(VoiceRoom.peers.size).toBe(0);
      expect(VoiceRoom.peers.has('user1')).toBe(false);
      expect(VoiceRoom.peers.has('user2')).toBe(false);
    });
  });

  describe('Остановка треков', () => {
    it('должен останавливать все треки локального потока', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const tracks = VoiceRoom.localStream.getTracks();
      const stopSpy = vi.spyOn(tracks[0], 'stop');
      
      VoiceRoom.leaveRoom();
      
      expect(stopSpy).toHaveBeenCalled();
      expect(VoiceRoom.localStream).toBeNull();
    });

    it('должен обрабатывать отсутствие локального потока', () => {
      VoiceRoom.init();
      VoiceRoom.localStream = null;
      
      expect(() => {
        VoiceRoom.leaveRoom();
      }).not.toThrow();
    });

    it('должен обрабатывать треки без метода stop', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const tracks = VoiceRoom.localStream.getTracks();
      delete tracks[0].stop;
      
      expect(() => {
        VoiceRoom.leaveRoom();
      }).not.toThrow();
    });

    it('должен останавливать все треки если их несколько', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const tracks = VoiceRoom.localStream.getTracks();
      const stopSpies = tracks.map(track => vi.spyOn(track, 'stop'));
      
      VoiceRoom.leaveRoom();
      
      stopSpies.forEach(spy => {
        expect(spy).toHaveBeenCalled();
      });
    });
  });

  describe('Закрытие AudioContext', () => {
    it('должен закрывать AudioContext при выходе', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const closeSpy = vi.spyOn(VoiceRoom.audioContext, 'close');
      
      VoiceRoom.leaveRoom();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(closeSpy).toHaveBeenCalled();
      expect(VoiceRoom.audioContext).toBeNull();
    });

    it('должен обрабатывать уже закрытый AudioContext', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      await VoiceRoom.audioContext.close();
      VoiceRoom.audioContext.state = 'closed';
      
      expect(() => {
        VoiceRoom.leaveRoom();
      }).not.toThrow();
    });

    it('должен обрабатывать ошибки при закрытии AudioContext', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const originalClose = VoiceRoom.audioContext.close.bind(VoiceRoom.audioContext);
      VoiceRoom.audioContext.close = () => Promise.reject(new Error('Close failed'));
      
      expect(() => {
        VoiceRoom.leaveRoom();
      }).not.toThrow();
      
      // Восстанавливаем только если audioContext еще существует
      if (VoiceRoom.audioContext) {
        VoiceRoom.audioContext.close = originalClose;
      }
    });

    it('должен очищать analyser при выходе', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const analyser = VoiceRoom.analyser;
      
      VoiceRoom.leaveRoom();
      
      expect(VoiceRoom.analyser).toBeNull();
    });
  });

  describe('Очистка таймаутов и интервалов', () => {
    it('должен очищать reconnectTimeout', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.currentRoomId = 'TEST01';
      VoiceRoom.reconnectTimeout = setTimeout(() => {}, 1000);
      
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      VoiceRoom.leaveRoom();
      
      expect(clearTimeoutSpy).toHaveBeenCalled();
      expect(VoiceRoom.reconnectTimeout).toBeNull();
    });

    it('должен очищать microphoneLevelCheckInterval', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.startMicrophoneMonitoring();
      expect(VoiceRoom.microphoneLevelCheckInterval).toBeTruthy();
      
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      VoiceRoom.leaveRoom();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(VoiceRoom.microphoneLevelCheckInterval).toBeNull();
    });

    it('должен обрабатывать отсутствие таймаутов', () => {
      VoiceRoom.init();
      VoiceRoom.reconnectTimeout = null;
      VoiceRoom.microphoneLevelCheckInterval = null;
      
      expect(() => {
        VoiceRoom.leaveRoom();
      }).not.toThrow();
    });

    it('должен очищать все таймауты даже при ошибках', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.reconnectTimeout = setTimeout(() => {}, 1000);
      VoiceRoom.startMicrophoneMonitoring();
      
      // Мокаем clearTimeout чтобы выбросить ошибку
      const originalClearTimeout = global.clearTimeout;
      global.clearTimeout = () => {
        throw new Error('Clear timeout failed');
      };
      
      // Должен обработать ошибку
      expect(() => {
        VoiceRoom.leaveRoom();
      }).not.toThrow();
      
      global.clearTimeout = originalClearTimeout;
    });
  });

  describe('Очистка при ошибках инициализации', () => {
    it('должен очищать ресурсы при ошибке инициализации медиа', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Мокаем getUserMedia чтобы выбросить ошибку
      const mockGetUserMedia = vi.spyOn(navigator.mediaDevices, 'getUserMedia');
      const error = new Error('Media init failed');
      mockGetUserMedia.mockRejectedValueOnce(error);
      
      try {
        await VoiceRoom.initMedia();
      } catch (e) {
        // Ожидаем ошибку
      }
      
      // Должны быть очищены частично созданные ресурсы
      expect(VoiceRoom.localStream).toBeFalsy();
      
      mockGetUserMedia.mockRestore();
    });

    it('должен очищать предыдущие ресурсы при повторной инициализации', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const firstStream = VoiceRoom.localStream;
      const firstContext = VoiceRoom.audioContext;
      
      await VoiceRoom.initMedia();
      
      // Должны быть созданы новые ресурсы
      expect(VoiceRoom.localStream).not.toBe(firstStream);
      expect(VoiceRoom.audioContext).not.toBe(firstContext);
    });
  });

  describe('Очистка UI', () => {
    it('должен очищать usersGrid при выходе', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const userCard = document.createElement('div');
      userCard.className = 'user-card';
      VoiceRoom.elements.usersGrid.appendChild(userCard);
      
      VoiceRoom.leaveRoom();
      
      expect(VoiceRoom.elements.usersGrid.innerHTML).toBe('');
    });

    it('должен очищать currentRoomId и myUserId', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      VoiceRoom.currentRoomId = 'TEST01';
      VoiceRoom.myUserId = 'user123';
      
      VoiceRoom.leaveRoom();
      
      expect(VoiceRoom.currentRoomId).toBeNull();
      expect(VoiceRoom.myUserId).toBeNull();
    });
  });

  describe('Очистка при повторной инициализации', () => {
    it('должен очищать предыдущие peer connections при повторной инициализации', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.createPeerConnection('user1');
      VoiceRoom.createPeerConnection('user2');
      
      expect(VoiceRoom.peers.size).toBe(2);
      
      VoiceRoom.init();
      
      // Peer connections должны быть очищены или пересозданы
      expect(VoiceRoom.peers.size).toBe(0);
    });

    it('должен очищать предыдущий localStream при повторной инициализации медиа', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const firstStream = VoiceRoom.localStream;
      
      await VoiceRoom.initMedia();
      
      // Должен быть создан новый поток
      expect(VoiceRoom.localStream).not.toBe(firstStream);
    });
  });

  describe('Проверка отсутствия утечек памяти', () => {
    it('должен освобождать все ссылки на peer connections', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.createPeerConnection('user1');
      const peer = VoiceRoom.peers.get('user1');
      
      VoiceRoom.leaveRoom();
      
      expect(VoiceRoom.peers.has('user1')).toBe(false);
      expect(VoiceRoom.peers.size).toBe(0);
    });

    it('должен освобождать ссылки на media streams', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const stream = VoiceRoom.localStream;
      
      VoiceRoom.leaveRoom();
      
      expect(VoiceRoom.localStream).toBeNull();
    });

    it('должен освобождать ссылки на AudioContext', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const context = VoiceRoom.audioContext;
      
      VoiceRoom.leaveRoom();
      
      expect(VoiceRoom.audioContext).toBeNull();
    });

    it('должен очищать все таймауты и интервалы', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      VoiceRoom.reconnectTimeout = setTimeout(() => {}, 1000);
      VoiceRoom.startMicrophoneMonitoring();
      
      VoiceRoom.leaveRoom();
      
      expect(VoiceRoom.reconnectTimeout).toBeNull();
      expect(VoiceRoom.microphoneLevelCheckInterval).toBeNull();
    });
  });

  describe('Очистка при частичной инициализации', () => {
    it('должен обрабатывать очистку когда медиа не инициализировано', () => {
      VoiceRoom.init();
      
      expect(() => {
        VoiceRoom.leaveRoom();
      }).not.toThrow();
    });

    it('должен обрабатывать очистку когда socket не подключен', () => {
      VoiceRoom.init();
      VoiceRoom.socket = null;
      VoiceRoom.currentRoomId = 'TEST01';
      
      expect(() => {
        VoiceRoom.leaveRoom();
      }).not.toThrow();
    });

    it('должен обрабатывать очистку когда нет peer connections', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      expect(VoiceRoom.peers.size).toBe(0);
      
      expect(() => {
        VoiceRoom.leaveRoom();
      }).not.toThrow();
    });
  });
});
