/**
 * Тесты состояний соединений для voice-room-cordova.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupDOM } from './helpers/setup-dom.js';
import { clearServerState } from './helpers/socket-mock.js';
import { mockGetUserMedia } from './helpers/webrtc-mock.js';

let VoiceRoom;
let App;

beforeEach(async () => {
  setupDOM();
  clearServerState();
  mockGetUserMedia();
  
  // Создаем модуль App для Cordova
  App = {
    get isCordova() {
      return true; // Для тестов Cordova всегда true
    },
    get isBrowser() {
      return false;
    },
    getSocketUrl() {
      return 'https://aiternitas.ru';
    },
    init() {}
  };
  window.App = App;
  
  // Устанавливаем cordova в window для тестов
  window.cordova = {
    platformId: 'android'
  };
  
  // Загружаем модуль voice-room-cordova.js
  // В реальности это будет динамический импорт или загрузка через script tag
  // Для тестов создаем упрощенную версию на основе реального кода
  VoiceRoom = {
    socket: null,
    localStream: null,
    peers: new Map(),
    currentRoomId: null,
    myUserId: null,
    myUsername: null,
    audioContext: null,
    analyser: null,
    elements: {},
    ICE_SERVERS: [{ urls: 'stun:stun.l.google.com:19302' }],
    
    init() {
      this.initElements();
      this.initSocket();
    },
    
    initElements() {
      this.elements = {
        usernameInput: document.getElementById('username'),
        roomIdInput: document.getElementById('roomId'),
        usersGrid: document.getElementById('usersGrid'),
        statusMessage: document.getElementById('statusMessage'),
        btnCreateRoom: document.getElementById('btnCreateRoom'),
        btnJoinRoom: document.getElementById('btnJoinRoom'),
        btnJoinRoomNow: document.getElementById('btnJoinRoomNow'),
        loginScreen: document.getElementById('loginScreen'),
        roomScreen: document.getElementById('roomScreen'),
        currentRoomIdSpan: document.getElementById('currentRoomId'),
        userCount: document.getElementById('userCount')
      };
    },
    
    initSocket() {
      if (typeof io === 'undefined') return;
      this.socket = io(App.getSocketUrl());
      this.setupSocketEvents();
    },
    
    setupSocketEvents() {
      if (!this.socket) return;
      
      this.socket.on('connect', () => {
        console.log('Socket connected');
      });
      
      this.socket.on('disconnect', () => {
        console.log('Socket disconnected');
      });
    },
    
    async initMedia() {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
    },
    
    createPeerConnection(targetUserId) {
      if (!this.localStream) {
        console.error('Cannot create peer connection: no local stream');
        return;
      }
      
      if (this.peers.has(targetUserId)) {
        console.warn('Peer connection already exists for:', targetUserId);
        return;
      }
      
      const shouldCreateOffer = this.myUserId < targetUserId;
      
      try {
        const peer = new RTCPeerConnection({
          iceServers: this.ICE_SERVERS
        });
        
        this.localStream.getTracks().forEach(track => {
          peer.addTrack(track, this.localStream);
        });
        
        peer.ontrack = (event) => {
          console.log('Received track from:', targetUserId);
          const audio = document.createElement('audio');
          audio.autoplay = true;
          audio.srcObject = event.streams[0];
          audio.setAttribute('data-user-id', targetUserId);
          document.body.appendChild(audio);
          
          // Обновляем статус при получении трека
          this.updateUserConnectionStatus(targetUserId, 'connected');
        };
        
        peer.onicecandidate = (event) => {
          if (event.candidate && this.socket && this.socket.connected) {
            this.socket.emit('ice-candidate', {
              to: targetUserId,
              candidate: event.candidate,
              roomId: this.currentRoomId
            });
          }
        };
        
        // Отслеживаем изменение состояния ICE соединения
        peer.oniceconnectionstatechange = () => {
          console.log(`ICE connection state for ${targetUserId}:`, peer.iceConnectionState);
          const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
          const status = card?.querySelector('.user-status');
          
          if (!status) return;
          
          switch (peer.iceConnectionState) {
            case 'connected':
            case 'completed':
              status.textContent = 'Подключен';
              if (card) {
                card.classList.add('connected');
                card.classList.remove('reconnecting', 'error');
              }
              break;
            case 'connecting':
            case 'checking':
              status.textContent = 'Подключение...';
              if (card) {
                card.classList.remove('error', 'connected');
              }
              break;
            case 'disconnected':
              status.textContent = 'Отключен';
              if (card) {
                card.classList.add('reconnecting');
                card.classList.remove('connected', 'error');
              }
              break;
            case 'failed':
              status.textContent = 'Ошибка подключения';
              if (card) {
                card.classList.add('error');
                card.classList.remove('connected', 'reconnecting');
              }
              break;
            case 'closed':
              status.textContent = 'Закрыто';
              break;
          }
        };
        
        // Отслеживаем изменение состояния соединения
        peer.onconnectionstatechange = () => {
          console.log(`Connection state for ${targetUserId}:`, peer.connectionState);
          const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
          const status = card?.querySelector('.user-status');
          
          if (!status) return;
          
          switch (peer.connectionState) {
            case 'connected':
              status.textContent = 'Подключен';
              if (card) {
                card.classList.add('connected');
                card.classList.remove('reconnecting', 'error');
              }
              break;
            case 'connecting':
              status.textContent = 'Подключение...';
              if (card) {
                card.classList.remove('error', 'connected');
              }
              break;
            case 'disconnected':
              status.textContent = 'Отключен';
              if (card) {
                card.classList.add('reconnecting');
                card.classList.remove('connected', 'error');
              }
              break;
            case 'failed':
              status.textContent = 'Ошибка подключения';
              if (card) {
                card.classList.add('error');
                card.classList.remove('connected', 'reconnecting');
              }
              break;
            case 'closed':
              status.textContent = 'Закрыто';
              break;
          }
        };
        
        this.peers.set(targetUserId, peer);
        
        if (shouldCreateOffer) {
          peer.createOffer().then(offer => {
            peer.setLocalDescription(offer);
            if (this.socket && this.socket.connected) {
              this.socket.emit('offer', {
                to: targetUserId,
                offer: offer,
                roomId: this.currentRoomId
              });
            }
          }).catch(error => {
            console.error('Error creating offer:', error);
          });
        }
      } catch (error) {
        console.error('Error creating peer connection:', error);
      }
    },
    
    addUserToGrid(userId, username, isMyself = false) {
      if (!this.elements.usersGrid) return;
      
      const existingCard = document.querySelector(`[data-user-id="${userId}"]`);
      if (existingCard) return;
      
      const emptyState = this.elements.usersGrid.querySelector('.empty-state');
      if (emptyState) {
        emptyState.remove();
      }
      
      const card = document.createElement('div');
      card.className = 'user-card';
      card.setAttribute('data-user-id', userId);
      if (isMyself) {
        card.classList.add('myself');
      }
      
      const avatar = document.createElement('div');
      avatar.className = 'user-avatar';
      avatar.textContent = username.charAt(0).toUpperCase();
      
      const name = document.createElement('div');
      name.className = 'user-name';
      name.textContent = username;
      
      const status = document.createElement('div');
      status.className = 'user-status';
      status.textContent = isMyself ? 'Вы' : 'Подключение...';
      
      card.appendChild(avatar);
      card.appendChild(name);
      card.appendChild(status);
      
      this.elements.usersGrid.appendChild(card);
    },
    
    updateUserConnectionStatus(userId, status) {
      const card = document.querySelector(`[data-user-id="${userId}"]`);
      const statusElement = card?.querySelector('.user-status');
      
      if (!statusElement) return;
      
      switch (status) {
        case 'connected':
          statusElement.textContent = 'Подключен';
          if (card) {
            card.classList.add('connected');
            card.classList.remove('reconnecting', 'error');
          }
          break;
        case 'connecting':
          statusElement.textContent = 'Подключение...';
          if (card) {
            card.classList.remove('error', 'connected');
          }
          break;
        case 'disconnected':
          statusElement.textContent = 'Отключен';
          if (card) {
            card.classList.add('reconnecting');
            card.classList.remove('connected', 'error');
          }
          break;
        case 'error':
          statusElement.textContent = 'Ошибка подключения';
          if (card) {
            card.classList.add('error');
            card.classList.remove('connected', 'reconnecting');
          }
          break;
      }
    },
    
    removeUserFromGrid(userId) {
      const card = document.querySelector(`[data-user-id="${userId}"]`);
      if (card) {
        card.remove();
      }
      
      const peer = this.peers.get(userId);
      if (peer) {
        try {
          peer.close();
        } catch (error) {
          console.error('Error closing peer:', error);
        }
        this.peers.delete(userId);
      }
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
  
  // Очищаем все peer connections
  VoiceRoom.peers.forEach(peer => {
    try {
      peer.close();
    } catch (e) {}
  });
  VoiceRoom.peers.clear();
  
  if (VoiceRoom.localStream) {
    VoiceRoom.localStream.getTracks().forEach(track => track.stop());
  }
});

describe('Состояния соединений (Cordova)', () => {
  describe('Состояния ICE', () => {
    it('должен обрабатывать состояние new', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      expect(peer).toBeDefined();
      expect(peer.iceConnectionState).toBe('new');
    });

    it('должен обрабатывать состояние connecting', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.myUserId = 'user-a';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      expect(peer).toBeDefined();
      
      // Симулируем изменение состояния
      peer.iceConnectionState = 'connecting';
      if (peer.oniceconnectionstatechange) {
        peer.oniceconnectionstatechange();
      }
      
      const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
      const status = card?.querySelector('.user-status');
      expect(status).toBeDefined();
      expect(status.textContent).toBe('Подключение...');
    });

    it('должен обрабатывать состояние connected', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.myUserId = 'user-a';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      expect(peer).toBeDefined();
      
      // Симулируем изменение состояния
      peer.iceConnectionState = 'connected';
      if (peer.oniceconnectionstatechange) {
        peer.oniceconnectionstatechange();
      }
      
      const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
      const status = card?.querySelector('.user-status');
      expect(status).toBeDefined();
      expect(status.textContent).toBe('Подключен');
      expect(card.classList.contains('connected')).toBe(true);
    });

    it('должен обрабатывать состояние disconnected', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.myUserId = 'user-a';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      expect(peer).toBeDefined();
      
      // Симулируем изменение состояния
      peer.iceConnectionState = 'disconnected';
      if (peer.oniceconnectionstatechange) {
        peer.oniceconnectionstatechange();
      }
      
      const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
      const status = card?.querySelector('.user-status');
      expect(status).toBeDefined();
      expect(status.textContent).toBe('Отключен');
      expect(card.classList.contains('reconnecting')).toBe(true);
    });

    it('должен обрабатывать состояние failed', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.myUserId = 'user-a';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      expect(peer).toBeDefined();
      
      // Симулируем изменение состояния
      peer.iceConnectionState = 'failed';
      if (peer.oniceconnectionstatechange) {
        peer.oniceconnectionstatechange();
      }
      
      const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
      const status = card?.querySelector('.user-status');
      expect(status).toBeDefined();
      expect(status.textContent).toBe('Ошибка подключения');
      expect(card.classList.contains('error')).toBe(true);
    });

    it('должен обрабатывать состояние closed', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.myUserId = 'user-a';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      expect(peer).toBeDefined();
      
      // Симулируем изменение состояния
      peer.iceConnectionState = 'closed';
      if (peer.oniceconnectionstatechange) {
        peer.oniceconnectionstatechange();
      }
      
      const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
      const status = card?.querySelector('.user-status');
      expect(status).toBeDefined();
      expect(status.textContent).toBe('Закрыто');
    });

    it('должен обрабатывать состояние checking', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.myUserId = 'user-a';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      expect(peer).toBeDefined();
      
      // Симулируем изменение состояния
      peer.iceConnectionState = 'checking';
      if (peer.oniceconnectionstatechange) {
        peer.oniceconnectionstatechange();
      }
      
      const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
      const status = card?.querySelector('.user-status');
      expect(status).toBeDefined();
      expect(status.textContent).toBe('Подключение...');
    });
  });

  describe('Состояния Connection', () => {
    it('должен обрабатывать состояние connecting', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.myUserId = 'user-a';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      expect(peer).toBeDefined();
      
      // Симулируем изменение состояния
      peer.connectionState = 'connecting';
      if (peer.onconnectionstatechange) {
        peer.onconnectionstatechange();
      }
      
      const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
      const status = card?.querySelector('.user-status');
      expect(status).toBeDefined();
      expect(status.textContent).toBe('Подключение...');
    });

    it('должен обрабатывать состояние connected', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.myUserId = 'user-a';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      expect(peer).toBeDefined();
      
      // Симулируем изменение состояния
      peer.connectionState = 'connected';
      if (peer.onconnectionstatechange) {
        peer.onconnectionstatechange();
      }
      
      const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
      const status = card?.querySelector('.user-status');
      expect(status).toBeDefined();
      expect(status.textContent).toBe('Подключен');
      expect(card.classList.contains('connected')).toBe(true);
    });

    it('должен обрабатывать состояние failed', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.myUserId = 'user-a';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      expect(peer).toBeDefined();
      
      // Симулируем изменение состояния
      peer.connectionState = 'failed';
      if (peer.onconnectionstatechange) {
        peer.onconnectionstatechange();
      }
      
      const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
      const status = card?.querySelector('.user-status');
      expect(status).toBeDefined();
      expect(status.textContent).toBe('Ошибка подключения');
      expect(card.classList.contains('error')).toBe(true);
    });
  });

  describe('Обновление статуса через updateUserConnectionStatus', () => {
    it('должен обновлять статус на "Подключен"', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      
      VoiceRoom.updateUserConnectionStatus(targetUserId, 'connected');
      
      const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
      const status = card?.querySelector('.user-status');
      expect(status).toBeDefined();
      expect(status.textContent).toBe('Подключен');
      expect(card.classList.contains('connected')).toBe(true);
    });

    it('должен обновлять статус на "Подключение..."', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      
      VoiceRoom.updateUserConnectionStatus(targetUserId, 'connecting');
      
      const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
      const status = card?.querySelector('.user-status');
      expect(status).toBeDefined();
      expect(status.textContent).toBe('Подключение...');
    });

    it('должен обновлять статус на "Отключен"', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      
      VoiceRoom.updateUserConnectionStatus(targetUserId, 'disconnected');
      
      const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
      const status = card?.querySelector('.user-status');
      expect(status).toBeDefined();
      expect(status.textContent).toBe('Отключен');
      expect(card.classList.contains('reconnecting')).toBe(true);
    });

    it('должен обновлять статус на "Ошибка подключения"', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const targetUserId = 'target-user';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      
      VoiceRoom.updateUserConnectionStatus(targetUserId, 'error');
      
      const card = document.querySelector(`[data-user-id="${targetUserId}"]`);
      const status = card?.querySelector('.user-status');
      expect(status).toBeDefined();
      expect(status.textContent).toBe('Ошибка подключения');
      expect(card.classList.contains('error')).toBe(true);
    });
  });

  describe('Переходы между состояниями', () => {
    it('должен обрабатывать переход new -> connecting -> connected', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.myUserId = 'user-a';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      expect(peer).toBeDefined();
      
      // Начальное состояние
      expect(peer.iceConnectionState).toBe('new');
      
      // Переход в connecting
      peer.iceConnectionState = 'connecting';
      if (peer.oniceconnectionstatechange) {
        peer.oniceconnectionstatechange();
      }
      
      let card = document.querySelector(`[data-user-id="${targetUserId}"]`);
      let status = card?.querySelector('.user-status');
      expect(status.textContent).toBe('Подключение...');
      
      // Переход в connected
      peer.iceConnectionState = 'connected';
      if (peer.oniceconnectionstatechange) {
        peer.oniceconnectionstatechange();
      }
      
      card = document.querySelector(`[data-user-id="${targetUserId}"]`);
      status = card?.querySelector('.user-status');
      expect(status.textContent).toBe('Подключен');
      expect(card.classList.contains('connected')).toBe(true);
    });

    it('должен обрабатывать переход connected -> disconnected -> failed', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'target-user';
      VoiceRoom.myUserId = 'user-a';
      VoiceRoom.addUserToGrid(targetUserId, 'TargetUser', false);
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      expect(peer).toBeDefined();
      
      // Переход в connected
      peer.iceConnectionState = 'connected';
      if (peer.oniceconnectionstatechange) {
        peer.oniceconnectionstatechange();
      }
      
      let card = document.querySelector(`[data-user-id="${targetUserId}"]`);
      let status = card?.querySelector('.user-status');
      expect(status.textContent).toBe('Подключен');
      
      // Переход в disconnected
      peer.iceConnectionState = 'disconnected';
      if (peer.oniceconnectionstatechange) {
        peer.oniceconnectionstatechange();
      }
      
      card = document.querySelector(`[data-user-id="${targetUserId}"]`);
      status = card?.querySelector('.user-status');
      expect(status.textContent).toBe('Отключен');
      expect(card.classList.contains('reconnecting')).toBe(true);
      
      // Переход в failed
      peer.iceConnectionState = 'failed';
      if (peer.oniceconnectionstatechange) {
        peer.oniceconnectionstatechange();
      }
      
      card = document.querySelector(`[data-user-id="${targetUserId}"]`);
      status = card?.querySelector('.user-status');
      expect(status.textContent).toBe('Ошибка подключения');
      expect(card.classList.contains('error')).toBe(true);
    });
  });

  describe('Обработка отсутствия карточки пользователя', () => {
    it('должен безопасно обрабатывать отсутствие карточки при изменении состояния', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 100));
      await VoiceRoom.initMedia();
      
      const targetUserId = 'nonexistent-user';
      VoiceRoom.myUserId = 'user-a';
      
      // Создаем peer connection без карточки пользователя
      VoiceRoom.createPeerConnection(targetUserId);
      
      const peer = VoiceRoom.peers.get(targetUserId);
      expect(peer).toBeDefined();
      
      // Пытаемся изменить состояние - не должно быть ошибки
      peer.iceConnectionState = 'connected';
      if (peer.oniceconnectionstatechange) {
        // Не должно быть ошибки, даже если карточка не найдена
        expect(() => peer.oniceconnectionstatechange()).not.toThrow();
      }
    });
  });
});

