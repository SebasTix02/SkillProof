/**
 * English texts. The shape of this object is the dictionary type: es.ts must have every key.
 * Group by screen; `{name}` is filled by t(); `{ one, other }` is a plural for tn().
 */
export const en = {
  common: {
    save: 'Save',
    saveChanges: 'Save changes',
    cancel: 'Cancel',
    close: 'Close',
    delete: 'Delete',
    remove: 'Remove',
    edit: 'Edit',
    open: 'Open',
    back: 'Back',
    continue: 'Continue',
    create: 'Create',
    submit: 'Submit',
    accept: 'Accept',
    decline: 'Decline',
    refresh: 'Refresh',
    loading: 'Loading',
    signIn: 'Log in',
    signUp: 'Sign up',
    signOut: 'Sign out',
    openApp: 'Open app',
    optional: 'Optional',
    none: 'None',
    yes: 'Yes',
    no: 'No',
    exportCsv: 'Export CSV',
    unsavedChanges: 'Unsaved changes',
    discard: 'Discard',
    pageNotFound: 'Page not found.',
  },
  language: {
    label: 'Language',
    hint: 'The language of the app and of your own voice interviews.',
    switchTo: 'Language: {current}. Choose another',
  },
  theme: {
    label: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    switchTo: 'Theme: {current}. Switch to {next}',
    appearance: 'Appearance & language',
    appearanceHint: 'Light or dark page and the language of the app. The theme is saved in this browser; System follows your device.',
  },
  errors: {
    sessionEnded: 'Your session has ended. Log in again to continue.',
    forbidden: 'You do not have permission to do that.',
    tooMany: 'Too many requests at once. Wait a moment and try again.',
    internal: 'Something went wrong on our side. Try again in a moment.',
    busy: 'The server is busy right now. Try again in a moment.',
    network: 'Could not reach the server. Check your connection and try again.',
    generic: 'Something went wrong. Try again in a moment.',
  },
  /** By API error code (when the code says it all). */
  apiErrors: {} as Record<string, string>,
  /** By the English text the API or a shared schema sent (translations only in es.ts). */
  messages: {} as Record<string, string>,
};
