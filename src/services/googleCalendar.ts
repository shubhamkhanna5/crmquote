import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { FollowUp, Quotation } from '../types';
import { api } from './api';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

const provider = new GoogleAuthProvider();
provider.addScope(CALENDAR_SCOPE);
provider.setCustomParameters({
  prompt: 'select_account',
});

// In-memory cache for the access token (per security requirements)
let cachedAccessToken: string | null = null;
let cachedUser: User | null = null;
let isSigningIn = false;

// Custom event dispatcher for UI reactivity across components
const GCAL_AUTH_EVENT = 'gcal_auth_state_changed';
const notifyAuthChange = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(GCAL_AUTH_EVENT, {
        detail: {
          isConnected: Boolean(cachedAccessToken),
          user: cachedUser,
          email: cachedUser?.email || localStorage.getItem('gcal_user_email'),
        },
      })
    );
  }
};

export const initGoogleAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    cachedUser = user;
    if (user) {
      if (user.email) {
        localStorage.setItem('gcal_user_email', user.email);
      }
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Token expired or page refreshed
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      cachedUser = null;
      localStorage.removeItem('gcal_user_email');
      if (onAuthFailure) onAuthFailure();
    }
    notifyAuthChange();
  });
};

export const signInWithGoogleCalendar = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Could not obtain Google Calendar access token');
    }
    cachedAccessToken = credential.accessToken;
    cachedUser = result.user;
    if (result.user.email) {
      localStorage.setItem('gcal_user_email', result.user.email);
    }
    notifyAuthChange();
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign-in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getGoogleAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const isGoogleCalendarConnected = (): boolean => {
  return Boolean(cachedAccessToken);
};

export const getGoogleCalendarUserEmail = (): string | null => {
  return cachedUser?.email || (typeof window !== 'undefined' ? localStorage.getItem('gcal_user_email') : null);
};

export const signOutGoogleCalendar = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  cachedUser = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('gcal_user_email');
  }
  notifyAuthChange();
};

/**
 * Computes exact RFC3339 string with local timezone offset
 */
function toRFC3339String(dateStr: string, timeStr: string): string {
  const cleanTime = timeStr && timeStr.includes(':') ? timeStr : '10:30';
  const [hours, mins] = cleanTime.split(':').map(Number);
  const [year, month, day] = dateStr.split('-').map(Number);

  const localDate = new Date(year, month - 1, day, hours, mins, 0);
  const offsetMin = -localDate.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const offsetHours = pad(offsetMin / 60);
  const offsetMinutes = pad(offsetMin % 60);

  return `${dateStr}T${pad(hours)}:${pad(mins)}:00${sign}${offsetHours}:${offsetMinutes}`;
}

/**
 * Automatically creates or updates an event in user's primary Google Calendar,
 * then persists the event reference to the backend database.
 */
export const syncFollowUpToGoogleCalendar = async (
  followup: FollowUp,
  quotation?: Quotation | null
): Promise<{ success: boolean; link?: string; error?: string }> => {
  if (!cachedAccessToken) {
    return {
      success: false,
      error: 'Google Calendar is not connected. Connect your Google account to auto-sync dates.',
    };
  }

  const clientName =
    quotation?.client_name || followup.quotation?.client_name || 'Client';
  const price =
    quotation?.quotation_price ?? followup.quotation?.quotation_price ?? 0;
  const poolType =
    quotation?.pool_type || followup.quotation?.pool_type || 'Swimming Pool';
  const poolDims =
    quotation?.pool_dimensions || followup.quotation?.pool_dimensions || '';
  const phone =
    quotation?.contact_number || followup.quotation?.contact_number || '';
  const notes = followup.notes || 'Routine follow-up call with quotation client';

  const timeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  const scheduledTime =
    followup.scheduled_time && followup.scheduled_time.includes(':')
      ? followup.scheduled_time
      : '10:30';

  // Calculate 30 min duration
  const [hours, mins] = scheduledTime.split(':').map(Number);
  const endHours = hours + Math.floor((mins + 30) / 60);
  const endMins = (mins + 30) % 60;
  const endTimeStr = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;

  const startRFC = toRFC3339String(followup.scheduled_date, scheduledTime);
  const endRFC = toRFC3339String(followup.scheduled_date, endTimeStr);

  const summary = `Follow-Up: ${clientName} - ₹${price.toLocaleString('en-IN')}`;
  const description = [
    `🏊 Quotation Follow-Up for ${clientName}`,
    `💰 Quotation Value: ₹${price.toLocaleString('en-IN')}`,
    `📦 Pool Specs: ${poolType}${poolDims ? ` (${poolDims})` : ''}`,
    phone ? `📞 Contact: ${phone}` : '',
    notes ? `📝 Notes: ${notes}` : '',
    `⏰ Scheduled: ${followup.scheduled_date} at ${scheduledTime}`,
    '',
    `📌 Managed in Quotation CRM`,
  ]
    .filter(Boolean)
    .join('\n');

  const eventPayload = {
    summary,
    description,
    start: {
      dateTime: startRFC,
      timeZone,
    },
    end: {
      dateTime: endRFC,
      timeZone,
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 30 },
        { method: 'popup', minutes: 10 },
      ],
    },
  };

  try {
    const existingEventId = followup.calendar_event?.external_event_id;
    let endpoint =
      'https://www.googleapis.com/calendar/v3/calendars/primary/events';
    let method = 'POST';

    if (existingEventId) {
      endpoint = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${existingEventId}`;
      method = 'PATCH';
    }

    const res = await fetch(endpoint, {
      method,
      headers: {
        Authorization: `Bearer ${cachedAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventPayload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(
        errData?.error?.message ||
          `Google Calendar API responded with status ${res.status}`
      );
    }

    const data = await res.json();

    // Record to local database
    await api.recordCalendarSync({
      followup_id: followup.id,
      provider: 'google',
      external_event_id: data.id,
      calendar_id: 'primary',
      status: 'active',
      start_at: data.start?.dateTime || startRFC,
      end_at: data.end?.dateTime || endRFC,
      html_link: data.htmlLink,
    });

    return { success: true, link: data.htmlLink };
  } catch (err: any) {
    console.error('Failed to sync to Google Calendar:', err);
    return {
      success: false,
      error: err.message || 'Failed to sync event with Google Calendar',
    };
  }
};

/**
 * Removes an event from Google Calendar and cleans the local sync record.
 */
export const removeGoogleCalendarEvent = async (
  followup: FollowUp
): Promise<{ success: boolean; error?: string }> => {
  try {
    const externalId = followup.calendar_event?.external_event_id;
    if (externalId && cachedAccessToken) {
      await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${externalId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${cachedAccessToken}`,
          },
        }
      ).catch((e) => console.warn('Google event delete warning:', e));
    }

    await api.deleteCalendarSync(followup.id);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

/**
 * Syncs all upcoming active follow-ups to Google Calendar in one go.
 */
export const syncAllUpcomingFollowUps = async (
  followups: FollowUp[],
  quotations: Quotation[]
): Promise<{ total: number; synced: number; failed: number }> => {
  if (!cachedAccessToken) {
    throw new Error('Google Calendar is not connected');
  }

  const quotesMap = new Map<string, Quotation>(
    quotations.map((q) => [q.id, q])
  );

  const activeFollowUps = followups.filter(
    (f) => f.status === 'Scheduled' || f.status === 'Due' || f.status === 'Overdue'
  );

  let synced = 0;
  let failed = 0;

  for (const f of activeFollowUps) {
    const q = quotesMap.get(f.quotation_id) || null;
    const res = await syncFollowUpToGoogleCalendar(f, q);
    if (res.success) {
      synced++;
    } else {
      failed++;
    }
  }

  return { total: activeFollowUps.length, synced, failed };
};
