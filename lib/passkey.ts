const PASSKEY_ID_KEY = 'uncgpt_feedback_passkey_id'

function toBase64Url(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

export function isPasskeySupported() {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined' && !!navigator.credentials
}

export async function registerFeedbackPasskey() {
  if (!isPasskeySupported()) throw new Error('This browser does not support passkeys')
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'uncgpt', id: window.location.hostname },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: 'feedback-owner',
        displayName: 'Feedback owner',
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      timeout: 60000,
      attestation: 'none',
    } as any,
  }) as PublicKeyCredential | null
  if (!credential) throw new Error('Passkey setup was cancelled')
  const id = toBase64Url(credential.rawId)
  localStorage.setItem(PASSKEY_ID_KEY, id)
  return id
}

export async function verifyFeedbackPasskey() {
  if (!isPasskeySupported()) throw new Error('This browser does not support Face ID passkeys')
  const storedId = localStorage.getItem(PASSKEY_ID_KEY)
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: storedId ? [{ type: 'public-key', id: fromBase64Url(storedId) }] : [],
      userVerification: 'required',
      timeout: 60000,
    } as any,
  })
  if (!assertion) throw new Error('Passkey verification was cancelled')
  return true
}

export function hasFeedbackPasskey() {
  return typeof window !== 'undefined' && !!localStorage.getItem(PASSKEY_ID_KEY)
}

export function clearFeedbackPasskey() {
  if (typeof window !== 'undefined') localStorage.removeItem(PASSKEY_ID_KEY)
}
