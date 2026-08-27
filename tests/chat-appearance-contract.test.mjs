import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const projectRoot = new URL('..', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, projectRoot), 'utf8');

test('AI replies are bubbleless while user messages retain their bubble', () => {
  const messages = read('./components/chat-messages.tsx');
  const computerMessages = read('./components/chat-messages-computer-use.tsx');

  assert.match(messages, /isAssistant\s*\? 'px-0 py-1 text-foreground'/);
  assert.match(messages, /: 'task-user-message rounded-\[22px\] px-4 py-3 text-foreground shadow-sm'/);
  assert.doesNotMatch(messages, /task-assistant-message/);
  assert.match(computerMessages, /: 'rounded-none bg-transparent px-0 py-1 text-foreground'/);
  assert.match(computerMessages, /\? 'rounded-lg bg-blue-600 px-4 py-3 text-white rounded-br-none'/);
});

test('Settings keeps a comprehensive AI language list while the app is locked to its clean gray appearance', () => {
  const settings = read('./components/settings-page.tsx');
  const layout = read('./app/layout.tsx');
  const styles = read('./app/globals.css');
  const chrome = read('./components/theme-chrome.tsx');
  const input = read('./components/chat-input.tsx');
  const notifications = read('./components/notifications-page.tsx');
  const inbox = read('./components/messages-page.tsx');
  const thread = read('./components/message-thread-page.tsx');
  const languages = read('./lib/language-preferences.ts');
  const chat = read('./components/chat-interface.tsx');
  const api = read('./app/api/chat/route.ts');
  const publisher = read('./scripts/publish-agent-upgrade.sh');
  const workspace = read('./app/chat-workspace.tsx');

  assert.doesNotMatch(settings, /<Label>Theme<\/Label>/);
  assert.doesNotMatch(settings, /APPEARANCE_OPTIONS/);
  assert.doesNotMatch(settings, /label: 'System'/);
  assert.match(layout, /forcedTheme="gray"/);
  assert.match(layout, /themes=\{\["gray"\]\}/);
  assert.match(layout, /gray: "dark-gray"/);
  assert.match(styles, /--task-chat-canvas/);
  assert.match(styles, /--task-chrome/);
  assert.match(styles, /\.dark-gray/);
  assert.match(styles, /\.white/);
  assert.match(styles, /#242424/);
  assert.match(styles, /#101011/);
  assert.match(styles, /background-color: var\(--background\)/);
  assert.match(styles, /\.task-welcome-back[\s\S]*color: var\(--task-chat-foreground\)/);
  assert.match(styles, /\.task-header-icon,[\s\S]*color: var\(--task-control-color\)/);
  assert.match(styles, /\.task-composer-dock[\s\S]*var\(--task-chrome\)/);
  assert.match(chrome, /activeTheme === "light" \|\| activeTheme === "white" \? "light" : "dark"/);
  assert.match(chrome, /meta\[name="theme-color"\]/);
  assert.match(styles, /--task-send-disabled-bg/);
  assert.match(styles, /--sidebar: oklch\(0\.20 0 0\)/);
  assert.match(styles, /--task-chrome: #242424/);
  assert.match(styles, /--task-composer-surface: #242424/);
  assert.match(styles, /background: rgba\(36, 36, 36, 0\.72\)/);
  assert.match(workspace, /bg-\[rgba\(36,36,36,0\.62\)\]/);
  assert.match(styles, /\.task-composer-send[\s\S]*var\(--task-send-disabled-color\)/);
  assert.match(input, /task-composer-send h-10 w-10 rounded-full/);
  assert.match(notifications, /social-scroll-page min-h-screen bg-background/);
  assert.match(notifications, /rounded-\[22px\] border border-border bg-card/);
  assert.match(inbox, /social-scroll-page min-h-screen bg-background/);
  assert.match(thread, /social-scroll-page min-h-screen bg-background/);
  assert.doesNotMatch(notifications, /bg-\[#050505\]/);
  assert.doesNotMatch(inbox, /bg-\[#050505\]/);
  assert.doesNotMatch(thread, /bg-\[#050505\]/);
  assert.match(settings, /AI language/);
  assert.match(settings, /LANGUAGE_OPTIONS\.map/);
  assert.match(languages, /code: "aa", label: "Afar"/);
  assert.match(languages, /code: "zh", label: "Chinese"/);
  assert.match(languages, /code: "zu", label: "Zulu"/);
  assert.match(languages, /normalizeLanguagePreference/);
  assert.match(chat, /clientLanguage: getStoredLanguagePreference\(\)/);
  assert.match(api, /clientLanguage,/);
  assert.match(api, /languagePreferenceInstruction\(clientLanguage, clientLocale\)/);
  for (const requiredFile of ['app/layout.tsx', 'app/chat-workspace.tsx', 'components/chat-sidebar.tsx', 'components/settings-page.tsx', 'components/theme-chrome.tsx', 'components/notifications-page.tsx', 'components/messages-page.tsx', 'components/message-thread-page.tsx', 'lib/language-preferences.ts']) {
    assert.match(publisher, new RegExp(`"${requiredFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  }
});
