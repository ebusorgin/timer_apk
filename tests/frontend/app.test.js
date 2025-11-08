/* @vitest-environment jsdom */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appScriptUrl = pathToFileURL(path.resolve(__dirname, '../../www/js/app.js'));

describe('conference App UI', () => {
  let App;

  beforeAll(async () => {
    await import(appScriptUrl.href);
    App = window.App;
  });

  beforeEach(() => {
    vi.restoreAllMocks();

    document.body.innerHTML = `
      <div id="app">
        <div id="connectScreen" class="screen active">
          <div class="container">
            <button id="btnConnect" class="btn btn-primary">Подключиться</button>
            <div id="statusMessage" class="status-message"></div>
          </div>
        </div>
        <div id="conferenceScreen" class="screen">
          <div class="container conference-container">
            <div id="conferenceStatus" class="conference-status"></div>
            <div id="videoGrid" class="video-grid">
              <div class="video-tile self video-off">
                <video id="localVideo" class="video-element" autoplay muted playsinline></video>
                <div class="video-label">Вы</div>
              </div>
            </div>
            <div id="participantsList" class="participants-list"></div>
            <div class="conference-controls">
              <button id="btnVideo" class="btn btn-control video">📹 Включить камеру</button>
              <button id="btnMute" class="btn btn-control">🎤 Включить микрофон</button>
              <button id="btnDisconnect" class="btn btn-secondary">Отключиться</button>
            </div>
            <div id="statusMessage" class="status-message"></div>
          </div>
        </div>
      </div>
    `;

    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());

    App.socket = null;
    App.localStream = null;
    App.participants = new Map();
    App.init();
    App.updateParticipantsList();

    if (!navigator.mediaDevices) {
      navigator.mediaDevices = {};
    }
    navigator.mediaDevices.getUserMedia = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initialises DOM element references after init', () => {
    expect(App.elements.btnConnect).toBeInstanceOf(HTMLButtonElement);
    expect(App.elements.btnMute).toBeInstanceOf(HTMLButtonElement);
    expect(App.elements.btnVideo).toBeInstanceOf(HTMLButtonElement);
    expect(App.elements.localVideo).toBeInstanceOf(HTMLVideoElement);
    expect(App.elements.participantsList.id).toBe('participantsList');
  });

  it('shows camera disabled state by default', () => {
    const cameraButton = App.elements.btnVideo;
    expect(cameraButton.disabled).toBe(true);
    expect(cameraButton.textContent).toContain('Включить камеру');
    expect(App.elements.localVideoTile.classList.contains('video-off')).toBe(true);
    expect(App.elements.participantsList.textContent).toContain('Камера выключена');
  });

  it('toggles microphone state and updates button label', () => {
    const track = { enabled: true };
    App.localStream = {
      getAudioTracks: vi.fn(() => [track]),
    };

    App.toggleMute();

    expect(track.enabled).toBe(false);
    expect(App.elements.btnMute.textContent).toContain('Включить микрофон');
    expect(App.elements.btnMute.classList.contains('muted')).toBe(true);
  });

  it('enables video through toggleVideo and updates UI', async () => {
    const videoTrack = {
      kind: 'video',
      stop: vi.fn(),
      enabled: true,
      readyState: 'live',
    };
    const mockStream = {
      getVideoTracks: () => [videoTrack],
      getTracks: () => [videoTrack],
    };

    App.localStream = {
      getAudioTracks: vi.fn(() => []),
      addTrack: vi.fn(),
      removeTrack: vi.fn(),
      getTracks: vi.fn(() => []),
    };
    App.updateVideoButton();

    navigator.mediaDevices.getUserMedia.mockResolvedValueOnce(mockStream);

    await App.toggleVideo();

    expect(App.isVideoEnabled).toBe(true);
    expect(App.videoTrack).toBe(videoTrack);
    expect(App.localStream.addTrack).toHaveBeenCalledWith(videoTrack);
    expect(App.elements.localVideoTile.classList.contains('video-off')).toBe(false);
    expect(App.elements.btnVideo.disabled).toBe(false);
    expect(App.elements.btnVideo.textContent).toContain('Выключить камеру');
    expect(App.elements.participantsList.textContent).toContain('Камера включена');
  });

  it('disables video through toggleVideo and resets UI', async () => {
    const videoTrack = {
      kind: 'video',
      stop: vi.fn(),
      enabled: true,
      readyState: 'live',
    };

    App.localStream = {
      getAudioTracks: vi.fn(() => []),
      addTrack: vi.fn(),
      removeTrack: vi.fn(),
      getTracks: vi.fn(() => []),
    };
    App.videoTrack = videoTrack;
    App.isVideoEnabled = true;
    App.participants = new Map();
    App.updateVideoButton();

    await App.toggleVideo();

    expect(App.localStream.removeTrack).toHaveBeenCalledWith(videoTrack);
    expect(videoTrack.stop).toHaveBeenCalled();
    expect(App.isVideoEnabled).toBe(false);
    expect(App.videoTrack).toBeNull();
    expect(App.elements.localVideoTile.classList.contains('video-off')).toBe(true);
    expect(App.elements.btnVideo.textContent).toContain('Включить камеру');
    expect(App.elements.participantsList.textContent).toContain('Камера выключена');
  });

  it('sends renegotiation offer to peers when enabling video', async () => {
    const videoTrack = {
      kind: 'video',
      stop: vi.fn(),
      enabled: true,
      readyState: 'live',
    };
    const mockStream = {
      getVideoTracks: () => [videoTrack],
      getTracks: () => [videoTrack],
    };

    const peerConnection = {
      signalingState: 'stable',
      createOffer: vi.fn(async () => ({ type: 'offer', sdp: 'test' })),
      setLocalDescription: vi.fn(async () => {}),
      getSenders: vi.fn(() => []),
      addTrack: vi.fn(),
      addEventListener: vi.fn(),
    };

    const participantRecord = {
      peerConnection,
      mediaElement: document.createElement('video'),
      tileElement: document.createElement('div'),
      labelElement: document.createElement('div'),
      pendingCandidates: [],
      connected: true,
      videoEnabled: false,
      videoSender: { replaceTrack: vi.fn(() => Promise.resolve()) },
      renegotiating: false,
      pendingRenegotiation: false,
      isInitiator: true,
    };
    participantRecord.tileElement.appendChild(participantRecord.mediaElement);
    participantRecord.mediaElement.srcObject = {
      getVideoTracks: () => [{ readyState: 'live', enabled: true }],
    };

    App.socket = { emit: vi.fn() };
    App.localStream = {
      getAudioTracks: vi.fn(() => []),
      addTrack: vi.fn(),
      removeTrack: vi.fn(),
      getTracks: vi.fn(() => []),
    };
    App.participants = new Map([[ 'peer-1', participantRecord ]]);
    App.selfId = 'self-1';
    App.updateVideoButton();

    navigator.mediaDevices.getUserMedia.mockResolvedValueOnce(mockStream);

    await App.toggleVideo();

    expect(peerConnection.createOffer).toHaveBeenCalledTimes(1);
    expect(peerConnection.setLocalDescription).toHaveBeenCalledTimes(1);
    expect(App.socket.emit).toHaveBeenCalledWith(
      'webrtc-signal',
      expect.objectContaining({
        targetSocketId: 'peer-1',
        type: 'offer',
        reason: 'enable-video',
      })
    );
  });

  it('запрашивает повторное согласование у инициатора, если сам не инициатор', async () => {
    const peerConnection = {
      addTrack: vi.fn(),
      getSenders: vi.fn(() => []),
      getTransceivers: vi.fn(() => []),
      createOffer: vi.fn(),
      setLocalDescription: vi.fn(),
      connectionState: 'connected',
      signalingState: 'stable',
      iceConnectionState: 'connected',
      close: vi.fn(),
    };

    const mockVideoTrack = { stop: vi.fn(), kind: 'video', enabled: true, readyState: 'live' };
    const mockStream = {
      getTracks: vi.fn(() => [mockVideoTrack]),
      getVideoTracks: vi.fn(() => [mockVideoTrack]),
      getAudioTracks: vi.fn(() => []),
      addTrack: vi.fn(),
    };

    const participantRecord = {
      peerConnection,
      mediaElement: document.createElement('video'),
      tileElement: document.createElement('div'),
      labelElement: document.createElement('div'),
      pendingCandidates: [],
      connected: true,
      videoEnabled: false,
      videoSender: null,
      renegotiating: false,
      pendingRenegotiation: false,
      isInitiator: false,
    };
    participantRecord.tileElement.appendChild(participantRecord.mediaElement);
    participantRecord.mediaElement.srcObject = {
      getVideoTracks: () => [],
    };

    App.socket = { emit: vi.fn() };
    App.localStream = {
      getAudioTracks: vi.fn(() => []),
      addTrack: vi.fn(),
      removeTrack: vi.fn(),
      getTracks: vi.fn(() => []),
    };
    App.participants = new Map([[ 'peer-1', participantRecord ]]);
    App.selfId = 'self-99';
    App.updateVideoButton();

    navigator.mediaDevices.getUserMedia.mockResolvedValueOnce(mockStream);

    await App.toggleVideo();

    expect(peerConnection.createOffer).toHaveBeenCalledTimes(1);
    expect(peerConnection.setLocalDescription).toHaveBeenCalledTimes(1);
    expect(App.socket.emit).toHaveBeenCalledWith(
      'webrtc-signal',
      expect.objectContaining({
        targetSocketId: 'peer-1',
        type: 'offer',
      }),
    );
  });
});
