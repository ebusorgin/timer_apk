import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import puppeteer from 'puppeteer';
import { collectConsole, resolveAppUrl, saveArtifact } from './helpers.js';

const TEST_PORT = process.env.TEST_PORT ? Number(process.env.TEST_PORT) : 4100;

const baseScenarios = [
  {
    name: 'initiator_a_camera_on',
    participants: ['A', 'B'],
    initiator: 'A',
    actions: [{ type: 'camera', participant: 'A', enable: true }],
    expectations: [{ page: 'B', remoteIdFrom: 'A', expectVideo: true }],
  },
  {
    name: 'non_initiator_camera_on',
    participants: ['A', 'B'],
    initiator: 'A',
    actions: [{ type: 'camera', participant: 'B', enable: true }],
    expectations: [{ page: 'A', remoteIdFrom: 'B', expectVideo: true }],
  },
  {
    name: 'toggle_camera_twice',
    participants: ['A', 'B'],
    initiator: 'A',
    actions: [
      { type: 'camera', participant: 'A', enable: true },
      { type: 'wait', ms: 2_000 },
      { type: 'camera', participant: 'A', enable: false },
      { type: 'wait', ms: 1_000 },
      { type: 'camera', participant: 'A', enable: true },
    ],
    expectations: [{ page: 'B', remoteIdFrom: 'A', expectVideo: true }],
  },
  {
    name: 'remote_rejoin_after_camera_on',
    initiator: 'A',
    actions: [
      { type: 'camera', participant: 'A', enable: true },
      { type: 'wait', ms: 2_000 },
      { type: 'rejoin', participant: 'B' },
      { type: 'wait', ms: 3_000 },
    ],
    expectations: [{ page: 'B', remoteIdFrom: 'A', expectVideo: true }],
  },
  {
    name: 'initiator_b_connects_first',
    initiator: 'B',
    actions: [{ type: 'camera', participant: 'B', enable: true }],
    expectations: [{ page: 'A', remoteIdFrom: 'B', expectVideo: true }],
  },
  {
    name: 'audio_stream_active',
    initiator: 'A',
    actions: [{ type: 'wait', ms: 3_000 }],
    expectations: [
      { page: 'A', expectLocalAudio: true },
      { page: 'B', expectAudioFrom: 'A', minPackets: 20 },
    ],
  },
  {
    name: 'initiator_hangup_all',
    initiator: 'A',
    actions: [
      { type: 'camera', participant: 'A', enable: true },
      { type: 'wait', ms: 2_000 },
      { type: 'hangup-all', participant: 'host' },
      { type: 'wait', ms: 2_000 },
    ],
    expectations: [
      { page: 'A', expectDisconnected: true },
      { page: 'B', expectDisconnected: true },
    ],
  },
  {
    name: 'server_restart_cleanup',
    participants: ['A', 'B'],
    initiator: 'A',
    actions: [
      { type: 'camera', participant: 'A', enable: true },
      { type: 'wait', ms: 2_000 },
      { type: 'restart-server' },
      { type: 'wait', ms: 4_000 },
    ],
    expectations: [
      { page: 'A', expectParticipantCount: 1 },
      { page: 'B', expectParticipantCount: 1 },
    ],
  },
];

const AUDIO_PERMUTATIONS = [
  ['A', 'B', 'C'],
  ['A', 'C', 'B'],
  ['B', 'A', 'C'],
  ['B', 'C', 'A'],
  ['C', 'A', 'B'],
  ['C', 'B', 'A'],
];

const audioMatrixScenario = {
  name: 'audio_matrix_all_pairs',
  participants: ['A', 'B', 'C'],
  initiator: 'A',
  actions: [{ type: 'wait', ms: 3_000 }],
  expectations: [
    { page: 'A', expectLocalAudio: true },
    { page: 'B', expectLocalAudio: true },
    { page: 'C', expectLocalAudio: true },
    { page: 'B', expectAudioFrom: 'A', minPackets: 20 },
    { page: 'C', expectAudioFrom: 'A', minPackets: 20 },
    { page: 'A', expectAudioFrom: 'B', minPackets: 20 },
    { page: 'C', expectAudioFrom: 'B', minPackets: 20 },
    { page: 'A', expectAudioFrom: 'C', minPackets: 20 },
    { page: 'B', expectAudioFrom: 'C', minPackets: 20 },
  ],
};

const permutationScenarios = AUDIO_PERMUTATIONS.map((order) => {
  const participants = ['A', 'B', 'C'];
  const phases = order.map((speaker, index) => {
    const listeners = participants.filter((p) => p !== speaker);
    return {
      label: `phase_${index + 1}_${speaker}`,
      actions: participants.map((participant) => ({
        type: 'microphone',
        participant,
        enable: participant === speaker,
      })),
      waitAfter: 2_500,
      expectations: [
        { page: speaker, expectLocalAudio: true },
        ...listeners.map((listener) => ({
          page: listener,
          expectAudioFrom: speaker,
          minPackets: 10,
        })),
      ],
    };
  });

  return {
    name: `audio_perm_${order.join('').toLowerCase()}`,
    participants,
    initiator: order[0],
    actions: [{ type: 'wait', ms: 2_000 }],
    phases,
  };
});

const fullLifecycleScenario = {
  name: 'audio_story_three_party',
  participants: ['A', 'B', 'C'],
  initialParticipants: ['A', 'B'],
  initiator: 'A',
  actions: [
    { type: 'microphone', participant: 'A', enable: true },
    { type: 'microphone', participant: 'B', enable: true },
  ],
  phases: [
    {
      label: 'phase1_a_speaks_b_listens',
      actions: [
        { type: 'microphone', participant: 'A', enable: true },
        { type: 'microphone', participant: 'B', enable: false },
      ],
      waitAfter: 3_000,
      expectations: [
        { page: 'A', expectLocalAudio: true },
        { page: 'B', expectAudioFrom: 'A', minPackets: 15 },
      ],
    },
    {
      label: 'phase2_b_speaks_a_listens',
      actions: [
        { type: 'microphone', participant: 'A', enable: false },
        { type: 'microphone', participant: 'B', enable: true },
      ],
      waitAfter: 3_000,
      expectations: [
        { page: 'B', expectLocalAudio: true },
        { page: 'A', expectAudioFrom: 'B', minPackets: 15 },
      ],
    },
    {
      label: 'phase3_c_joins_b_continues',
      actions: [
        { type: 'join', participant: 'C' },
        { type: 'microphone', participant: 'C', enable: true },
        { type: 'microphone', participant: 'B', enable: true },
      ],
      waitAfter: 4_000,
      expectations: [
        { page: 'B', expectLocalAudio: true },
        { page: 'A', expectAudioFrom: 'B', minPackets: 20 },
        { page: 'C', expectAudioFrom: 'B', minPackets: 12 },
      ],
    },
    {
      label: 'phase4_toggle_both',
      actions: [
        { type: 'microphone', participant: 'B', enable: false },
        { type: 'wait', ms: 1_000 },
        { type: 'microphone', participant: 'B', enable: true },
        { type: 'microphone', participant: 'A', enable: true },
      ],
      waitAfter: 4_000,
      expectations: [
        { page: 'B', expectLocalAudio: true },
        { page: 'A', expectAudioFrom: 'B', minPackets: 15 },
        { page: 'C', expectAudioFrom: 'A', minPackets: 12 },
      ],
    },
    {
      label: 'phase5_c_reconnects_and_speaks',
      actions: [
        { type: 'microphone', participant: 'A', enable: false },
        { type: 'microphone', participant: 'B', enable: false },
        { type: 'rejoin', participant: 'C' },
        { type: 'wait', ms: 2_000 },
        { type: 'microphone', participant: 'C', enable: true },
      ],
      waitAfter: 4_000,
      expectations: [
        { page: 'C', expectLocalAudio: true },
        { page: 'A', expectAudioFrom: 'C', minPackets: 12 },
        { page: 'B', expectAudioFrom: 'C', minPackets: 12 },
      ],
    },
    {
      label: 'phase6_everyone_speaks',
      actions: [
        { type: 'microphone', participant: 'A', enable: true },
        { type: 'microphone', participant: 'B', enable: true },
        { type: 'microphone', participant: 'C', enable: true },
      ],
      waitAfter: 4_000,
      expectations: [
        { page: 'A', expectAudioFrom: 'B', minPackets: 15 },
        { page: 'A', expectAudioFrom: 'C', minPackets: 15 },
        { page: 'B', expectAudioFrom: 'A', minPackets: 15 },
        { page: 'B', expectAudioFrom: 'C', minPackets: 15 },
        { page: 'C', expectAudioFrom: 'A', minPackets: 15 },
        { page: 'C', expectAudioFrom: 'B', minPackets: 15 },
      ],
    },
  ],
};

const scenarios = [
  ...baseScenarios,
  audioMatrixScenario,
  fullLifecycleScenario,
  ...permutationScenarios,
];

function createContext(browser) {
  if (typeof browser.createBrowserContext === 'function') {
    return browser.createBrowserContext();
  }
  if (typeof browser.createIncognitoBrowserContext === 'function') {
    return browser.createIncognitoBrowserContext();
  }
  return browser.defaultBrowserContext();
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = spawn('node', ['server/server.mjs'], {
      env: { ...process.env, PORT: String(TEST_PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;

    server.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      process.stdout.write(`[server] ${text}`);
      if (!resolved && text.includes('Сервер запущен на порту')) {
        resolved = true;
        resolve(server);
      }
    });

    server.stderr.on('data', (chunk) => {
      process.stderr.write(`[server:err] ${chunk.toString()}`);
    });

    server.on('error', (err) => {
      if (!resolved) {
        reject(err);
      }
    });

    server.on('exit', (code) => {
      if (!resolved) {
        reject(new Error(`Server exited prematurely with code ${code}`));
      }
    });
  });
}

function stopServer(server) {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }

    let settled = false;
    const finalize = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    server.once('exit', finalize);
    server.once('error', finalize);

    server.kill('SIGTERM');
    setTimeout(finalize, 2_000);
  });
}

async function waitForConferenceScreen(page) {
  await page.waitForSelector('#conferenceScreen', { visible: true, timeout: 20_000 });
}

async function clickConnect(page) {
  await page.waitForSelector('#btnConnect', { visible: true, timeout: 10_000 });
  await page.click('#btnConnect');
  await waitForConferenceScreen(page);
}

async function setCameraState(page, enable) {
  await page.waitForSelector('#btnVideo', { visible: true, timeout: 10_000 });
  await page.waitForFunction(() => !!globalThis.App?.localStream, { timeout: 15_000 });

  const changed = await page.evaluate((desired) => {
    if (!globalThis.App) return false;
    const current = !!globalThis.App.isVideoEnabled;
    if (current === desired) return false;
    document.getElementById('btnVideo')?.click();
    return true;
  }, enable);

  if (changed) {
    await page.waitForFunction(
      (desired) => !!globalThis.App?.isVideoEnabled === desired,
      {},
      enable
    );
  }
}

async function setMicrophoneState(page, enable) {
  await page.waitForSelector('#btnMute', { visible: true, timeout: 10_000 });
  await page.waitForFunction(() => !!globalThis.App?.localStream, { timeout: 15_000 });

  const changed = await page.evaluate((desired) => {
    const app = globalThis.App;
    if (!app?.localStream) return false;
    const [audioTrack] = app.localStream.getAudioTracks();
    if (!audioTrack) return false;
    const current = audioTrack.enabled;
    if (current === desired) return false;
    document.getElementById('btnMute')?.click();
    return true;
  }, enable);

  if (changed) {
    await page.waitForFunction(
      (desired) => {
        const app = globalThis.App;
        if (!app?.localStream) return false;
        const [audioTrack] = app.localStream.getAudioTracks();
        return audioTrack ? audioTrack.enabled === desired : false;
      },
      {},
      enable
    );
  }
}

async function extractState(page) {
  return page.evaluate(async () => {
    const participants = await Promise.all(
      Array.from(globalThis.App.participants.entries()).map(async ([id, participant]) => {
        const stats = [];
        if (participant?.peerConnection?.getStats) {
          const reports = await participant.peerConnection.getStats();
          reports.forEach((report) => {
            if (report.type === 'inbound-rtp' || report.type === 'outbound-rtp') {
              stats.push({
                id: report.id,
                type: report.type,
                kind: report.kind,
                bytesReceived: report.bytesReceived,
                bytesSent: report.bytesSent,
                framesDecoded: report.framesDecoded,
                framesEncoded: report.framesEncoded,
                framesPerSecond: report.framesPerSecond,
                packetsReceived: report.packetsReceived,
                packetsSent: report.packetsSent,
                nackCount: report.nackCount,
              });
            }
          });
        }

        const presenceRecord = globalThis.App.presence?.get(id) ?? null;

        const tracks = participant?.mediaElement?.srcObject
          ? participant.mediaElement.srcObject.getTracks().map((track) => ({
              kind: track.kind,
              enabled: track.enabled,
              muted: track.muted,
              readyState: track.readyState,
            }))
          : [];

        return {
          id,
          videoEnabled: !!participant?.videoEnabled,
          presenceCam: typeof presenceRecord?.media?.cam === 'boolean' ? presenceRecord.media.cam : null,
          presenceMic: typeof presenceRecord?.media?.mic === 'boolean' ? presenceRecord.media.mic : null,
          hasMediaElement: !!participant?.mediaElement,
          mediaElementMuted: participant?.mediaElement?.muted ?? null,
          mediaElementVolume: participant?.mediaElement?.volume ?? null,
          signalingState: participant?.peerConnection?.signalingState,
          connectionState: participant?.peerConnection?.connectionState,
          iceState: participant?.peerConnection?.iceConnectionState,
          tracks,
          stats,
        };
      })
    );

    const localTracks = globalThis.App.localStream
      ? globalThis.App.localStream.getTracks().map((track) => ({
          kind: track.kind,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
        }))
      : [];

    return {
      socketId: globalThis.App.socket?.id ?? null,
      isVideoEnabled: !!globalThis.App.isVideoEnabled,
      localAudioMuted: !!globalThis.App.localStream?.getAudioTracks()?.some((track) => track.muted),
      participants,
      localTracks,
    };
  });
}

function hasLiveRemoteVideo(state, remoteId) {
  const remote = state?.participants?.find((p) => p.id === remoteId);
  if (!remote) return false;
  return remote.tracks.some((track) => track.kind === 'video' && track.readyState === 'live');
}

function evaluateExpectations(expectations = [], states, participantLabels, packetTracker) {
  return expectations.map((expectation) => {
    const pageLabel = expectation.page;
    const pageState = pageLabel ? states[pageLabel] : null;
    if (!pageLabel || !pageState) {
      return { expectation, passed: false, reason: `State for ${pageLabel ?? 'unknown'} missing` };
    }

    if (expectation.expectDisconnected) {
      const isDisconnected =
        !pageState.socketId &&
        (!pageState.participants || pageState.participants.length === 0);

      return {
        expectation,
        passed: isDisconnected,
        isDisconnected,
        socketId: pageState.socketId,
        participantCount: pageState.participants?.length ?? 0,
      };
    }

    if (typeof expectation.expectParticipantCount === 'number') {
      const participantCount = pageState.participants?.length ?? 0;
      return {
        expectation,
        passed: participantCount === expectation.expectParticipantCount,
        participantCount,
      };
    }

    if (expectation.expectLocalAudio) {
      const tracks = pageState.localTracks || [];
      const audioTrack = tracks.find((track) => track.kind === 'audio');
      const hasLiveAudio =
        !!audioTrack &&
        audioTrack.readyState === 'live' &&
        audioTrack.enabled === true &&
        audioTrack.muted === false;

      return {
        expectation,
        passed: hasLiveAudio,
        localAudioTrack: audioTrack ?? null,
      };
    }

    if (expectation.expectAudioFrom) {
      const remoteLabel = expectation.expectAudioFrom;
      if (!participantLabels.includes(remoteLabel)) {
        return {
          expectation,
          passed: false,
          reason: `Unknown participant label ${remoteLabel}`,
        };
      }

      const remoteState = states[remoteLabel];
      const remoteSocketId = remoteState?.socketId ?? null;
      if (!remoteSocketId) {
        return {
          expectation,
          passed: false,
          reason: `SocketId for ${remoteLabel} missing`,
        };
      }

      const remoteEntry =
        pageState.participants?.find((p) => p.id === remoteSocketId) || null;
      const audioStats = remoteEntry?.stats?.filter(
        (s) => s.type === 'inbound-rtp' && s.kind === 'audio'
      ) || [];
      const packetsReceived = audioStats.reduce(
        (sum, stat) => sum + (stat.packetsReceived ?? 0),
        0
      );
      const minPackets =
        typeof expectation.minPackets === 'number' ? expectation.minPackets : 1;
      const remoteAudioTrack =
        remoteEntry?.tracks?.find((track) => track.kind === 'audio') ?? null;
      const trackLive =
        !!remoteAudioTrack &&
        remoteAudioTrack.readyState === 'live' &&
        remoteAudioTrack.enabled === true &&
        remoteAudioTrack.muted === false;
      const playbackOk =
        remoteEntry?.mediaElementMuted === false ||
        remoteEntry?.mediaElementMuted === null;
      const trackerKey = `${pageLabel}->${remoteLabel}`;
      const previousPackets = packetTracker?.get(trackerKey);
      let deltaPackets =
        previousPackets != null ? packetsReceived - previousPackets : packetsReceived;
      if (deltaPackets < 0) {
        deltaPackets = packetsReceived;
      }

      return {
        expectation,
        passed: deltaPackets >= minPackets && trackLive && playbackOk,
        packetsReceived,
        deltaPackets,
        previousPackets: previousPackets ?? null,
        minPackets,
        trackLive,
        playbackMuted: remoteEntry?.mediaElementMuted ?? null,
      };
    }

    if (expectation.remoteIdFrom) {
      const remoteLabel = expectation.remoteIdFrom;
      if (!participantLabels.includes(remoteLabel)) {
        return {
          expectation,
          passed: false,
          reason: `Unknown participant label ${remoteLabel}`,
        };
      }

      const remoteState = states[remoteLabel];
      const expectedRemoteId = remoteState?.socketId ?? null;
      if (!expectedRemoteId) {
        return {
          expectation,
          passed: false,
          reason: `SocketId for ${remoteLabel} missing`,
        };
      }

      const remoteEntry =
        pageState.participants?.find((p) => p.id === expectedRemoteId) || null;
      const hasVideo = hasLiveRemoteVideo(pageState, expectedRemoteId);
      const desired = !!expectation.expectVideo;

      const videoFlagMatches = remoteEntry ? remoteEntry.videoEnabled === hasVideo : !desired;
      const presenceValue = remoteEntry?.presenceCam;
      const presenceMatches = presenceValue == null ? true : presenceValue === desired;
      const expectationMatches = desired ? hasVideo : !hasVideo;

      const passed = expectationMatches && videoFlagMatches && presenceMatches;

      return {
        expectation,
        passed,
        hasVideo,
        remoteId: expectedRemoteId,
        videoFlag: remoteEntry?.videoEnabled ?? null,
        presenceCam: remoteEntry?.presenceCam ?? null,
        presenceMic: remoteEntry?.presenceMic ?? null,
      };
    }

    return { expectation, passed: false, reason: 'Unknown expectation type' };
  });
}

async function runScenario(def) {
  const result = { name: def.name, success: false, details: {} };
  const logs = [];
  let server;
  let browser;
  const artifacts = {};

  const participantLabels = Array.from(new Set(def.participants ?? ['A', 'B']));
  if (participantLabels.length === 0) {
    throw new Error(`Scenario ${def.name} must declare at least one participant`);
  }

  const initiatorLabel = participantLabels.includes(def.initiator)
    ? def.initiator
    : participantLabels[0];

  const initialParticipants = Array.isArray(def.initialParticipants) && def.initialParticipants.length > 0
    ? def.initialParticipants.filter(
        (label, index, arr) => participantLabels.includes(label) && arr.indexOf(label) === index,
      )
    : [...participantLabels];

  if (!initialParticipants.includes(initiatorLabel)) {
    initialParticipants.unshift(initiatorLabel);
  }

  const connectionOrder = [
    initiatorLabel,
    ...initialParticipants.filter((label) => label !== initiatorLabel),
  ];

  try {
    server = await startServer();

    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--allow-insecure-localhost',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });

    const contexts = {};
    const pages = {};
    const url = resolveAppUrl(TEST_PORT);

    async function openParticipant(label) {
      const context = await createContext(browser);
      const page = await context.newPage();
      await collectConsole(page, label, logs);
      await page.goto(url, { waitUntil: 'networkidle0' });
      contexts[label] = context;
      pages[label] = page;
    }

    for (const label of connectionOrder) {
      await openParticipant(label);
      await clickConnect(pages[label]);
    }

    async function resolveHostLabel() {
      const entries = await Promise.all(
        participantLabels.map(async (label) => {
          const page = pages[label];
          if (!page) return null;
          const socketId = await page.evaluate(() => globalThis.App?.socket?.id || null);
          if (!socketId) return null;
          return { label, socketId };
        })
      );
      const available = entries.filter(Boolean);
      if (available.length === 0) {
        return initiatorLabel;
      }
      available.sort((a, b) => a.socketId.localeCompare(b.socketId));
      return available[0].label;
    }

    async function performAction(action) {
      if (!action || typeof action.type !== 'string') {
        return;
      }

      if (action.type === 'wait') {
        await delay(action.ms ?? 1_000);
        return;
      }

      if (action.type === 'camera') {
        const page = pages[action.participant];
        if (!page) throw new Error(`Page for participant ${action.participant} not found`);
        await setCameraState(page, action.enable);
        return;
      }

      if (action.type === 'microphone') {
        const page = pages[action.participant];
        if (!page) throw new Error(`Page for participant ${action.participant} not found`);
        await setMicrophoneState(page, action.enable);
        return;
      }

      if (action.type === 'join') {
        const label = action.participant;
        if (!participantLabels.includes(label)) {
          throw new Error(`Cannot join unknown participant ${label}`);
        }
        if (pages[label]) {
          return;
        }
        await openParticipant(label);
        await clickConnect(pages[label]);
        return;
      }

      if (action.type === 'hangup-all') {
        let participantLabel = action.participant;
        if (participantLabel === 'host') {
          participantLabel = await resolveHostLabel();
        }

        const page = pages[participantLabel];
        if (!page) throw new Error(`Page for participant ${participantLabel} not found`);
        await page.waitForSelector('#btnHangupAll', { visible: true, timeout: 15_000 });
        await page.click('#btnHangupAll');
        return;
      }

      if (action.type === 'restart-server') {
        await stopServer(server);
        server = await startServer();
        return;
      }

      if (action.type === 'rejoin') {
        const label = action.participant;
        const context = contexts[label];
        if (context) {
          await context.close();
        }
        delete contexts[label];
        delete pages[label];
        await delay(1_000);
        await openParticipant(label);
        await clickConnect(pages[label]);
        return;
      }

      throw new Error(`Unknown action type: ${action.type}`);
    }

    async function performActions(actions = []) {
      if (!Array.isArray(actions)) return;
      for (const action of actions) {
        await performAction(action);
      }
    }

    await performActions(def.actions);

    const packetTracker = new Map();

    async function captureStates() {
      const snapshot = {};
      for (const label of participantLabels) {
        const page = pages[label];
        snapshot[label] = page ? await extractState(page) : null;
      }
      return snapshot;
    }

    function updatePacketTracker(states) {
      participantLabels.forEach((pageLabel) => {
        const pageState = states[pageLabel];
        if (!pageState) {
          return;
        }
        participantLabels.forEach((remoteLabel) => {
          if (remoteLabel === pageLabel) {
            return;
          }
          const remoteState = states[remoteLabel];
          const remoteSocketId = remoteState?.socketId ?? null;
          if (!remoteSocketId) {
            return;
          }
          const remoteEntry =
            pageState.participants?.find((p) => p.id === remoteSocketId) || null;
          const audioStats = remoteEntry?.stats?.filter(
            (s) => s.type === 'inbound-rtp' && s.kind === 'audio'
          ) || [];
          const packetsReceived = audioStats.reduce(
            (sum, stat) => sum + (stat.packetsReceived ?? 0),
            0
          );
          const trackerKey = `${pageLabel}->${remoteLabel}`;
          packetTracker.set(trackerKey, packetsReceived);
        });
      });
    }

    const initialStates = await captureStates();
    updatePacketTracker(initialStates);

    const phases = Array.isArray(def.phases) && def.phases.length > 0
      ? def.phases
      : [
          {
            label: 'final',
            waitAfter: def.waitAfter ?? 5_000,
            expectations: def.expectations ?? [],
          },
        ];

    const phasesResults = [];
    let allPassed = true;

    for (const phase of phases) {
      if (phase.actions) {
        await performActions(phase.actions);
      }

      const waitMs = phase.waitAfter ?? 5_000;
      if (waitMs > 0) {
        await delay(waitMs);
      }

      const states = await captureStates();
      const expectationResults = evaluateExpectations(
        phase.expectations ?? [],
        states,
        participantLabels,
        packetTracker
      );
      if (!expectationResults.every((item) => item.passed)) {
        allPassed = false;
      }

      updatePacketTracker(states);

      phasesResults.push({
        label: phase.label ?? null,
        expectations: expectationResults,
        states,
      });
    }

    result.details.phases = phasesResults;
    result.details.logs = logs;
    result.success = allPassed;

    const artifactPath = await saveArtifact(def.name, result.details);
    artifacts.state = artifactPath;
    result.details.artifactPath = artifactPath;
  } catch (error) {
    result.error = error.message;
    console.error(`[scenario:${def.name}]`, error);
    result.success = false;
  } finally {
    await browser?.close();
    await stopServer(server);
  }

  if (!result.success) {
    console.error(`[scenario:${def.name}] FAILED`);
  } else {
    console.log(`[scenario:${def.name}] OK`);
  }

  return result;
}

async function main() {
  const results = [];
  for (const scenario of scenarios) {
    console.log(`\n--- Running scenario: ${scenario.name} ---`);
    results.push(await runScenario(scenario));
  }

  const failed = results.filter((r) => !r.success);
  console.log('\nSummary:');
  results.forEach((r) => {
    console.log(` - ${r.name}: ${r.success ? 'OK' : 'FAILED'}`);
    if (r.details?.artifactPath) {
      console.log(`   artifact: ${r.details.artifactPath}`);
    }
    if (r.error) {
      console.log(`   error: ${r.error}`);
    }
  });

  if (failed.length > 0) {
    console.error(`\nScenarios failed: ${failed.map((r) => r.name).join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
