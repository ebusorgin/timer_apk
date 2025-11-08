import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import puppeteer from 'puppeteer';
import { collectConsole, resolveAppUrl, saveArtifact } from './helpers.js';

const TEST_PORT = process.env.TEST_PORT ? Number(process.env.TEST_PORT) : 4100;

const scenarios = [
  {
    name: 'initiator_a_camera_on',
    initiator: 'A',
    actions: [{ type: 'camera', participant: 'A', enable: true }],
    expectations: [{ page: 'B', remoteIdFrom: 'A', expectVideo: true }],
  },
  {
    name: 'non_initiator_camera_on',
    initiator: 'A',
    actions: [{ type: 'camera', participant: 'B', enable: true }],
    expectations: [{ page: 'A', remoteIdFrom: 'B', expectVideo: true }],
  },
  {
    name: 'toggle_camera_twice',
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
      participants,
      localTracks,
    };
  });
}

function hasLiveRemoteVideo(state, remoteId) {
  const remote = state.participants.find((p) => p.id === remoteId);
  if (!remote) return false;
  return remote.tracks.some((track) => track.kind === 'video' && track.readyState === 'live');
}

async function runScenario(def) {
  const result = { name: def.name, success: false, details: {} };
  const logs = [];
  let server;
  let browser;
  const artifacts = {};

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

    if (def.initiator === 'A') {
      await openParticipant('A');
      await clickConnect(pages.A);
      await openParticipant('B');
      await clickConnect(pages.B);
    } else {
      await openParticipant('B');
      await clickConnect(pages.B);
      await openParticipant('A');
      await clickConnect(pages.A);
    }

    for (const action of def.actions) {
      if (action.type === 'wait') {
        await delay(action.ms);
        continue;
      }
      if (action.type === 'camera') {
        const page = pages[action.participant];
        if (!page) throw new Error(`Page for participant ${action.participant} not found`);
        await setCameraState(page, action.enable);
        continue;
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
        continue;
      }
      throw new Error(`Unknown action type: ${action.type}`);
    }

    await delay(5_000);

    const stateA = await extractState(pages.A);
    const stateB = await extractState(pages.B);

    result.details.stateA = stateA;
    result.details.stateB = stateB;

    const expectationResults = def.expectations.map((expectation) => {
      const pageState = expectation.page === 'A' ? stateA : stateB;
      if (!pageState) {
        return { expectation, passed: false, reason: 'Page state missing' };
      }

      const expectedRemoteId =
        expectation.remoteIdFrom === 'A' ? stateA.socketId : stateB.socketId;
      if (!expectedRemoteId) {
        return {
          expectation,
          passed: false,
          reason: `SocketId for ${expectation.remoteIdFrom} missing`,
        };
      }

      const remoteEntry = pageState.participants.find((p) => p.id === expectedRemoteId) || null;
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
    });

    result.details.expectations = expectationResults;
    result.details.logs = logs;

    result.success = expectationResults.every((item) => item.passed);

    const artifactPath = await saveArtifact(def.name, result.details);
    artifacts.state = artifactPath;
    result.details.artifactPath = artifactPath;
  } catch (error) {
    result.error = error.message;
    console.error(`[scenario:${def.name}]`, error);
    result.success = false;
  } finally {
    await browser?.close();
    server?.kill('SIGTERM');
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

