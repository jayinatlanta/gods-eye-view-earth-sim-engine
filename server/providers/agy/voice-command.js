import { spawn } from 'node:child_process';
import process from 'node:process';
import { readRequestBody } from '../common/request.js';
import {
  DEFAULT_FALLBACK_MODEL,
  admitLocalAssistantRequest,
  buildSanitizedAgyEnv,
  isInvalidModelSelectionOutput,
  stripBenignAgyStderrWarnings,
} from './self-modify.js';

function spawnAgyOnce(prompt, modelName, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    try {
      const args = ['-p', prompt];
      if (modelName) {
        args.push('--model', modelName);
      }
      args.push('--disable-slash-commands', '--output-format', 'text');

      const child = spawn(
        process.platform === 'win32' ? 'agy.exe' : 'agy',
        args,
        {
          env: buildSanitizedAgyEnv(process.env),
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );

      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* ignore */
        }
        resolve({
          ok: false,
          exitCode: -1,
          stdout: stdout.trim(),
          stderr: stripBenignAgyStderrWarnings(stderr),
        });
      }, timeoutMs);

      child.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      child.on('error', () => {
        clearTimeout(timer);
        resolve({
          ok: false,
          exitCode: -1,
          stdout: stdout.trim(),
          stderr: stripBenignAgyStderrWarnings(stderr),
        });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          ok: code === 0 && Boolean(stdout.trim()),
          exitCode: code ?? -1,
          stdout: stdout.trim(),
          stderr: stripBenignAgyStderrWarnings(stderr),
        });
      });
    } catch {
      resolve({ ok: false, exitCode: -1, stdout: '', stderr: '' });
    }
  });
}

async function invokeAgyCli(prompt, { timeoutMs = 15000 } = {}) {
  const candidates = [
    'Gemini 3.8 Flash (High)',
    'gemini-3.8-flash-high',
    DEFAULT_FALLBACK_MODEL,
    '',
  ];
  for (const candidateModel of candidates) {
    const res = await spawnAgyOnce(prompt, candidateModel, { timeoutMs });
    if (res.ok) {
      return res.stdout;
    }
    if (!isInvalidModelSelectionOutput(res.stdout, res.stderr)) {
      return null;
    }
  }
  return null;
}

function parseJsonPayload(raw) {
  if (!raw) return null;
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Attempt to extract the first { ... } block
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function handleAgyVoiceCommand(
  req,
  res,
  { env = process.env } = {},
) {
  if (admitLocalAssistantRequest(req, res, { env })) return;
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const rawBody = await readRequestBody(req, 64 * 1024);
    const { transcript, context } = JSON.parse(rawBody || '{}');
    if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'Empty voice transcript' }));
      return;
    }

    const prompt = [
      "You are the voice assistant for God's Eye View 3D geospatial dashboard.",
      `User command: "${transcript.trim()}"`,
      context ? `Current UI context: ${JSON.stringify(context)}` : '',
      '',
      'Translate the command into a short spoken reply (<=12 words) and an array of actions from this list:',
      "- fly_to_location({ locationId?: 'austin'|'sf'|'nyc'|'tokyo'|'london'|'paris'|'dubai'|'dc', query?: string })",
      "- select_nearest_aircraft({ layerId: 'flights'|'military', locationId?: 'austin'|'sf'|'nyc'|'tokyo'|'london'|'paris'|'dubai'|'dc', locationQuery?: string })",
      "- adjust_camera_zoom({ direction: 'in'|'out', amount?: 'little'|'medium'|'lot' })",
      "- control_cockpit({ action: 'enter'|'exit' })",
      "- set_visual_style({ style: 'normal'|'retro'|'surveillance'|'thermal'|'anime'|'noir'|'snow' })",
      "- set_layer_visibility({ layerId: 'flights'|'military'|'satellites'|'cctv'|'traffic'|'firms'|'ais-live-vessels'|'radio', enabled: boolean })",
      "- set_context_mode({ mode: 'contacts'|'space-missions'|'off' })",
      '- zoom_to_globe()',
      "- toggle_panel({ panelId: 'data-panel'|'location-bar'|'control-panel'|'cctv-panel'|'radio-panel'|'global-context-panel'|'scene-panel'|'pp-toggles' })",
      '',
      'Rules:',
      "1. For flight tracking requests (e.g. 'track flight in New York', 'show nearest plane'), use select_nearest_aircraft.",
      "2. For cockpit requests ('cockpit', 'enter cockpit', 'cockpit view'), include control_cockpit({ action: 'enter' }).",
      "3. For exiting cockpit ('exit cockpit', 'back to map'), use control_cockpit({ action: 'exit' }).",
      "4. For visual styles ('night vision', 'thermal', 'crt'), use set_visual_style.",
      "5. For city/places ('fly to Paris', 'show Tokyo'), use fly_to_location.",
      'Respond with ONLY valid JSON with this schema:',
      '{',
      '  "reply": "spoken confirmation under 12 words",',
      '  "actions": [',
      '    { "name": "tool_name", "args": { ... } }',
      '  ]',
      '}',
    ]
      .filter(Boolean)
      .join('\n');

    const output = await invokeAgyCli(prompt, { timeoutMs: 15000 });
    const parsed = parseJsonPayload(output);

    if (parsed && typeof parsed === 'object') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify({
          ok: true,
          reply: parsed.reply || 'Executing command.',
          actions: Array.isArray(parsed.actions) ? parsed.actions : [],
          provider: 'agy-cli',
        }),
      );
      return;
    }

    // Fallback if model did not return structured JSON
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify({
        ok: true,
        reply: output ? output.slice(0, 80) : 'Command received.',
        actions: [],
        provider: 'agy-cli',
      }),
    );
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        ok: false,
        error: error?.message || 'Voice command handling failed',
      }),
    );
  }
}
