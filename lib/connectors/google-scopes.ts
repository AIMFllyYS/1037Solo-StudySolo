/** User-approved capabilities shared by the form and server. No credentials. */
export const GOOGLE_SCOPE_OPTIONS = [
  ["https://www.googleapis.com/auth/drive.readonly", "googleFiles"],
  ["https://www.googleapis.com/auth/calendar.readonly", "googleCalendar"],
  ["https://www.googleapis.com/auth/gmail.readonly", "googleMailRead"],
  ["https://www.googleapis.com/auth/gmail.send", "googleMailSend"],
  ["https://www.googleapis.com/auth/contacts.readonly", "googleContacts"],
] as const;
export const GOOGLE_CONNECTOR_SCOPES = GOOGLE_SCOPE_OPTIONS.map(([scope]) => scope);
