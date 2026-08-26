import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const projectRoot = new URL('..', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, projectRoot), 'utf8');

test('voice input shows the full waveform tray while recording and sends only recognized text on confirm', () => {
  const input = read('./components/chat-input.tsx');
  const messages = read('./components/chat-messages.tsx');
  const styles = read('./app/globals.css');
  const voiceLifecycle = input.slice(input.indexOf('const cancelVoiceRecording'), input.indexOf('const handleKeyDown'));

  assert.match(input, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(input, /SpeechRecognition/);
  assert.match(input, /const cancelVoiceRecording/);
  assert.match(input, /const confirmVoiceRecording/);
  assert.match(input, /onSend\(transcript\)/);
  assert.match(input, /voice-live-composer relative mx-3 min-h-\[146px\]/);
  assert.match(input, /voice-live-wave/);
  assert.match(input, /--voice-wave-index/);
  assert.match(input, /voiceDraft && "hidden"|isRecording && "hidden"/);
  assert.match(input, /Discard voice recording/);
  assert.match(input, /Send recognized voice text/);
  assert.match(input, /cancelVoiceRecording/);
  assert.match(input, /confirmVoiceRecording/);
  assert.doesNotMatch(voiceLifecycle, /Voice message transcript:/);
  assert.doesNotMatch(voiceLifecycle, /\/api\/storage\/upload/);
  assert.doesNotMatch(voiceLifecycle, /type: 'audio'/);
  assert.match(styles, /voice-live-composer/);
  assert.match(styles, /voice-live-wave/);
  assert.match(styles, /voice-wave-travel/);
  assert.match(styles, /--voice-wave-index/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(messages, /attachment\.type === 'audio'/);
});

test('voice input refuses to fabricate a text message when speech was not recognized', () => {
  const input = read('./components/chat-input.tsx');
  assert.match(input, /No speech was detected, so nothing was sent/);
  assert.match(input, /Speech transcription is not available in this browser/);
});
