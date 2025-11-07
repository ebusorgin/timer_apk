/* @vitest-environment jsdom */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
            <div id="participantsList" class="participants-list"></div>
            <div class="conference-controls">
              <button id="btnMute" class="btn btn-control">🎤 Включить микрофон</button>
              <button id="btnDisconnect" class="btn btn-secondary">Отключиться</button>
            </div>
            <div id="statusMessage" class="status-message"></div>
          </div>
        </div>
      </div>
    `;

    App.socket = null;
    App.localStream = null;
    App.participants = new Map();
    App.init();
  });

  it('initialises DOM element references after init', () => {
    expect(App.elements.btnConnect).toBeInstanceOf(HTMLButtonElement);
    expect(App.elements.btnMute).toBeInstanceOf(HTMLButtonElement);
    expect(App.elements.participantsList.id).toBe('participantsList');
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
});
