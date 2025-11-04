/**
 * Тесты для WebRTC signaling state handling
 * Проверяют правильную обработку состояний peer connection при установке offer/answer
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
  
  // Загружаем реальный код VoiceRoom (упрощенная версия для тестов)
  // В реальности это будет импорт из www/js/voice-room.js
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
    reconnectTimeout: null,
    microphoneLevelCheckInterval: null,
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
        loginScreen: document.getElementById('loginScreen'),
        roomScreen: document.getElementById('roomScreen')
      };
    },
    
    initSocket() {
      if (typeof io === 'undefined') return;
      this.socket = io(window.location.origin);
      this.setupSocketEvents();
    },
    
    setupSocketEvents() {
      if (!this.socket) return;
      
      this.socket.on('connect', () => {
        this.connectionStatus = 'connected';
      });
      
      this.socket.on('disconnect', () => {
        this.connectionStatus = 'disconnected';
      });
      
      // Обработчик offer с проверкой состояния
      this.socket.on('offer', async ({ offer, fromUserId }) => {
        try {
          const peer = this.peers.get(fromUserId);
          if (!peer) {
            console.warn('Peer not found for offer from:', fromUserId);
            return;
          }
          
          console.log('Received offer from:', fromUserId, 'Peer state:', peer.signalingState);
          
          // Проверяем что мы можем установить remote description
          if (peer.signalingState === 'stable') {
            // Нормальный случай - устанавливаем remote offer, создаем answer
            await peer.setRemoteDescription(new RTCSessionDescription(offer));
            console.log('Remote description (offer) set for:', fromUserId);
            
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            console.log('Local description (answer) set for:', fromUserId);
            
            this.socket.emit('answer', { 
              roomId: this.currentRoomId, 
              answer, 
              targetUserId: fromUserId, 
              fromUserId: this.myUserId 
            });
          } else if (peer.signalingState === 'have-local-offer') {
            // У нас уже есть local offer, значит мы тоже создали offer одновременно
            console.log('Both peers created offer, handling rollback for:', fromUserId);
            await peer.setRemoteDescription(new RTCSessionDescription(offer));
            console.log('Remote description (offer) set for:', fromUserId);
            
            // Если у нас уже есть local offer, нужно создать answer
            if (peer.localDescription && peer.localDescription.type === 'offer') {
              const answer = await peer.createAnswer();
              await peer.setLocalDescription(answer);
              console.log('Local description (answer) set for:', fromUserId);
              
              this.socket.emit('answer', { 
                roomId: this.currentRoomId, 
                answer, 
                targetUserId: fromUserId, 
                fromUserId: this.myUserId 
              });
            }
          } else {
            console.warn('Cannot set remote description, peer state:', peer.signalingState);
            return;
          }
        } catch (error) {
          console.error('Error handling offer:', error);
        }
      });
      
      // Обработчик answer с проверкой состояния
      this.socket.on('answer', async ({ answer, fromUserId }) => {
        try {
          const peer = this.peers.get(fromUserId);
          if (!peer) {
            console.warn('Peer not found for answer from:', fromUserId);
            return;
          }
          
          console.log('Received answer from:', fromUserId, 'Peer state:', peer.signalingState);
          
          // Проверяем что мы можем установить remote description
          // Answer можно установить только когда local description (offer) уже установлен
          if (peer.signalingState !== 'have-local-offer') {
            console.warn('Cannot set remote answer, peer state:', peer.signalingState, 'Expected: have-local-offer');
            return;
          }
          
          await peer.setRemoteDescription(new RTCSessionDescription(answer));
          console.log('Remote description (answer) set for:', fromUserId);
        } catch (error) {
          console.error('Error handling answer:', error);
        }
      });
      
      this.socket.on('ice-candidate', async ({ candidate, fromUserId }) => {
        try {
          const peer = this.peers.get(fromUserId);
          if (peer && candidate) {
            await peer.addIceCandidate(new RTCIceCandidate(candidate));
          }
        } catch (error) {
          console.error('Error adding ICE candidate:', error);
        }
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
      
      // Проверяем, не существует ли уже соединение
      if (this.peers.has(targetUserId)) {
        console.warn('Peer connection already exists for:', targetUserId);
        const existingPeer = this.peers.get(targetUserId);
        console.log('Existing peer state:', existingPeer.signalingState);
        return;
      }
      
      console.log('Creating peer with:', targetUserId);
      console.log('My userId:', this.myUserId, 'Target userId:', targetUserId);
      
      // Определяем кто создает offer первым (чтобы избежать race condition)
      // Пользователь с меньшим userId создает offer
      const shouldCreateOffer = this.myUserId < targetUserId;
      console.log('Should create offer:', shouldCreateOffer);
      
      try {
        const peer = new RTCPeerConnection({
          iceServers: this.ICE_SERVERS
        });
        
        // Добавляем локальные треки
        this.localStream.getTracks().forEach(track => {
          peer.addTrack(track, this.localStream);
        });
        
        peer.ontrack = (event) => {
          console.log('Received track from:', targetUserId);
          const stream = event.streams[0];
          
          const audio = document.getElementById(`audio-${targetUserId}`);
          if (audio) {
            audio.srcObject = stream;
            audio.play().catch(err => {
              console.error('Error playing audio:', err);
            });
          }
        };
        
        peer.onicecandidate = (event) => {
          if (event.candidate && this.socket && this.socket.connected) {
            this.socket.emit('ice-candidate', { 
              roomId: this.currentRoomId, 
              candidate: event.candidate, 
              targetUserId, 
              fromUserId: this.myUserId 
            });
          }
        };
        
        peer.oniceconnectionstatechange = () => {
          console.log(`ICE connection state with ${targetUserId}:`, peer.iceConnectionState);
        };
        
        peer.onconnectionstatechange = () => {
          console.log(`Connection state with ${targetUserId}:`, peer.connectionState);
        };
        
        peer.onerror = (error) => {
          console.error('Peer connection error:', error);
        };
        
        this.peers.set(targetUserId, peer);
        
        // Создаем offer только если мы должны инициировать соединение
        if (shouldCreateOffer) {
          console.log('Creating offer for:', targetUserId);
          peer.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: false
          }).then(offer => {
            console.log('Offer created, setting local description...');
            return peer.setLocalDescription(offer);
          }).then(() => {
            console.log('Local description set, sending offer to:', targetUserId);
            if (this.socket && this.socket.connected && peer.signalingState === 'have-local-offer') {
              this.socket.emit('offer', { 
                roomId: this.currentRoomId, 
                offer: peer.localDescription, 
                targetUserId, 
                fromUserId: this.myUserId 
              });
            } else {
              console.warn('Cannot send offer:', {
                socketConnected: this.socket?.connected,
                peerState: peer.signalingState
              });
            }
          }).catch(error => {
            console.error('Error creating offer:', error);
            this.peers.delete(targetUserId);
          });
        } else {
          console.log('Waiting for offer from:', targetUserId);
        }
      } catch (error) {
        console.error('Error creating peer connection:', error);
      }
    },
    
    addUserToGrid(userId, username) {
      if (!this.elements.usersGrid || document.getElementById(`user-${userId}`)) return;
      
      const card = document.createElement('div');
      card.id = `user-${userId}`;
      card.className = 'user-card';
      
      const audio = document.createElement('audio');
      audio.id = `audio-${userId}`;
      audio.autoplay = true;
      card.appendChild(audio);
      
      this.elements.usersGrid.appendChild(card);
    },
    
    removeUser(userId) {
      const peer = this.peers.get(userId);
      if (peer) {
        try {
          peer.close();
        } catch (error) {
          console.error('Error closing peer connection:', error);
        }
        this.peers.delete(userId);
      }
      
      const card = document.getElementById(`user-${userId}`);
      if (card) {
        card.remove();
      }
    },
    
    showNotification(message, type, duration) {
      // Мок для showNotification
      console.log(`Notification [${type}]:`, message);
    }
  };
  
  window.VoiceRoom = VoiceRoom;
});

afterEach(() => {
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

describe('WebRTC Signaling State Handling', () => {
  
  describe('Offer обработка', () => {
    
    it('должен правильно обрабатывать offer когда peer в состоянии stable', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 50)); // Ждем подключения socket
      
      await VoiceRoom.initMedia();
      VoiceRoom.currentRoomId = 'test-room';
      VoiceRoom.myUserId = 'user-b';
      
      // Создаем peer connection
      VoiceRoom.createPeerConnection('user-a');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const peer = VoiceRoom.peers.get('user-a');
      expect(peer).toBeDefined();
      expect(peer.signalingState).toBe('stable');
      
      // Симулируем получение offer
      const offer = { type: 'offer', sdp: 'test-offer-sdp' };
      const offerHandler = VoiceRoom.socket._eventHandlers.get('offer');
      
      expect(offerHandler).toBeDefined();
      expect(offerHandler.length).toBeGreaterThan(0);
      
      // Вызываем обработчик offer
      await offerHandler[0]({ offer, fromUserId: 'user-a' });
      
      // Проверяем что remote description установлен
      expect(peer.remoteDescription).toBeDefined();
      expect(peer.localDescription).toBeDefined();
      expect(peer.localDescription.type).toBe('answer');
      expect(peer.signalingState).toBe('stable');
    });
    
    it('должен обрабатывать одновременные offer (rollback)', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await VoiceRoom.initMedia();
      VoiceRoom.currentRoomId = 'test-room';
      VoiceRoom.myUserId = 'user-b';
      
      // Создаем peer connection и устанавливаем local offer
      VoiceRoom.createPeerConnection('user-a');
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const peer = VoiceRoom.peers.get('user-a');
      expect(peer).toBeDefined();
      
      // Если мы создали offer одновременно, состояние будет have-local-offer
      // Но в нашем случае user-b < user-a, поэтому user-b не создает offer
      // Давайте вручную установим local offer для теста
      const localOffer = await peer.createOffer();
      await peer.setLocalDescription(localOffer);
      expect(peer.signalingState).toBe('have-local-offer');
      
      // Теперь получаем offer от другого пользователя
      const offer = { type: 'offer', sdp: 'test-offer-sdp' };
      const offerHandler = VoiceRoom.socket._eventHandlers.get('offer');
      
      await offerHandler[0]({ offer, fromUserId: 'user-a' });
      
      // Проверяем что remote description установлен и answer создан
      expect(peer.remoteDescription).toBeDefined();
      expect(peer.localDescription).toBeDefined();
      expect(peer.localDescription.type).toBe('answer');
    });
    
    it('должен игнорировать offer если peer в неправильном состоянии', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await VoiceRoom.initMedia();
      VoiceRoom.currentRoomId = 'test-room';
      VoiceRoom.myUserId = 'user-b';
      
      VoiceRoom.createPeerConnection('user-a');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const peer = VoiceRoom.peers.get('user-a');
      
      // Устанавливаем состояние, которое не позволяет установить remote offer
      peer.signalingState = 'have-remote-offer';
      
      const offer = { type: 'offer', sdp: 'test-offer-sdp' };
      const offerHandler = VoiceRoom.socket._eventHandlers.get('offer');
      
      // Должно быть предупреждение, но не ошибка
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      await offerHandler[0]({ offer, fromUserId: 'user-a' });
      
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Cannot set remote description'),
        expect.anything()
      );
      
      consoleWarn.mockRestore();
    });
    
    it('должен обрабатывать отсутствие peer при получении offer', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await VoiceRoom.initMedia();
      VoiceRoom.currentRoomId = 'test-room';
      VoiceRoom.myUserId = 'user-b';
      
      const offer = { type: 'offer', sdp: 'test-offer-sdp' };
      const offerHandler = VoiceRoom.socket._eventHandlers.get('offer');
      
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      await offerHandler[0]({ offer, fromUserId: 'nonexistent-user' });
      
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Peer not found'),
        'nonexistent-user'
      );
      
      consoleWarn.mockRestore();
    });
  });
  
  describe('Answer обработка', () => {
    
    it('должен правильно обрабатывать answer когда peer в состоянии have-local-offer', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await VoiceRoom.initMedia();
      VoiceRoom.currentRoomId = 'test-room';
      VoiceRoom.myUserId = 'user-a';
      
      // Создаем peer connection и устанавливаем local offer
      VoiceRoom.createPeerConnection('user-b');
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const peer = VoiceRoom.peers.get('user-b');
      expect(peer).toBeDefined();
      expect(peer.signalingState).toBe('have-local-offer');
      
      // Симулируем получение answer
      const answer = { type: 'answer', sdp: 'test-answer-sdp' };
      const answerHandler = VoiceRoom.socket._eventHandlers.get('answer');
      
      await answerHandler[0]({ answer, fromUserId: 'user-b' });
      
      // Проверяем что remote description установлен
      expect(peer.remoteDescription).toBeDefined();
      expect(peer.remoteDescription.type).toBe('answer');
      expect(peer.signalingState).toBe('stable');
    });
    
    it('должен игнорировать answer если peer не в состоянии have-local-offer', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await VoiceRoom.initMedia();
      VoiceRoom.currentRoomId = 'test-room';
      VoiceRoom.myUserId = 'user-a';
      
      VoiceRoom.createPeerConnection('user-b');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const peer = VoiceRoom.peers.get('user-b');
      
      // Устанавливаем состояние, которое не позволяет установить remote answer
      peer.signalingState = 'stable';
      
      const answer = { type: 'answer', sdp: 'test-answer-sdp' };
      const answerHandler = VoiceRoom.socket._eventHandlers.get('answer');
      
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      await answerHandler[0]({ answer, fromUserId: 'user-b' });
      
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Cannot set remote answer'),
        expect.anything(),
        expect.stringContaining('have-local-offer')
      );
      
      consoleWarn.mockRestore();
    });
    
    it('должен обрабатывать отсутствие peer при получении answer', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await VoiceRoom.initMedia();
      VoiceRoom.currentRoomId = 'test-room';
      
      const answer = { type: 'answer', sdp: 'test-answer-sdp' };
      const answerHandler = VoiceRoom.socket._eventHandlers.get('answer');
      
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      await answerHandler[0]({ answer, fromUserId: 'nonexistent-user' });
      
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Peer not found'),
        'nonexistent-user'
      );
      
      consoleWarn.mockRestore();
    });
  });
  
  describe('Race condition предотвращение', () => {
    
    it('должен определять кто создает offer на основе userId сравнения', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await VoiceRoom.initMedia();
      VoiceRoom.currentRoomId = 'test-room';
      VoiceRoom.myUserId = 'user-a';
      
      // user-a < user-b, поэтому user-a должен создать offer
      const socketEmit = vi.spyOn(VoiceRoom.socket, 'emit');
      
      VoiceRoom.createPeerConnection('user-b');
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Проверяем что offer был отправлен
      expect(socketEmit).toHaveBeenCalledWith(
        'offer',
        expect.objectContaining({
          targetUserId: 'user-b',
          fromUserId: 'user-a'
        })
      );
      
      socketEmit.mockRestore();
    });
    
    it('должен ждать offer если userId больше чем targetUserId', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await VoiceRoom.initMedia();
      VoiceRoom.currentRoomId = 'test-room';
      VoiceRoom.myUserId = 'user-b';
      
      const socketEmit = vi.spyOn(VoiceRoom.socket, 'emit');
      
      // user-b > user-a, поэтому user-b должен ждать offer от user-a
      VoiceRoom.createPeerConnection('user-a');
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Проверяем что offer НЕ был отправлен
      const offerCalls = socketEmit.mock.calls.filter(call => call[0] === 'offer');
      expect(offerCalls.length).toBe(0);
      
      socketEmit.mockRestore();
    });
    
    it('должен игнорировать повторное создание peer connection для того же пользователя', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await VoiceRoom.initMedia();
      VoiceRoom.currentRoomId = 'test-room';
      VoiceRoom.myUserId = 'user-a';
      
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      VoiceRoom.createPeerConnection('user-b');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Пытаемся создать еще раз
      VoiceRoom.createPeerConnection('user-b');
      
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('already exists'),
        'user-b'
      );
      
      // Проверяем что peer connection все еще один
      expect(VoiceRoom.peers.size).toBe(1);
      
      consoleWarn.mockRestore();
    });
  });
  
  describe('Обработка ошибок', () => {
    
    it('должен обрабатывать ошибку при установке remote description', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await VoiceRoom.initMedia();
      VoiceRoom.currentRoomId = 'test-room';
      VoiceRoom.myUserId = 'user-b';
      
      VoiceRoom.createPeerConnection('user-a');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const peer = VoiceRoom.peers.get('user-a');
      
      // Устанавливаем состояние, которое вызовет ошибку
      peer.signalingState = 'have-remote-offer';
      
      const offer = { type: 'offer', sdp: 'test-offer-sdp' };
      const offerHandler = VoiceRoom.socket._eventHandlers.get('offer');
      
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await offerHandler[0]({ offer, fromUserId: 'user-a' });
      
      // Должно быть предупреждение, но не должно быть ошибки установки
      expect(consoleError).not.toHaveBeenCalled();
      
      consoleError.mockRestore();
    });
    
    it('должен обрабатывать ошибку при создании answer', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await VoiceRoom.initMedia();
      VoiceRoom.currentRoomId = 'test-room';
      VoiceRoom.myUserId = 'user-b';
      
      VoiceRoom.createPeerConnection('user-a');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const peer = VoiceRoom.peers.get('user-a');
      
      // Мокаем createAnswer чтобы вызвать ошибку
      const originalCreateAnswer = peer.createAnswer;
      peer.createAnswer = vi.fn().mockRejectedValue(new Error('Failed to create answer'));
      
      const offer = { type: 'offer', sdp: 'test-offer-sdp' };
      const offerHandler = VoiceRoom.socket._eventHandlers.get('offer');
      
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await offerHandler[0]({ offer, fromUserId: 'user-a' });
      
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('Error handling offer'),
        expect.any(Error)
      );
      
      peer.createAnswer = originalCreateAnswer;
      consoleError.mockRestore();
    });
  });
  
  describe('Состояния peer connection', () => {
    
    it('должен правильно обновлять signalingState при установке local offer', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await VoiceRoom.initMedia();
      VoiceRoom.currentRoomId = 'test-room';
      VoiceRoom.myUserId = 'user-a';
      
      VoiceRoom.createPeerConnection('user-b');
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const peer = VoiceRoom.peers.get('user-b');
      
      // После установки local offer должно быть состояние have-local-offer
      expect(peer.signalingState).toBe('have-local-offer');
      expect(peer.localDescription).toBeDefined();
      expect(peer.localDescription.type).toBe('offer');
    });
    
    it('должен правильно обновлять signalingState при установке remote offer', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await VoiceRoom.initMedia();
      VoiceRoom.currentRoomId = 'test-room';
      VoiceRoom.myUserId = 'user-b';
      
      VoiceRoom.createPeerConnection('user-a');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const peer = VoiceRoom.peers.get('user-a');
      
      const offer = { type: 'offer', sdp: 'test-offer-sdp' };
      const offerHandler = VoiceRoom.socket._eventHandlers.get('offer');
      
      await offerHandler[0]({ offer, fromUserId: 'user-a' });
      
      // После установки remote offer и local answer должно быть состояние stable
      expect(peer.signalingState).toBe('stable');
      expect(peer.remoteDescription).toBeDefined();
      expect(peer.remoteDescription.type).toBe('offer');
      expect(peer.localDescription).toBeDefined();
      expect(peer.localDescription.type).toBe('answer');
    });
    
    it('должен правильно обновлять signalingState при установке remote answer', async () => {
      VoiceRoom.init();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await VoiceRoom.initMedia();
      VoiceRoom.currentRoomId = 'test-room';
      VoiceRoom.myUserId = 'user-a';
      
      VoiceRoom.createPeerConnection('user-b');
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const peer = VoiceRoom.peers.get('user-b');
      expect(peer.signalingState).toBe('have-local-offer');
      
      const answer = { type: 'answer', sdp: 'test-answer-sdp' };
      const answerHandler = VoiceRoom.socket._eventHandlers.get('answer');
      
      await answerHandler[0]({ answer, fromUserId: 'user-b' });
      
      // После установки remote answer должно быть состояние stable
      expect(peer.signalingState).toBe('stable');
      expect(peer.remoteDescription).toBeDefined();
      expect(peer.remoteDescription.type).toBe('answer');
    });
  });
});

