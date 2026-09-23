/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ActiveTab,
  Navigation,
} from './components/Navigation';
import { MyDayView } from './components/MyDayView';
import { QuotationsView } from './components/QuotationsView';
import { ClientsView } from './components/ClientsView';
import { CalendarView } from './components/CalendarView';
import { SettingsView } from './components/SettingsView';
import { FollowUpDoneModal } from './components/FollowUpDoneModal';
import { RescheduleModal } from './components/RescheduleModal';
import { NewFollowUpModal } from './components/NewFollowUpModal';
import { QuotationDetailModal } from './components/QuotationDetailModal';
import { NewQuotationModal } from './components/NewQuotationModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { SwitchUserModal } from './components/SwitchUserModal';
import { useToast } from './components/Toast';
import { GoogleCalendarButton } from './components/GoogleCalendarButton';
import {
  isGoogleCalendarConnected,
  syncFollowUpToGoogleCalendar,
  signInWithGoogleCalendar,
} from './services/googleCalendar';
import {
  DashboardMetrics,
  Quotation,
  FollowUp,
  Client,
  SyncRun,
  WorkspaceSettings,
  FollowUpOutcome,
  FollowUpType,
  ActiveUser,
  matchesActiveUser,
  isTrialRecord,
  AppStatus,
} from './types';
import { api } from './services/api';
import { formatIndianCurrency } from '../server/normalizer';
import { RotateCw, Search, Plus, CheckCircle2, Layers, Lock } from 'lucide-react';

export default function App() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<ActiveTab>('today');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Data states
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [filterOptions, setFilterOptions] = useState<{
    poolTypes: string[];
    senders: string[];
  }>({ poolTypes: [], senders: [] });
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [latestSync, setLatestSync] = useState<SyncRun | null>(null);
  const [syncHistory, setSyncHistory] = useState<SyncRun[]>([]);
  const [settings, setSettings] = useState<WorkspaceSettings>({
    id: '',
    workspace_id: '',
    sheet_id: '1ReM-fqeHpFqetNa4vPhfDhk4uapexmKKwwZMGPuJR84',
    sheet_gid: '409600100',
    auto_sync_interval: 'manual',
    followup_days: '3, 7, 14, 21, 30',
    default_time: '10:30',
    updated_at: '',
  });
  const [supabaseStatus, setSupabaseStatus] = useState<{
    connected: boolean;
    url: string | null;
    hasKey: boolean;
  }>({ connected: false, url: null, hasKey: false });

  // Modals state
  const [selectedQuotationId, setSelectedQuotationId] = useState<string | null>(null);
  const [doneModalFollowup, setDoneModalFollowup] = useState<FollowUp | null>(null);
  const [rescheduleModalFollowup, setRescheduleModalFollowup] = useState<FollowUp | null>(null);
  const [newFollowUpModalOpen, setNewFollowUpModalOpen] = useState(false);
  const [newFollowUpInitialQuotationId, setNewFollowUpInitialQuotationId] = useState<string | null>(null);
  const [isNewQuotationModalOpen, setIsNewQuotationModalOpen] = useState(false);
  const [newQuotationInitialClientId, setNewQuotationInitialClientId] = useState<string | undefined>(undefined);

  const handleOpenNewQuotation = (clientId?: string) => {
    setNewQuotationInitialClientId(clientId);
    setIsNewQuotationModalOpen(true);
  };

  const handleNewQuotationSuccess = (quotation: Quotation) => {
    loadData(true);
    setSelectedQuotationId(quotation.id);
  };

  // User Profile Switcher (Pranjal vs Shubham with 1234 PIN)
  const [activeUser, setActiveUser] = useState<ActiveUser>(() => {
    const saved = localStorage.getItem('crm_active_user');
    return saved === 'Pranjal' ? 'Pranjal' : 'Shubham';
  });
  const [targetSwitchUser, setTargetSwitchUser] = useState<'Pranjal' | 'Shubham' | null>(null);

  // Load all app data
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const [
        dashboardRes,
        quotesRes,
        followupsRes,
        clientsRes,
        syncStatusRes,
        syncHistoryRes,
        settingsRes,
      ] = await Promise.all([
        api.getDashboard(),
        api.getQuotations(),
        api.getFollowUps(),
        api.getClients(),
        api.getSyncStatus(),
        api.getSyncHistory(),
        api.getSettings(),
      ]);

      setMetrics(dashboardRes);
      setQuotations(
        (quotesRes.quotations || []).filter(
          (q) => !isTrialRecord(q.client_name, q.contact_number, q.contact_number_raw)
        )
      );
      setFilterOptions(quotesRes.filterOptions);
      setFollowups(
        (followupsRes || []).filter(
          (f) => !isTrialRecord(f.quotation?.client_name, f.quotation?.contact_number)
        )
      );
      setClients(
        (clientsRes || []).filter(
          (c) => !isTrialRecord(c.name, c.phone, c.contact_number_raw)
        )
      );
      setLatestSync(syncStatusRes.latestRun);
      setSyncHistory(syncHistoryRes);
      setSettings(settingsRes.settings);
      setSupabaseStatus(settingsRes.supabase);
    } catch (err: any) {
      console.error('Failed to load CRM data:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Quick Trigger Sheet Sync
  const handleTriggerSync = async () => {
    setIsSyncing(true);
    try {
      const run = await api.runSync();
      setLatestSync(run);
      await loadData(true);
    } catch (err: any) {
      alert(err.message || 'Synchronization failed');
    } finally {
      setIsSyncing(false);
    }
  };

  // Follow-up completion handler
  const handleCompleteFollowUp = async (data: {
    outcome: FollowUpOutcome;
    notes?: string;
    nextAction?: {
      type: 'tomorrow' | '3_days' | '7_days' | 'custom' | 'none';
      customDate?: string;
      customTime?: string;
      followupType?: FollowUpType;
    };
  }) => {
    if (!doneModalFollowup) return;
    try {
      const result = await api.completeFollowUp(doneModalFollowup.id, data);
      await loadData(true);

      if (result.nextFollowup) {
        const quote = quotations.find((q) => q.id === result.nextFollowup?.quotation_id);
        if (isGoogleCalendarConnected()) {
          const syncRes = await syncFollowUpToGoogleCalendar(result.nextFollowup, quote);
          if (syncRes.success) {
            showToast(
              `Follow-up marked complete & next date auto-added to Google Calendar!`,
              'success',
              5000,
              syncRes.link ? { link: { label: 'View in Calendar ↗', url: syncRes.link } } : undefined
            );
            await loadData(true);
            return;
          }
        }
        showToast(
          `Follow-up saved & next follow-up set for ${result.nextFollowup.scheduled_date}`,
          'success'
        );
      } else {
        showToast(`Follow-up marked done: ${data.outcome}`, 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to complete follow-up', 'error');
    }
  };

  // Reschedule handler
  const handleRescheduleFollowUp = async (
    id: string,
    newDate: string,
    newTime: string
  ) => {
    try {
      const updated = await api.rescheduleFollowUp(id, newDate, newTime);
      await loadData(true);

      const quote = quotations.find((q) => q.id === updated.quotation_id);
      if (isGoogleCalendarConnected()) {
        const syncRes = await syncFollowUpToGoogleCalendar(updated, quote);
        if (syncRes.success) {
          showToast(
            `Rescheduled to ${newDate} & auto-synced to Google Calendar!`,
            'success',
            5000,
            syncRes.link ? { link: { label: 'View in Calendar ↗', url: syncRes.link } } : undefined
          );
          await loadData(true);
          return;
        }
      }
      showToast(
        `Follow-up rescheduled to ${newDate}${newTime ? ` at ${newTime}` : ''}`,
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'Failed to reschedule follow-up', 'error');
    }
  };

  // Create new follow up
  const handleCreateFollowUp = async (data: {
    quotation_id: string;
    scheduled_date: string;
    scheduled_time: string;
    type: FollowUpType;
    notes?: string;
  }) => {
    try {
      const newFollowup = await api.createFollowUp(data);
      await loadData(true);

      const quote = quotations.find((q) => q.id === data.quotation_id);
      if (isGoogleCalendarConnected()) {
        const syncRes = await syncFollowUpToGoogleCalendar(newFollowup, quote);
        if (syncRes.success) {
          showToast(
            `Follow-up date scheduled & added to Google Calendar!`,
            'success',
            5000,
            syncRes.link ? { link: { label: 'View in Calendar ↗', url: syncRes.link } } : undefined
          );
          await loadData(true);
          return;
        }
      } else {
        showToast(
          `Follow-up scheduled for ${data.scheduled_date}! Connect Calendar to auto-sync.`,
          'info',
          6000,
          {
            action: {
              label: 'Connect Calendar',
              onClick: async () => {
                try {
                  const res = await signInWithGoogleCalendar();
                  if (res) {
                    const syncRes = await syncFollowUpToGoogleCalendar(newFollowup, quote);
                    showToast(
                      'Google Calendar connected & event synced!',
                      'success',
                      5000,
                      syncRes.link
                        ? { link: { label: 'View in Calendar ↗', url: syncRes.link } }
                        : undefined
                    );
                    await loadData(true);
                  }
                } catch (e: any) {
                  console.error(e);
                }
              },
            },
          }
        );
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to schedule follow-up', 'error');
    }
  };

  const handleOpenNewFollowUp = (quotationId?: string) => {
    setNewFollowUpInitialQuotationId(quotationId || null);
    setNewFollowUpModalOpen(true);
  };

  // Filter quotations and followups by current active user (Pranjal vs Shubham), strictly excluding trial records
  const userQuotations = useMemo(
    () =>
      quotations.filter(
        (q) =>
          !isTrialRecord(q.client_name, q.contact_number, q.contact_number_raw) &&
          matchesActiveUser(q.sender_name, activeUser)
      ),
    [quotations, activeUser]
  );

  const userFollowups = useMemo(
    () =>
      followups.filter(
        (f) =>
          !isTrialRecord(f.quotation?.client_name, f.quotation?.contact_number) &&
          matchesActiveUser(f.quotation?.sender_name, activeUser)
      ),
    [followups, activeUser]
  );

  // Also filter clients that have quotations belonging to this user
  const userClientNames = useMemo(
    () => new Set(userQuotations.map((q) => q.client_name.toLowerCase().trim())),
    [userQuotations]
  );
  const userClients = useMemo(
    () => clients.filter((c) => userClientNames.has(c.name.toLowerCase().trim())),
    [clients, userClientNames]
  );

  const overdueCount = userFollowups.filter((f) => f.status === 'Overdue').length;
  const dueTodayCount = userFollowups.filter((f) => f.status === 'Due').length;
  const activeStatuses: AppStatus[] = ['New', 'Active', 'In Discussion', 'Waiting for Client', 'On Hold'];
  const noNextActionCount = userQuotations.filter((q) => {
    if (!activeStatuses.includes(q.app_status)) return false;
    return !userFollowups.some(
      (f) =>
        f.quotation_id === q.id &&
        ['Scheduled', 'Due', 'Overdue'].includes(f.status)
    );
  }).length;

  // Accurately compute user-specific dashboard metrics (Active Pipeline Value, Hot/Warm/Won values)
  // Strictly without trial quotes and strictly scoped to active user
  const userMetrics = useMemo<DashboardMetrics>(() => {
    const activeQuotations = userQuotations.filter((q) => activeStatuses.includes(q.app_status));
    const wonQuotations = userQuotations.filter((q) => q.app_status === 'Won');
    const lostQuotations = userQuotations.filter((q) => q.app_status === 'Lost' || q.app_status === 'Cancelled');

    const activeQuotedValue = activeQuotations.reduce((sum, q) => sum + (q.quotation_price || 0), 0);
    const wonQuotedValue = wonQuotations.reduce((sum, q) => sum + (q.quotation_price || 0), 0);

    const hotValue = activeQuotations
      .filter((q) => q.temperature === 'hot')
      .reduce((sum, q) => sum + (q.quotation_price || 0), 0);
    const warmValue = activeQuotations
      .filter((q) => q.temperature === 'warm')
      .reduce((sum, q) => sum + (q.quotation_price || 0), 0);
    const coldValue = activeQuotations
      .filter((q) => q.temperature === 'cold')
      .reduce((sum, q) => sum + (q.quotation_price || 0), 0);

    const overdueFollowups = userFollowups.filter((f) => f.status === 'Overdue');
    const dueTodayFollowups = userFollowups.filter((f) => f.status === 'Due');
    const upcomingFollowups = userFollowups.filter((f) => f.status === 'Scheduled');

    const quotationsWithNoNextAction = activeQuotations.filter((q) => {
      const hasFutureFollowup = userFollowups.some(
        (f) =>
          f.quotation_id === q.id &&
          ['Scheduled', 'Due', 'Overdue'].includes(f.status)
      );
      return !hasFutureFollowup;
    });

    return {
      totalQuotations: userQuotations.length,
      activeCount: activeQuotations.length,
      wonCount: wonQuotations.length,
      lostCount: lostQuotations.length,
      dueTodayCount: dueTodayFollowups.length,
      overdueCount: overdueFollowups.length,
      noNextActionCount: quotationsWithNoNextAction.length,
      upcomingCount: upcomingFollowups.length,
      activeQuotedValue,
      wonQuotedValue,
      hotValue,
      warmValue,
      coldValue,
      activeQuotedValueFormatted: formatIndianCurrency(activeQuotedValue),
      hotValueFormatted: formatIndianCurrency(hotValue),
      warmValueFormatted: formatIndianCurrency(warmValue),
      coldValueFormatted: formatIndianCurrency(coldValue),
    };
  }, [userQuotations, userFollowups]);

  const handleSwitchUserSuccess = (newUser: 'Pranjal' | 'Shubham') => {
    setActiveUser(newUser);
    localStorage.setItem('crm_active_user', newUser);
    setTargetSwitchUser(null);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-sans text-slate-800 antialiased selection:bg-teal-500 selection:text-white">
        {/* Offline Alert Indicator */}
      <OfflineIndicator />

      {/* Navigation (Sidebar on Desktop, Bottom bar on Mobile) */}
      <Navigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenNewFollowUp={() => handleOpenNewFollowUp()}
        onQuickSync={handleTriggerSync}
        isSyncing={isSyncing}
        latestSync={latestSync}
        overdueCount={overdueCount}
        dueTodayCount={dueTodayCount}
        noNextActionCount={noNextActionCount}
        activeUser={activeUser}
        onRequestSwitchUser={(target) => setTargetSwitchUser(target)}
      />

      {/* Main View Area */}
      <main className="flex-1 overflow-y-auto bg-slate-50 px-3 py-3 sm:px-8 sm:py-6 pb-28 md:pb-8">
        <div className="mx-auto max-w-7xl">
          {/* Mobile Sticky Top Header (md:hidden) */}
          <div className="md:hidden sticky top-0 z-30 -mx-3 -mt-3 mb-3 bg-white/95 px-3 py-2.5 backdrop-blur-md border-b border-slate-200/90 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              {/* Brand & User switcher */}
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-600 text-white shadow-2xs">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const next = activeUser === 'Pranjal' ? 'Shubham' : 'Pranjal';
                      setTargetSwitchUser(next);
                    }}
                    className="flex items-center gap-1 rounded-lg bg-teal-50 border border-teal-200 px-2.5 py-1 text-xs font-bold text-teal-800 active:scale-95 transition"
                    title={`Switch user (current: ${activeUser})`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
                    <span>{activeUser}</span>
                    <Lock className="w-2.5 h-2.5 text-teal-500 ml-0.5" />
                  </button>
                </div>
              </div>

              {/* Quick Sync & Google Calendar Sync */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleTriggerSync}
                  disabled={isSyncing}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 active:scale-95 transition disabled:opacity-50 shadow-2xs"
                  title="Quick sync Google Sheet"
                >
                  <RotateCw className={`w-3.5 h-3.5 text-teal-600 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span className="text-[11px]">Sync</span>
                </button>
                <GoogleCalendarButton
                  variant="pill"
                  followups={userFollowups}
                  quotations={userQuotations}
                  onSyncComplete={() => loadData(true)}
                />
              </div>
            </div>

            {/* Quick Metrics Bar on Phone */}
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-1.5">
              <span className="font-medium text-slate-700">
                <strong className="text-slate-900">{userQuotations.length}</strong> quotes ·{' '}
                <strong className="text-teal-700">{userFollowups.length}</strong> follow-ups
              </span>
              {latestSync?.completed_at && (
                <span className="text-slate-400 text-[10px]">
                  Synced {new Date(latestSync.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>

          {/* Desktop Streamlined Profile & Workspace Header (hidden md:flex) */}
          <div className="hidden md:flex mb-6 flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3.5">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-500">Workspace:</span>
              <div className="inline-flex items-center rounded-xl bg-white border border-slate-200 p-1 shadow-xs">
                <button
                  type="button"
                  onClick={() => {
                    if (activeUser !== 'Pranjal') {
                      setTargetSwitchUser('Pranjal');
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition ${
                    activeUser === 'Pranjal'
                      ? 'bg-cyan-600 text-white shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${activeUser === 'Pranjal' ? 'bg-white' : 'bg-slate-300'}`} />
                  <span>Pranjal</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (activeUser !== 'Shubham') {
                      setTargetSwitchUser('Shubham');
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition ${
                    activeUser === 'Shubham'
                      ? 'bg-cyan-600 text-white shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${activeUser === 'Shubham' ? 'bg-white' : 'bg-slate-300'}`} />
                  <span>Shubham</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-600">
              <GoogleCalendarButton
                variant="pill"
                followups={userFollowups}
                quotations={userQuotations}
                onSyncComplete={() => loadData(true)}
              />
              <span className="text-slate-300 hidden sm:inline">•</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="font-semibold text-slate-900">{userQuotations.length}</span> quotes
              </span>
              <span className="text-slate-300">•</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="font-semibold text-slate-900">{userFollowups.length}</span> follow-ups
              </span>
              {latestSync?.completed_at && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="text-slate-500 text-[11px] hidden sm:inline">
                    Synced {new Date(latestSync.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex h-96 flex-col items-center justify-center gap-3 text-slate-500">
              <RotateCw className="h-8 w-8 animate-spin text-cyan-600" />
              <p className="text-sm font-medium text-slate-700">Loading Quotation CRM...</p>
            </div>
          ) : (
            <>
              {activeTab === 'today' && (
                <MyDayView
                  metrics={userMetrics}
                  followups={userFollowups}
                  quotations={userQuotations}
                  onOpenQuotation={(id) => setSelectedQuotationId(id)}
                  onOpenDoneModal={(f) => setDoneModalFollowup(f)}
                  onOpenRescheduleModal={(f) => setRescheduleModalFollowup(f)}
                  onOpenNewFollowUpForQuotation={(id) => handleOpenNewFollowUp(id)}
                  onRefresh={() => loadData(false)}
                  isRefreshing={isRefreshing}
                  onBulkActionSuccess={() => loadData(true)}
                />
              )}

              {activeTab === 'quotations' && (
                <QuotationsView
                  quotations={userQuotations}
                  metrics={userMetrics}
                  activeUser={activeUser}
                  filterOptions={filterOptions}
                  onOpenQuotation={(id) => setSelectedQuotationId(id)}
                  onOpenNewFollowUpForQuotation={(id) => handleOpenNewFollowUp(id)}
                  onOpenDoneModal={(f) => setDoneModalFollowup(f)}
                  onOpenRescheduleModal={(f) => setRescheduleModalFollowup(f)}
                  onOpenNewQuotation={() => handleOpenNewQuotation()}
                  onRefresh={() => loadData(false)}
                  isRefreshing={isRefreshing}
                />
              )}

              {activeTab === 'clients' && (
                <ClientsView
                  clients={userClients}
                  quotations={userQuotations}
                  onOpenQuotation={(id) => setSelectedQuotationId(id)}
                  onOpenNewQuotation={(cid) => handleOpenNewQuotation(cid)}
                  onRefresh={() => loadData(false)}
                  isRefreshing={isRefreshing}
                />
              )}

              {activeTab === 'calendar' && (
                <CalendarView
                  followups={userFollowups}
                  quotations={userQuotations}
                  onOpenQuotation={(id) => setSelectedQuotationId(id)}
                  onOpenDoneModal={(f) => setDoneModalFollowup(f)}
                  onOpenRescheduleModal={(f) => setRescheduleModalFollowup(f)}
                  onRefresh={() => loadData(false)}
                  isRefreshing={isRefreshing}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsView
                  settings={settings}
                  syncHistory={syncHistory}
                  quotations={userQuotations}
                  clients={userClients}
                  followups={userFollowups}
                  supabaseStatus={supabaseStatus}
                  onTriggerSync={handleTriggerSync}
                  isSyncing={isSyncing}
                  onSettingsUpdated={() => loadData(true)}
                />
              )}
            </>
          )}
        </div>
      </main>

      {/* Modals */}
      {/* 1. Quotation Detail Modal */}
      {selectedQuotationId && (
        <QuotationDetailModal
          quotationId={selectedQuotationId}
          onClose={() => setSelectedQuotationId(null)}
          onOpenDoneModal={(f) => setDoneModalFollowup(f)}
          onOpenRescheduleModal={(f) => setRescheduleModalFollowup(f)}
          onOpenNewFollowUpForQuotation={(id) => handleOpenNewFollowUp(id)}
          onQuotationUpdated={() => loadData(true)}
        />
      )}

      {/* 2. Follow-Up Done Modal (10 outcomes + Next Action) */}
      {doneModalFollowup && (
        <FollowUpDoneModal
          followup={doneModalFollowup}
          onClose={() => setDoneModalFollowup(null)}
          onSave={handleCompleteFollowUp}
        />
      )}

      {/* 3. Reschedule Modal */}
      {rescheduleModalFollowup && (
        <RescheduleModal
          followup={rescheduleModalFollowup}
          onClose={() => setRescheduleModalFollowup(null)}
          onReschedule={handleRescheduleFollowUp}
        />
      )}

      {/* 4. Schedule New Follow-Up Modal */}
      {newFollowUpModalOpen && (
        <NewFollowUpModal
          quotations={userQuotations}
          initialQuotationId={newFollowUpInitialQuotationId}
          onClose={() => {
            setNewFollowUpModalOpen(false);
            setNewFollowUpInitialQuotationId(null);
          }}
          onSave={handleCreateFollowUp}
        />
      )}

        {/* 5. Switch User PIN 1234 Verification Modal */}
        {targetSwitchUser && (
          <SwitchUserModal
            isOpen={Boolean(targetSwitchUser)}
            currentUser={activeUser}
            targetUser={targetSwitchUser}
            onClose={() => setTargetSwitchUser(null)}
            onSuccess={handleSwitchUserSuccess}
          />
        )}

        {/* 6. New Quotation Modal (Direct CRM quote, not from backend sheet sync) */}
        {isNewQuotationModalOpen && (
          <NewQuotationModal
            isOpen={isNewQuotationModalOpen}
            onClose={() => {
              setIsNewQuotationModalOpen(false);
              setNewQuotationInitialClientId(undefined);
            }}
            onSuccess={handleNewQuotationSuccess}
            clients={clients}
            activeUser={activeUser}
            knownSenders={filterOptions.senders}
            initialClientId={newQuotationInitialClientId}
          />
        )}
      </div>
  );
}
