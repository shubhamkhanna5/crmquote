import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  ExternalLink,
  LogOut,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  signInWithGoogleCalendar,
  signOutGoogleCalendar,
  isGoogleCalendarConnected,
  getGoogleCalendarUserEmail,
  initGoogleAuth,
  syncAllUpcomingFollowUps,
} from '../services/googleCalendar';
import { useToast } from './Toast';
import { FollowUp, Quotation } from '../types';

interface GoogleCalendarButtonProps {
  variant?: 'compact' | 'full' | 'pill';
  followups?: FollowUp[];
  quotations?: Quotation[];
  onSyncComplete?: () => void;
}

export const GoogleCalendarButton: React.FC<GoogleCalendarButtonProps> = ({
  variant = 'compact',
  followups = [],
  quotations = [],
  onSyncComplete,
}) => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncingAll, setIsSyncingAll] = useState<boolean>(false);
  const [showMenu, setShowMenu] = useState<boolean>(false);
  const { showToast } = useToast();

  const updateStatus = () => {
    const connected = isGoogleCalendarConnected();
    setIsConnected(connected);
    setUserEmail(getGoogleCalendarUserEmail());
  };

  useEffect(() => {
    updateStatus();

    // Listen for auth state changes
    const handleAuthChange = () => {
      updateStatus();
    };

    window.addEventListener('gcal_auth_state_changed', handleAuthChange);

    // Initialize Firebase Auth listener
    const unsubscribe = initGoogleAuth(
      (_user, _token) => {
        updateStatus();
      },
      () => {
        updateStatus();
      }
    );

    return () => {
      window.removeEventListener('gcal_auth_state_changed', handleAuthChange);
      unsubscribe();
    };
  }, []);

  const handleConnect = async () => {
    setIsLoading(true);
    try {
      const res = await signInWithGoogleCalendar();
      if (res) {
        setIsConnected(true);
        setUserEmail(res.user.email);
        showToast(
          `Google Calendar connected as ${res.user.email || 'user'}! All follow-up dates will now auto-sync.`,
          'success',
          5000
        );
      }
    } catch (err: any) {
      console.error('Google Calendar Connect Error:', err);
      showToast(
        err.message?.includes('popup-closed-by-user')
          ? 'Sign-in window was closed'
          : err.message || 'Failed to connect Google Calendar',
        'error'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await signOutGoogleCalendar();
      setIsConnected(false);
      setUserEmail(null);
      setShowMenu(false);
      showToast('Google Calendar disconnected', 'info');
    } catch (err: any) {
      showToast('Failed to disconnect Google Calendar', 'error');
    }
  };

  const handleSyncAll = async () => {
    if (!isConnected) {
      handleConnect();
      return;
    }

    setIsSyncingAll(true);
    try {
      const res = await syncAllUpcomingFollowUps(followups, quotations);
      showToast(
        `Synced ${res.synced} follow-up(s) to your Google Calendar!`,
        'success'
      );
      if (onSyncComplete) onSyncComplete();
    } catch (err: any) {
      showToast(err.message || 'Failed to sync follow-ups to Google Calendar', 'error');
    } finally {
      setIsSyncingAll(false);
      setShowMenu(false);
    }
  };

  if (variant === 'pill') {
    if (!isConnected) {
      return (
        <button
          type="button"
          onClick={handleConnect}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 transition shadow-2xs active:scale-95 disabled:opacity-50"
          title="Connect Google Calendar to auto-sync follow-up dates"
        >
          <CalendarIcon className="w-3.5 h-3.5 text-emerald-600" />
          <span>{isLoading ? 'Connecting...' : 'Connect Calendar'}</span>
        </button>
      );
    }

    return (
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setShowMenu(!showMenu)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-800 border border-emerald-200 hover:bg-emerald-500/20 transition shadow-2xs"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <CalendarIcon className="w-3.5 h-3.5 text-emerald-600" />
          <span className="hidden sm:inline">Calendar Synced</span>
          <span className="sm:hidden">Calendar</span>
        </button>

        {showMenu && (
          <div className="absolute right-0 mt-1.5 w-60 rounded-xl bg-white border border-slate-200 shadow-xl p-2 z-50 animate-in fade-in">
            <div className="px-2 py-1.5 border-b border-slate-100 mb-1">
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-bold uppercase tracking-wider">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Auto-Sync Active</span>
              </div>
              <p className="text-xs text-slate-600 truncate font-mono mt-0.5">
                {userEmail || 'Google Account'}
              </p>
            </div>

            <button
              onClick={handleSyncAll}
              disabled={isSyncingAll}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs text-slate-700 hover:bg-slate-100 transition font-medium"
            >
              <span className="flex items-center gap-2">
                <RefreshCw
                  className={`w-3.5 h-3.5 text-slate-500 ${
                    isSyncingAll ? 'animate-spin text-emerald-600' : ''
                  }`}
                />
                <span>Sync All Follow-Ups</span>
              </span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                {followups.filter((f) => ['Scheduled', 'Due'].includes(f.status)).length}
              </span>
            </button>

            <a
              href="https://calendar.google.com"
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-slate-700 hover:bg-slate-100 transition font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              <span>Open Google Calendar</span>
            </a>

            <div className="border-t border-slate-100 mt-1 pt-1">
              <button
                onClick={handleDisconnect}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-rose-600 hover:bg-rose-50 transition font-medium"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect Calendar</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full / Settings Card Variant
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Google Calendar Auto-Sync
              </h3>
              {isConnected ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Auto-Syncing ON
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                  Disconnected
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Whenever any follow-up date or time is set or rescheduled, it is automatically
              created in your Google Calendar with 30-min reminders.
            </p>
            {userEmail && (
              <p className="text-[11px] text-slate-600 font-mono mt-1">
                Connected: <span className="text-slate-900 font-medium">{userEmail}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          {isConnected ? (
            <>
              <button
                type="button"
                onClick={handleSyncAll}
                disabled={isSyncingAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition active:scale-95 disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin text-blue-600' : ''}`}
                />
                <span>{isSyncingAll ? 'Syncing...' : 'Sync All Scheduled'}</span>
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
                title="Disconnect Google Calendar"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-500 transition shadow-xs active:scale-95 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-blue-200" />
              <span>{isLoading ? 'Connecting...' : 'Connect Google Calendar'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
