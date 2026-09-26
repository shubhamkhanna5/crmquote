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
      {/* macOS Desktop Sidebar (md:flex) */}
      <aside
        id="desktop-sidebar"
        className="hidden md:flex w-56 lg:w-64 shrink-0 flex-col border-r border-slate-200/80 macos-glass text-slate-700 select-none"
      >
        {/* macOS Window Traffic Lights & App Brand Header */}
        <div className="px-4 pt-3.5 pb-3 border-b border-black/[0.06]">
          {/* Traffic Lights */}
          <div className="flex items-center gap-1.5 mb-3" aria-hidden="true">
            <span className="h-3 w-3 rounded-full bg-[#FF5F56] border border-black/10 inline-block shadow-2xs hover:opacity-80 transition cursor-pointer" />
            <span className="h-3 w-3 rounded-full bg-[#FFBD2E] border border-black/10 inline-block shadow-2xs hover:opacity-80 transition cursor-pointer" />
            <span className="h-3 w-3 rounded-full bg-[#27C93F] border border-black/10 inline-block shadow-2xs hover:opacity-80 transition cursor-pointer" />
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-b from-[#007AFF] to-[#0051C7] text-white shadow-xs">
              <Layers className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xs font-bold text-slate-900 tracking-tight truncate">
                Quotation Queue
              </h1>
              <p className="text-[11px] text-slate-500 truncate flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#34C759]" />
                macOS Workspace
              </p>
            </div>
          </div>
        </div>

        {/* macOS Segmented User Profile Switcher */}
        <div className="px-3 py-2.5 border-b border-black/[0.06] bg-slate-100/50">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1 mb-1.5">
            Active Salesperson
          </div>
          <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-black/[0.06] shadow-inner">
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
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
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
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <span>Shubham</span>
              {activeUser !== 'Shubham' && <Lock className="w-2.5 h-2.5 text-slate-400" />}
            </button>
          </div>
        </div>

        {/* macOS Sidebar Navigation Items */}
        <nav className="flex-1 space-y-0.5 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 pt-1 pb-1">
            Views
          </div>

          <button
            id="nav-tab-today"
            onClick={() => onTabChange('today')}
            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
              activeTab === 'today'
                ? 'bg-[#007AFF] text-white shadow-xs'
                : 'text-slate-700 hover:bg-black/[0.04] hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>My Day</span>
            </div>
            {totalPendingAction > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  activeTab === 'today'
                    ? 'bg-white/30 text-white'
                    : overdueCount > 0
                    ? 'bg-[#FF3B30] text-white'
                    : 'bg-[#FF9500] text-white'
                }`}
              >
                {totalPendingAction}
              </span>
            )}
          </button>

          <button
            id="nav-tab-quotations"
            onClick={() => onTabChange('quotations')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
              activeTab === 'quotations'
                ? 'bg-[#007AFF] text-white shadow-xs'
                : 'text-slate-700 hover:bg-black/[0.04] hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>Quotations</span>
          </button>

          <button
            id="nav-tab-clients"
            onClick={() => onTabChange('clients')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
              activeTab === 'clients'
                ? 'bg-[#007AFF] text-white shadow-xs'
                : 'text-slate-700 hover:bg-black/[0.04] hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>Clients</span>
          </button>

          <button
            id="nav-tab-calendar"
            onClick={() => onTabChange('calendar')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
              activeTab === 'calendar'
                ? 'bg-[#007AFF] text-white shadow-xs'
                : 'text-slate-700 hover:bg-black/[0.04] hover:text-slate-900'
            }`}
          >
            <CalendarDays className="w-4 h-4 shrink-0" />
            <span>Calendar</span>
          </button>

          <div className="pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 pb-1">
            System
          </div>

          <button
            id="nav-tab-settings"
            onClick={() => onTabChange('settings')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
              activeTab === 'settings'
                ? 'bg-[#007AFF] text-white shadow-xs'
                : 'text-slate-700 hover:bg-black/[0.04] hover:text-slate-900'
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span>Settings & Sync</span>
          </button>
        </nav>

        {/* macOS Action Push Button */}
        <div className="px-2.5 pb-2">
          <button
            id="btn-sidebar-new-followup"
            onClick={onOpenNewFollowUp}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition active:scale-[0.98] shadow-2xs"
          >
            <PlusCircle className="w-3.5 h-3.5 text-[#007AFF]" />
            <span>Schedule Follow-Up</span>
          </button>
        </div>

        {/* macOS Status Card */}
        <div className="p-2.5 border-t border-black/[0.06] space-y-2 bg-slate-100/40">
          <div className="rounded-lg border border-slate-200/80 bg-white/90 p-2 text-xs shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="font-semibold text-slate-800 text-[11px] flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${
                    isSyncing ? 'bg-[#FF9500] animate-ping' : 'bg-[#34C759]'
                  }`}
                />
                Google Sheet
              </span>
              <button
                id="btn-sidebar-sync-now"
                onClick={onQuickSync}
                disabled={isSyncing}
                className="text-[#007AFF] hover:text-blue-700 transition p-0.5 disabled:opacity-50"
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
                <span className="text-[#34C759] font-medium">✓ Synced</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center">
            <GoogleCalendarButton variant="pill" />
          </div>

          <PWAInstallButton />
        </div>
      </aside>

      {/* iOS Mobile Bottom Navigation Bar (md:hidden) - Authentic Cupertino HIG Style */}
      <nav
        id="mobile-bottom-nav"
        aria-label="iOS Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-black/[0.08] ios-nav-glass px-1 py-1 pb-safe shadow-[0_-2px_10px_rgba(0,0,0,0.03)]"
      >
        {/* 1. My Day */}
        <button
          id="mobile-nav-today"
          type="button"
          onClick={() => onTabChange('today')}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-0.5 min-h-[44px] touch-manipulation ios-tap-active ${
            activeTab === 'today'
              ? 'text-[#007AFF]'
              : 'text-[#8E8E93] hover:text-slate-700'
          }`}
        >
          <div className="relative">
            <CheckCircle2 className={`w-5 h-5 ${activeTab === 'today' ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
            {totalPendingAction > 0 && (
              <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[9px] font-black text-white shadow-2xs border border-white">
                {totalPendingAction}
              </span>
            )}
          </div>
          <span className={`text-[10px] tracking-tight ${activeTab === 'today' ? 'font-semibold' : 'font-medium'}`}>
            My Day
          </span>
        </button>

        {/* 2. Quotations */}
        <button
          id="mobile-nav-quotes"
          type="button"
          onClick={() => onTabChange('quotations')}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-0.5 min-h-[44px] touch-manipulation ios-tap-active ${
            activeTab === 'quotations'
              ? 'text-[#007AFF]'
              : 'text-[#8E8E93] hover:text-slate-700'
          }`}
        >
          <FileSpreadsheet className={`w-5 h-5 ${activeTab === 'quotations' ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
          <span className={`text-[10px] tracking-tight ${activeTab === 'quotations' ? 'font-semibold' : 'font-medium'}`}>
            Quotes
          </span>
        </button>

        {/* 3. Clients */}
        <button
          id="mobile-nav-clients"
          type="button"
          onClick={() => onTabChange('clients')}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-0.5 min-h-[44px] touch-manipulation ios-tap-active ${
            activeTab === 'clients'
              ? 'text-[#007AFF]'
              : 'text-[#8E8E93] hover:text-slate-700'
          }`}
        >
          <Users className={`w-5 h-5 ${activeTab === 'clients' ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
          <span className={`text-[10px] tracking-tight ${activeTab === 'clients' ? 'font-semibold' : 'font-medium'}`}>
            Clients
          </span>
        </button>

        {/* 4. Calendar */}
        <button
          id="mobile-nav-calendar"
          type="button"
          onClick={() => onTabChange('calendar')}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-0.5 min-h-[44px] touch-manipulation ios-tap-active ${
            activeTab === 'calendar'
              ? 'text-[#007AFF]'
              : 'text-[#8E8E93] hover:text-slate-700'
          }`}
        >
          <CalendarDays className={`w-5 h-5 ${activeTab === 'calendar' ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
          <span className={`text-[10px] tracking-tight ${activeTab === 'calendar' ? 'font-semibold' : 'font-medium'}`}>
            Calendar
          </span>
        </button>

        {/* 5. Settings */}
        <button
          id="mobile-nav-settings"
          type="button"
          onClick={() => onTabChange('settings')}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-0.5 min-h-[44px] touch-manipulation ios-tap-active ${
            activeTab === 'settings'
              ? 'text-[#007AFF]'
              : 'text-[#8E8E93] hover:text-slate-700'
          }`}
        >
          <Settings className={`w-5 h-5 ${activeTab === 'settings' ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
          <span className={`text-[10px] tracking-tight ${activeTab === 'settings' ? 'font-semibold' : 'font-medium'}`}>
            Settings
          </span>
        </button>
      </nav>
    </>
  );
};
