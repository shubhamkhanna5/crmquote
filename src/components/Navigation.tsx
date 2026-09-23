import React from 'react';
import {
  CalendarDays,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  Lock,
  PlusCircle,
  RotateCw,
  Settings,
  User,
  Users,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { GoogleCalendarButton } from './GoogleCalendarButton';
import { SyncRun, ActiveUser, FollowUp, Quotation } from '../types';

export type ActiveTab = 'today' | 'quotations' | 'clients' | 'calendar' | 'settings';

interface NavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onOpenNewFollowUp: () => void;
  onQuickSync: () => void;
  isSyncing: boolean;
  latestSync: SyncRun | null;
  overdueCount: number;
  dueTodayCount: number;
  noNextActionCount: number;
  activeUser: ActiveUser;
  onRequestSwitchUser: (targetUser: 'Pranjal' | 'Shubham') => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  onOpenNewFollowUp,
  onQuickSync,
  isSyncing,
  latestSync,
  overdueCount,
  dueTodayCount,
  noNextActionCount,
  activeUser,
  onRequestSwitchUser,
}) => {
  const totalPendingAction = overdueCount + dueTodayCount;

  return (
    <>
      {/* Desktop Sidebar (md:flex) */}
      <aside
        id="desktop-sidebar"
        className="hidden md:flex w-56 lg:w-60 shrink-0 flex-col border-r border-slate-200/80 bg-white text-slate-700"
      >
        {/* Brand Header */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-slate-100">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white shadow-xs">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xs font-bold text-slate-900 tracking-tight truncate uppercase">
              Quotation CRM
            </h1>
            <p className="text-[11px] text-slate-500 truncate flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Follow-Up Hub
            </p>
          </div>
        </div>

        {/* User Profile Switcher Widget */}
        <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/60">
          <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-white border border-slate-200/70 shadow-xs">
            <button
              id="switch-to-pranjal-btn"
              type="button"
              onClick={() => {
                if (activeUser !== 'Pranjal') {
                  onRequestSwitchUser('Pranjal');
                }
              }}
              className={`flex items-center justify-center gap-1 py-1 px-1.5 rounded-md text-xs font-semibold transition ${
                activeUser === 'Pranjal'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span>Pranjal</span>
              {activeUser !== 'Pranjal' && <Lock className="w-2.5 h-2.5 text-slate-400" />}
            </button>

            <button
              id="switch-to-shubham-btn"
              type="button"
              onClick={() => {
                if (activeUser !== 'Shubham') {
                  onRequestSwitchUser('Shubham');
                }
              }}
              className={`flex items-center justify-center gap-1 py-1 px-1.5 rounded-md text-xs font-semibold transition ${
                activeUser === 'Shubham'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span>Shubham</span>
              {activeUser !== 'Shubham' && <Lock className="w-2.5 h-2.5 text-slate-400" />}
            </button>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-0.5 p-2.5">
          <button
            id="nav-tab-today"
            onClick={() => onTabChange('today')}
            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold transition ${
              activeTab === 'today'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>My Day</span>
            </div>
            {totalPendingAction > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  overdueCount > 0
                    ? 'bg-rose-500 text-white'
                    : 'bg-amber-500 text-white'
                }`}
              >
                {totalPendingAction}
              </span>
            )}
          </button>

          <button
            id="nav-tab-quotations"
            onClick={() => onTabChange('quotations')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition ${
              activeTab === 'quotations'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>Quotations</span>
          </button>

          <button
            id="nav-tab-clients"
            onClick={() => onTabChange('clients')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition ${
              activeTab === 'clients'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>Clients</span>
          </button>

          <button
            id="nav-tab-calendar"
            onClick={() => onTabChange('calendar')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition ${
              activeTab === 'calendar'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <CalendarDays className="w-4 h-4 shrink-0" />
            <span>Calendar</span>
          </button>

          <button
            id="nav-tab-settings"
            onClick={() => onTabChange('settings')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition ${
              activeTab === 'settings'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span>Settings & Sync</span>
          </button>
        </nav>

        {/* New Action Button */}
        <div className="px-2.5 pb-2">
          <button
            id="btn-sidebar-new-followup"
            onClick={onOpenNewFollowUp}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-50 border border-teal-200/80 px-2.5 py-1.5 text-xs font-bold text-teal-700 hover:bg-teal-100 transition active:scale-98 shadow-2xs"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Schedule Follow-Up</span>
          </button>
        </div>

        {/* Sync Status Card & Quick Sync */}
        <div className="p-2.5 border-t border-slate-100 space-y-2">
          <div className="rounded-lg border border-slate-200/70 bg-slate-50/80 p-2 text-xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="font-semibold text-slate-800 text-[11px] flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${
                    isSyncing ? 'bg-amber-500 animate-ping' : 'bg-emerald-500'
                  }`}
                />
                Google Sheet
              </span>
              <button
                id="btn-sidebar-sync-now"
                onClick={onQuickSync}
                disabled={isSyncing}
                className="text-teal-600 hover:text-teal-700 transition p-0.5 disabled:opacity-50"
                title="Sync now from Google Sheet"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              {latestSync?.completed_at
                ? `Synced ${new Date(latestSync.completed_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : 'Connected'}
            </p>
            {latestSync && (
              <div className="mt-0.5 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span>{latestSync.rows_found} rows</span>
                <span className="text-emerald-600 font-medium">✓ Synced</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center">
            <GoogleCalendarButton variant="pill" />
          </div>

          <PWAInstallButton />
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar (md:hidden) - PRD Section 63 */}
      <nav
        id="mobile-bottom-nav"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-slate-200 bg-white/95 px-2 backdrop-blur-md shadow-lg"
      >
        <button
          id="mobile-nav-today"
          onClick={() => onTabChange('today')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 min-w-[54px] ${
            activeTab === 'today' ? 'text-cyan-600 font-semibold' : 'text-slate-500'
          }`}
        >
          <div className="relative">
            <CheckCircle2 className="w-5 h-5" />
            {totalPendingAction > 0 && (
              <span className="absolute -top-1 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                {totalPendingAction}
              </span>
            )}
          </div>
          <span className="text-[11px] font-medium">My Day</span>
        </button>

        <button
          id="mobile-nav-quotes"
          onClick={() => onTabChange('quotations')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 min-w-[54px] ${
            activeTab === 'quotations' ? 'text-cyan-600 font-semibold' : 'text-slate-500'
          }`}
        >
          <FileSpreadsheet className="w-5 h-5" />
          <span className="text-[11px] font-medium">Quotes</span>
        </button>

        {/* Center Primary Action Button */}
        <button
          id="mobile-nav-action-new"
          onClick={onOpenNewFollowUp}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-600 text-white shadow-md shadow-cyan-600/30 active:scale-95 transition"
          title="Schedule New Follow-up"
        >
          <PlusCircle className="w-6 h-6" />
        </button>

        <button
          id="mobile-nav-clients"
          onClick={() => onTabChange('clients')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 min-w-[54px] ${
            activeTab === 'clients' ? 'text-cyan-600 font-semibold' : 'text-slate-500'
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="text-[11px] font-medium">Clients</span>
        </button>

        <button
          id="mobile-nav-settings"
          onClick={() => onTabChange('settings')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 min-w-[54px] ${
            activeTab === 'settings' ? 'text-cyan-600 font-semibold' : 'text-slate-500'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[11px] font-medium">Settings</span>
        </button>

        {/* Mobile Quick User Switcher */}
        <button
          id="mobile-nav-switch-user"
          onClick={() => {
            const nextUser = activeUser === 'Pranjal' ? 'Shubham' : 'Pranjal';
            onRequestSwitchUser(nextUser);
          }}
          className="flex flex-col items-center justify-center gap-0.5 py-1 min-w-[50px] text-cyan-600"
          title={`Switch user (current: ${activeUser})`}
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-100 border border-cyan-300 text-[10px] font-bold text-cyan-700">
            {activeUser[0]}
          </div>
          <span className="text-[10px] font-medium text-slate-700 truncate max-w-[48px]">{activeUser}</span>
        </button>
      </nav>
    </>
  );
};
