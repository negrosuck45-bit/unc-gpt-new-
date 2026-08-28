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
  | 'searchApps'   | 'connect' | 'disconnect' | 'refresh' | 'loading' | 'copyResponse' | 'likeResponse' | 'dislikeResponse' | 'readResponseAloud' | 'stopReading' | 'voiceUnavailable' | 'regenerate' | 'editMessage' | 'submit' | 'saveSettings' | 'advancedSettings' | 'advancedSettingsDescription' | 'messages' | 'conversation' | 'inbox' | 'startConversation'

  | 'noMessagesYet' | 'caughtUp' | 'peopleYouMayKnow' | 'openMessage' | 'addBack' | 'taskAction'
  | 'generalSettings' | 'basicAppPreferences' | 'chooseLanguageDescription'
  | 'sendOnEnter' | 'sendOnEnterDescription' | 'autoScroll' | 'autoScrollDescription'
  | 'soundEffects' | 'soundEffectsDescription' | 'hapticFeedback' | 'hapticFeedbackDescription'
  | 'previewReplyTone' | 'testSound' | 'streamingResponses' | 'streamingResponsesDescription'
  | 'general' | 'profile' | 'data' | 'connectors'

const translations: Record<string, Partial<Record<TranslationKey, string>>> = {
  en: {
    signInTitle: 'Sign in to Lunar', signUpTitle: 'Create your Lunar account', welcomeBack: 'Welcome back! Please sign in to continue', createAccount: 'Create an account to continue.', continueGoogle: 'Continue with Google', continueDiscord: 'Continue with Discord', continueGithub: 'Continue with GitHub', openingSignIn: 'Opening sign-in…', lastUsed: 'Last used', or: 'or', emailAddress: 'Email address', enterEmail: 'Enter your email address', continue: 'Continue', dontHaveAccount: "Don't have an account?", alreadyHaveAccount: 'Already have an account?', signUpPrompt: 'Sign up', signInPrompt: 'Sign in', emailUnavailable: 'Email sign-in is not configured yet. Use Google, Discord, or GitHub to continue.', cancelled: 'Sign-in was cancelled. Choose a provider to continue.', unavailable: 'This Lunar sign-in option is still being configured. Please choose another option.', failed: 'Lunar could not complete that sign-in. Please try again.', unverified: 'Use a provider account with a verified email address to continue.', getStarted: 'Get started', language: 'Language', automaticDevice: 'Automatic uses your device language.', selected: 'Selected', back: 'Back', openingLanguageSelection: 'Opening language selection', enterEmailOnboarding: 'Enter your email', accountRecovery: 'For your Lunar account and recovery.', signedInAccount: 'Signed-in Lunar account', whatsYourName: "What's your name?", nameDescription: 'This name will be shown in your Lunar settings.', yourName: 'Your name', chooseUsername: 'Choose a username', usernameDescription: '1–24 characters. Use letters, numbers, and underscores.', changeLater: 'You can change this later in Settings.', createAccountButton: 'Create account', chooseLanguage: 'Choose your language',
    newTask: 'New task', assignTask: 'Assign a task or type / for more', newChat: 'New chat', search: 'Search', imagine: 'Imagine', settings: 'Settings', notifications: 'Notifications', openSidebar: 'Open sidebar', closeSidebar: 'Close sidebar', searchChats: 'Search chats', searchChatsPlaceholder: 'Search chats…', recents: 'Recents', today: 'Today', yesterday: 'Yesterday', previous7Days: 'Previous 7 days', previous30Days: 'Previous 30 days', older: 'Older', noChatsFound: 'No chats found', noChatsYet: 'No chats yet', account: 'Account', signedInSecurely: 'Signed in', rename: 'Rename', delete: 'Delete', untitled: 'Untitled', welcomeBackShort: 'Welcome back', connectionRestored: 'Connection restored', connectionLost: 'Connection lost. Please check your network.', assistantUnavailable: 'The assistant is temporarily unreachable. Please try again.', send: 'Send', cancel: 'Cancel', add: 'Add', photos: 'Photos', seeAll: 'See all', photoLibrary: 'Photo Library', addFiles: 'Add files', connectComputer: 'Connect My Computer', addSkills: 'Add Skills', buildWebsite: 'Build website', createSlides: 'Create slides', createImage: 'Create image', pasteUrl: 'Paste URL…', connections: 'Connections', connectAppsDescription: 'Connect the apps you use and control what Lunar can access.', secureSignInDescription: 'Choose an app below and finish sign-in once.', noAppsConnected: 'No apps connected yet', connectedApps: 'Connected apps', browseApps: 'Browse apps', searchApps: 'Search for an app and connect it.', connect: 'Connect', disconnect: 'Disconnect', refresh: 'Refresh', loading: 'Loading…', messages: 'Messages', conversation: 'Conversation', inbox: 'Inbox', startConversation: 'Start a conversation', noMessagesYet: 'No messages yet', caughtUp: 'You’re all caught up.', peopleYouMayKnow: 'People you may know', openMessage: 'Open message', addBack: 'Add back', taskAction: 'Assign a task', generalSettings: 'General Settings', basicAppPreferences: 'Basic app preferences', chooseLanguageDescription: 'Choose the language used across Lunar.', sendOnEnter: 'Send on Enter', sendOnEnterDescription: 'Press Enter to send, Shift+Enter for new line', autoScroll: 'Auto-scroll', autoScrollDescription: 'Automatically scroll to new messages', soundEffects: 'Sound Effects', soundEffectsDescription: 'Play the clean reply tone when an assistant reply finishes', hapticFeedback: 'Haptic Feedback', hapticFeedbackDescription: 'Use device vibration when supported', previewReplyTone: 'Preview the clean reply tone', testSound: 'Test sound', streamingResponses: 'Streaming Responses', streamingResponsesDescription: 'Show response text live or wait until the reply is complete', general: 'General', profile: 'Profile', data: 'Data', connectors: 'Connectors', copyResponse: 'Copy response', likeResponse: 'Like response', dislikeResponse: 'Dislike response', readResponseAloud: 'Read response aloud', stopReading: 'Stop reading', voiceUnavailable: 'Voice playback is unavailable right now.', regenerate: 'Regenerate response', editMessage: 'Edit message', submit: 'Submit', saveSettings: 'Save settings', advancedSettings: 'Advanced settings', advancedSettingsDescription: 'For power users',
  },
  it: {
    signInTitle: 'Accedi a Lunar', signUpTitle: 'Crea il tuo account Lunar', welcomeBack: 'Bentornato! Accedi per continuare', createAccount: 'Crea un account per continuare.', continueGoogle: 'Continua con Google', continueDiscord: 'Continua con Discord', continueGithub: 'Continua con GitHub', openingSignIn: 'Apertura dell’accesso…', lastUsed: 'Usato di recente', or: 'oppure', emailAddress: 'Indirizzo email', enterEmail: 'Inserisci il tuo indirizzo email', continue: 'Continua', dontHaveAccount: 'Non hai un account?', alreadyHaveAccount: 'Hai già un account?', signUpPrompt: 'Registrati', signInPrompt: 'Accedi', emailUnavailable: 'L’accesso con email non è ancora configurato. Usa Google, Discord o GitHub per continuare.', cancelled: 'Accesso annullato. Scegli un provider per continuare.', unavailable: 'Questa opzione di accesso a Lunar è ancora in configurazione. Scegline un’altra.', failed: 'Lunar non ha potuto completare l’accesso. Riprova.', unverified: 'Usa un account del provider con un indirizzo email verificato per continuare.', getStarted: 'Inizia', language: 'Lingua', automaticDevice: 'Automatico usa la lingua del dispositivo.', selected: 'Selezionato', back: 'Indietro', openingLanguageSelection: 'Apertura della selezione della lingua', enterEmailOnboarding: 'Inserisci la tua email', accountRecovery: 'Per il tuo account Lunar e il recupero.', signedInAccount: 'Account Lunar connesso', whatsYourName: 'Come ti chiami?', nameDescription: 'Questo nome sarà mostrato nelle impostazioni di Lunar.', yourName: 'Il tuo nome', chooseUsername: 'Scegli un nome utente', usernameDescription: '1–24 caratteri. Usa lettere, numeri e trattini bassi.', changeLater: 'Puoi cambiarlo in seguito nelle Impostazioni.', createAccountButton: 'Crea account', chooseLanguage: 'Scegli la tua lingua',
    newTask: 'Nuovo compito', assignTask: 'Assegna un compito o digita / per altro', newChat: 'Nuova chat', search: 'Cerca', imagine: 'Immagina', settings: 'Impostazioni', notifications: 'Notifiche', openSidebar: 'Apri barra laterale', closeSidebar: 'Chiudi barra laterale', searchChats: 'Cerca nelle chat', searchChatsPlaceholder: 'Cerca chat…', recents: 'Recenti', today: 'Oggi', yesterday: 'Ieri', previous7Days: 'Ultimi 7 giorni', previous30Days: 'Ultimi 30 giorni', older: 'Più vecchie', noChatsFound: 'Nessuna chat trovata', noChatsYet: 'Ancora nessuna chat', account: 'Account', signedInSecurely: 'Accesso effettuato', rename: 'Rinomina', delete: 'Elimina', untitled: 'Senza titolo', welcomeBackShort: 'Bentornato', connectionRestored: 'Connessione ripristinata', connectionLost: 'Connessione persa. Controlla la rete.', assistantUnavailable: 'L’assistente non è momentaneamente raggiungibile. Riprova.', send: 'Invia', cancel: 'Annulla', add: 'Aggiungi', photos: 'Foto', seeAll: 'Vedi tutto', photoLibrary: 'Libreria foto', addFiles: 'Aggiungi file', connectComputer: 'Collega il mio computer', addSkills: 'Aggiungi competenze', buildWebsite: 'Crea sito web', createSlides: 'Crea presentazione', createImage: 'Crea immagine', pasteUrl: 'Incolla URL…', connections: 'Connessioni', connectAppsDescription: 'Collega le app che usi e controlla a cosa può accedere Lunar.', secureSignInDescription: 'Scegli un’app e completa una volta l’accesso.', noAppsConnected: 'Nessuna app collegata', connectedApps: 'App collegate', browseApps: 'Esplora app', searchApps: 'Cerca un’app e collegala.', connect: 'Collega', disconnect: 'Disconnetti', refresh: 'Aggiorna', loading: 'Caricamento…', messages: 'Messaggi', conversation: 'Conversazione', inbox: 'Posta in arrivo', startConversation: 'Inizia una conversazione', noMessagesYet: 'Ancora nessun messaggio', caughtUp: 'Hai recuperato tutto.', peopleYouMayKnow: 'Persone che potresti conoscere', openMessage: 'Apri messaggio', addBack: 'Aggiungi', taskAction: 'Assegna un compito',
  },
  hi: {
    signInTitle: 'Lunar में साइन इन करें', signUpTitle: 'अपना Lunar खाता बनाएँ', welcomeBack: 'वापसी पर स्वागत है! जारी रखने के लिए साइन इन करें', createAccount: 'जारी रखने के लिए खाता बनाएँ', continueGoogle: 'Google से जारी रखें', continueDiscord: 'Discord से जारी रखें', continueGithub: 'GitHub से जारी रखें', openingSignIn: 'साइन-इन खोला जा रहा है…', lastUsed: 'हाल ही में उपयोग किया गया', or: 'या', emailAddress: 'ईमेल पता', enterEmail: 'अपना ईमेल पता दर्ज करें', continue: 'जारी रखें', signUpPrompt: 'साइन अप करें', signInPrompt: 'साइन इन करें', dontHaveAccount: 'खाता नहीं है?', alreadyHaveAccount: 'पहले से खाता है?', emailUnavailable: 'ईमेल साइन-इन अभी उपलब्ध नहीं है। जारी रखने के लिए Google, Discord या GitHub चुनें।', cancelled: 'साइन-इन रद्द कर दिया गया। जारी रखने के लिए कोई प्रदाता चुनें।', unavailable: 'यह Lunar साइन-इन विकल्प अभी तैयार किया जा रहा है। कोई दूसरा विकल्प चुनें।', failed: 'Lunar इस साइन-इन को पूरा नहीं कर सका। फिर से प्रयास करें।', unverified: 'जारी रखने के लिए सत्यापित ईमेल वाले प्रदाता खाते का उपयोग करें।', getStarted: 'शुरू करें', language: 'भाषा', automaticDevice: 'स्वचालित विकल्प आपके डिवाइस की भाषा का उपयोग करता है।', selected: 'चयनित', back: 'वापस', openingLanguageSelection: 'भाषा चयन खोला जा रहा है', enterEmailOnboarding: 'अपना ईमेल दर्ज करें', accountRecovery: 'आपके Lunar खाते और रिकवरी के लिए।', signedInAccount: 'साइन-इन किया हुआ Lunar खाता', whatsYourName: 'आपका नाम क्या है?', nameDescription: 'यह नाम आपकी Lunar सेटिंग्स में दिखाई देगा।', yourName: 'आपका नाम', chooseUsername: 'उपयोगकर्ता नाम चुनें', usernameDescription: '1–24 अक्षर। अक्षरों, अंकों और अंडरस्कोर का उपयोग करें।', changeLater: 'इसे बाद में सेटिंग्स में बदल सकते हैं।', createAccountButton: 'खाता बनाएँ', chooseLanguage: 'अपनी भाषा चुनें',
    newTask: 'नया कार्य', assignTask: 'कोई कार्य असाइन करें या अधिक विकल्पों के लिए / लिखें', newChat: 'नई चैट', search: 'खोजें', imagine: 'कल्पना करें', settings: 'सेटिंग्स', notifications: 'सूचनाएँ', openSidebar: 'साइडबार खोलें', closeSidebar: 'साइडबार बंद करें', searchChats: 'चैट खोजें', searchChatsPlaceholder: 'चैट खोजें…', recents: 'हाल की चैट', today: 'आज', yesterday: 'कल', previous7Days: 'पिछले 7 दिन', previous30Days: 'पिछले 30 दिन', older: 'पुरानी', noChatsFound: 'कोई चैट नहीं मिली', noChatsYet: 'अभी कोई चैट नहीं है', account: 'खाता', signedInSecurely: 'साइन इन है', rename: 'नाम बदलें', delete: 'हटाएँ', untitled: 'बिना शीर्षक', welcomeBackShort: 'वापसी पर स्वागत है', connectionRestored: 'कनेक्शन बहाल हो गया', connectionLost: 'कनेक्शन टूट गया', assistantUnavailable: 'असिस्टेंट अभी उपलब्ध नहीं है', send: 'भेजें', cancel: 'रद्द करें', add: 'जोड़ें', photos: 'फ़ोटो', seeAll: 'सब देखें', photoLibrary: 'फ़ोटो लाइब्रेरी', addFiles: 'फ़ाइलें जोड़ें', connectComputer: 'कंप्��ूटर कनेक्ट करें', addSkills: 'स्किल जोड़ें', buildWebsite: 'वेबसाइट बनाएँ', createSlides: 'स्लाइड प्रस्तुति बनाएँ', createImage: 'इमेज बनाएँ', pasteUrl: 'URL पेस्ट करें…', connections: 'क���ेक्शन', connectAppsDescription: 'आप जिन ऐप्स का उपयोग करते हैं उन्हें कनेक्ट करें और Lunar की पहुँच नियंत्रित करें।', secureSignInDescription: 'एक ऐप चुनें और साइन-इन एक बार पूरा करें।', noAppsConnected: 'कोई ऐप कनेक्ट नहीं है', connectedApps: 'कनेक्ट किए गए ऐप्स', browseApps: 'ऐप्स देखें', searchApps: 'ऐप खोजें और उसे कनेक्ट करें।', connect: 'कनेक्ट करें', disconnect: 'डिस्कनेक्ट करें', refresh: 'रिफ्रेश करें', loading: 'लोड हो रहा है…', messages: 'संदेश', conversation: 'बातचीत', inbox: 'इनबॉक्स', startConversation: 'बातचीत शुरू करें', noMessagesYet: 'अभी कोई संदेश नहीं है', caughtUp: 'आप सभी संदेश देख चुके हैं।', peopleYouMayKnow: 'शायद आप इन्हें जानते हों', openMessage: 'संदेश खोलें', addBack: 'जोड़ें', taskAction: 'कार्य असाइन करें',
    generalSettings: 'सामान्य सेटिंग्स', basicAppPreferences: 'ऐप की मूल प्राथमिकताएँ', chooseLanguageDescription: 'Lunar में उपयोग की जाने वाली भाषा चुनें।', sendOnEnter: 'Enter दबाकर भेजें', sendOnEnterDescription: 'भेजने के लिए Enter, नई पंक्ति के लिए Shift+Enter दबाएँ', autoScroll: 'ऑटो-स्क्रॉल', autoScrollDescription: 'नए संदेशों तक अपने आप स्क्रॉल करें', soundEffects: 'ध्वनि प्रभाव', soundEffectsDescription: 'असिस्टेंट का उत्तर पूरा होने पर साफ़ ध्वनि चलाएँ', hapticFeedback: 'हैप्टिक फीडबैक', hapticFeedbackDescription: 'जहाँ उपलब्ध हो वहाँ डिवाइस वाइब्रेशन का उपयोग करें', previewReplyTone: 'उत्तर की ध्वनि सुनें', testSound: 'ध्वनि जाँचें', streamingResponses: 'स्ट्रीमिंग उत्तर', streamingResponsesDescription: 'उत्तर का टेक्स्ट लाइव दिखाएँ या पूरा होने तक प्रतीक्षा करें', general: 'सामान्य', profile: 'प्रोफ़ाइल', data: 'डेटा', connectors: 'कनेक्टर',
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
  const [language, setLanguage] = useState<string>('en')
  const [catalog, setCatalog] = useState<Record<string, string>>(translations.en || {})
  useEffect(() => {
    let active = true
    const sync = async () => {
      const preference = getStoredLanguagePreference()
      const resolved = getUiLanguage(preference)
      setLanguage(resolved)
      if (resolved === 'en') { setCatalog(translations.en || {}); return }
      const response = await fetch('/api/translate-ui', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: resolved, strings: translations.en }),
      }).catch(() => null)
      const translated = response?.ok ? await response.json().catch(() => null) : null
      if (active && translated) setCatalog({ ...(translations.en || {}), ...translated })
    }
    void sync()
    window.addEventListener('storage', sync)
    window.addEventListener('uncgpt-language-changed', sync)
    return () => { active = false; window.removeEventListener('storage', sync); window.removeEventListener('uncgpt-language-changed', sync) }
  }, [])
  return (key: TranslationKey) => catalog[key] ?? uiText(language, key)
}

export type { TranslationKey }
