import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const projectRoot = new URL('..', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, projectRoot), 'utf8');

test('voice messages are recorded, transcribed, uploaded, and sent as audio attachments', () => {
  const input = read('./components/chat-input.tsx');
  const store = read('./lib/chat-store.ts');
  const storageRoute = read('./app/api/storage/upload/route.ts');
  const messageRenderer = read('./components/chat-messages.tsx');
  const chatInterface = read('./components/chat-interface.tsx');

  assert.match(store, /"audio"/);
  assert.match(input, /new MediaRecorder\(stream/);
  assert.match(input, /SpeechRecognition/);
  assert.match(input, /Voice message transcript:/);
  assert.match(input, /type: 'audio'/);
  assert.match(input, /\/api\/storage\/upload/);
  assert.match(input, /voice-recording-wave/);
  assert.match(storageRoute, /const isAudio = file\.type\.startsWith\('audio\/'\)/);
  assert.match(storageRoute, /Only image and audio uploads are supported/);
  assert.match(messageRenderer, /attachment\.type === 'audio'/);
  assert.match(messageRenderer, /Voice message/);
  assert.match(chatInterface, /a\.type === "audio"/);
});

test('voice messages are not sent to the AI without recognized speech', () => {
  const input = read('./components/chat-input.tsx');
  assert.match(input, /No speech was detected, so the voice message was not sent/);
  assert.match(input, /Speech transcription is not available in this browser/);
});
