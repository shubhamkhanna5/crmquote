import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  RefreshCw,
  RotateCw,
  Save,
  Server,
  Settings as SettingsIcon,
  ShieldCheck,
  Sliders,
  Table,
} from 'lucide-react';
import { WorkspaceSettings, SyncRun, Quotation, Client, FollowUp } from '../types';
import { api } from '../services/api';
import { GoogleCalendarButton } from './GoogleCalendarButton';

interface SettingsViewProps {
  settings: WorkspaceSettings;
  syncHistory: SyncRun[];
  quotations: Quotation[];
  clients: Client[];
  followups: FollowUp[];
  supabaseStatus: { connected: boolean; url: string | null; hasKey: boolean };
  onTriggerSync: () => Promise<void>;
  isSyncing: boolean;
  onSettingsUpdated: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  syncHistory,
  quotations,
  clients,
  followups,
  supabaseStatus,
  onTriggerSync,
  isSyncing,
  onSettingsUpdated,
}) => {
  const [sheetId, setSheetId] = useState(settings.sheet_id);
  const [sheetGid, setSheetGid] = useState(settings.sheet_gid);
  const [autoSync, setAutoSync] = useState(settings.auto_sync_interval);
  const [followupDays, setFollowupDays] = useState(settings.followup_days);
  const [defaultTime, setDefaultTime] = useState(settings.default_time);

  const [supabaseUrl, setSupabaseUrl] = useState(supabaseStatus.url || '');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [isSyncingSupabase, setIsSyncingSupabase] = useState(false);
  const [supabaseSyncMsg, setSupabaseSyncMsg] = useState<string | null>(null);

  const handlePushSupabase = async () => {
    setIsSyncingSupabase(true);
    setSupabaseSyncMsg(null);
    try {
      const res = await api.pushToSupabase();
      setSupabaseSyncMsg(res.message);
      onSettingsUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to sync to Supabase');
    } finally {
      setIsSyncingSupabase(false);
    }
  };

  const handlePullSupabase = async () => {
    setIsSyncingSupabase(true);
    setSupabaseSyncMsg(null);
    try {
      const res = await api.pullFromSupabase();
      setSupabaseSyncMsg(res.message);
      onSettingsUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to pull from Supabase');
    } finally {
      setIsSyncingSupabase(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.updateSettings({
        sheet_id: sheetId.trim(),
        sheet_gid: sheetGid.trim(),
        auto_sync_interval: autoSync,
        followup_days: followupDays.trim(),
        default_time: defaultTime.trim(),
        supabase_url: supabaseUrl.trim() || undefined,
        supabase_key: supabaseKey.trim() || undefined,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      onSettingsUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to update settings');
    } finally {
      setIsSaving(false);
    }
  };

  // CSV Exporter helpers (PRD Section 117)
  const downloadCSV = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportQuotationsCSV = () => {
    const headers = [
      'Quotation Date',
      'Client Name',
      'Price',
      'Pool Specs',
      'Dimensions',
      'Contact',
      'Sender',
      'App Status',
      'Temperature',
      'Priority',
      'Next Follow-up Date',
      'Notes',
    ];
    const rows = quotations.map((q) => [
      `"${q.quotation_date}"`,
      `"${q.client_name.replace(/"/g, '""')}"`,
      q.quotation_price,
      `"${(q.pool_type || '').replace(/"/g, '""')}"`,
      `"${(q.pool_dimensions || '').replace(/"/g, '""')}"`,
      `"${q.contact_number}"`,
      `"${(q.sender_name || '').replace(/"/g, '""')}"`,
      `"${q.app_status}"`,
      `"${q.temperature}"`,
      `"${q.priority}"`,
      `"${q.next_followup?.scheduled_date || ''}"`,
      `"${(q.internal_notes || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadCSV(`quotations_export_${new Date().toISOString().split('T')[0]}.csv`, csv);
  };

  const exportClientsCSV = () => {
    const headers = ['Client Name', 'Phone', 'Quotes Count', 'Total Quoted Value', 'Notes'];
    const rows = clients.map((c) => [
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.phone}"`,
      c.quotations_count || 0,
      c.total_quoted_value || 0,
      `"${(c.notes || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadCSV(`clients_export_${new Date().toISOString().split('T')[0]}.csv`, csv);
  };

  const exportFollowupsCSV = () => {
    const headers = ['Date', 'Time', 'Client', 'Type', 'Status', 'Outcome', 'Notes'];
    const rows = followups.map((f) => [
      `"${f.scheduled_date}"`,
      `"${f.scheduled_time}"`,
      `"${(f.quotation?.client_name || '').replace(/"/g, '""')}"`,
      `"${f.type}"`,
      `"${f.status}"`,
      `"${(f.outcome || '').replace(/"/g, '""')}"`,
      `"${(f.notes || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadCSV(`followups_export_${new Date().toISOString().split('T')[0]}.csv`, csv);
  };

  const exportJSONBackup = () => {
    const backup = {
      exportedAt: new Date().toISOString(),
      quotations,
      clients,
      followups,
      settings,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `quotation_crm_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copySqlMigration = () => {
    const sql = `-- Supabase Schema for Quotation Follow-Up Manager
-- Generated for PostgreSQL with Row Level Security
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.quotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL,
    source_id TEXT NOT NULL,
    client_id UUID,
    quotation_date DATE NOT NULL,
    client_name TEXT NOT NULL,
    quotation_price NUMERIC NOT NULL DEFAULT 0,
    sender_name TEXT,
    pool_dimensions TEXT,
    pool_type TEXT,
    contact_number TEXT NOT NULL,
    contact_number_raw TEXT,
    source_status TEXT NOT NULL DEFAULT 'SENT',
    temperature TEXT NOT NULL DEFAULT 'warm',
    priority TEXT NOT NULL DEFAULT 'normal',
    app_status TEXT NOT NULL DEFAULT 'New',
    source_present BOOLEAN NOT NULL DEFAULT true,
    source_last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ,
    internal_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, source_id)
);

CREATE TABLE IF NOT EXISTS public.followups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL,
    quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL DEFAULT '10:30:00',
    type TEXT NOT NULL DEFAULT 'Call',
    status TEXT NOT NULL DEFAULT 'Scheduled',
    outcome TEXT,
    notes TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;
    navigator.clipboard.writeText(sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  return (
    <div className="space-y-6 pb-20 md:pb-8 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
          Settings & Synchronization
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Manage Google Calendar auto-sync, Google Sheets connection, defaults, and data backups
        </p>
      </div>

      {/* Google Calendar Auto-Sync Integration */}
      <GoogleCalendarButton
        variant="full"
        followups={followups}
        quotations={quotations}
        onSyncComplete={onSettingsUpdated}
      />

      {/* 1. Google Sheets Sync Panel (PRD Section 110-116) */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Google Sheet Connection</h2>
              <p className="text-xs text-slate-400">
                Live synchronization with automatic schema validation and deduplication
              </p>
            </div>
          </div>

          <button
            onClick={onTriggerSync}
            disabled={isSyncing}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition disabled:opacity-50 active:scale-95"
          >
            <RotateCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>
        </div>

        {/* Sync Summary Metrics */}
        {syncHistory.length > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs">
            <div className="flex items-center justify-between text-slate-300 font-semibold mb-2">
              <span>Last Run: {syncHistory[0].status.toUpperCase()}</span>
              <span className="font-mono text-slate-400 text-[11px]">
                {syncHistory[0].completed_at
                  ? new Date(syncHistory[0].completed_at).toLocaleString()
                  : 'In progress...'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="rounded-lg bg-slate-900 p-2">
                <span className="text-slate-500">Rows in Sheet</span>
                <p className="font-bold text-white text-sm">{syncHistory[0].rows_found}</p>
              </div>
              <div className="rounded-lg bg-slate-900 p-2">
                <span className="text-emerald-400">New Records</span>
                <p className="font-bold text-emerald-400 text-sm">
                  +{syncHistory[0].records_created}
                </p>
              </div>
              <div className="rounded-lg bg-slate-900 p-2">
                <span className="text-cyan-400">Updated</span>
                <p className="font-bold text-cyan-400 text-sm">
                  {syncHistory[0].records_updated}
                </p>
              </div>
              <div className="rounded-lg bg-slate-900 p-2">
                <span className="text-slate-400">Failed / Errors</span>
                <p
                  className={`font-bold text-sm ${
                    syncHistory[0].records_failed > 0 ? 'text-rose-400' : 'text-slate-400'
                  }`}
                >
                  {syncHistory[0].records_failed}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Form to change sheet ID or GID */}
        <form onSubmit={handleSaveSettings} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Google Sheet ID
              </label>
              <input
                type="text"
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Tab GID
              </label>
              <input
                type="text"
                value={sheetGid}
                onChange={(e) => setSheetGid(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Auto-Sync Interval
              </label>
              <select
                value={autoSync}
                onChange={(e) => setAutoSync(e.target.value as any)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              >
                <option value="manual">Manual only</option>
                <option value="15m">Every 15 minutes</option>
                <option value="30m">Every 30 minutes</option>
                <option value="1h">Every 1 hour</option>
                <option value="4h">Every 4 hours</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Default Follow-Up Cadence (Days)
              </label>
              <input
                type="text"
                value={followupDays}
                onChange={(e) => setFollowupDays(e.target.value)}
                placeholder="3, 7, 14, 21, 30"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Default Action Time (Asia/Kolkata)
              </label>
              <input
                type="time"
                value={defaultTime}
                onChange={(e) => setDefaultTime(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            {saveSuccess && (
              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Settings Saved!
              </span>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-xl bg-cyan-600 px-5 py-2 text-xs font-semibold text-white hover:bg-cyan-500 transition disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* 2. Supabase Integration Panel (PRD Section 112 & 113) */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Supabase PostgreSQL CRM</h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    supabaseStatus.connected
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {supabaseStatus.connected ? '● Cloud Connected' : '● Local Store Active'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Shared persistent database for multi-user quotation follow-up management
              </p>
            </div>
          </div>

          <button
            onClick={copySqlMigration}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-cyan-400 hover:bg-slate-700 transition"
          >
            {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedSql ? 'SQL Copied!' : 'Copy Supabase SQL'}</span>
          </button>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 text-xs text-slate-300 space-y-2">
          <p>
            The backend features an <strong>integrated dual storage engine</strong>. It provides zero-configuration local persistence (`data/db.json`) while offering full Supabase synchronization when credentials are configured.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 font-mono text-[11px] text-slate-400">
            <span>
              Config file: <code className="text-cyan-400">.env</code> or form below
            </span>
            <span className="hidden sm:inline">·</span>
            <span>
              Schema file:{' '}
              <code className="text-cyan-400">
                supabase/migrations/20260101000000_init_quotation_crm.sql
              </code>
            </span>
          </div>
        </div>

        {/* Supabase Actions & Direct Sync Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSyncingSupabase}
              onClick={handlePushSupabase}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-950/40 px-3.5 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-900/50 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSupabase ? 'animate-spin' : ''}`} />
              <span>Push All Local to Supabase</span>
            </button>
            <button
              type="button"
              disabled={isSyncingSupabase}
              onClick={handlePullSupabase}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isSyncingSupabase ? 'animate-spin' : ''}`} />
              <span>Pull / Hydrate from Supabase</span>
            </button>
          </div>

          {supabaseSyncMsg && (
            <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> {supabaseSyncMsg}
            </span>
          )}
        </div>
      </section>

      {/* 3. Data Export & Backup (PRD Section 117) */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Data Export & Backup</h2>
            <p className="text-xs text-slate-400">
              Export quotation records, client lists, and follow-up activities
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            onClick={exportQuotationsCSV}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 p-3.5 text-center hover:border-cyan-500/50 hover:bg-slate-800 transition group"
          >
            <Table className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition" />
            <span className="text-xs font-semibold text-white">Quotations CSV</span>
            <span className="text-[10px] text-slate-500">{quotations.length} records</span>
          </button>

          <button
            onClick={exportClientsCSV}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 p-3.5 text-center hover:border-cyan-500/50 hover:bg-slate-800 transition group"
          >
            <FileSpreadsheet className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition" />
            <span className="text-xs font-semibold text-white">Clients CSV</span>
            <span className="text-[10px] text-slate-500">{clients.length} clients</span>
          </button>

          <button
            onClick={exportFollowupsCSV}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 p-3.5 text-center hover:border-cyan-500/50 hover:bg-slate-800 transition group"
          >
            <CheckCircle2 className="w-5 h-5 text-amber-400 group-hover:scale-110 transition" />
            <span className="text-xs font-semibold text-white">Follow-Ups CSV</span>
            <span className="text-[10px] text-slate-500">{followups.length} entries</span>
          </button>

          <button
            onClick={exportJSONBackup}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 p-3.5 text-center hover:border-cyan-500/50 hover:bg-slate-800 transition group"
          >
            <Database className="w-5 h-5 text-purple-400 group-hover:scale-110 transition" />
            <span className="text-xs font-semibold text-white">Complete JSON</span>
            <span className="text-[10px] text-slate-500">Full backup</span>
          </button>
        </div>
      </section>
    </div>
  );
};
