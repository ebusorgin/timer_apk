import { beforeEach, afterEach, vi } from 'vitest';
import { setupDOM } from './helpers/setup-dom.js';
import './helpers/webrtc-mock.js';
import './helpers/socket-mock.js';
import { clearServerState } from './helpers/socket-mock.js';
import { clearMockStreams, clearMockPeerConnections } from './helpers/webrtc-mock.js';

// Глобальная настройка для всех тестов
beforeEach(() => {
  setupDOM();
  clearServerState();
  clearMockStreams();
  clearMockPeerConnections();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  clearServerState();
  clearMockStreams();
  clearMockPeerConnections();
});