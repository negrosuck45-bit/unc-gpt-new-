import assert from "node:assert/strict"
import test from "node:test"
import fs from "node:fs"

const root = new URL("../", import.meta.url)
const read = (path) => fs.readFileSync(new URL(path, root), "utf8")

test("sidebar does not expose a dedicated Website Audit action", () => {
  const source = read("components/chat-sidebar.tsx")
  assert.doesNotMatch(source, /Website audit|Website recovery audit|onOpenAudit|ShieldCheck/)
  assert.match(source, /onModeChange: \(mode: "text" \| "voice" \| "imagine"\)/)
})

test("authenticated workspace opens directly into ordinary chat", () => {
  const source = read("app/chat-workspace.tsx")
  assert.doesNotMatch(source, /WebsiteRecoveryAudit|currentMode.*audit|onOpenAudit|FirstOpenOnboarding|shouldShowFirstOpenOnboarding/)
  assert.match(source, /const \[currentMode, setCurrentMode\] = useState<"text" \| "voice" \| "imagine">\("text"\)/)
  assert.match(source, /<ChatInterface/)
})

test("normal chat instructs the model to inspect user-requested URLs read-only", () => {
  const source = read("app/api/chat/route.ts")
  assert.match(source, /When the user provides an HTTP or HTTPS URL/)
  assert.match(source, /read-only computer_browser capability in the normal chat flow/)
  assert.match(source, /do not sign in, enter personal data, submit forms, send messages, make purchases/)
  assert.match(source, /visible usability|responsive layout|accessibility/)
  assert.match(source, /name: "computer_browser"/)
})
