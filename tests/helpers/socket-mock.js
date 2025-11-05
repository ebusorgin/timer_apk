/**
 * Мок для Socket.IO клиента
 */

import { vi } from 'vitest';

// Глобальный хранилище для симуляции сервера
const serverState = {
  globalChat: {
    users: new Map()
  },
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
    if (event === 'join-chat') {
      this._handleJoinChat(data, callback);
    } else if (event === 'leave-chat') {
      this._handleLeaveChat(data);
    } else if (event === 'offer' || event === 'answer' || event === 'ice-candidate') {
      this._handleWebRTCEvent(event, data);
    }
    return this;
  }

  _handleJoinChat(data, callback) {
    const { username } = data;
    
    // Проверка на переполнение чата
    if (serverState.globalChat.users.size >= 100) {
      if (callback && typeof callback === 'function') {
        callback({ error: 'Chat is full (max 100 users)' });
      }
      return;
    }
    
    const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    serverState.globalChat.users.set(userId, { socketId: this.id, username });
    
    // Получаем список существующих пользователей
    const existingUsers = Array.from(serverState.globalChat.users.entries())
      .filter(([id]) => id !== userId)
      .map(([id, u]) => ({ userId: id, username: u.username }));
    
    // Отправляем событие user-joined всем остальным участникам
    setTimeout(() => {
      serverState.clients.forEach((client) => {
        // Отправляем событие всем подключенным клиентам, кроме текущего
        if (client.id !== this.id && client.connected) {
          client._emitEvent('user-joined', { userId, username });
        }
      });
    }, 50);
    
    if (callback && typeof callback === 'function') {
      callback({ userId, users: existingUsers });
    }
  }

  _handleLeaveChat(data) {
    // Удаляем пользователя из глобального чата
    for (const [userId, user] of serverState.globalChat.users.entries()) {
      if (user.socketId === this.id) {
        serverState.globalChat.users.delete(userId);
        
        // Уведомляем всех остальных участников
        serverState.clients.forEach((client) => {
          if (client.id !== this.id && client.connected) {
            client._emitEvent('user-left', userId);
          }
        });
        break;
      }
    }
  }

  _handleWebRTCEvent(event, data) {
    const { targetUserId, fromUserId } = data;
    
    if (!targetUserId) {
      console.error('Missing targetUserId in WebRTC event:', event, data);
      return;
    }
    
    // Находим userId отправителя по его socketId если не указан явно
    let actualFromUserId = fromUserId;
    if (!actualFromUserId) {
      for (const [userId, user] of serverState.globalChat.users.entries()) {
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
      if (client.id !== this.id && client.connected) {
        // Находим socketId целевого пользователя
        for (const [userId, user] of serverState.globalChat.users.entries()) {
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
    
    // Удаляем пользователя из глобального чата при отключении
    for (const [userId, user] of serverState.globalChat.users.entries()) {
      if (user.socketId === this.id) {
        serverState.globalChat.users.delete(userId);
        
        // Уведомляем всех остальных участников
        serverState.clients.forEach((client) => {
          if (client.id !== this.id && client.connected) {
            client._emitEvent('user-left', userId);
          }
        });
        break;
      }
    }
    
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
  serverState.globalChat.users.clear();
  serverState.clients.clear();
}

export function getServerState() {
  return {
    globalChat: {
      users: new Map(serverState.globalChat.users)
    },
    clients: new Map(serverState.clients)
  };
}

export { mockIO, MockSocket, serverState };