import { useEffect, useState } from 'react'
import { LANGUAGE_OPTIONS, normalizeLanguagePreference, getStoredLanguagePreference } from '@/lib/language-preferences'

type TranslationKey =
  | 'signInTitle' | 'signUpTitle' | 'welcomeBack' | 'createAccount'
  | 'continueGoogle' | 'continueDiscord' | 'continueGithub' | 'openingSignIn'
  | 'lastUsed' | 'or' | 'emailAddress' | 'enterEmail' | 'continue'
  | 'signUpPrompt' | 'signInPrompt' | 'dontHaveAccount' | 'alreadyHaveAccount'
  | 'emailUnavailable' | 'cancelled' | 'unavailable' | 'failed' | 'unverified'
  | 'getStarted' | 'language' | 'automaticDevice' | 'selected' | 'back' | 'openingLanguageSelection'
  | 'enterEmailOnboarding' | 'accountRecovery' | 'signedInAccount'
  | 'whatsYourName' | 'nameDescription' | 'yourName' | 'chooseUsername'
  | 'usernameDescription' | 'changeLater' | 'createAccountButton' | 'chooseLanguage'
  | 'newTask' | 'assignTask' | 'newChat' | 'search' | 'imagine' | 'settings' | 'notifications'
  | 'openSidebar' | 'closeSidebar' | 'searchChats' | 'searchChatsPlaceholder' | 'recents' | 'today' | 'yesterday'
  | 'previous7Days' | 'previous30Days' | 'older' | 'noChatsFound' | 'noChatsYet' | 'account' | 'signedInSecurely'
  | 'rename' | 'delete' | 'untitled' | 'welcomeBackShort' | 'connectionRestored' | 'connectionLost'
  | 'assistantUnavailable' | 'send' | 'cancel' | 'add' | 'photos' | 'seeAll' | 'photoLibrary' | 'addFiles'
  | 'connectComputer' | 'addSkills' | 'buildWebsite' | 'createSlides' | 'createImage' | 'pasteUrl' | 'connections'
  | 'connectAppsDescription' | 'secureSignInDescription' | 'noAppsConnected' | 'connectedApps' | 'browseApps'
  | 'searchApps' | 'connect' | 'disconnect' | 'refresh' | 'loading'   | 'messages' | 'conversation' | 'inbox' | 'startConversation'

  | 'noMessagesYet' | 'caughtUp' | 'peopleYouMayKnow' | 'openMessage' | 'addBack' | 'taskAction'

const translations: Record<string, Partial<Record<TranslationKey, string>>> = {
  en: {
    signInTitle: 'Sign in to Lunar', signUpTitle: 'Create your Lunar account', welcomeBack: 'Welcome back! Please sign in to continue', createAccount: 'Create an account to continue.', continueGoogle: 'Continue with Google', continueDiscord: 'Continue with Discord', continueGithub: 'Continue with GitHub', openingSignIn: 'Opening secure sign-in…', lastUsed: 'Last used', or: 'or', emailAddress: 'Email address', enterEmail: 'Enter your email address', continue: 'Continue', dontHaveAccount: "Don't have an account?", alreadyHaveAccount: 'Already have an account?', signUpPrompt: 'Sign up', signInPrompt: 'Sign in', emailUnavailable: 'Email sign-in is not configured yet. Use Google, Discord, or GitHub to continue securely.', cancelled: 'Sign-in was cancelled. Choose a provider to continue.', unavailable: 'This Lunar sign-in option is still being configured. Please choose another option.', failed: 'Lunar could not complete that sign-in. Please try again.', unverified: 'Use a provider account with a verified email address to continue.', getStarted: 'Get started', language: 'Language', automaticDevice: 'Automatic uses your device language.', selected: 'Selected', back: 'Back', openingLanguageSelection: 'Opening language selection', enterEmailOnboarding: 'Enter your email', accountRecovery: 'For your Lunar account and recovery.', signedInAccount: 'Signed-in Lunar account', whatsYourName: "What's your name?", nameDescription: 'This name will be shown in your Lunar settings.', yourName: 'Your name', chooseUsername: 'Choose a username', usernameDescription: '1–24 characters. Use letters, numbers, and underscores.', changeLater: 'You can change this later in Settings.', createAccountButton: 'Create account', chooseLanguage: 'Choose your language',
    newTask: 'New task', assignTask: 'Assign a task or type / for more', newChat: 'New chat', search: 'Search', imagine: 'Imagine', settings: 'Settings', notifications: 'Notifications', openSidebar: 'Open sidebar', closeSidebar: 'Close sidebar', searchChats: 'Search chats', searchChatsPlaceholder: 'Search chats…', recents: 'Recents', today: 'Today', yesterday: 'Yesterday', previous7Days: 'Previous 7 days', previous30Days: 'Previous 30 days', older: 'Older', noChatsFound: 'No chats found', noChatsYet: 'No chats yet', account: 'Account', signedInSecurely: 'Signed in securely', rename: 'Rename', delete: 'Delete', untitled: 'Untitled', welcomeBackShort: 'Welcome back', connectionRestored: 'Connection restored', connectionLost: 'Connection lost. Please check your network.', assistantUnavailable: 'The assistant is temporarily unreachable. Please try again.', send: 'Send', cancel: 'Cancel', add: 'Add', photos: 'Photos', seeAll: 'See all', photoLibrary: 'Photo Library', addFiles: 'Add files', connectComputer: 'Connect My Computer', addSkills: 'Add Skills', buildWebsite: 'Build website', createSlides: 'Create slides', createImage: 'Create image', pasteUrl: 'Paste URL…', connections: 'Connections', connectAppsDescription: 'Connect the apps you use and control what Lunar can access.', secureSignInDescription: 'Choose an app below and finish its secure sign-in once.', noAppsConnected: 'No apps connected yet', connectedApps: 'Connected apps', browseApps: 'Browse apps', searchApps: 'Search for an app and connect it securely.', connect: 'Connect', disconnect: 'Disconnect', refresh: 'Refresh', loading: 'Loading…', messages: 'Messages', conversation: 'Conversation', inbox: 'Inbox', startConversation: 'Start a conversation', noMessagesYet: 'No messages yet', caughtUp: 'You’re all caught up.', peopleYouMayKnow: 'People you may know', openMessage: 'Open message', addBack: 'Add back', taskAction: 'Assign a task',
  },
  it: {
    signInTitle: 'Accedi a Lunar', signUpTitle: 'Crea il tuo account Lunar', welcomeBack: 'Bentornato! Accedi per continuare', createAccount: 'Crea un account per continuare.', continueGoogle: 'Continua con Google', continueDiscord: 'Continua con Discord', continueGithub: 'Continua con GitHub', openingSignIn: 'Apertura dell’accesso sicuro…', lastUsed: 'Usato di recente', or: 'oppure', emailAddress: 'Indirizzo email', enterEmail: 'Inserisci il tuo indirizzo email', continue: 'Continua', dontHaveAccount: 'Non hai un account?', alreadyHaveAccount: 'Hai già un account?', signUpPrompt: 'Registrati', signInPrompt: 'Accedi', emailUnavailable: 'L’accesso con email non è ancora configurato. Usa Google, Discord o GitHub per continuare in sicurezza.', cancelled: 'Accesso annullato. Scegli un provider per continuare.', unavailable: 'Questa opzione di accesso a Lunar è ancora in configurazione. Scegline un’altra.', failed: 'Lunar non ha potuto completare l’accesso. Riprova.', unverified: 'Usa un account del provider con un indirizzo email verificato per continuare.', getStarted: 'Inizia', language: 'Lingua', automaticDevice: 'Automatico usa la lingua del dispositivo.', selected: 'Selezionato', back: 'Indietro', openingLanguageSelection: 'Apertura della selezione della lingua', enterEmailOnboarding: 'Inserisci la tua email', accountRecovery: 'Per il tuo account Lunar e il recupero.', signedInAccount: 'Account Lunar connesso', whatsYourName: 'Come ti chiami?', nameDescription: 'Questo nome sarà mostrato nelle impostazioni di Lunar.', yourName: 'Il tuo nome', chooseUsername: 'Scegli un nome utente', usernameDescription: '1–24 caratteri. Usa lettere, numeri e trattini bassi.', changeLater: 'Puoi cambiarlo in seguito nelle Impostazioni.', createAccountButton: 'Crea account', chooseLanguage: 'Scegli la tua lingua',
    newTask: 'Nuovo compito', assignTask: 'Assegna un compito o digita / per altro', newChat: 'Nuova chat', search: 'Cerca', imagine: 'Immagina', settings: 'Impostazioni', notifications: 'Notifiche', openSidebar: 'Apri barra laterale', closeSidebar: 'Chiudi barra laterale', searchChats: 'Cerca nelle chat', searchChatsPlaceholder: 'Cerca chat…', recents: 'Recenti', today: 'Oggi', yesterday: 'Ieri', previous7Days: 'Ultimi 7 giorni', previous30Days: 'Ultimi 30 giorni', older: 'Più vecchie', noChatsFound: 'Nessuna chat trovata', noChatsYet: 'Ancora nessuna chat', account: 'Account', signedInSecurely: 'Accesso sicuro effettuato', rename: 'Rinomina', delete: 'Elimina', untitled: 'Senza titolo', welcomeBackShort: 'Bentornato', connectionRestored: 'Connessione ripristinata', connectionLost: 'Connessione persa. Controlla la rete.', assistantUnavailable: 'L’assistente non è momentaneamente raggiungibile. Riprova.', send: 'Invia', cancel: 'Annulla', add: 'Aggiungi', photos: 'Foto', seeAll: 'Vedi tutto', photoLibrary: 'Libreria foto', addFiles: 'Aggiungi file', connectComputer: 'Collega il mio computer', addSkills: 'Aggiungi competenze', buildWebsite: 'Crea sito web', createSlides: 'Crea presentazione', createImage: 'Crea immagine', pasteUrl: 'Incolla URL…', connections: 'Connessioni', connectAppsDescription: 'Collega le app che usi e controlla a cosa può accedere Lunar.', secureSignInDescription: 'Scegli un’app e completa una volta l’accesso sicuro.', noAppsConnected: 'Nessuna app collegata', connectedApps: 'App collegate', browseApps: 'Esplora app', searchApps: 'Cerca un’app e collegala in sicurezza.', connect: 'Collega', disconnect: 'Disconnetti', refresh: 'Aggiorna', loading: 'Caricamento…', messages: 'Messaggi', conversation: 'Conversazione', inbox: 'Posta in arrivo', startConversation: 'Inizia una conversazione', noMessagesYet: 'Ancora nessun messaggio', caughtUp: 'Hai recuperato tutto.', peopleYouMayKnow: 'Persone che potresti conoscere', openMessage: 'Apri messaggio', addBack: 'Aggiungi', taskAction: 'Assegna un compito',
  },
  es: { welcomeBack: '¡Bienvenido de nuevo!', assignTask: 'Asigna una tarea o escribe / para más', language: 'Idioma', settings: 'Ajustes', notifications: 'Notificaciones', newChat: 'Nuevo chat', search: 'Buscar', send: 'Enviar', cancel: 'Cancelar', connect: 'Conectar', disconnect: 'Desconectar', messages: 'Mensajes', inbox: 'Bandeja de entrada', startConversation: 'Inicia una conversación', chooseLanguage: 'Elige tu idioma' },
  fr: { welcomeBack: 'Bon retour !', assignTask: 'Attribuez une tâche ou saisissez / pour plus', language: 'Langue', settings: 'Paramètres', notifications: 'Notifications', newChat: 'Nouvelle discussion', search: 'Rechercher', send: 'Envoyer', cancel: 'Annuler', connect: 'Connecter', disconnect: 'Déconnecter', messages: 'Messages', inbox: 'Boîte de réception', startConversation: 'Démarrer une conversation', chooseLanguage: 'Choisissez votre langue' },
  de: { welcomeBack: 'Willkommen zurück!', assignTask: 'Aufgabe zuweisen oder / für mehr eingeben', language: 'Sprache', settings: 'Einstellungen', notifications: 'Benachrichtigungen', newChat: 'Neuer Chat', search: 'Suchen', send: 'Senden', cancel: 'Abbrechen', connect: 'Verbinden', disconnect: 'Trennen', messages: 'Nachrichten', inbox: 'Posteingang', startConversation: 'Gespräch beginnen', chooseLanguage: 'Sprache auswählen' },
  pt: { welcomeBack: 'Bem-vindo de volta!', assignTask: 'Atribua uma tarefa ou digite / para mais', language: 'Idioma', settings: 'Configurações', notifications: 'Notificações', newChat: 'Novo chat', search: 'Pesquisar', send: 'Enviar', cancel: 'Cancelar', connect: 'Conectar', disconnect: 'Desconectar', messages: 'Mensagens', inbox: 'Caixa de entrada', startConversation: 'Iniciar uma conversa', chooseLanguage: 'Escolha seu idioma' },
}

// Every language in the picker gets a complete catalog. Locale-specific phrases
// win, while individual untranslated phrases safely fall back to English.
const completeTranslations: Record<string, Partial<Record<TranslationKey, string>>> = Object.fromEntries(
  LANGUAGE_OPTIONS
    .filter(({ code }) => code !== 'auto')
    .map(({ code }) => [code, { ...(translations.en || {}), ...(translations[code] || {}) }]),
)

function getDeviceLanguage(): string {
  if (typeof navigator === 'undefined') return 'en'
  const candidates = [navigator.language, ...(navigator.languages || [])]
  for (const candidate of candidates) {
    const code = String(candidate || '').toLowerCase().split('-')[0]
    if (code && completeTranslations[code]) return code
  }
  return 'en'
}

export function getUiLanguage(value: unknown): string {
  const code = normalizeLanguagePreference(value)
  if (code === 'auto') return getDeviceLanguage()
  return completeTranslations[code] ? code : 'en'
}

export function uiText(value: unknown, key: TranslationKey): string {
  const language = getUiLanguage(value)
  return completeTranslations[language]?.[key] ?? translations.en[key] ?? key
}

export function useUiText() {
  // Render English on the server/first paint, then resolve the device locale after mount.
  const [language, setLanguage] = useState<string>('en')
  useEffect(() => {
    const sync = () => setLanguage(getStoredLanguagePreference())
    sync()
    window.addEventListener('storage', sync)
    window.addEventListener('uncgpt-language-changed', sync)
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('uncgpt-language-changed', sync) }
  }, [])
  return (key: TranslationKey) => uiText(language, key)
}

export type { TranslationKey }
