import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const projectRoot = new URL('..', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, projectRoot), 'utf8');

test('voice input creates a review draft and sends only recognized text into chat', () => {
  const input = read('./components/chat-input.tsx');
  const messages = read('./components/chat-messages.tsx');
  const styles = read('./app/globals.css');

  const voiceLifecycle = input.slice(input.indexOf('const prepareVoiceDraft'), input.indexOf('const handleKeyDown'));

  assert.match(input, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(input, /SpeechRecognition/);
  assert.match(input, /prepareVoiceDraft/);
  assert.match(input, /setVoiceDraft\(\{ transcript: cleanTranscript, duration \}\)/);
  assert.match(input, /onSend\(voiceDraft\.transcript\)/);
  assert.match(input, /voice-draft-composer relative mx-3 min-h-\[146px\]/);
  assert.match(input, /voiceDraft && "hidden"/);
  assert.match(input, /voice-draft-wave/);
  assert.match(input, /absolute bottom-5 left-5/);
  assert.match(input, /absolute bottom-5 right-5/);
  assert.match(input, /Discard voice draft/);
  assert.match(input, /Send recognized voice text/);
  assert.doesNotMatch(voiceLifecycle, /Voice message transcript:/);
  assert.doesNotMatch(voiceLifecycle, /\/api\/storage\/upload/);
  assert.doesNotMatch(voiceLifecycle, /type: 'audio'/);
  assert.match(styles, /min-height: 146px/);
  assert.match(styles, /voice-draft-wave/);
  assert.match(messages, /attachment\.type === 'audio'/);
});

test('voice input refuses to fabricate a text message when speech was not recognized', () => {
  const input = read('./components/chat-input.tsx');
  assert.match(input, /No speech was detected, so nothing was sent/);
  assert.match(input, /Speech transcription is not available in this browser/);
});
