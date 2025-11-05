/**
 * Мок для Socket.IO клиента
 */

import { vi } from 'vitest';

// Глобальный хранилище для симуляции сервера
const serverState = {
  rooms: new Map(),
  clients: new Map()
};

// Создаем мок Socket.IO клиента
class MockSocket {
  constructor(url, options = {}) {
    this.id = `socket_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    this.url = url;
    this.options = options;
    this.connected = false;
    this.disconnected = true;
    this._eventHandlers = new Map();
    this._rooms = new Set();
    serverState.clients.set(this.id, this);
    
    // Автоматически подключаемся через небольшую задержку
    setTimeout(() => {
      this.connected = true;
      this.disconnected = false;
      this.emit('connect');
      if (this._eventHandlers.has('connect')) {
        const handlers = this._eventHandlers.get('connect');
        handlers.forEach(handler => handler());
      }
    }, 10);
  }

  on(event, handler) {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, []);
    }
    this._eventHandlers.get(event).push(handler);
    return this;
  }

  once(event, handler) {
    const onceHandler = (...args) => {
      handler(...args);
      this.off(event, onceHandler);
    };
    this.on(event, onceHandler);
    return this;
  }

  off(event, handler) {
    if (this._eventHandlers.has(event)) {
      const handlers = this._eventHandlers.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
    return this;
  }

  emit(event, data, callback) {
    // Обработка специальных событий
    if (event === 'create-room') {
      this._handleCreateRoom(data, callback);
    } else if (event === 'join-room') {
      this._handleJoinRoom(data, callback);
    } else if (event === 'leave-room') {
      this._handleLeaveRoom(data);
    } else if (event === 'offer' || event === 'answer' || event === 'ice-candidate') {
      this._handleWebRTCEvent(event, data);
    }
    return this;
  }

  _handleCreateRoom(data, callback) {
    const { username } = data;
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    const room = {
      id: roomId,
      users: new Map([[userId, { socketId: this.id, username }]]),
      created: Date.now()
    };
    
    serverState.rooms.set(roomId, room);
    this.join(roomId);
    
    if (callback && typeof callback === 'function') {
      callback({ roomId, userId });
    }
  }

  _handleJoinRoom(data, callback) {
    const { roomId, username } = data;
    const room = serverState.rooms.get(roomId);
    
    if (!room) {
      if (callback && typeof callback === 'function') {
        callback({ error: 'Room not found' });
      }
      return;
    }
    
    if (room.users.size >= 10) {
      if (callback && typeof callback === 'function') {
        callback({ error: 'Room is full (max 10 users)' });
      }
      return;
    }
    
    const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    room.users.set(userId, { socketId: this.id, username });
    this.join(roomId);
    
    // Уведомляем всех участников комнаты (включая создателя) о новом пользователе
    const existingUsers = Array.from(room.users.entries())
      .filter(([id]) => id !== userId)
      .map(([id, u]) => ({ userId: id, username: u.username }));
    
    // Отправляем событие user-joined всем участникам комнаты
    // Используем setTimeout для асинхронной отправки событий
    // Увеличиваем задержку до 50ms чтобы убедиться что callback обработан
    setTimeout(() => {
      serverState.clients.forEach((client) => {
        if (client._rooms.has(roomId)) {
          // Отправляем событие всем, включая создателя комнаты
          // НО исключаем самого присоединившегося пользователя, т.к. он уже добавил себя через callback
          if (client.id !== this.id) {
            client._emitEvent('user-joined', { userId, username });
          }
        }
      });
    }, 50);
    
    if (callback && typeof callback === 'function') {
      callback({ userId, users: existingUsers });
    }
  }

  _handleLeaveRoom(data) {
    const { roomId } = data;
    const room = serverState.rooms.get(roomId);
    
    if (!room) return;
    
    // Находим и удаляем пользователя
    for (const [userId, user] of room.users.entries()) {
      if (user.socketId === this.id) {
        room.users.delete(userId);
        
        // Уведомляем других участников
        serverState.clients.forEach((client) => {
          if (client.id !== this.id && client._rooms.has(roomId)) {
            client._emitEvent('user-left', userId);
          }
        });
        
        // Удаляем комнату если она пустая
        if (room.users.size === 0) {
          serverState.rooms.delete(roomId);
        }
        
        break;
      }
    }
    
    this.leave(roomId);
  }

  _handleWebRTCEvent(event, data) {
    const { roomId, targetUserId, fromUserId } = data;
    const room = serverState.rooms.get(roomId);
    
    if (!room) return;
    
    if (!targetUserId) {
      console.error('Missing targetUserId in WebRTC event:', event, data);
      return;
    }
    
    // Находим userId отправителя по его socketId если не указан явно
    let actualFromUserId = fromUserId;
    if (!actualFromUserId) {
      for (const [userId, user] of room.users.entries()) {
        if (user.socketId === this.id) {
          actualFromUserId = userId;
          break;
        }
      }
    }
    
    if (!actualFromUserId) {
      console.error('Cannot determine fromUserId for WebRTC event:', event, data);
      return;
    }
    
    // Пересылаем событие целевому пользователю
    serverState.clients.forEach((client) => {
      if (client.id !== this.id && client._rooms.has(roomId)) {
        // Находим socketId целевого пользователя
        for (const [userId, user] of room.users.entries()) {
          if (userId === targetUserId && user.socketId === client.id) {
            // Отправляем событие в формате targetUserId/fromUserId
            const eventData = {
              ...data,
              targetUserId: targetUserId,
              fromUserId: actualFromUserId
            };
            client._emitEvent(event, eventData);
            break;
          }
        }
      }
    });
  }

  _emitEvent(event, data) {
    if (this._eventHandlers.has(event)) {
      const handlers = this._eventHandlers.get(event);
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in handler for ${event}:`, error);
        }
      });
    }
  }

  join(room) {
    this._rooms.add(room);
    return this;
  }

  to(room) {
    return {
      emit: (event, data) => {
        serverState.clients.forEach((client) => {
          if (client.id !== this.id && client._rooms.has(room)) {
            client._emitEvent(event, data);
          }
        });
      }
    };
  }

  leave(room) {
    this._rooms.delete(room);
    return this;
  }

  disconnect() {
    this.connected = false;
    this.disconnected = true;
    
    // Покидаем все комнаты
    this._rooms.forEach(roomId => {
      const room = serverState.rooms.get(roomId);
      if (room) {
        for (const [userId, user] of room.users.entries()) {
          if (user.socketId === this.id) {
            room.users.delete(userId);
            
            // Уведомляем других участников
            serverState.clients.forEach((client) => {
              if (client.id !== this.id && client._rooms.has(roomId)) {
                client._emitEvent('user-left', userId);
              }
            });
            
            if (room.users.size === 0) {
              serverState.rooms.delete(roomId);
            }
            break;
          }
        }
      }
    });
    
    this._rooms.clear();
    serverState.clients.delete(this.id);
  }

  connect() {
    this.connected = true;
    this.disconnected = false;
    this._emitEvent('connect');
    return this;
  }
}

// Функция для создания мока Socket.IO
const mockIO = vi.fn().mockImplementation((url, options) => {
  return new MockSocket(url, options);
});

// Устанавливаем мок в глобальную область
if (typeof global !== 'undefined') {
  global.io = mockIO;
}

if (typeof window !== 'undefined') {
  window.io = mockIO;
}

// Функции для очистки состояния сервера
export function clearServerState() {
  serverState.rooms.clear();
  serverState.clients.clear();
}

export function getServerState() {
  return {
    rooms: new Map(serverState.rooms),
    clients: new Map(serverState.clients)
  };
}

export { mockIO, MockSocket, serverState };