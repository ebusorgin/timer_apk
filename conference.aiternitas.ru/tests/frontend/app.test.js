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
    try {
      localStorage.setItem('conference:token', 'test-token');
      localStorage.setItem('conference:displayName', 'TestUser');
      localStorage.setItem('conference:subscriberId', 'test-subscriber-id');
    } catch (e) {}

    document.body.innerHTML = `
      <div id="app">
        <div id="landingScreen" class="screen"><div class="auth-tabs"><button id="authTabLogin" class="auth-tab active">Вход</button><button id="authTabRegister" class="auth-tab">Регистрация</button></div><div id="loginForm"><input id="inputLogin"><input id="inputLoginPassword" type="password"><button id="btnLogin" disabled></button><p id="loginError"></p></div><div id="registerForm" style="display:none;"><input id="inputRegLogin"><input id="inputRegName"><input id="inputRegPassword" type="password"><button id="btnRegister" disabled></button><p id="registerError"></p><input id="inputNameLanding" type="hidden"></div></div>
        <div id="mainAppScreen" class="screen active">
          <header class="app-header"><div id="headerUser" class="header-user"><div id="headerAvatar" class="header-avatar"></div><span id="headerUserName" class="header-user-name"></span></div><button id="btnGlobalSearch" class="icon-btn"></button><button id="btnOpenSettings" class="icon-btn"></button></header>
          <nav class="tab-bar"><button class="tab-btn active" data-tab="chats">Чаты</button><button class="tab-btn" data-tab="calls">Звонки</button><button class="tab-btn" data-tab="contacts">Контакты</button></nav>
          <div class="tab-content">
            <div id="tabChats" class="tab-panel active"><div id="chatsList" class="list-view"></div><div id="chatsEmpty" class="empty-state"></div></div>
            <div id="tabCalls" class="tab-panel"><button id="btnCreateRoom"></button><button id="btnJoinRoom"></button><div id="callHistory"></div><div id="callsEmpty" class="empty-state"></div></div>
            <div id="tabContacts" class="tab-panel"><div class="search-wrap"><input id="inputSearch"><div id="searchResults" style="display:none;"></div></div><div id="contactRequestsBanner" style="display:none;"><button id="btnShowRequests"><span id="requestsCount">0</span></button></div><div id="contactRequestsList" style="display:none;"></div><div id="myContactsList"></div><div id="contactsEmpty"></div></div>
          </div>
          <div id="globalSearchOverlay" class="overlay" style="display:none;"><button id="btnCloseGlobalSearch"></button><input id="inputGlobalSearch"><div id="globalSearchResults"></div></div>
          <div id="chatScreen" class="overlay" style="display:none;"><button id="btnBackFromChat"></button><span id="chatContactName"></span><button id="btnAudioCallFromChat"></button><button id="btnVideoCallFromChat"></button><div id="chatMessages"></div><input id="inputChatMessage"><button id="btnSendMessage"></button></div>
          <div id="contactProfile" class="overlay" style="display:none;"><button id="btnBackFromProfile"></button><div id="profileAvatar"></div><h2 id="profileName"></h2><p id="profileId"></p><button id="btnProfileChat"></button><button id="btnProfileAudioCall"></button><button id="btnProfileVideoCall"></button><button id="btnProfileRemove"></button></div>
          <div id="joinRoomOverlay" class="overlay" style="display:none;"><button id="btnBackFromJoinRoom"></button><input id="inputRoomId" type="text" placeholder="general"><input id="inputDisplayName" type="hidden" value="TestUser"><button id="btnConnect">Войти</button><div id="connectStatusMessage"></div></div>
          <div id="settingsOverlay" class="overlay" style="display:none;"><button id="btnBackFromSettings"></button><span class="overlay-title">Настройки</span><button id="btnLogout"></button><div id="settingsAvatar"></div><div id="settingsNameView"><span id="settingsDisplayName"></span><button id="btnEditName"></button></div><div id="settingsNameEdit" style="display:none;"><input id="inputSettingsName"><button id="btnSaveName"></button></div><span id="settingsUserId"></span><div id="settingsAndroidDownload"></div><div id="adminLinkSection" style="display:none;"></div><input id="inputAvatarFile" type="file" style="display:none;"></div>
        </div>
        <div id="callScreen" class="screen"><div id="callAvatar"></div><h2 id="callContactName"></h2><p id="callStatus"></p><p id="callTimer" style="display:none;"></p><div id="callVideoContainer" style="display:none;"><video id="remoteVideo" autoplay playsinline></video><video id="localVideoSmall" autoplay muted playsinline></video></div><button id="btnCallMute"></button><button id="btnCallVideo"></button><button id="btnCallHangup"></button></div>
        <div id="conferenceScreen" class="screen">
          <div class="conference-container">
            <span id="conferenceRoomTitle"></span>
            <input id="inviteLink" type="text" readonly>
            <button id="btnCopyInvite"></button>
            <button id="btnChangeRoom"></button>
            <div id="conferenceStatus"></div>
            <div id="videoGrid" class="video-grid">
              <div class="video-tile self video-off">
                <video id="localVideo" class="video-element" autoplay muted playsinline></video>
                <div class="video-label">Вы</div>
              </div>
            </div>
            <div id="participantsList"></div>
            <div class="conference-controls">
              <button id="btnVideo" class="btn-control video"></button>
              <button id="btnMute" class="btn-control"></button>
              <button id="btnDisconnect" class="btn-control btn-danger"></button>
            </div>
            <div id="statusMessage"></div>
          </div>
        </div>
      </div>
      <div id="incomingCallModal" class="modal" style="display:none;"><div class="modal-backdrop"></div><div class="modal-content"><div id="incomingCallAvatar"></div><h3 id="incomingCallTitle"></h3><p id="incomingCallFrom"></p><p id="incomingCallType"></p><button id="btnAcceptCall"></button><button id="btnRejectCall"></button></div></div>
      <div id="toastContainer" class="toast-container"></div>
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
    expect(cameraButton.classList.contains('muted')).toBe(true);
    expect(cameraButton.classList.contains('active')).toBe(false);
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

    App.videoTrack = null;
    App.isVideoEnabled = false;
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
    expect(App.elements.btnVideo.classList.contains('active')).toBe(true);
    expect(App.elements.btnVideo.classList.contains('muted')).toBe(false);
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

    expect(videoTrack.enabled).toBe(false);
    expect(App.isVideoEnabled).toBe(false);
    expect(App.videoTrack).toBe(videoTrack);
    expect(App.elements.localVideoTile.classList.contains('video-off')).toBe(true);
    expect(App.elements.btnVideo.classList.contains('active')).toBe(false);
    expect(App.elements.btnVideo.classList.contains('muted')).toBe(true);
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
    App.videoTrack = null;
    App.isVideoEnabled = false;
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
    const mockVideoSender = {
      track: { kind: 'video' },
      replaceTrack: vi.fn(() => Promise.resolve()),
      getParameters: vi.fn(() => ({ encodings: [] })),
      setParameters: vi.fn(() => Promise.resolve()),
      setStreams: vi.fn(),
    };
    const mockTransceiver = {
      sender: mockVideoSender,
      setDirection: vi.fn(() => Promise.resolve()),
    };
    const peerConnection = {
      addTrack: vi.fn(() => mockVideoSender),
      addTransceiver: vi.fn(() => mockTransceiver),
      getSenders: vi.fn(() => [mockVideoSender]),
      getTransceivers: vi.fn(() => [mockTransceiver]),
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
    App.videoTrack = null;
    App.isVideoEnabled = false;
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

  it('isSafeAvatarUrl rejects javascript: and allows https/data:image', () => {
    expect(App.isSafeAvatarUrl('javascript:alert(1)')).toBe(false);
    expect(App.isSafeAvatarUrl('https://example.com/avatar.png')).toBe(true);
    expect(App.isSafeAvatarUrl('http://example.com/a.jpg')).toBe(true);
    expect(App.isSafeAvatarUrl('data:image/png;base64,abc')).toBe(true);
    expect(App.isSafeAvatarUrl('')).toBe(false);
    expect(App.isSafeAvatarUrl(null)).toBe(false);
  });

  it('getAvatarHtml uses fallback when avatarUrl is unsafe', () => {
    const sub = { name: 'Test', avatarUrl: 'javascript:alert(1)' };
    expect(App.getAvatarHtml(sub)).toBe('T');
  });

  it('getAvatarHtml renders img for safe avatarUrl', () => {
    const sub = { name: 'Test', avatarUrl: 'https://example.com/a.png' };
    const html = App.getAvatarHtml(sub, 48);
    expect(html).toContain('<img');
    expect(html).toContain('src="https://example.com/a.png"');
    expect(html).toContain('width:48px');
  });

  it('connect requests both audio and video to fix guest audio in room', async () => {
    const audioTrack = { kind: 'audio', stop: vi.fn(), enabled: true, readyState: 'live' };
    const videoTrack = { kind: 'video', stop: vi.fn(), enabled: true, readyState: 'live' };
    const mockStream = {
      getAudioTracks: () => [audioTrack],
      getVideoTracks: () => [videoTrack],
      getTracks: () => [audioTrack, videoTrack],
      addTrack: vi.fn(),
      removeTrack: vi.fn(),
    };

    const mockSocket = { connected: true, id: 'sock-1', emit: vi.fn(), on: vi.fn(), disconnect: vi.fn() };
    window.io = vi.fn(() => mockSocket);
    App.socket = mockSocket;
    App.connectSocketForCalls = vi.fn(() => { App.socket = mockSocket; });
    App.selfId = 'sock-1';
    App.displayName = 'Guest';
    App.currentRoomId = 'room_xxx';
    App.participants = new Map();
    App.elements.btnConnect = document.createElement('button');
    App.elements.conferenceRoomTitle = document.createElement('span');
    App.elements.inviteLink = document.createElement('input');
    App.socketEventsSetup = true;
    App.setConnectStatusMessage = vi.fn();
    App.clearConnectStatusMessage = vi.fn();
    App.showMessage = vi.fn();

    navigator.mediaDevices.getUserMedia.mockResolvedValueOnce(mockStream);

    await App.connect();

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: true, video: true })
    );
    expect(App.localStream).toBe(mockStream);
    expect(App.videoTrack).toBe(videoTrack);
    expect(App.videoTrack.enabled).toBe(false);
    expect(App.isVideoEnabled).toBe(false);
  });

});
