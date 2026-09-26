import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Quotation,
  Client,
  FollowUp,
  Activity,
  SyncRun,
  WorkspaceSettings,
  AppStatus,
  Temperature,
  Priority,
  FollowUpOutcome,
  FollowUpType,
  CalendarEvent,
  CalendarProvider,
} from './types';
import { calculateQuotationAgeDays, isTrialRecord, normalizePhone, normalizePrice } from './normalizer';

// In serverless environments (like Vercel or AWS Lambda), current working directory is read-only.
// We fallback to /tmp if process.env.VERCEL or process.env.AWS_LAMBDA_FUNCTION_NAME is defined.
const DATA_DIR = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
  ? path.join('/tmp', '.data')
  : path.join(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

interface DBStore {
  workspaces: Array<{ id: string; name: string; created_at: string; updated_at: string }>;
  clients: Client[];
  quotations: Quotation[];
  followups: FollowUp[];
  activities: Activity[];
  sync_runs: SyncRun[];
  settings: WorkspaceSettings[];
  calendar_events: CalendarEvent[];
}

class Database {
  private store: DBStore;
  private supabase: SupabaseClient | null = null;
  public isSupabaseConnected = false;

  constructor() {
    this.store = this.loadStore();
    this.initSupabase();
  }

  private loadStore(): DBStore {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const data = fs.readFileSync(DB_FILE, 'utf-8');
        const store: DBStore = JSON.parse(data);
        // Automatically purge any trial records ("Valued Client" or "9650081896")
        const trialQuoteIds = new Set(
          (store.quotations || [])
            .filter((q) => isTrialRecord(q.client_name, q.contact_number, q.contact_number_raw))
            .map((q) => q.id)
        );
        const trialClientIds = new Set(
          (store.clients || [])
            .filter((c) => isTrialRecord(c.name, c.phone, c.contact_number_raw))
            .map((c) => c.id)
        );
        let storeNeedsSave = false;
        if (trialQuoteIds.size > 0 || trialClientIds.size > 0) {
          store.quotations = (store.quotations || []).filter((q) => !trialQuoteIds.has(q.id));
          store.followups = (store.followups || []).filter((f) => !trialQuoteIds.has(f.quotation_id));
          store.activities = (store.activities || []).filter((a) => !a.quotation_id || !trialQuoteIds.has(a.quotation_id));
          store.clients = (store.clients || []).filter((c) => !trialClientIds.has(c.id));
          storeNeedsSave = true;
        }

        // Clean up stale zombie followups: if a lead has a Completed follow-up, remove any stale
        // overdue follow-up created on the same or earlier date that was re-created or left behind
        if (store.followups && store.followups.length > 0) {
          const initialFollowupLen = store.followups.length;
          const completedByQuote = new Map<string, string[]>();
          for (const f of store.followups) {
            if (f.status === 'Completed') {
              const list = completedByQuote.get(f.quotation_id) || [];
              list.push(f.scheduled_date);
              completedByQuote.set(f.quotation_id, list);
            }
          }
          store.followups = store.followups.filter((f) => {
            if (['Overdue', 'Due'].includes(f.status)) {
              const completedDates = completedByQuote.get(f.quotation_id);
              if (completedDates && completedDates.some((cDate) => f.scheduled_date <= cDate)) {
                return false;
              }
            }
            return true;
          });
          if (store.followups.length !== initialFollowupLen) {
            storeNeedsSave = true;
          }

          // Sanitize automated placeholder/boilerplate notes on followups
          const PLACEHOLDER_NOTE_SET = new Set([
            'initial follow-up for imported quotation',
            'initial follow-up to discuss quote and pool specifications',
            'initial follow-up',
            'batch scheduled follow-up',
            'follow-up date from google sheet',
            'day 3 follow-up',
            'quick scheduled call',
            'quick scheduled whatsapp',
            'quick scheduled email',
            'quick scheduled visit',
            'quick scheduled follow-up',
            'routine follow-up call',
            'routine follow-up',
            'scheduled follow-up',
            'follow-up',
            'followup',
            'none',
            'n/a',
            'null',
            'undefined',
            '-',
            '--',
            'no notes',
            'action taken',
          ]);
          const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

          for (const f of store.followups) {
            if (f.notes) {
              const trimmed = f.notes.trim();
              const lower = trimmed.toLowerCase();
              if (
                PLACEHOLDER_NOTE_SET.has(lower) ||
                UUID_REGEX.test(trimmed) ||
                lower.startsWith('quick scheduled') ||
                lower.startsWith('batch scheduled') ||
                lower.startsWith('initial follow-up for') ||
                lower.startsWith('initial follow up for')
              ) {
                f.notes = null;
                storeNeedsSave = true;
              }
            }
          }
        }

        if (storeNeedsSave) {
          this.saveStore(store);
        }
        store.calendar_events = store.calendar_events || [];
        return store;
      }
    } catch (e) {
      console.error('Error loading DB file, initializing fresh store:', e);
    }

    const initial: DBStore = {
      workspaces: [
        {
          id: DEFAULT_WORKSPACE_ID,
          name: 'Main Workspace',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      clients: [],
      quotations: [],
      followups: [],
      activities: [],
      sync_runs: [],
      settings: [
        {
          id: crypto.randomUUID(),
          workspace_id: DEFAULT_WORKSPACE_ID,
          sheet_id: process.env.GOOGLE_SHEET_ID || '1ReM-fqeHpFqetNa4vPhfDhk4uapexmKKwwZMGPuJR84',
          sheet_gid: process.env.GOOGLE_SHEET_GID || '0',
          auto_sync_interval: '15m',
          followup_days: '3,7,14,21,30',
          default_time: '10:30',
          updated_at: new Date().toISOString(),
        },
      ],
      calendar_events: [],
    };

    this.saveStore(initial);
    return initial;
  }

  private saveStore(storeToSave?: DBStore) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(storeToSave || this.store, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to write database file:', e);
    }
  }

  public initSupabase(url?: string, key?: string) {
    const supabaseUrl = url || process.env.SUPABASE_URL;
    const supabaseKey = key || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey && supabaseUrl.startsWith('http')) {
      try {
        this.supabase = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false },
        });
        this.isSupabaseConnected = true;
        console.log('Supabase client initialized with URL:', supabaseUrl);
      } catch (err) {
        console.warn('Failed to initialize Supabase client:', err);
        this.isSupabaseConnected = false;
        this.supabase = null;
      }
    } else {
      this.isSupabaseConnected = false;
      this.supabase = null;
    }
  }

  public getSupabaseStatus() {
    return {
      connected: this.isSupabaseConnected,
      url: process.env.SUPABASE_URL || null,
      hasKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY),
    };
  }

  public async ensureWorkspaceInSupabase(workspaceId: string = DEFAULT_WORKSPACE_ID) {
    if (!this.supabase || !this.isSupabaseConnected) return;
    try {
      await this.supabase.from('workspaces').upsert(
        {
          id: workspaceId,
          name: 'Main Workspace',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
    } catch (e) {
      console.warn('[Supabase ensureWorkspace warning]', e);
    }
  }

  public async syncQuotationToSupabase(q: Quotation) {
    if (!this.supabase || !this.isSupabaseConnected) return;
    try {
      await this.ensureWorkspaceInSupabase(q.workspace_id);
      const clean: any = {
        id: q.id,
        workspace_id: q.workspace_id,
        source_id: q.source_id,
        client_id: q.client_id,
        quotation_date: q.quotation_date,
        client_name: q.client_name,
        quotation_price: q.quotation_price,
        sender_name: q.sender_name || null,
        pool_dimensions: q.pool_dimensions || null,
        pool_type: q.pool_type || null,
        contact_number: q.contact_number,
        contact_number_raw: q.contact_number_raw || null,
        source_status: q.source_status || 'SENT',
        temperature: q.temperature || 'warm',
        priority: q.priority || 'normal',
        app_status: q.app_status || 'New',
        source_present: q.source_present ?? true,
        source_updated_at: q.source_updated_at || q.updated_at,
        archived_at: q.archived_at || null,
        internal_notes: q.internal_notes || null,
        created_at: q.created_at,
        updated_at: q.updated_at,
      };

      let payload = clean;
      if (q.location) {
        payload = { ...clean, location: q.location };
      }

      let { error } = await this.supabase.from('quotations').upsert(payload, { onConflict: 'id' });
      if (error && (error.code === 'PGRST204' || error.message?.includes('location') || error.message?.includes('schema cache'))) {
        const retryRes = await this.supabase.from('quotations').upsert(clean, { onConflict: 'id' });
        error = retryRes.error;
      }
      if (error) {
        console.warn('[Supabase syncQuotation warning]', error.message || error);
      }
    } catch (e: any) {
      console.warn('[Supabase syncQuotation warning]', e?.message || e);
    }
  }

  public async deleteQuotationFromSupabase(id: string) {
    if (!this.supabase || !this.isSupabaseConnected) return;
    try {
      await this.supabase.from('followups').delete().eq('quotation_id', id);
      await this.supabase.from('quotations').delete().eq('id', id);
    } catch (e: any) {
      console.warn('[Supabase deleteQuotation warning]', e?.message || e);
    }
  }

  public async syncFollowUpToSupabase(f: FollowUp) {
    if (!this.supabase || !this.isSupabaseConnected) return;
    try {
      await this.ensureWorkspaceInSupabase(f.workspace_id);
      const clean = {
        id: f.id,
        workspace_id: f.workspace_id,
        quotation_id: f.quotation_id,
        scheduled_date: f.scheduled_date,
        scheduled_time: f.scheduled_time || '10:30',
        type: f.type || 'Call',
        status: f.status || 'Scheduled',
        notes: f.notes || null,
        completed_at: f.completed_at || null,
        outcome: f.outcome || null,
        created_at: f.created_at,
        updated_at: f.updated_at,
      };
      const { error } = await this.supabase.from('followups').upsert(clean, { onConflict: 'id' });
      if (error) {
        console.warn('[Supabase syncFollowUp warning]', error.message || error);
      }
    } catch (e: any) {
      console.warn('[Supabase syncFollowUp warning]', e?.message || e);
    }
  }

  public async deleteFollowUpFromSupabase(id: string) {
    if (!this.supabase || !this.isSupabaseConnected) return;
    try {
      await this.supabase.from('followups').delete().eq('id', id);
    } catch (e: any) {
      console.warn('[Supabase deleteFollowUp warning]', e?.message || e);
    }
  }

  public async syncClientToSupabase(c: Client) {
    if (!this.supabase || !this.isSupabaseConnected) return;
    try {
      await this.ensureWorkspaceInSupabase(c.workspace_id);
      const clean: any = {
        id: c.id,
        workspace_id: c.workspace_id,
        name: c.name,
        phone: c.phone,
        contact_number_raw: c.contact_number_raw || null,
        notes: c.notes || null,
        created_at: c.created_at,
        updated_at: c.updated_at,
      };

      let payload = clean;
      if (c.location) {
        payload = { ...clean, location: c.location };
      }

      let { error } = await this.supabase.from('clients').upsert(payload, { onConflict: 'id' });
      if (error && (error.code === 'PGRST204' || error.message?.includes('location') || error.message?.includes('schema cache'))) {
        const retryRes = await this.supabase.from('clients').upsert(clean, { onConflict: 'id' });
        error = retryRes.error;
      }
      if (error) {
        console.warn('[Supabase syncClient warning]', error.message || error);
      }
    } catch (e: any) {
      console.warn('[Supabase syncClient warning]', e?.message || e);
    }
  }

  public async syncActivityToSupabase(a: Activity) {
    if (!this.supabase || !this.isSupabaseConnected) return;
    try {
      const clean = {
        id: a.id,
        workspace_id: a.workspace_id,
        quotation_id: a.quotation_id || null,
        activity_type: a.activity_type,
        description: a.description,
        metadata: a.metadata || null,
        created_at: a.created_at,
      };
      const { error } = await this.supabase.from('activities').upsert(clean, { onConflict: 'id' });
      if (error) {
        console.warn('[Supabase syncActivity warning]', error.message || error);
      }
    } catch (e: any) {
      console.warn('[Supabase syncActivity warning]', e?.message || e);
    }
  }

  public async syncAllToSupabase(workspaceId = DEFAULT_WORKSPACE_ID) {
    if (!this.supabase || !this.isSupabaseConnected) return;
    try {
      await this.ensureWorkspaceInSupabase(workspaceId);

      // 1. Clients
      const clients = this.store.clients
        .filter((c) => c.workspace_id === workspaceId && !isTrialRecord(c.name, c.phone, c.contact_number_raw))
        .map((c) => ({
          id: c.id,
          workspace_id: c.workspace_id,
          name: c.name,
          phone: c.phone,
          contact_number_raw: c.contact_number_raw || null,
          location: c.location || null,
          notes: c.notes || null,
          created_at: c.created_at,
          updated_at: c.updated_at,
        }));
      if (clients.length > 0) {
        let { error: cErr } = await this.supabase.from('clients').upsert(clients, { onConflict: 'id' });
        if (cErr && (cErr.code === 'PGRST204' || cErr.message?.includes('location'))) {
          const clientsWithoutLoc = clients.map(({ location: _loc, ...rest }) => rest);
          const retryRes = await this.supabase.from('clients').upsert(clientsWithoutLoc, { onConflict: 'id' });
          cErr = retryRes.error;
        }
        if (cErr) {
          console.warn('[Supabase Sync All Clients Warning]', cErr.message || cErr);
        }
      }

      // 2. Quotations
      const quotations = this.store.quotations
        .filter((q) => q.workspace_id === workspaceId && !isTrialRecord(q.client_name, q.contact_number, q.contact_number_raw))
        .map((q) => ({
          id: q.id,
          workspace_id: q.workspace_id,
          source_id: q.source_id,
          client_id: q.client_id,
          quotation_date: q.quotation_date,
          client_name: q.client_name,
          quotation_price: q.quotation_price,
          sender_name: q.sender_name || null,
          pool_dimensions: q.pool_dimensions || null,
          pool_type: q.pool_type || null,
          contact_number: q.contact_number,
          contact_number_raw: q.contact_number_raw || null,
          source_status: q.source_status || 'SENT',
          temperature: q.temperature || 'warm',
          priority: q.priority || 'normal',
          app_status: q.app_status || 'New',
          source_present: q.source_present ?? true,
          source_updated_at: q.source_updated_at || q.updated_at,
          archived_at: q.archived_at || null,
          internal_notes: q.internal_notes || null,
          created_at: q.created_at,
          updated_at: q.updated_at,
        }));
      if (quotations.length > 0) {
        let { error: qErr } = await this.supabase.from('quotations').upsert(quotations, { onConflict: 'id' });
        if (qErr && (qErr.code === 'PGRST204' || qErr.message?.includes('location'))) {
          const quotationsWithoutLoc = quotations.map(({ location: _loc, ...rest }: any) => rest);
          const retryRes = await this.supabase.from('quotations').upsert(quotationsWithoutLoc, { onConflict: 'id' });
          qErr = retryRes.error;
        }
        if (qErr) {
          console.warn('[Supabase Sync All Quotations Warning]', qErr.message || qErr);
        }
      }

      // 3. Followups
      const validQuoteIds = new Set(quotations.map((q) => q.id));
      const followups = this.store.followups
        .filter((f) => f.workspace_id === workspaceId && validQuoteIds.has(f.quotation_id))
        .map((f) => ({
          id: f.id,
          workspace_id: f.workspace_id,
          quotation_id: f.quotation_id,
          scheduled_date: f.scheduled_date,
          scheduled_time: f.scheduled_time || '10:30',
          type: f.type || 'Call',
          status: f.status || 'Scheduled',
          notes: f.notes || null,
          completed_at: f.completed_at || null,
          outcome: f.outcome || null,
          created_at: f.created_at,
          updated_at: f.updated_at,
        }));
      if (followups.length > 0) {
        const { error: fErr } = await this.supabase.from('followups').upsert(followups, { onConflict: 'id' });
        if (fErr) {
          console.warn('[Supabase Sync All Followups Warning]', fErr.message || fErr);
        }
      }

      console.log(`[Supabase] Complete sync to Supabase finished: ${quotations.length} quotes, ${clients.length} clients, ${followups.length} followups.`);
    } catch (err: any) {
      console.warn('[Supabase Sync All Warning]', err?.message || err);
    }
  }

  public async hydrateFromSupabase(workspaceId = DEFAULT_WORKSPACE_ID): Promise<boolean> {
    if (!this.supabase || !this.isSupabaseConnected) {
      return false;
    }
    try {
      const [cRes, qRes, fRes, aRes] = await Promise.all([
        this.supabase.from('clients').select('*').eq('workspace_id', workspaceId),
        this.supabase.from('quotations').select('*').eq('workspace_id', workspaceId),
        this.supabase.from('followups').select('*').eq('workspace_id', workspaceId),
        this.supabase.from('activities').select('*').eq('workspace_id', workspaceId),
      ]);

      if (qRes.data && qRes.data.length > 0) {
        const cleanQuotes = (qRes.data as Quotation[]).filter(
          (q) => !isTrialRecord(q.client_name, q.contact_number, q.contact_number_raw)
        );
        const cleanQuoteIds = new Set(cleanQuotes.map((q) => q.id));
        const cleanClients = ((cRes.data as Client[]) || []).filter(
          (c) => !isTrialRecord(c.name, c.phone, c.contact_number_raw)
        );
        const cleanFollowups = ((fRes.data as FollowUp[]) || []).filter(
          (f) => cleanQuoteIds.has(f.quotation_id)
        );
        const cleanActivities = (aRes.data as Activity[]) || [];

        this.store.quotations = cleanQuotes;
        this.store.clients = cleanClients;
        this.store.followups = cleanFollowups;
        this.store.activities = cleanActivities;
        this.saveStore();
        console.log(`[Supabase] Successfully hydrated ${cleanQuotes.length} quotations, ${cleanClients.length} clients, ${cleanFollowups.length} followups from Supabase.`);
        return true;
      } else if (this.store.quotations.length > 0) {
        console.log('[Supabase] Supabase empty; migrating local store to Supabase...');
        await this.syncAllToSupabase(workspaceId);
        return true;
      }
    } catch (err: any) {
      console.warn('[Supabase Hydration Warning]', err?.message || err);
    }
    return false;
  }

  // --- Settings ---
  public getSettings(workspaceId = DEFAULT_WORKSPACE_ID): WorkspaceSettings {
    let s = this.store.settings.find((item) => item.workspace_id === workspaceId);
    if (!s) {
      s = {
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        sheet_id: process.env.GOOGLE_SHEET_ID || '1ReM-fqeHpFqetNa4vPhfDhk4uapexmKKwwZMGPuJR84',
        sheet_gid: process.env.GOOGLE_SHEET_GID || '0',
        auto_sync_interval: '15m',
        followup_days: '3,7,14,21,30',
        default_time: '10:30',
        updated_at: new Date().toISOString(),
      };
      this.store.settings.push(s);
      this.saveStore();
    }
    return s;
  }

  public updateSettings(
    workspaceId = DEFAULT_WORKSPACE_ID,
    updates: Partial<WorkspaceSettings>
  ): WorkspaceSettings {
    const s = this.getSettings(workspaceId);
    Object.assign(s, updates, { updated_at: new Date().toISOString() });
    this.saveStore();
    return s;
  }

  // --- Clients ---
  public getClients(workspaceId = DEFAULT_WORKSPACE_ID): Client[] {
    const clients = this.store.clients.filter(
      (c) => c.workspace_id === workspaceId && !isTrialRecord(c.name, c.phone, c.contact_number_raw)
    );
    // Enrich with statistics and sort newest quotation first
    return clients
      .map((client) => {
        const quotes = this.store.quotations.filter(
          (q) => q.client_id === client.id && !q.archived_at
        );
        const activeQuotes = quotes.filter((q) =>
          ['New', 'Active', 'In Discussion', 'Waiting for Client', 'On Hold'].includes(q.app_status)
        );
        const totalValue = quotes.reduce((acc, q) => acc + (q.quotation_price || 0), 0);
        return {
          ...client,
          quotations_count: quotes.length,
          active_quotations_count: activeQuotes.length,
          total_quoted_value: totalValue,
        };
      })
      .sort((a, b) => {
        const quotesA = this.store.quotations.filter((q) => q.client_id === a.id);
        const quotesB = this.store.quotations.filter((q) => q.client_id === b.id);
        const latestA = quotesA.reduce((max, q) => q.quotation_date > max ? q.quotation_date : max, '');
        const latestB = quotesB.reduce((max, q) => q.quotation_date > max ? q.quotation_date : max, '');
        if (latestA !== latestB) return latestB.localeCompare(latestA);
        return a.name.localeCompare(b.name);
      });
  }

  public getClientById(id: string, workspaceId = DEFAULT_WORKSPACE_ID): Client | null {
    const client = this.store.clients.find(
      (c) => c.id === id && c.workspace_id === workspaceId && !isTrialRecord(c.name, c.phone, c.contact_number_raw)
    );
    if (!client) return null;
    const quotes = this.store.quotations.filter(
      (q) => q.client_id === client.id && !q.archived_at
    );
    const activeQuotes = quotes.filter((q) =>
      ['New', 'Active', 'In Discussion', 'Waiting for Client', 'On Hold'].includes(q.app_status)
    );
    const totalValue = quotes.reduce((acc, q) => acc + (q.quotation_price || 0), 0);
    return {
      ...client,
      quotations_count: quotes.length,
      active_quotations_count: activeQuotes.length,
      total_quoted_value: totalValue,
    };
  }

  public findClientByPhoneOrName(
    phone: string,
    name: string,
    workspaceId = DEFAULT_WORKSPACE_ID
  ): Client | null {
    // 1. Match normalized phone
    if (phone) {
      const matchPhone = this.store.clients.find(
        (c) => c.workspace_id === workspaceId && c.phone === phone
      );
      if (matchPhone) return matchPhone;
    }
    // 2. Match exact normalized name
    if (name) {
      const cleanName = name.trim().toLowerCase();
      const matchName = this.store.clients.find(
        (c) => c.workspace_id === workspaceId && c.name.trim().toLowerCase() === cleanName
      );
      if (matchName) return matchName;
    }
    return null;
  }

  public upsertClient(
    clientData: {
      name: string;
      phone: string;
      contact_number_raw?: string;
      location?: string | null;
      notes?: string | null;
    },
    workspaceId = DEFAULT_WORKSPACE_ID
  ): Client {
    let client = this.findClientByPhoneOrName(clientData.phone, clientData.name, workspaceId);
    const now = new Date().toISOString();

    if (!client) {
      client = {
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        name: clientData.name,
        phone: clientData.phone,
        contact_number_raw: clientData.contact_number_raw,
        location: clientData.location || null,
        notes: clientData.notes || null,
        created_at: now,
        updated_at: now,
      };
      this.store.clients.push(client);
    } else {
      // Update phone if missing or better
      if (!client.phone && clientData.phone) {
        client.phone = clientData.phone;
      }
      if (clientData.contact_number_raw && !client.contact_number_raw) {
        client.contact_number_raw = clientData.contact_number_raw;
      }
      if (!client.location && clientData.location) {
        client.location = clientData.location;
      }
      client.updated_at = now;
    }
    this.saveStore();
    this.syncClientToSupabase(client);
    return client;
  }

  public updateClientNotes(id: string, notes: string, workspaceId = DEFAULT_WORKSPACE_ID): Client | null {
    const client = this.store.clients.find((c) => c.id === id && c.workspace_id === workspaceId);
    if (!client) return null;
    client.notes = notes;
    client.updated_at = new Date().toISOString();
    this.saveStore();
    this.syncClientToSupabase(client);
    return client;
  }

  public updateClientLocation(id: string, location: string | null, workspaceId = DEFAULT_WORKSPACE_ID): Client | null {
    const client = this.store.clients.find((c) => c.id === id && c.workspace_id === workspaceId);
    if (!client) return null;
    client.location = location;
    client.updated_at = new Date().toISOString();
    this.saveStore();
    this.syncClientToSupabase(client);
    return client;
  }

  public updateClient(
    id: string,
    updates: { notes?: string; location?: string | null },
    workspaceId = DEFAULT_WORKSPACE_ID
  ): Client | null {
    if (updates.notes !== undefined) {
      this.updateClientNotes(id, updates.notes, workspaceId);
    }
    if (updates.location !== undefined) {
      this.updateClientLocation(id, updates.location, workspaceId);
    }
    return this.getClientById(id, workspaceId);
  }

  // --- Quotations ---
  public getQuotations(workspaceId = DEFAULT_WORKSPACE_ID): Quotation[] {
    const today = new Date().toISOString().split('T')[0];
    const quotes = this.store.quotations
      .filter(
        (q) =>
          q.workspace_id === workspaceId &&
          !q.archived_at &&
          !isTrialRecord(q.client_name, q.contact_number, q.contact_number_raw)
      )
      .sort((a, b) => b.quotation_date.localeCompare(a.quotation_date));

    return quotes.map((q) => {
      // Find next future scheduled/due/overdue follow-up
      const followups = this.store.followups
        .filter((f) => f.quotation_id === q.id && ['Scheduled', 'Due', 'Overdue'].includes(f.status))
        .sort((a, b) => (a.scheduled_date + a.scheduled_time).localeCompare(b.scheduled_date + b.scheduled_time));

      // Re-evaluate overdue / due status dynamically based on current date
      const activeFollowups = followups.map((f) => {
        let currentStatus = f.status;
        if (['Scheduled', 'Due', 'Overdue'].includes(currentStatus)) {
          if (f.scheduled_date < today) currentStatus = 'Overdue';
          else if (f.scheduled_date === today) currentStatus = 'Due';
          else currentStatus = 'Scheduled';
        }
        return { ...f, status: currentStatus };
      });

      const completedFollowups = this.store.followups
        .filter((f) => f.quotation_id === q.id && f.status === 'Completed')
        .sort((a, b) => (b.completed_at || b.updated_at).localeCompare(a.completed_at || a.updated_at));

      const latestCompleted = completedFollowups[0] || null;

      const hasActionTaken = Boolean(
        latestCompleted ||
        q.app_status === 'Won' ||
        q.app_status === 'Lost' ||
        q.app_status === 'Cancelled'
      );

      return {
        ...q,
        age_days: calculateQuotationAgeDays(q.quotation_date),
        next_followup: activeFollowups[0] || null,
        latest_completed_followup: latestCompleted,
        has_action_taken: hasActionTaken,
      };
    });
  }

  public getQuotationById(id: string, workspaceId = DEFAULT_WORKSPACE_ID): Quotation | null {
    const q = this.store.quotations.find(
      (item) =>
        item.id === id &&
        item.workspace_id === workspaceId &&
        !isTrialRecord(item.client_name, item.contact_number, item.contact_number_raw)
    );
    if (!q) return null;

    const today = new Date().toISOString().split('T')[0];
    const followups = this.store.followups
      .filter((f) => f.quotation_id === q.id && ['Scheduled', 'Due', 'Overdue'].includes(f.status))
      .sort((a, b) => (a.scheduled_date + a.scheduled_time).localeCompare(b.scheduled_date + b.scheduled_time));

    const nextFollowup = followups[0]
      ? {
          ...followups[0],
          status:
            followups[0].scheduled_date < today
              ? ('Overdue' as const)
              : followups[0].scheduled_date === today
              ? ('Due' as const)
              : ('Scheduled' as const),
        }
      : null;

    return {
      ...q,
      age_days: calculateQuotationAgeDays(q.quotation_date),
      next_followup: nextFollowup,
    };
  }

  public findQuotationBySourceId(sourceId: string, workspaceId = DEFAULT_WORKSPACE_ID): Quotation | null {
    return (
      this.store.quotations.find(
        (q) => q.workspace_id === workspaceId && q.source_id === sourceId
      ) || null
    );
  }

  public insertQuotation(
    data: Omit<Quotation, 'id' | 'created_at' | 'updated_at'>,
    workspaceId = DEFAULT_WORKSPACE_ID
  ): Quotation {
    const now = new Date().toISOString();
    const newQuote: Quotation = {
      ...data,
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      created_at: now,
      updated_at: now,
    };
    this.store.quotations.push(newQuote);
    this.saveStore();
    this.syncQuotationToSupabase(newQuote);

    // Log Activity
    this.addActivity({
      workspace_id: workspaceId,
      quotation_id: newQuote.id,
      activity_type: 'quotation_created',
      description: `Quotation created from Google Sheet for ${newQuote.client_name}`,
      metadata: {
        source_id: newQuote.source_id,
        price: newQuote.quotation_price,
        pool_type: newQuote.pool_type,
      },
    });

    return newQuote;
  }

  public createDirectQuotation(
    quoteData: {
      client_name: string;
      contact_number: string;
      quotation_price: number;
      quotation_date?: string;
      sender_name?: string;
      pool_dimensions?: string;
      pool_type?: string;
      temperature?: Temperature;
      priority?: Priority;
      app_status?: AppStatus;
      internal_notes?: string;
      initial_followup?: {
        scheduled_date: string;
        scheduled_time?: string;
        type?: FollowUpType;
        notes?: string;
      };
    },
    workspaceId = DEFAULT_WORKSPACE_ID
  ): { quotation: Quotation; followup?: FollowUp | null } {
    const normPhone = normalizePhone(quoteData.contact_number);
    const clientPhone = normPhone.display || quoteData.contact_number.trim();

    // Upsert or link Client
    const client = this.upsertClient(
      {
        name: quoteData.client_name.trim(),
        phone: clientPhone,
        contact_number_raw: quoteData.contact_number.trim(),
      },
      workspaceId
    );

    const now = new Date().toISOString();
    const cleanPrice = normalizePrice(quoteData.quotation_price);
    const sourceId = `crm_manual_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const newQuote: Quotation = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      source_id: sourceId,
      client_id: client.id,
      quotation_date: quoteData.quotation_date || now.split('T')[0],
      client_name: quoteData.client_name.trim(),
      quotation_price: cleanPrice,
      sender_name: quoteData.sender_name?.trim() || 'Direct CRM',
      pool_dimensions: quoteData.pool_dimensions?.trim() || '',
      pool_type: quoteData.pool_type?.trim() || 'Swimming Pool',
      contact_number: clientPhone,
      contact_number_raw: quoteData.contact_number.trim(),
      source_status: 'SENT',
      temperature: quoteData.temperature || 'warm',
      priority: quoteData.priority || 'normal',
      app_status: quoteData.app_status || 'New',
      source_present: false, // Direct CRM quotation (not from sheet backend sync)
      source_last_seen_at: now,
      source_updated_at: now,
      internal_notes: quoteData.internal_notes?.trim() || null,
      created_at: now,
      updated_at: now,
    };

    this.store.quotations.push(newQuote);
    this.saveStore();
    this.syncQuotationToSupabase(newQuote);

    // Log Activity
    this.addActivity({
      workspace_id: workspaceId,
      quotation_id: newQuote.id,
      activity_type: 'quotation_created',
      description: `Direct quotation created in CRM for ${newQuote.client_name}`,
      metadata: {
        price: newQuote.quotation_price,
        pool_type: newQuote.pool_type,
        pool_dimensions: newQuote.pool_dimensions,
        is_manual: true,
      },
    });

    let followup: FollowUp | null = null;
    if (quoteData.initial_followup && quoteData.initial_followup.scheduled_date) {
      followup = this.createFollowUp(
        {
          quotation_id: newQuote.id,
          scheduled_date: quoteData.initial_followup.scheduled_date,
          scheduled_time: quoteData.initial_followup.scheduled_time || '10:30',
          type: quoteData.initial_followup.type || 'Call',
          notes: quoteData.initial_followup.notes ? quoteData.initial_followup.notes.trim() : null,
        },
        workspaceId
      );
    }

    return {
      quotation: {
        ...newQuote,
        age_days: calculateQuotationAgeDays(newQuote.quotation_date),
        next_followup: followup,
      },
      followup,
    };
  }

  public updateQuotationSheetFields(
    id: string,
    sheetFields: Partial<
      Pick<
        Quotation,
        | 'quotation_date'
        | 'client_name'
        | 'quotation_price'
        | 'sender_name'
        | 'pool_dimensions'
        | 'pool_type'
        | 'contact_number'
        | 'contact_number_raw'
        | 'source_status'
        | 'source_last_seen_at'
        | 'source_updated_at'
        | 'source_present'
      >
    >,
    workspaceId = DEFAULT_WORKSPACE_ID
  ): { quotation: Quotation; changed: boolean } {
    const quote = this.store.quotations.find(
      (q) => q.id === id && q.workspace_id === workspaceId
    );
    if (!quote) throw new Error('Quotation not found');

    let changed = false;
    const priceChanged =
      sheetFields.quotation_price !== undefined &&
      sheetFields.quotation_price !== quote.quotation_price;
    const oldPrice = quote.quotation_price;

    for (const [key, value] of Object.entries(sheetFields)) {
      if ((quote as any)[key] !== value) {
        (quote as any)[key] = value;
        changed = true;
      }
    }

    if (changed) {
      quote.updated_at = new Date().toISOString();
      this.saveStore();
      this.syncQuotationToSupabase(quote);

      if (priceChanged) {
        this.addActivity({
          workspace_id: workspaceId,
          quotation_id: quote.id,
          activity_type: 'quotation_updated',
          description: `Price updated from Google Sheet: ₹${oldPrice?.toLocaleString('en-IN')} → ₹${quote.quotation_price.toLocaleString('en-IN')}`,
          metadata: { old_price: oldPrice, new_price: quote.quotation_price },
        });
      }
    }

    return { quotation: quote, changed };
  }

  public updateQuotationAppFields(
    id: string,
    updates: {
      temperature?: Temperature;
      priority?: Priority;
      app_status?: AppStatus;
      internal_notes?: string;
      location?: string | null;
    },
    workspaceId = DEFAULT_WORKSPACE_ID
  ): Quotation {
    const quote = this.store.quotations.find(
      (q) => q.id === id && q.workspace_id === workspaceId
    );
    if (!quote) throw new Error('Quotation not found');

    const now = new Date().toISOString();
    if (updates.location !== undefined) {
      quote.location = updates.location;
      if (quote.client_id) {
        const client = this.store.clients.find((c) => c.id === quote.client_id);
        if (client) {
          client.location = updates.location;
          client.updated_at = now;
          this.syncClientToSupabase(client);
        }
      }
    }
    if (updates.temperature && updates.temperature !== quote.temperature) {
      const oldTemp = quote.temperature;
      quote.temperature = updates.temperature;
      this.addActivity({
        workspace_id: workspaceId,
        quotation_id: quote.id,
        activity_type: 'temperature_changed',
        description: `Temperature changed from ${oldTemp} to ${updates.temperature}`,
        metadata: { old: oldTemp, new: updates.temperature },
      });
    }

    if (updates.priority && updates.priority !== quote.priority) {
      const oldPrio = quote.priority;
      quote.priority = updates.priority;
      this.addActivity({
        workspace_id: workspaceId,
        quotation_id: quote.id,
        activity_type: 'priority_changed',
        description: `Priority set to ${updates.priority}`,
        metadata: { old: oldPrio, new: updates.priority },
      });
    }

    if (updates.app_status && updates.app_status !== quote.app_status) {
      const oldStatus = quote.app_status;
      quote.app_status = updates.app_status;
      this.addActivity({
        workspace_id: workspaceId,
        quotation_id: quote.id,
        activity_type: 'status_changed',
        description: `Status changed from ${oldStatus} to ${updates.app_status}`,
        metadata: { old: oldStatus, new: updates.app_status },
      });
    }

    if (updates.internal_notes !== undefined) {
      quote.internal_notes = updates.internal_notes;
      this.addActivity({
        workspace_id: workspaceId,
        quotation_id: quote.id,
        activity_type: 'note_added',
        description: `Internal notes updated`,
      });
    }

    quote.updated_at = now;
    this.saveStore();
    this.syncQuotationToSupabase(quote);
    return quote;
  }

  public updateQuotation(
    id: string,
    updates: Partial<Quotation>,
    workspaceId = DEFAULT_WORKSPACE_ID
  ): Quotation | null {
    const quote = this.store.quotations.find(
      (q) => q.id === id && q.workspace_id === workspaceId
    );
    if (!quote) return null;
    return this.updateQuotationAppFields(
      id,
      {
        temperature: updates.temperature,
        priority: updates.priority,
        app_status: updates.app_status,
        internal_notes: updates.internal_notes || undefined,
        location: updates.location,
      },
      workspaceId
    );
  }

  public archiveQuotation(id: string, workspaceId = DEFAULT_WORKSPACE_ID): Quotation | null {
    const quote = this.store.quotations.find(
      (q) => q.id === id && q.workspace_id === workspaceId
    );
    if (!quote) return null;
    const now = new Date().toISOString();
    quote.archived_at = now;
    quote.updated_at = now;
    this.saveStore();
    this.syncQuotationToSupabase(quote);
    return quote;
  }

  // --- Follow-ups ---
  public getFollowUps(workspaceId = DEFAULT_WORKSPACE_ID): FollowUp[] {
    const today = new Date().toISOString().split('T')[0];
    return this.store.followups
      .filter((f) => {
        if (f.workspace_id !== workspaceId) return false;
        const quote = this.store.quotations.find((q) => q.id === f.quotation_id);
        if (
          !quote ||
          quote.archived_at ||
          isTrialRecord(quote.client_name, quote.contact_number, quote.contact_number_raw)
        ) {
          return false;
        }
        return true;
      })
      .map((f) => {
        let status = f.status;
        if (['Scheduled', 'Due', 'Overdue'].includes(status)) {
          if (f.scheduled_date < today) status = 'Overdue';
          else if (f.scheduled_date === today) status = 'Due';
          else status = 'Scheduled';
        }
        const quote = this.store.quotations.find((q) => q.id === f.quotation_id);
        const calendarEvent = this.getCalendarEventByFollowUpId(f.id, workspaceId);
        return {
          ...f,
          status,
          calendar_event: calendarEvent,
          quotation: quote
            ? {
                client_name: quote.client_name,
                quotation_price: quote.quotation_price,
                pool_type: quote.pool_type,
                pool_dimensions: quote.pool_dimensions,
                contact_number: quote.contact_number,
                temperature: quote.temperature,
                priority: quote.priority,
                app_status: quote.app_status,
                sender_name: quote.sender_name,
                quotation_date: quote.quotation_date,
                location: quote.location || null,
              }
            : undefined,
        };
      })
      .sort((a, b) => {
        const dateA = a.quotation?.quotation_date || '';
        const dateB = b.quotation?.quotation_date || '';
        if (dateA !== dateB) return dateB.localeCompare(dateA);
        return b.scheduled_date.localeCompare(a.scheduled_date);
      });
  }

  public getFollowUpsByQuotationId(quotationId: string, workspaceId = DEFAULT_WORKSPACE_ID): FollowUp[] {
    const quote = this.store.quotations.find((q) => q.id === quotationId);
    if (quote && isTrialRecord(quote.client_name, quote.contact_number, quote.contact_number_raw)) {
      return [];
    }
    const today = new Date().toISOString().split('T')[0];
    return this.store.followups
      .filter((f) => f.workspace_id === workspaceId && f.quotation_id === quotationId)
      .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))
      .map((f) => {
        let status = f.status;
        if (['Scheduled', 'Due', 'Overdue'].includes(status)) {
          if (f.scheduled_date < today) status = 'Overdue';
          else if (f.scheduled_date === today) status = 'Due';
          else status = 'Scheduled';
        }
        const calendarEvent = this.getCalendarEventByFollowUpId(f.id, workspaceId);
        return { ...f, status, calendar_event: calendarEvent };
      });
  }

  public createFollowUp(
    data: {
      quotation_id: string;
      scheduled_date: string;
      scheduled_time?: string;
      type?: FollowUpType;
      notes?: string | null;
    },
    workspaceId = DEFAULT_WORKSPACE_ID
  ): FollowUp {
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const scheduledDate = data.scheduled_date;
    let status: FollowUp['status'] = 'Scheduled';
    if (scheduledDate < today) status = 'Overdue';
    else if (scheduledDate === today) status = 'Due';

    let cleanNotes = data.notes ? data.notes.trim() : null;
    if (cleanNotes) {
      const lower = cleanNotes.toLowerCase();
      if (
        lower === 'initial follow-up for imported quotation' ||
        lower === 'initial follow-up to discuss quote and pool specifications' ||
        lower === 'initial follow-up' ||
        lower === 'batch scheduled follow-up' ||
        lower === 'follow-up date from google sheet' ||
        lower === 'day 3 follow-up' ||
        lower === 'routine follow-up call' ||
        lower === 'none' ||
        lower === 'n/a' ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanNotes) ||
        lower.startsWith('quick scheduled') ||
        lower.startsWith('batch scheduled') ||
        lower.startsWith('initial follow-up for') ||
        lower.startsWith('initial follow up for')
      ) {
        cleanNotes = null;
      }
    }

    const followup: FollowUp = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      quotation_id: data.quotation_id,
      scheduled_date: scheduledDate,
      scheduled_time: data.scheduled_time || '10:30',
      type: data.type || 'Call',
      status,
      notes: cleanNotes,
      created_at: now,
      updated_at: now,
    };

    this.store.followups.push(followup);
    this.saveStore();
    this.syncFollowUpToSupabase(followup);

    this.addActivity({
      workspace_id: workspaceId,
      quotation_id: followup.quotation_id,
      activity_type: 'followup_created',
      description: `Follow-up scheduled for ${followup.scheduled_date} at ${followup.scheduled_time} (${followup.type})`,
      metadata: { followup_id: followup.id, date: followup.scheduled_date, type: followup.type },
    });

    return followup;
  }

  public completeFollowUp(
    followupId: string,
    data: {
      outcome: FollowUpOutcome;
      notes?: string;
      nextAction?: {
        type: 'tomorrow' | '3_days' | '7_days' | 'custom' | 'none';
        customDate?: string;
        customTime?: string;
        followupType?: FollowUpType;
      };
    },
    workspaceId = DEFAULT_WORKSPACE_ID
  ): { completed: FollowUp; nextFollowup: FollowUp | null } {
    const followup = this.store.followups.find(
      (f) => f.id === followupId && f.workspace_id === workspaceId
    );
    if (!followup) throw new Error('Follow-up not found');

    const now = new Date().toISOString();
    followup.status = 'Completed';
    followup.outcome = data.outcome;
    followup.notes = data.notes || followup.notes;
    followup.completed_at = now;
    followup.updated_at = now;

    this.addActivity({
      workspace_id: workspaceId,
      quotation_id: followup.quotation_id,
      activity_type: 'followup_completed',
      description: `Follow-up completed: ${data.outcome}${data.notes ? ` — "${data.notes}"` : ''}`,
      metadata: {
        followup_id: followup.id,
        outcome: data.outcome,
        notes: data.notes,
      },
    });

    let nextFollowup: FollowUp | null = null;

    if (data.nextAction && data.nextAction.type !== 'none') {
      const targetDate = new Date();
      if (data.nextAction.type === 'tomorrow') {
        targetDate.setDate(targetDate.getDate() + 1);
      } else if (data.nextAction.type === '3_days') {
        targetDate.setDate(targetDate.getDate() + 3);
      } else if (data.nextAction.type === '7_days') {
        targetDate.setDate(targetDate.getDate() + 7);
      } else if (data.nextAction.type === 'custom' && data.nextAction.customDate) {
        const parsed = new Date(data.nextAction.customDate);
        if (!isNaN(parsed.getTime())) {
          targetDate.setTime(parsed.getTime());
        }
      }

      const nextDateStr = targetDate.toISOString().split('T')[0];
      nextFollowup = this.createFollowUp(
        {
          quotation_id: followup.quotation_id,
          scheduled_date: nextDateStr,
          scheduled_time: data.nextAction.customTime || '10:30',
          type: data.nextAction.followupType || followup.type,
          notes: data.notes ? `Follow-up after outcome: ${data.outcome}` : undefined,
        },
        workspaceId
      );
    }

    const quote = this.store.quotations.find((q) => q.id === followup.quotation_id && q.workspace_id === workspaceId);
    if (quote) {
      if (data.outcome === 'Not interested') {
        quote.app_status = 'Lost';
        quote.temperature = 'cold';
      }
      quote.updated_at = now;
      this.syncQuotationToSupabase(quote);
    }

    this.saveStore();
    this.syncFollowUpToSupabase(followup);
    if (nextFollowup) {
      this.syncFollowUpToSupabase(nextFollowup);
    }
    return {
      completed: {
        ...followup,
        calendar_event: this.getCalendarEventByFollowUpId(followup.id, workspaceId),
      },
      nextFollowup: nextFollowup
        ? {
            ...nextFollowup,
            calendar_event: this.getCalendarEventByFollowUpId(nextFollowup.id, workspaceId),
          }
        : null,
    };
  }

  public rescheduleFollowUp(
    followupId: string,
    newDate: string,
    newTime = '10:30',
    notes?: string,
    workspaceId = DEFAULT_WORKSPACE_ID
  ): FollowUp {
    const followup = this.store.followups.find(
      (f) => f.id === followupId && f.workspace_id === workspaceId
    );
    if (!followup) throw new Error('Follow-up not found');

    const originalDate = followup.scheduled_date;
    const originalTime = followup.scheduled_time;
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    let status: FollowUp['status'] = 'Scheduled';
    if (newDate < today) status = 'Overdue';
    else if (newDate === today) status = 'Due';

    followup.scheduled_date = newDate;
    followup.scheduled_time = newTime;
    followup.status = status;
    followup.updated_at = now;
    if (notes) {
      followup.notes = notes;
    }

    this.addActivity({
      workspace_id: workspaceId,
      quotation_id: followup.quotation_id,
      activity_type: 'followup_rescheduled',
      description: `Follow-up rescheduled from ${originalDate} ${originalTime} to ${newDate} ${newTime}`,
      metadata: {
        original_date: originalDate,
        new_date: newDate,
        original_time: originalTime,
        new_time: newTime,
      },
    });

    this.saveStore();
    this.syncFollowUpToSupabase(followup);
    return {
      ...followup,
      calendar_event: this.getCalendarEventByFollowUpId(followup.id, workspaceId),
    };
  }

  public logQuotationAction(
    quotationId: string,
    actionData: {
      type?: FollowUpType;
      outcome?: FollowUpOutcome;
      notes?: string;
      app_status?: AppStatus;
    },
    workspaceId = DEFAULT_WORKSPACE_ID
  ): { followup: FollowUp; quotation: Quotation } {
    const quote = this.store.quotations.find(
      (q) => q.id === quotationId && q.workspace_id === workspaceId
    );
    if (!quote) throw new Error('Quotation not found');

    const now = new Date().toISOString();
    const today = now.split('T')[0];

    const followup: FollowUp = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      quotation_id: quotationId,
      scheduled_date: today,
      scheduled_time: '10:30',
      type: actionData.type || 'Call',
      status: 'Completed',
      outcome: actionData.outcome || 'Spoke to client',
      notes: actionData.notes || `Action recorded (${actionData.type || 'Call'})`,
      completed_at: now,
      created_at: now,
      updated_at: now,
    };

    this.store.followups.push(followup);

    if (actionData.app_status) {
      quote.app_status = actionData.app_status;
    } else if (actionData.outcome === 'Not interested') {
      quote.app_status = 'Lost';
    }
    quote.updated_at = now;

    this.saveStore();
    this.syncFollowUpToSupabase(followup);
    this.syncQuotationToSupabase(quote);

    this.addActivity({
      workspace_id: workspaceId,
      quotation_id: quotationId,
      activity_type: 'followup_completed',
      description: `Action completed: ${followup.type} - ${followup.outcome}`,
      metadata: { followup_id: followup.id, outcome: followup.outcome },
    });

    return { followup, quotation: quote };
  }

  public cancelFollowUp(followupId: string, workspaceId = DEFAULT_WORKSPACE_ID): FollowUp {
    const followup = this.store.followups.find(
      (f) => f.id === followupId && f.workspace_id === workspaceId
    );
    if (!followup) throw new Error('Follow-up not found');

    followup.status = 'Cancelled';
    followup.updated_at = new Date().toISOString();

    this.addActivity({
      workspace_id: workspaceId,
      quotation_id: followup.quotation_id,
      activity_type: 'followup_cancelled',
      description: `Follow-up cancelled for ${followup.scheduled_date}`,
      metadata: { followup_id: followup.id },
    });

    this.saveStore();
    this.syncFollowUpToSupabase(followup);
    return {
      ...followup,
      calendar_event: this.getCalendarEventByFollowUpId(followup.id, workspaceId),
    };
  }

  public deleteFollowUp(followupId: string, workspaceId = DEFAULT_WORKSPACE_ID): boolean {
    const idx = this.store.followups.findIndex((f) => f.id === followupId && f.workspace_id === workspaceId);
    if (idx !== -1) {
      this.store.followups.splice(idx, 1);
      this.saveStore();
      this.deleteFollowUpFromSupabase(followupId);
      return true;
    }
    return false;
  }

  public deleteQuotation(quotationId: string, workspaceId = DEFAULT_WORKSPACE_ID): boolean {
    const idx = this.store.quotations.findIndex((q) => q.id === quotationId && q.workspace_id === workspaceId);
    if (idx !== -1) {
      this.store.quotations.splice(idx, 1);
      this.store.followups = this.store.followups.filter((f) => f.quotation_id !== quotationId);
      this.store.activities = this.store.activities.filter((a) => a.quotation_id !== quotationId);
      this.saveStore();
      this.deleteQuotationFromSupabase(quotationId);
      return true;
    }
    return false;
  }

  public deleteClient(clientId: string, workspaceId = DEFAULT_WORKSPACE_ID): boolean {
    const idx = this.store.clients.findIndex((c) => c.id === clientId && c.workspace_id === workspaceId);
    if (idx !== -1) {
      this.store.clients.splice(idx, 1);
      this.saveStore();
      return true;
    }
    return false;
  }

  public purgeTrialRecords(workspaceId = DEFAULT_WORKSPACE_ID): { purgedQuotations: number; purgedClients: number } {
    const trialQuoteIds = new Set(
      this.store.quotations
        .filter((q) => q.workspace_id === workspaceId && isTrialRecord(q.client_name, q.contact_number, q.contact_number_raw))
        .map((q) => q.id)
    );
    const trialClientIds = new Set(
      this.store.clients
        .filter((c) => c.workspace_id === workspaceId && isTrialRecord(c.name, c.phone, c.contact_number_raw))
        .map((c) => c.id)
    );

    this.store.quotations = this.store.quotations.filter((q) => !trialQuoteIds.has(q.id));
    this.store.followups = this.store.followups.filter((f) => !trialQuoteIds.has(f.quotation_id));
    this.store.activities = this.store.activities.filter((a) => !a.quotation_id || !trialQuoteIds.has(a.quotation_id));
    this.store.clients = this.store.clients.filter((c) => !trialClientIds.has(c.id));

    this.saveStore();
    return { purgedQuotations: trialQuoteIds.size, purgedClients: trialClientIds.size };
  }

  // --- Activities ---
  public addActivity(activity: Omit<Activity, 'id' | 'created_at'>): Activity {
    const act: Activity = {
      ...activity,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    this.store.activities.push(act);
    this.saveStore();
    this.syncActivityToSupabase(act);
    return act;
  }

  public getActivitiesByQuotationId(
    quotationId: string,
    workspaceId = DEFAULT_WORKSPACE_ID
  ): Activity[] {
    return this.store.activities
      .filter((a) => a.workspace_id === workspaceId && a.quotation_id === quotationId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  public getAllActivities(workspaceId = DEFAULT_WORKSPACE_ID, limit = 50): Activity[] {
    return this.store.activities
      .filter((a) => a.workspace_id === workspaceId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  public getActivities(
    workspaceId = DEFAULT_WORKSPACE_ID,
    quotationId?: string,
    limit = 50
  ): Activity[] {
    if (quotationId) {
      return this.getActivitiesByQuotationId(quotationId, workspaceId);
    }
    return this.getAllActivities(workspaceId, limit);
  }

  // --- Sync Runs ---
  public createSyncRun(workspaceId = DEFAULT_WORKSPACE_ID): SyncRun {
    const run: SyncRun = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      started_at: new Date().toISOString(),
      rows_found: 0,
      records_created: 0,
      records_updated: 0,
      records_unchanged: 0,
      records_failed: 0,
      status: 'running',
    };
    this.store.sync_runs.unshift(run);
    // Keep max 50 runs in history
    if (this.store.sync_runs.length > 50) {
      this.store.sync_runs = this.store.sync_runs.slice(0, 50);
    }
    this.saveStore();
    return run;
  }

  public updateSyncRun(
    id: string,
    updates: Partial<SyncRun>,
    workspaceId = DEFAULT_WORKSPACE_ID
  ): SyncRun {
    const run = this.store.sync_runs.find(
      (r) => r.id === id && r.workspace_id === workspaceId
    );
    if (!run) throw new Error('Sync run not found');
    Object.assign(run, updates);
    this.saveStore();
    return run;
  }

  public getLatestSyncRun(workspaceId = DEFAULT_WORKSPACE_ID): SyncRun | null {
    return this.store.sync_runs.find((r) => r.workspace_id === workspaceId) || null;
  }

  public getSyncRuns(workspaceId = DEFAULT_WORKSPACE_ID): SyncRun[] {
    return this.store.sync_runs.filter((r) => r.workspace_id === workspaceId);
  }

  public getSyncStatus(workspaceId = DEFAULT_WORKSPACE_ID) {
    const latest = this.getLatestSyncRun(workspaceId);
    const settings = this.getSettings(workspaceId);
    return {
      latestRun: latest,
      status: latest?.status || 'idle',
      lastSyncedAt: latest?.completed_at || latest?.started_at || null,
      autoSyncInterval: settings.auto_sync_interval,
    };
  }

  public getSyncHistory(workspaceId = DEFAULT_WORKSPACE_ID): SyncRun[] {
    return this.getSyncRuns(workspaceId);
  }

  // --- Calendar Events ---
  public getCalendarEvents(workspaceId = DEFAULT_WORKSPACE_ID): CalendarEvent[] {
    return (this.store.calendar_events || []).filter((e) => e.workspace_id === workspaceId);
  }

  public getCalendarEventByFollowUpId(
    followupId: string,
    workspaceId = DEFAULT_WORKSPACE_ID
  ): CalendarEvent | null {
    return (
      (this.store.calendar_events || []).find(
        (e) => e.workspace_id === workspaceId && e.followup_id === followupId
      ) || null
    );
  }

  public upsertCalendarEvent(
    data: {
      followup_id: string;
      provider?: CalendarProvider;
      external_event_id?: string | null;
      calendar_id?: string | null;
      status?: 'active' | 'cancelled' | 'updated';
      start_at: string;
      end_at: string;
      html_link?: string | null;
    },
    workspaceId = DEFAULT_WORKSPACE_ID
  ): CalendarEvent {
    this.store.calendar_events = this.store.calendar_events || [];
    const existingIndex = this.store.calendar_events.findIndex(
      (e) => e.workspace_id === workspaceId && e.followup_id === data.followup_id
    );

    const now = new Date().toISOString();
    if (existingIndex >= 0) {
      const existing = this.store.calendar_events[existingIndex];
      const updated: CalendarEvent = {
        ...existing,
        provider: data.provider || existing.provider,
        external_event_id: data.external_event_id !== undefined ? data.external_event_id : existing.external_event_id,
        calendar_id: data.calendar_id !== undefined ? data.calendar_id : existing.calendar_id,
        status: data.status || 'updated',
        start_at: data.start_at || existing.start_at,
        end_at: data.end_at || existing.end_at,
        html_link: data.html_link !== undefined ? data.html_link : existing.html_link,
        updated_at: now,
      };
      this.store.calendar_events[existingIndex] = updated;
      this.saveStore();
      return updated;
    }

    const newEvent: CalendarEvent = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      followup_id: data.followup_id,
      provider: data.provider || 'google',
      external_event_id: data.external_event_id || null,
      calendar_id: data.calendar_id || 'primary',
      status: data.status || 'active',
      start_at: data.start_at,
      end_at: data.end_at,
      html_link: data.html_link || null,
      created_at: now,
      updated_at: now,
    };
    this.store.calendar_events.push(newEvent);
    this.saveStore();
    return newEvent;
  }

  public deleteCalendarEvent(
    followupId: string,
    workspaceId = DEFAULT_WORKSPACE_ID
  ): boolean {
    if (!this.store.calendar_events) return false;
    const initialLen = this.store.calendar_events.length;
    this.store.calendar_events = this.store.calendar_events.filter(
      (e) => !(e.workspace_id === workspaceId && e.followup_id === followupId)
    );
    if (this.store.calendar_events.length !== initialLen) {
      this.saveStore();
      return true;
    }
    return false;
  }

  // --- Bulk Operations ---
  public bulkAssignFollowUps(
    followupIds: string[],
    senderName: string,
    workspaceId = DEFAULT_WORKSPACE_ID
  ): { updatedCount: number } {
    let count = 0;
    const now = new Date().toISOString();
    for (const fId of followupIds) {
      const followup = this.store.followups.find((f) => f.id === fId && f.workspace_id === workspaceId);
      if (followup) {
        const quotation = this.store.quotations.find((q) => q.id === followup.quotation_id);
        if (quotation) {
          quotation.sender_name = senderName;
          quotation.updated_at = now;
          this.addActivity({
            workspace_id: workspaceId,
            quotation_id: quotation.id,
            activity_type: 'priority_changed',
            description: `Lead re-assigned to ${senderName} in bulk`,
            metadata: { assigned_to: senderName },
          });
          count++;
        }
      }
    }
    if (count > 0) this.saveStore();
    return { updatedCount: count };
  }

  public bulkRescheduleFollowUps(
    followupIds: string[],
    scheduledDate: string,
    notes?: string,
    workspaceId = DEFAULT_WORKSPACE_ID
  ): { updatedCount: number } {
    let count = 0;
    for (const fId of followupIds) {
      try {
        this.rescheduleFollowUp(fId, scheduledDate, '10:30', notes, workspaceId);
        count++;
      } catch (e) {
        console.error(`Failed to bulk reschedule ${fId}:`, e);
      }
    }
    return { updatedCount: count };
  }

  // --- Complete Backup / Export ---
  public getFullBackup(workspaceId = DEFAULT_WORKSPACE_ID) {
    return {
      exported_at: new Date().toISOString(),
      workspace_id: workspaceId,
      quotations: this.store.quotations.filter((q) => q.workspace_id === workspaceId),
      clients: this.store.clients.filter((c) => c.workspace_id === workspaceId),
      followups: this.store.followups.filter((f) => f.workspace_id === workspaceId),
      activities: this.store.activities.filter((a) => a.workspace_id === workspaceId),
      settings: this.getSettings(workspaceId),
      sync_runs: this.store.sync_runs.filter((r) => r.workspace_id === workspaceId),
    };
  }
}

export const db = new Database();
