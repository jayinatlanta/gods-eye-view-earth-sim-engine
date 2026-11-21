import { createGevActionRunner } from './gevActions.js';
import { isPushToTalkKey, PUSH_TO_TALK_HOLD_DELAY_MS } from './gevRealtime.js';

const STATUS = {
  idle: 'OFF',
  listening: 'LISTENING',
  executing: 'THINKING',
  error: 'ERROR',
};

export class AgyVoiceController {
  constructor({ runner, ui, dataManager = null }) {
    this.runner = runner;
    this.ui = ui;
    this.dataManager = dataManager;
    this.status = 'idle';
    this.recognition = null;
    this.finalTranscript = '';
    this.spaceKeyHeld = false;
    this.spaceHoldTimer = null;
    this.pushToTalkMode = false;
    this.spaceSuppressNextClick = false;
    this.visualizerInterval = null;
    this._boundKeyDown = (e) => this.onKeyDown(e);
    this._boundKeyUp = (e) => this.onKeyUp(e);
  }

  isActive() {
    return this.status === 'listening' || this.status === 'executing';
  }

  setStatus(status, detailText = '') {
    this.status = status;
    if (this.ui?.root) {
      this.ui.root.dataset.status = status;
      this.ui.root.dataset.speaker =
        status === 'listening'
          ? 'user'
          : status === 'executing'
            ? 'ai'
            : 'idle';
    }
    if (this.ui?.status) {
      this.ui.status.textContent = STATUS[status] || status.toUpperCase();
    }
    if (this.ui?.detail && detailText) {
      this.ui.detail.textContent = detailText;
    }
  }

  syncCostUi() {
    if (this.ui?.costValue) {
      this.ui.costValue.textContent = 'LOCAL';
      this.ui.costValue.title = 'Free local AGY CLI voice processing';
      this.ui.costValue.dataset.level = 'ok';
    }
    if (this.ui?.tierButton) {
      this.ui.tierButton.textContent = 'AGY';
      this.ui.tierButton.title = 'Active provider: AGY CLI (Gemini 3.8 Flash)';
    }
  }

  toggleVoiceTier() {
    // No-op for local AGY tier, or can notify
    this.syncCostUi();
  }

  start({ pushToTalk = false } = {}) {
    if (this.isActive()) return;
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.setStatus('error', 'Browser speech recognition not supported');
      return;
    }

    this.pushToTalkMode = pushToTalk;
    this.finalTranscript = '';

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.setStatus('listening', 'Hold Space to speak');
        this.startVisualizer();
      };

      this.recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            this.finalTranscript += transcript;
          } else {
            interim += transcript;
          }
        }
        const text = (this.finalTranscript + ' ' + interim).trim();
        if (text && this.ui?.detail) {
          this.ui.detail.textContent = text;
        }
      };

      this.recognition.onerror = (event) => {
        this.stopVisualizer();
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('[AGY Voice] Recognition error:', event.error);
          this.setStatus('error', `Speech error: ${event.error}`);
        } else {
          this.setStatus('idle', 'VOICE STANDBY');
        }
      };

      this.recognition.onend = () => {
        this.stopVisualizer();
        const command = this.finalTranscript.trim();
        if (command) {
          void this.dispatchCommand(command);
        } else {
          this.setStatus('idle', 'VOICE STANDBY');
        }
      };

      this.recognition.start();
    } catch (error) {
      console.warn('[AGY Voice] Failed to start recognition:', error);
      this.setStatus('error', 'Microphone unavailable');
    }
  }

  stop({ preserveStatus = false } = {}) {
    this.stopVisualizer();
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        /* best effort */
      }
      this.recognition = null;
    }
    if (!preserveStatus) {
      this.setStatus('idle', 'VOICE STANDBY');
    }
  }

  startVisualizer() {
    this.stopVisualizer();
    const bars = this.ui?.root?.querySelectorAll('.gev-voice-visualizer span');
    if (!bars || bars.length === 0) return;
    this.visualizerInterval = setInterval(() => {
      const level = Math.random() * 0.7 + 0.3;
      for (const bar of bars) {
        bar.style.setProperty('--audio-level', String(level));
        bar.style.setProperty('--audio-opacity', '0.9');
      }
    }, 100);
  }

  stopVisualizer() {
    if (this.visualizerInterval) {
      clearInterval(this.visualizerInterval);
      this.visualizerInterval = null;
    }
    const bars = this.ui?.root?.querySelectorAll('.gev-voice-visualizer span');
    if (bars) {
      for (const bar of bars) {
        bar.style.removeProperty('--audio-level');
        bar.style.removeProperty('--audio-opacity');
      }
    }
  }

  async dispatchCommand(transcript) {
    this.setStatus('executing', `Thinking: "${transcript}"`);
    try {
      const response = await fetch('/api/agy/voice-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || 'Execution failed');
      }

      // Execute returned tool actions sequentially
      if (Array.isArray(data.actions) && data.actions.length > 0) {
        for (const action of data.actions) {
          if (action?.name && typeof this.runner === 'function') {
            try {
              await this.runner(action.name, action.args || {});
            } catch (err) {
              console.warn(`[AGY Voice] Action ${action.name} failed:`, err);
            }
          }
        }
      }

      const reply = data.reply || 'Done.';
      this.setStatus('idle', reply);
      this.speakReply(reply);
    } catch (error) {
      console.warn('[AGY Voice] Command execution failed:', error);
      this.setStatus('error', error.message || 'Execution error');
      setTimeout(() => {
        if (this.status === 'error') {
          this.setStatus('idle', 'VOICE STANDBY');
        }
      }, 4000);
    }
  }

  speakReply(text) {
    if (typeof window.speechSynthesis === 'undefined' || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices?.() || [];
      const englishVoice = voices.find(
        (v) =>
          v.lang?.startsWith('en') &&
          (v.name.includes('Natural') ||
            v.name.includes('Google') ||
            v.name.includes('Online')),
      );
      if (englishVoice) {
        utterance.voice = englishVoice;
      }
      window.speechSynthesis.speak(utterance);
    } catch {
      /* best effort speech output */
    }
  }

  bindPushToTalkShortcut() {
    window.addEventListener('keydown', this._boundKeyDown);
    window.addEventListener('keyup', this._boundKeyUp);
  }

  unbindPushToTalkShortcut() {
    window.removeEventListener('keydown', this._boundKeyDown);
    window.removeEventListener('keyup', this._boundKeyUp);
  }

  onKeyDown(event) {
    if (!isPushToTalkKey(event) || event.repeat) return;
    if (event.target?.closest?.('input, textarea, select, [contenteditable]'))
      return;
    this.spaceKeyHeld = true;
    this.spaceHoldTimer = setTimeout(() => {
      this.spaceSuppressNextClick = true;
      if (!this.isActive()) {
        this.start({ pushToTalk: true });
      }
    }, PUSH_TO_TALK_HOLD_DELAY_MS);
  }

  onKeyUp(event) {
    if (!isPushToTalkKey(event)) return;
    clearTimeout(this.spaceHoldTimer);
    this.spaceHoldTimer = null;
    this.spaceKeyHeld = false;
    if (this.status === 'listening') {
      this.stop();
    }
    setTimeout(() => {
      this.spaceSuppressNextClick = false;
    }, 100);
  }
}

export function initAgyVoiceCommands({
  viewer,
  styleManager,
  dataManager,
  sceneDirector = null,
  annotations = null,
  placeSearch,
}) {
  if (
    window.__gevVoiceCommands &&
    typeof window.__gevVoiceCommands.stop === 'function'
  ) {
    window.__gevVoiceCommands.stop({ removeUi: true });
  }

  const runner = createGevActionRunner({
    viewer,
    styleManager,
    dataManager,
    sceneDirector,
    annotations,
    placeSearch,
  });
  const root = document.getElementById('gev-voice-control');
  const ui = root
    ? {
        root,
        button: root.querySelector('#gev-voice-button'),
        buttonLabel: root.querySelector('.gev-mic-label'),
        status: root.querySelector('#gev-voice-status'),
        detail: root.querySelector('#gev-voice-detail'),
        helpDetail: root.querySelector('.gev-voice-help-detail'),
        errorDetail: root.querySelector('#gev-voice-error-detail'),
        tierButton: root.querySelector('#gev-voice-tier'),
        costValue: root.querySelector('#gev-voice-cost-value'),
      }
    : null;

  const controller = new AgyVoiceController({ runner, ui, dataManager });
  controller.buttonHandler = () => {
    if (controller.spaceSuppressNextClick) return;
    if (controller.isActive()) controller.stop();
    else controller.start({ pushToTalk: false });
  };

  if (ui?.button) {
    ui.button.addEventListener('click', controller.buttonHandler);
  }
  controller.syncCostUi();
  controller.bindPushToTalkShortcut();
  window.__gevVoiceCommands = controller;
  return controller;
}
