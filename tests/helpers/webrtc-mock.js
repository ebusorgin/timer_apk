/**
 * Моки для WebRTC API
 */

import { vi } from 'vitest';

// Глобальные переменные для отслеживания потоков
const mockStreams = new Map();
const mockPeerConnections = new Map();

// Создаем мок MediaStream
class MockMediaStream {
  constructor(tracks = []) {
    this.id = `stream_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this._tracks = tracks;
    this.active = true;
    mockStreams.set(this.id, this);
  }

  getTracks() {
    return this._tracks;
  }

  getAudioTracks() {
    return this._tracks.filter(track => track.kind === 'audio');
  }

  getVideoTracks() {
    return this._tracks.filter(track => track.kind === 'video');
  }

  addTrack(track) {
    this._tracks.push(track);
  }

  removeTrack(track) {
    const index = this._tracks.indexOf(track);
    if (index > -1) {
      this._tracks.splice(index, 1);
    }
  }
}

// Создаем мок MediaStreamTrack
class MockMediaStreamTrack {
  constructor(kind = 'audio', enabled = true) {
    this.id = `track_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.kind = kind;
    this.enabled = enabled;
    this.readyState = 'live';
    this.muted = false;
  }

  stop() {
    this.readyState = 'ended';
    this.enabled = false;
  }
}

// Создаем мок RTCPeerConnection
class MockRTCPeerConnection {
  constructor(config = {}) {
    this.id = `peer_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.localDescription = null;
    this.remoteDescription = null;
    this.iceConnectionState = 'new';
    this.connectionState = 'new';
    this.iceGatheringState = 'new';
    this._tracks = [];
    this._onTrack = null;
    this._onIceCandidate = null;
    this._onIceConnectionStateChange = null;
    this._onConnectionStateChange = null;
    this.config = config;
    mockPeerConnections.set(this.id, this);
  }

  async setLocalDescription(description) {
    this.localDescription = description;
    this.iceGatheringState = 'complete';
    return Promise.resolve();
  }

  async setRemoteDescription(description) {
    this.remoteDescription = description;
    if (this._onTrack) {
      // Симулируем получение трека
      const mockTrack = new MockMediaStreamTrack('audio', true);
      const mockStream = new MockMediaStream([mockTrack]);
      const event = {
        streams: [mockStream],
        track: mockTrack
      };
      setTimeout(() => {
        if (this._onTrack) {
          this._onTrack(event);
        }
      }, 10);
    }
    return Promise.resolve();
  }

  async createOffer(options = {}) {
    return {
      type: 'offer',
      sdp: `mock-offer-sdp-${Date.now()}`
    };
  }

  async createAnswer() {
    return {
      type: 'answer',
      sdp: `mock-answer-sdp-${Date.now()}`
    };
  }

  async addIceCandidate(candidate) {
    if (this._onIceCandidate) {
      // Симулируем изменение состояния соединения
      setTimeout(() => {
        this.iceConnectionState = 'connected';
        this.connectionState = 'connected';
        if (this._onIceConnectionStateChange) {
          this._onIceConnectionStateChange();
        }
        if (this._onConnectionStateChange) {
          this._onConnectionStateChange();
        }
      }, 10);
    }
    return Promise.resolve();
  }

  addTrack(track, stream) {
    this._tracks.push({ track, stream });
    return {};
  }

  getSenders() {
    return this._tracks.map(({ track }) => ({
      track,
      replaceTrack: vi.fn().mockResolvedValue(undefined)
    }));
  }

  getReceivers() {
    return [];
  }

  close() {
    this.iceConnectionState = 'closed';
    this.connectionState = 'closed';
    mockPeerConnections.delete(this.id);
  }

  set ontrack(callback) {
    this._onTrack = callback;
  }

  get ontrack() {
    return this._onTrack;
  }

  set onicecandidate(callback) {
    this._onIceCandidate = callback;
  }

  get onicecandidate() {
    return this._onIceCandidate;
  }

  set oniceconnectionstatechange(callback) {
    this._onIceConnectionStateChange = callback;
  }

  get oniceconnectionstatechange() {
    return this._onIceConnectionStateChange;
  }

  set onconnectionstatechange(callback) {
    this._onConnectionStateChange = callback;
  }

  get onconnectionstatechange() {
    return this._onConnectionStateChange;
  }

  set onerror(callback) {
    this._onError = callback;
  }

  get onerror() {
    return this._onError;
  }
}

// Создаем мок AudioContext
class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.destination = {};
  }

  createAnalyser() {
    return {
      fftSize: 256,
      smoothingTimeConstant: 0.8,
      frequencyBinCount: 128,
      getByteFrequencyData: vi.fn((array) => {
        // Симулируем данные микрофона
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.random() * 100;
        }
      })
    };
  }

  createMediaStreamSource(stream) {
    return {
      connect: vi.fn()
    };
  }

  async close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

// Мок getUserMedia
const mockGetUserMedia = vi.fn().mockImplementation(async (constraints) => {
  const audioTrack = new MockMediaStreamTrack('audio', true);
  const videoTrack = new MockMediaStreamTrack('video', false);
  const tracks = constraints.video ? [audioTrack, videoTrack] : [audioTrack];
  return new MockMediaStream(tracks);
});

// Мок navigator.mediaDevices
const mockMediaDevices = {
  getUserMedia: mockGetUserMedia,
  enumerateDevices: vi.fn().mockResolvedValue([])
};

// Мок navigator.clipboard
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined)
};

// Мок RTCSessionDescription
class MockRTCSessionDescription {
  constructor(init) {
    this.type = init.type;
    this.sdp = init.sdp;
  }
}

// Мок RTCIceCandidate
class MockRTCIceCandidate {
  constructor(init) {
    this.candidate = init.candidate;
    this.sdpMLineIndex = init.sdpMLineIndex;
    this.sdpMid = init.sdpMid;
  }
}

// Устанавливаем моки в глобальную область
if (typeof global !== 'undefined') {
  global.RTCPeerConnection = MockRTCPeerConnection;
  global.MediaStream = MockMediaStream;
  global.MediaStreamTrack = MockMediaStreamTrack;
  global.AudioContext = MockAudioContext;
  global.webkitAudioContext = MockAudioContext;
  global.RTCSessionDescription = MockRTCSessionDescription;
  global.RTCIceCandidate = MockRTCIceCandidate;
  
  if (typeof navigator !== 'undefined') {
    navigator.mediaDevices = mockMediaDevices;
    navigator.clipboard = mockClipboard;
  }
}

if (typeof window !== 'undefined') {
  window.RTCPeerConnection = MockRTCPeerConnection;
  window.MediaStream = MockMediaStream;
  window.MediaStreamTrack = MockMediaStreamTrack;
  window.AudioContext = MockAudioContext;
  window.webkitAudioContext = MockAudioContext;
  window.RTCSessionDescription = MockRTCSessionDescription;
  window.RTCIceCandidate = MockRTCIceCandidate;
  
  if (window.navigator) {
    window.navigator.mediaDevices = mockMediaDevices;
    window.navigator.clipboard = mockClipboard;
  }
}

// Экспортируем вспомогательные функции для тестов
export function getMockStreams() {
  return Array.from(mockStreams.values());
}

export function getMockPeerConnections() {
  return Array.from(mockPeerConnections.values());
}

export function clearMockStreams() {
  mockStreams.clear();
}

export function clearMockPeerConnections() {
  mockPeerConnections.clear();
}

export { mockGetUserMedia, MockMediaStream, MockMediaStreamTrack, MockRTCPeerConnection };