// server/app.ts
import express from "express";

// server/db.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// server/normalizer.ts
function normalizePhone(raw) {
  const rawStr = String(raw || "").trim();
  const digits = rawStr.replace(/\D/g, "");
  let normalized = "";
  let digitsOnly = "";
  if (digits.length === 10) {
    normalized = `+91${digits}`;
    digitsOnly = `91${digits}`;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    normalized = `+91${digits.slice(1)}`;
    digitsOnly = `91${digits.slice(1)}`;
  } else if (digits.length === 12 && digits.startsWith("91")) {
    normalized = `+${digits}`;
    digitsOnly = digits;
  } else if (digits.length > 0) {
    normalized = rawStr.startsWith("+") ? `+${digits}` : `+91${digits.slice(-10)}`;
    digitsOnly = normalized.replace(/\D/g, "");
  } else {
    normalized = "";
    digitsOnly = "";
  }
  let display = normalized;
  if (normalized.startsWith("+91") && normalized.length === 13) {
    display = `+91 ${normalized.slice(3)}`;
  }
  return {
    raw: rawStr,
    normalized,
    display,
    digitsOnly
  };
}
function normalizePrice(raw) {
  if (typeof raw === "number") {
    return isNaN(raw) ? 0 : Math.round(raw);
  }
  const clean = String(raw || "").replace(/[₹,$\s]/g, "").trim();
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : Math.round(parsed);
}
function formatIndianCurrency(amount) {
  if (isNaN(amount) || amount === null || amount === void 0) return "\u20B90";
  const isNegative = amount < 0;
  const abs = Math.abs(Math.round(amount));
  const s = abs.toString();
  if (s.length <= 3) {
    return `${isNegative ? "-" : ""}\u20B9${s}`;
  }
  const lastThree = s.substring(s.length - 3);
  const otherNumbers = s.substring(0, s.length - 3);
  const formattedOther = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${isNegative ? "-" : ""}\u20B9${formattedOther},${lastThree}`;
}
function normalizeDate(raw) {
  if (!raw) {
    return (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  }
  const str = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  const slashParts = str.split("/");
  if (slashParts.length === 3) {
    let [m, d, y] = slashParts;
    if (y.length === 2) y = `20${y}`;
    const mm = m.padStart(2, "0");
    const dd = d.padStart(2, "0");
    const mNum = parseInt(m, 10);
    const dNum = parseInt(d, 10);
    if (mNum > 12 && dNum <= 12) {
      return `${y}-${d.padStart(2, "0")}-${m.padStart(2, "0")}`;
    }
    return `${y}-${mm}-${dd}`;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }
  return (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
}
function normalizeText(raw) {
  return String(raw || "").trim();
}
function isTrialRecord(name, phone, rawPhone) {
  if (name) {
    const lower = name.toLowerCase();
    if (lower.includes("valued client") || lower.includes("trial") || lower.includes("test client") || lower.trim() === "test") {
      return true;
    }
  }
  const clean = (val) => val ? String(val).replace(/\D/g, "") : "";
  if (clean(phone).includes("9650081896") || clean(rawPhone).includes("9650081896")) {
    return true;
  }
  return false;
}
function calculateQuotationAgeDays(quotationDateStr) {
  try {
    const qDate = new Date(quotationDateStr);
    const today = /* @__PURE__ */ new Date();
    qDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - qDate.getTime();
    const diffDays = Math.floor(diffTime / (1e3 * 60 * 60 * 24));
    return diffDays >= 0 ? diffDays : 0;
  } catch {
    return 0;
  }
}

// server/db.ts
var DATA_DIR = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME ? path.join("/tmp", ".data") : path.join(process.cwd(), ".data");
var DB_FILE = path.join(DATA_DIR, "db.json");
var DEFAULT_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";
var Database = class {
  constructor() {
    this.supabase = null;
    this.isSupabaseConnected = false;
    this.store = this.loadStore();
    this.initSupabase();
  }
  loadStore() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const data = fs.readFileSync(DB_FILE, "utf-8");
        const store = JSON.parse(data);
        const trialQuoteIds = new Set(
          (store.quotations || []).filter((q) => isTrialRecord(q.client_name, q.contact_number, q.contact_number_raw)).map((q) => q.id)
        );
        const trialClientIds = new Set(
          (store.clients || []).filter((c) => isTrialRecord(c.name, c.phone, c.contact_number_raw)).map((c) => c.id)
        );
        let storeNeedsSave = false;
        if (trialQuoteIds.size > 0 || trialClientIds.size > 0) {
          store.quotations = (store.quotations || []).filter((q) => !trialQuoteIds.has(q.id));
          store.followups = (store.followups || []).filter((f) => !trialQuoteIds.has(f.quotation_id));
          store.activities = (store.activities || []).filter((a) => !a.quotation_id || !trialQuoteIds.has(a.quotation_id));
          store.clients = (store.clients || []).filter((c) => !trialClientIds.has(c.id));
          storeNeedsSave = true;
        }
        if (store.followups && store.followups.length > 0) {
          const initialFollowupLen = store.followups.length;
          const completedByQuote = /* @__PURE__ */ new Map();
          for (const f of store.followups) {
            if (f.status === "Completed") {
              const list = completedByQuote.get(f.quotation_id) || [];
              list.push(f.scheduled_date);
              completedByQuote.set(f.quotation_id, list);
            }
          }
          store.followups = store.followups.filter((f) => {
            if (["Overdue", "Due"].includes(f.status)) {
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
        }
        if (storeNeedsSave) {
          this.saveStore(store);
        }
        store.calendar_events = store.calendar_events || [];
        return store;
      }
    } catch (e) {
      console.error("Error loading DB file, initializing fresh store:", e);
    }
    const initial = {
      workspaces: [
        {
          id: DEFAULT_WORKSPACE_ID,
          name: "Main Workspace",
          created_at: (/* @__PURE__ */ new Date()).toISOString(),
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }
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
          sheet_id: process.env.GOOGLE_SHEET_ID || "1ReM-fqeHpFqetNa4vPhfDhk4uapexmKKwwZMGPuJR84",
          sheet_gid: process.env.GOOGLE_SHEET_GID || "0",
          auto_sync_interval: "15m",
          followup_days: "3,7,14,21,30",
          default_time: "10:30",
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }
      ],
      calendar_events: []
    };
    this.saveStore(initial);
    return initial;
  }
  saveStore(storeToSave) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(storeToSave || this.store, null, 2), "utf-8");
    } catch (e) {
      console.error("Failed to write database file:", e);
    }
  }
  initSupabase(url, key) {
    const supabaseUrl = url || process.env.SUPABASE_URL;
    const supabaseKey = key || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey && supabaseUrl.startsWith("http")) {
      try {
        this.supabase = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false }
        });
        this.isSupabaseConnected = true;
        console.log("Supabase client initialized with URL:", supabaseUrl);
      } catch (err) {
        console.warn("Failed to initialize Supabase client:", err);
        this.isSupabaseConnected = false;
        this.supabase = null;
      }
    } else {
      this.isSupabaseConnected = false;
      this.supabase = null;
    }
  }
  getSupabaseStatus() {
    return {
      connected: this.isSupabaseConnected,
      url: process.env.SUPABASE_URL || null,
      hasKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)
    };
  }
  async ensureWorkspaceInSupabase(workspaceId = DEFAULT_WORKSPACE_ID) {
    if (!this.supabase || !this.isSupabaseConnected) return;
    try {
      await this.supabase.from("workspaces").upsert(
        {
          id: workspaceId,
          name: "Main Workspace",
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        },
        { onConflict: "id" }
      );
    } catch (e) {
      console.warn("[Supabase ensureWorkspace warning]", e);
    }
  }
  async syncQuotationToSupabase(q) {
    if (!this.supabase || !this.isSupabaseConnected) return;
    try {
      await this.ensureWorkspaceInSupabase(q.workspace_id);
      const clean = {
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
        source_status: q.source_status || "SENT",
        temperature: q.temperature || "warm",
        priority: q.priority || "normal",
        app_status: q.app_status || "New",
        source_present: q.source_present ?? true,
        source_updated_at: q.source_updated_at || q.updated_at,
        archived_at: q.archived_at || null,
        internal_notes: q.internal_notes || null,
        created_at: q.created_at,
        updated_at: q.updated_at
      };
      let payload = clean;
      if (q.location) {
        payload = { ...clean, location: q.location };
      }
      let { error } = await this.supabase.from("quotations").upsert(payload, { onConflict: "id" });
      if (error && (error.code === "PGRST204" || error.message?.includes("location") || error.message?.includes("schema cache"))) {
        const retryRes = await this.supabase.from("quotations").upsert(clean, { onConflict: "id" });
        error = retryRes.error;
      }
      if (error) {
        console.warn("[Supabase syncQuotation warning]", error.message || error);
      }
    } catch (e) {
      console.warn("[Supabase syncQuotation warning]", e?.message || e);
    }
  }
  async deleteQuotationFromSupabase(id) {
    if (!this.supabase || !this.isSupabaseConnected) return;
    try {
      await this.supabase.from("followups").delete().eq("quotation_id", id);
      await this.supabase.from("quotations").delete().eq("id", id);
    } catch (e) {
      console.warn("[Supabase deleteQuotation warning]", e?.message || e);
    }
  }
  async syncFollowUpToSupabase(f) {
    if (!this.supabase || !this.isSupabaseConnected) return;
    try {
      await this.ensureWorkspaceInSupabase(f.workspace_id);
      const clean = {
        id: f.id,
        workspace_id: f.workspace_id,
        quotation_id: f.quotation_id,
        scheduled_date: f.scheduled_date,
        scheduled_time: f.scheduled_time || "10:30",
        type: f.type || "Call",
        status: f.status || "Scheduled",
        notes: f.notes || null,
        completed_at: f.completed_at || null,
        outcome: f.outcome || null,
        created_at: f.created_at,
        updated_at: f.updated_at
      };
      const { error } = await this.supabase.from("followups").upsert(clean, { onConflict: "id" });
      if (error) {
        console.warn("[Supabase syncFollowUp warning]", error.message || error);
      }
    } catch (e) {
      console.warn("[Supabase syncFollowUp warning]", e?.message || e);
    }
  }
  async deleteFollowUpFromSupabase(id) {
    if (!this.supabase || !this.isSupabaseConnected) return;
    try {
      await this.supabase.from("followups").delete().eq("id", id);
    } catch (e) {
      console.warn("[Supabase deleteFollowUp warning]", e?.message || e);
    }
  }
  async syncClientToSupabase(c) {
    if (!this.supabase || !this.isSupabaseConnected) return;
    try {
      await this.ensureWorkspaceInSupabase(c.workspace_id);
      const clean = {
        id: c.id,
        workspace_id: c.workspace_id,
        name: c.name,
        phone: c.phone,
        contact_number_raw: c.contact_number_raw || null,
        notes: c.notes || null,
        created_at: c.created_at,
        updated_at: c.updated_at
      };
      let payload = clean;
      if (c.location) {
        payload = { ...clean, location: c.location };
      }
      let { error } = await this.supabase.from("clients").upsert(payload, { onConflict: "id" });
      if (error && (error.code === "PGRST204" || error.message?.includes("location") || error.message?.includes("schema cache"))) {
        const retryRes = await this.supabase.from("clients").upsert(clean, { onConflict: "id" });
        error = retryRes.error;
      }
      if (error) {
        console.warn("[Supabase syncClient warning]", error.message || error);
      }
    } catch (e) {
      console.warn("[Supabase syncClient warning]", e?.message || e);
    }
  }
  async syncActivityToSupabase(a) {
    if (!this.supabase || !this.isSupabaseConnected) return;
    try {
      const clean = {
        id: a.id,
        workspace_id: a.workspace_id,
        quotation_id: a.quotation_id || null,
        activity_type: a.activity_type,
        description: a.description,
        metadata: a.metadata || null,
        created_at: a.created_at
      };
      const { error } = await this.supabase.from("activities").upsert(clean, { onConflict: "id" });
      if (error) {
        console.warn("[Supabase syncActivity warning]", error.message || error);
      }
    } catch (e) {
      console.warn("[Supabase syncActivity warning]", e?.message || e);
    }
  }
  async syncAllToSupabase(workspaceId = DEFAULT_WORKSPACE_ID) {
    if (!this.supabase || !this.isSupabaseConnected) return;
    try {
      await this.ensureWorkspaceInSupabase(workspaceId);
      const clients = this.store.clients.filter((c) => c.workspace_id === workspaceId && !isTrialRecord(c.name, c.phone, c.contact_number_raw)).map((c) => ({
        id: c.id,
        workspace_id: c.workspace_id,
        name: c.name,
        phone: c.phone,
        contact_number_raw: c.contact_number_raw || null,
        location: c.location || null,
        notes: c.notes || null,
        created_at: c.created_at,
        updated_at: c.updated_at
      }));
      if (clients.length > 0) {
        let { error: cErr } = await this.supabase.from("clients").upsert(clients, { onConflict: "id" });
        if (cErr && (cErr.code === "PGRST204" || cErr.message?.includes("location"))) {
          const clientsWithoutLoc = clients.map(({ location: _loc, ...rest }) => rest);
          const retryRes = await this.supabase.from("clients").upsert(clientsWithoutLoc, { onConflict: "id" });
          cErr = retryRes.error;
        }
        if (cErr) {
          console.warn("[Supabase Sync All Clients Warning]", cErr.message || cErr);
        }
      }
      const quotations = this.store.quotations.filter((q) => q.workspace_id === workspaceId && !isTrialRecord(q.client_name, q.contact_number, q.contact_number_raw)).map((q) => ({
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
        source_status: q.source_status || "SENT",
        temperature: q.temperature || "warm",
        priority: q.priority || "normal",
        app_status: q.app_status || "New",
        source_present: q.source_present ?? true,
        source_updated_at: q.source_updated_at || q.updated_at,
        archived_at: q.archived_at || null,
        internal_notes: q.internal_notes || null,
        created_at: q.created_at,
        updated_at: q.updated_at
      }));
      if (quotations.length > 0) {
        let { error: qErr } = await this.supabase.from("quotations").upsert(quotations, { onConflict: "id" });
        if (qErr && (qErr.code === "PGRST204" || qErr.message?.includes("location"))) {
          const quotationsWithoutLoc = quotations.map(({ location: _loc, ...rest }) => rest);
          const retryRes = await this.supabase.from("quotations").upsert(quotationsWithoutLoc, { onConflict: "id" });
          qErr = retryRes.error;
        }
        if (qErr) {
          console.warn("[Supabase Sync All Quotations Warning]", qErr.message || qErr);
        }
      }
      const validQuoteIds = new Set(quotations.map((q) => q.id));
      const followups = this.store.followups.filter((f) => f.workspace_id === workspaceId && validQuoteIds.has(f.quotation_id)).map((f) => ({
        id: f.id,
        workspace_id: f.workspace_id,
        quotation_id: f.quotation_id,
        scheduled_date: f.scheduled_date,
        scheduled_time: f.scheduled_time || "10:30",
        type: f.type || "Call",
        status: f.status || "Scheduled",
        notes: f.notes || null,
        completed_at: f.completed_at || null,
        outcome: f.outcome || null,
        created_at: f.created_at,
        updated_at: f.updated_at
      }));
      if (followups.length > 0) {
        const { error: fErr } = await this.supabase.from("followups").upsert(followups, { onConflict: "id" });
        if (fErr) {
          console.warn("[Supabase Sync All Followups Warning]", fErr.message || fErr);
        }
      }
      console.log(`[Supabase] Complete sync to Supabase finished: ${quotations.length} quotes, ${clients.length} clients, ${followups.length} followups.`);
    } catch (err) {
      console.warn("[Supabase Sync All Warning]", err?.message || err);
    }
  }
  async hydrateFromSupabase(workspaceId = DEFAULT_WORKSPACE_ID) {
    if (!this.supabase || !this.isSupabaseConnected) {
      return false;
    }
    try {
      const [cRes, qRes, fRes, aRes] = await Promise.all([
        this.supabase.from("clients").select("*").eq("workspace_id", workspaceId),
        this.supabase.from("quotations").select("*").eq("workspace_id", workspaceId),
        this.supabase.from("followups").select("*").eq("workspace_id", workspaceId),
        this.supabase.from("activities").select("*").eq("workspace_id", workspaceId)
      ]);
      if (qRes.data && qRes.data.length > 0) {
        const cleanQuotes = qRes.data.filter(
          (q) => !isTrialRecord(q.client_name, q.contact_number, q.contact_number_raw)
        );
        const cleanQuoteIds = new Set(cleanQuotes.map((q) => q.id));
        const cleanClients = (cRes.data || []).filter(
          (c) => !isTrialRecord(c.name, c.phone, c.contact_number_raw)
        );
        const cleanFollowups = (fRes.data || []).filter(
          (f) => cleanQuoteIds.has(f.quotation_id)
        );
        const cleanActivities = aRes.data || [];
        this.store.quotations = cleanQuotes;
        this.store.clients = cleanClients;
        this.store.followups = cleanFollowups;
        this.store.activities = cleanActivities;
        this.saveStore();
        console.log(`[Supabase] Successfully hydrated ${cleanQuotes.length} quotations, ${cleanClients.length} clients, ${cleanFollowups.length} followups from Supabase.`);
        return true;
      } else if (this.store.quotations.length > 0) {
        console.log("[Supabase] Supabase empty; migrating local store to Supabase...");
        await this.syncAllToSupabase(workspaceId);
        return true;
      }
    } catch (err) {
      console.warn("[Supabase Hydration Warning]", err?.message || err);
    }
    return false;
  }
  // --- Settings ---
  getSettings(workspaceId = DEFAULT_WORKSPACE_ID) {
    let s = this.store.settings.find((item) => item.workspace_id === workspaceId);
    if (!s) {
      s = {
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        sheet_id: process.env.GOOGLE_SHEET_ID || "1ReM-fqeHpFqetNa4vPhfDhk4uapexmKKwwZMGPuJR84",
        sheet_gid: process.env.GOOGLE_SHEET_GID || "0",
        auto_sync_interval: "15m",
        followup_days: "3,7,14,21,30",
        default_time: "10:30",
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      this.store.settings.push(s);
      this.saveStore();
    }
    return s;
  }
  updateSettings(workspaceId = DEFAULT_WORKSPACE_ID, updates) {
    const s = this.getSettings(workspaceId);
    Object.assign(s, updates, { updated_at: (/* @__PURE__ */ new Date()).toISOString() });
    this.saveStore();
    return s;
  }
  // --- Clients ---
  getClients(workspaceId = DEFAULT_WORKSPACE_ID) {
    const clients = this.store.clients.filter(
      (c) => c.workspace_id === workspaceId && !isTrialRecord(c.name, c.phone, c.contact_number_raw)
    );
    return clients.map((client) => {
      const quotes = this.store.quotations.filter(
        (q) => q.client_id === client.id && !q.archived_at
      );
      const activeQuotes = quotes.filter(
        (q) => ["New", "Active", "In Discussion", "Waiting for Client", "On Hold"].includes(q.app_status)
      );
      const totalValue = quotes.reduce((acc, q) => acc + (q.quotation_price || 0), 0);
      return {
        ...client,
        quotations_count: quotes.length,
        active_quotations_count: activeQuotes.length,
        total_quoted_value: totalValue
      };
    }).sort((a, b) => {
      const quotesA = this.store.quotations.filter((q) => q.client_id === a.id);
      const quotesB = this.store.quotations.filter((q) => q.client_id === b.id);
      const latestA = quotesA.reduce((max, q) => q.quotation_date > max ? q.quotation_date : max, "");
      const latestB = quotesB.reduce((max, q) => q.quotation_date > max ? q.quotation_date : max, "");
      if (latestA !== latestB) return latestB.localeCompare(latestA);
      return a.name.localeCompare(b.name);
    });
  }
  getClientById(id, workspaceId = DEFAULT_WORKSPACE_ID) {
    const client = this.store.clients.find(
      (c) => c.id === id && c.workspace_id === workspaceId && !isTrialRecord(c.name, c.phone, c.contact_number_raw)
    );
    if (!client) return null;
    const quotes = this.store.quotations.filter(
      (q) => q.client_id === client.id && !q.archived_at
    );
    const activeQuotes = quotes.filter(
      (q) => ["New", "Active", "In Discussion", "Waiting for Client", "On Hold"].includes(q.app_status)
    );
    const totalValue = quotes.reduce((acc, q) => acc + (q.quotation_price || 0), 0);
    return {
      ...client,
      quotations_count: quotes.length,
      active_quotations_count: activeQuotes.length,
      total_quoted_value: totalValue
    };
  }
  findClientByPhoneOrName(phone, name, workspaceId = DEFAULT_WORKSPACE_ID) {
    if (phone) {
      const matchPhone = this.store.clients.find(
        (c) => c.workspace_id === workspaceId && c.phone === phone
      );
      if (matchPhone) return matchPhone;
    }
    if (name) {
      const cleanName = name.trim().toLowerCase();
      const matchName = this.store.clients.find(
        (c) => c.workspace_id === workspaceId && c.name.trim().toLowerCase() === cleanName
      );
      if (matchName) return matchName;
    }
    return null;
  }
  upsertClient(clientData, workspaceId = DEFAULT_WORKSPACE_ID) {
    let client = this.findClientByPhoneOrName(clientData.phone, clientData.name, workspaceId);
    const now = (/* @__PURE__ */ new Date()).toISOString();
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
        updated_at: now
      };
      this.store.clients.push(client);
    } else {
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
  updateClientNotes(id, notes, workspaceId = DEFAULT_WORKSPACE_ID) {
    const client = this.store.clients.find((c) => c.id === id && c.workspace_id === workspaceId);
    if (!client) return null;
    client.notes = notes;
    client.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    this.saveStore();
    this.syncClientToSupabase(client);
    return client;
  }
  updateClientLocation(id, location, workspaceId = DEFAULT_WORKSPACE_ID) {
    const client = this.store.clients.find((c) => c.id === id && c.workspace_id === workspaceId);
    if (!client) return null;
    client.location = location;
    client.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    this.saveStore();
    this.syncClientToSupabase(client);
    return client;
  }
  updateClient(id, updates, workspaceId = DEFAULT_WORKSPACE_ID) {
    if (updates.notes !== void 0) {
      this.updateClientNotes(id, updates.notes, workspaceId);
    }
    if (updates.location !== void 0) {
      this.updateClientLocation(id, updates.location, workspaceId);
    }
    return this.getClientById(id, workspaceId);
  }
  // --- Quotations ---
  getQuotations(workspaceId = DEFAULT_WORKSPACE_ID) {
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const quotes = this.store.quotations.filter(
      (q) => q.workspace_id === workspaceId && !q.archived_at && !isTrialRecord(q.client_name, q.contact_number, q.contact_number_raw)
    ).sort((a, b) => b.quotation_date.localeCompare(a.quotation_date));
    return quotes.map((q) => {
      const followups = this.store.followups.filter((f) => f.quotation_id === q.id && ["Scheduled", "Due", "Overdue"].includes(f.status)).sort((a, b) => (a.scheduled_date + a.scheduled_time).localeCompare(b.scheduled_date + b.scheduled_time));
      const activeFollowups = followups.map((f) => {
        let currentStatus = f.status;
        if (["Scheduled", "Due", "Overdue"].includes(currentStatus)) {
          if (f.scheduled_date < today) currentStatus = "Overdue";
          else if (f.scheduled_date === today) currentStatus = "Due";
          else currentStatus = "Scheduled";
        }
        return { ...f, status: currentStatus };
      });
      const completedFollowups = this.store.followups.filter((f) => f.quotation_id === q.id && f.status === "Completed").sort((a, b) => (b.completed_at || b.updated_at).localeCompare(a.completed_at || a.updated_at));
      const latestCompleted = completedFollowups[0] || null;
      const hasActionTaken = Boolean(
        latestCompleted || q.app_status === "Won" || q.app_status === "Lost" || q.app_status === "Cancelled"
      );
      return {
        ...q,
        age_days: calculateQuotationAgeDays(q.quotation_date),
        next_followup: activeFollowups[0] || null,
        latest_completed_followup: latestCompleted,
        has_action_taken: hasActionTaken
      };
    });
  }
  getQuotationById(id, workspaceId = DEFAULT_WORKSPACE_ID) {
    const q = this.store.quotations.find(
      (item) => item.id === id && item.workspace_id === workspaceId && !isTrialRecord(item.client_name, item.contact_number, item.contact_number_raw)
    );
    if (!q) return null;
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const followups = this.store.followups.filter((f) => f.quotation_id === q.id && ["Scheduled", "Due", "Overdue"].includes(f.status)).sort((a, b) => (a.scheduled_date + a.scheduled_time).localeCompare(b.scheduled_date + b.scheduled_time));
    const nextFollowup = followups[0] ? {
      ...followups[0],
      status: followups[0].scheduled_date < today ? "Overdue" : followups[0].scheduled_date === today ? "Due" : "Scheduled"
    } : null;
    return {
      ...q,
      age_days: calculateQuotationAgeDays(q.quotation_date),
      next_followup: nextFollowup
    };
  }
  findQuotationBySourceId(sourceId, workspaceId = DEFAULT_WORKSPACE_ID) {
    return this.store.quotations.find(
      (q) => q.workspace_id === workspaceId && q.source_id === sourceId
    ) || null;
  }
  insertQuotation(data, workspaceId = DEFAULT_WORKSPACE_ID) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const newQuote = {
      ...data,
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      created_at: now,
      updated_at: now
    };
    this.store.quotations.push(newQuote);
    this.saveStore();
    this.syncQuotationToSupabase(newQuote);
    this.addActivity({
      workspace_id: workspaceId,
      quotation_id: newQuote.id,
      activity_type: "quotation_created",
      description: `Quotation created from Google Sheet for ${newQuote.client_name}`,
      metadata: {
        source_id: newQuote.source_id,
        price: newQuote.quotation_price,
        pool_type: newQuote.pool_type
      }
    });
    return newQuote;
  }
  createDirectQuotation(quoteData, workspaceId = DEFAULT_WORKSPACE_ID) {
    const normPhone = normalizePhone(quoteData.contact_number);
    const clientPhone = normPhone.display || quoteData.contact_number.trim();
    const client = this.upsertClient(
      {
        name: quoteData.client_name.trim(),
        phone: clientPhone,
        contact_number_raw: quoteData.contact_number.trim()
      },
      workspaceId
    );
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const cleanPrice = normalizePrice(quoteData.quotation_price);
    const sourceId = `crm_manual_${Date.now()}_${Math.floor(Math.random() * 1e3)}`;
    const newQuote = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      source_id: sourceId,
      client_id: client.id,
      quotation_date: quoteData.quotation_date || now.split("T")[0],
      client_name: quoteData.client_name.trim(),
      quotation_price: cleanPrice,
      sender_name: quoteData.sender_name?.trim() || "Direct CRM",
      pool_dimensions: quoteData.pool_dimensions?.trim() || "",
      pool_type: quoteData.pool_type?.trim() || "Swimming Pool",
      contact_number: clientPhone,
      contact_number_raw: quoteData.contact_number.trim(),
      source_status: "SENT",
      temperature: quoteData.temperature || "warm",
      priority: quoteData.priority || "normal",
      app_status: quoteData.app_status || "New",
      source_present: false,
      // Direct CRM quotation (not from sheet backend sync)
      source_last_seen_at: now,
      source_updated_at: now,
      internal_notes: quoteData.internal_notes?.trim() || null,
      created_at: now,
      updated_at: now
    };
    this.store.quotations.push(newQuote);
    this.saveStore();
    this.syncQuotationToSupabase(newQuote);
    this.addActivity({
      workspace_id: workspaceId,
      quotation_id: newQuote.id,
      activity_type: "quotation_created",
      description: `Direct quotation created in CRM for ${newQuote.client_name}`,
      metadata: {
        price: newQuote.quotation_price,
        pool_type: newQuote.pool_type,
        pool_dimensions: newQuote.pool_dimensions,
        is_manual: true
      }
    });
    let followup = null;
    if (quoteData.initial_followup && quoteData.initial_followup.scheduled_date) {
      followup = this.createFollowUp(
        {
          quotation_id: newQuote.id,
          scheduled_date: quoteData.initial_followup.scheduled_date,
          scheduled_time: quoteData.initial_followup.scheduled_time || "10:30",
          type: quoteData.initial_followup.type || "Call",
          notes: quoteData.initial_followup.notes || "Initial follow-up scheduled with quote creation"
        },
        workspaceId
      );
    }
    return {
      quotation: {
        ...newQuote,
        age_days: calculateQuotationAgeDays(newQuote.quotation_date),
        next_followup: followup
      },
      followup
    };
  }
  updateQuotationSheetFields(id, sheetFields, workspaceId = DEFAULT_WORKSPACE_ID) {
    const quote = this.store.quotations.find(
      (q) => q.id === id && q.workspace_id === workspaceId
    );
    if (!quote) throw new Error("Quotation not found");
    let changed = false;
    const priceChanged = sheetFields.quotation_price !== void 0 && sheetFields.quotation_price !== quote.quotation_price;
    const oldPrice = quote.quotation_price;
    for (const [key, value] of Object.entries(sheetFields)) {
      if (quote[key] !== value) {
        quote[key] = value;
        changed = true;
      }
    }
    if (changed) {
      quote.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      this.saveStore();
      this.syncQuotationToSupabase(quote);
      if (priceChanged) {
        this.addActivity({
          workspace_id: workspaceId,
          quotation_id: quote.id,
          activity_type: "quotation_updated",
          description: `Price updated from Google Sheet: \u20B9${oldPrice?.toLocaleString("en-IN")} \u2192 \u20B9${quote.quotation_price.toLocaleString("en-IN")}`,
          metadata: { old_price: oldPrice, new_price: quote.quotation_price }
        });
      }
    }
    return { quotation: quote, changed };
  }
  updateQuotationAppFields(id, updates, workspaceId = DEFAULT_WORKSPACE_ID) {
    const quote = this.store.quotations.find(
      (q) => q.id === id && q.workspace_id === workspaceId
    );
    if (!quote) throw new Error("Quotation not found");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (updates.location !== void 0) {
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
        activity_type: "temperature_changed",
        description: `Temperature changed from ${oldTemp} to ${updates.temperature}`,
        metadata: { old: oldTemp, new: updates.temperature }
      });
    }
    if (updates.priority && updates.priority !== quote.priority) {
      const oldPrio = quote.priority;
      quote.priority = updates.priority;
      this.addActivity({
        workspace_id: workspaceId,
        quotation_id: quote.id,
        activity_type: "priority_changed",
        description: `Priority set to ${updates.priority}`,
        metadata: { old: oldPrio, new: updates.priority }
      });
    }
    if (updates.app_status && updates.app_status !== quote.app_status) {
      const oldStatus = quote.app_status;
      quote.app_status = updates.app_status;
      this.addActivity({
        workspace_id: workspaceId,
        quotation_id: quote.id,
        activity_type: "status_changed",
        description: `Status changed from ${oldStatus} to ${updates.app_status}`,
        metadata: { old: oldStatus, new: updates.app_status }
      });
    }
    if (updates.internal_notes !== void 0) {
      quote.internal_notes = updates.internal_notes;
      this.addActivity({
        workspace_id: workspaceId,
        quotation_id: quote.id,
        activity_type: "note_added",
        description: `Internal notes updated`
      });
    }
    quote.updated_at = now;
    this.saveStore();
    this.syncQuotationToSupabase(quote);
    return quote;
  }
  updateQuotation(id, updates, workspaceId = DEFAULT_WORKSPACE_ID) {
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
        internal_notes: updates.internal_notes || void 0,
        location: updates.location
      },
      workspaceId
    );
  }
  archiveQuotation(id, workspaceId = DEFAULT_WORKSPACE_ID) {
    const quote = this.store.quotations.find(
      (q) => q.id === id && q.workspace_id === workspaceId
    );
    if (!quote) return null;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    quote.archived_at = now;
    quote.updated_at = now;
    this.saveStore();
    this.syncQuotationToSupabase(quote);
    return quote;
  }
  // --- Follow-ups ---
  getFollowUps(workspaceId = DEFAULT_WORKSPACE_ID) {
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    return this.store.followups.filter((f) => {
      if (f.workspace_id !== workspaceId) return false;
      const quote = this.store.quotations.find((q) => q.id === f.quotation_id);
      if (!quote || quote.archived_at || isTrialRecord(quote.client_name, quote.contact_number, quote.contact_number_raw)) {
        return false;
      }
      return true;
    }).map((f) => {
      let status = f.status;
      if (["Scheduled", "Due", "Overdue"].includes(status)) {
        if (f.scheduled_date < today) status = "Overdue";
        else if (f.scheduled_date === today) status = "Due";
        else status = "Scheduled";
      }
      const quote = this.store.quotations.find((q) => q.id === f.quotation_id);
      const calendarEvent = this.getCalendarEventByFollowUpId(f.id, workspaceId);
      return {
        ...f,
        status,
        calendar_event: calendarEvent,
        quotation: quote ? {
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
          location: quote.location || null
        } : void 0
      };
    }).sort((a, b) => {
      const dateA = a.quotation?.quotation_date || "";
      const dateB = b.quotation?.quotation_date || "";
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return b.scheduled_date.localeCompare(a.scheduled_date);
    });
  }
  getFollowUpsByQuotationId(quotationId, workspaceId = DEFAULT_WORKSPACE_ID) {
    const quote = this.store.quotations.find((q) => q.id === quotationId);
    if (quote && isTrialRecord(quote.client_name, quote.contact_number, quote.contact_number_raw)) {
      return [];
    }
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    return this.store.followups.filter((f) => f.workspace_id === workspaceId && f.quotation_id === quotationId).sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date)).map((f) => {
      let status = f.status;
      if (["Scheduled", "Due", "Overdue"].includes(status)) {
        if (f.scheduled_date < today) status = "Overdue";
        else if (f.scheduled_date === today) status = "Due";
        else status = "Scheduled";
      }
      const calendarEvent = this.getCalendarEventByFollowUpId(f.id, workspaceId);
      return { ...f, status, calendar_event: calendarEvent };
    });
  }
  createFollowUp(data, workspaceId = DEFAULT_WORKSPACE_ID) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const today = now.split("T")[0];
    const scheduledDate = data.scheduled_date;
    let status = "Scheduled";
    if (scheduledDate < today) status = "Overdue";
    else if (scheduledDate === today) status = "Due";
    const followup = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      quotation_id: data.quotation_id,
      scheduled_date: scheduledDate,
      scheduled_time: data.scheduled_time || "10:30",
      type: data.type || "Call",
      status,
      notes: data.notes || null,
      created_at: now,
      updated_at: now
    };
    this.store.followups.push(followup);
    this.saveStore();
    this.syncFollowUpToSupabase(followup);
    this.addActivity({
      workspace_id: workspaceId,
      quotation_id: followup.quotation_id,
      activity_type: "followup_created",
      description: `Follow-up scheduled for ${followup.scheduled_date} at ${followup.scheduled_time} (${followup.type})`,
      metadata: { followup_id: followup.id, date: followup.scheduled_date, type: followup.type }
    });
    return followup;
  }
  completeFollowUp(followupId, data, workspaceId = DEFAULT_WORKSPACE_ID) {
    const followup = this.store.followups.find(
      (f) => f.id === followupId && f.workspace_id === workspaceId
    );
    if (!followup) throw new Error("Follow-up not found");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    followup.status = "Completed";
    followup.outcome = data.outcome;
    followup.notes = data.notes || followup.notes;
    followup.completed_at = now;
    followup.updated_at = now;
    this.addActivity({
      workspace_id: workspaceId,
      quotation_id: followup.quotation_id,
      activity_type: "followup_completed",
      description: `Follow-up completed: ${data.outcome}${data.notes ? ` \u2014 "${data.notes}"` : ""}`,
      metadata: {
        followup_id: followup.id,
        outcome: data.outcome,
        notes: data.notes
      }
    });
    let nextFollowup = null;
    if (data.nextAction && data.nextAction.type !== "none") {
      const targetDate = /* @__PURE__ */ new Date();
      if (data.nextAction.type === "tomorrow") {
        targetDate.setDate(targetDate.getDate() + 1);
      } else if (data.nextAction.type === "3_days") {
        targetDate.setDate(targetDate.getDate() + 3);
      } else if (data.nextAction.type === "7_days") {
        targetDate.setDate(targetDate.getDate() + 7);
      } else if (data.nextAction.type === "custom" && data.nextAction.customDate) {
        const parsed = new Date(data.nextAction.customDate);
        if (!isNaN(parsed.getTime())) {
          targetDate.setTime(parsed.getTime());
        }
      }
      const nextDateStr = targetDate.toISOString().split("T")[0];
      nextFollowup = this.createFollowUp(
        {
          quotation_id: followup.quotation_id,
          scheduled_date: nextDateStr,
          scheduled_time: data.nextAction.customTime || "10:30",
          type: data.nextAction.followupType || followup.type,
          notes: data.notes ? `Follow-up after outcome: ${data.outcome}` : void 0
        },
        workspaceId
      );
    }
    const quote = this.store.quotations.find((q) => q.id === followup.quotation_id && q.workspace_id === workspaceId);
    if (quote) {
      if (data.outcome === "Not interested") {
        quote.app_status = "Lost";
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
        calendar_event: this.getCalendarEventByFollowUpId(followup.id, workspaceId)
      },
      nextFollowup: nextFollowup ? {
        ...nextFollowup,
        calendar_event: this.getCalendarEventByFollowUpId(nextFollowup.id, workspaceId)
      } : null
    };
  }
  rescheduleFollowUp(followupId, newDate, newTime = "10:30", notes, workspaceId = DEFAULT_WORKSPACE_ID) {
    const followup = this.store.followups.find(
      (f) => f.id === followupId && f.workspace_id === workspaceId
    );
    if (!followup) throw new Error("Follow-up not found");
    const originalDate = followup.scheduled_date;
    const originalTime = followup.scheduled_time;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const today = now.split("T")[0];
    let status = "Scheduled";
    if (newDate < today) status = "Overdue";
    else if (newDate === today) status = "Due";
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
      activity_type: "followup_rescheduled",
      description: `Follow-up rescheduled from ${originalDate} ${originalTime} to ${newDate} ${newTime}`,
      metadata: {
        original_date: originalDate,
        new_date: newDate,
        original_time: originalTime,
        new_time: newTime
      }
    });
    this.saveStore();
    this.syncFollowUpToSupabase(followup);
    return {
      ...followup,
      calendar_event: this.getCalendarEventByFollowUpId(followup.id, workspaceId)
    };
  }
  logQuotationAction(quotationId, actionData, workspaceId = DEFAULT_WORKSPACE_ID) {
    const quote = this.store.quotations.find(
      (q) => q.id === quotationId && q.workspace_id === workspaceId
    );
    if (!quote) throw new Error("Quotation not found");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const today = now.split("T")[0];
    const followup = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      quotation_id: quotationId,
      scheduled_date: today,
      scheduled_time: "10:30",
      type: actionData.type || "Call",
      status: "Completed",
      outcome: actionData.outcome || "Spoke to client",
      notes: actionData.notes || `Action recorded (${actionData.type || "Call"})`,
      completed_at: now,
      created_at: now,
      updated_at: now
    };
    this.store.followups.push(followup);
    if (actionData.app_status) {
      quote.app_status = actionData.app_status;
    } else if (actionData.outcome === "Not interested") {
      quote.app_status = "Lost";
    }
    quote.updated_at = now;
    this.saveStore();
    this.syncFollowUpToSupabase(followup);
    this.syncQuotationToSupabase(quote);
    this.addActivity({
      workspace_id: workspaceId,
      quotation_id: quotationId,
      activity_type: "followup_completed",
      description: `Action completed: ${followup.type} - ${followup.outcome}`,
      metadata: { followup_id: followup.id, outcome: followup.outcome }
    });
    return { followup, quotation: quote };
  }
  cancelFollowUp(followupId, workspaceId = DEFAULT_WORKSPACE_ID) {
    const followup = this.store.followups.find(
      (f) => f.id === followupId && f.workspace_id === workspaceId
    );
    if (!followup) throw new Error("Follow-up not found");
    followup.status = "Cancelled";
    followup.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    this.addActivity({
      workspace_id: workspaceId,
      quotation_id: followup.quotation_id,
      activity_type: "followup_cancelled",
      description: `Follow-up cancelled for ${followup.scheduled_date}`,
      metadata: { followup_id: followup.id }
    });
    this.saveStore();
    this.syncFollowUpToSupabase(followup);
    return {
      ...followup,
      calendar_event: this.getCalendarEventByFollowUpId(followup.id, workspaceId)
    };
  }
  deleteFollowUp(followupId, workspaceId = DEFAULT_WORKSPACE_ID) {
    const idx = this.store.followups.findIndex((f) => f.id === followupId && f.workspace_id === workspaceId);
    if (idx !== -1) {
      this.store.followups.splice(idx, 1);
      this.saveStore();
      this.deleteFollowUpFromSupabase(followupId);
      return true;
    }
    return false;
  }
  deleteQuotation(quotationId, workspaceId = DEFAULT_WORKSPACE_ID) {
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
  deleteClient(clientId, workspaceId = DEFAULT_WORKSPACE_ID) {
    const idx = this.store.clients.findIndex((c) => c.id === clientId && c.workspace_id === workspaceId);
    if (idx !== -1) {
      this.store.clients.splice(idx, 1);
      this.saveStore();
      return true;
    }
    return false;
  }
  purgeTrialRecords(workspaceId = DEFAULT_WORKSPACE_ID) {
    const trialQuoteIds = new Set(
      this.store.quotations.filter((q) => q.workspace_id === workspaceId && isTrialRecord(q.client_name, q.contact_number, q.contact_number_raw)).map((q) => q.id)
    );
    const trialClientIds = new Set(
      this.store.clients.filter((c) => c.workspace_id === workspaceId && isTrialRecord(c.name, c.phone, c.contact_number_raw)).map((c) => c.id)
    );
    this.store.quotations = this.store.quotations.filter((q) => !trialQuoteIds.has(q.id));
    this.store.followups = this.store.followups.filter((f) => !trialQuoteIds.has(f.quotation_id));
    this.store.activities = this.store.activities.filter((a) => !a.quotation_id || !trialQuoteIds.has(a.quotation_id));
    this.store.clients = this.store.clients.filter((c) => !trialClientIds.has(c.id));
    this.saveStore();
    return { purgedQuotations: trialQuoteIds.size, purgedClients: trialClientIds.size };
  }
  // --- Activities ---
  addActivity(activity) {
    const act = {
      ...activity,
      id: crypto.randomUUID(),
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.store.activities.push(act);
    this.saveStore();
    this.syncActivityToSupabase(act);
    return act;
  }
  getActivitiesByQuotationId(quotationId, workspaceId = DEFAULT_WORKSPACE_ID) {
    return this.store.activities.filter((a) => a.workspace_id === workspaceId && a.quotation_id === quotationId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  getAllActivities(workspaceId = DEFAULT_WORKSPACE_ID, limit = 50) {
    return this.store.activities.filter((a) => a.workspace_id === workspaceId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  }
  getActivities(workspaceId = DEFAULT_WORKSPACE_ID, quotationId, limit = 50) {
    if (quotationId) {
      return this.getActivitiesByQuotationId(quotationId, workspaceId);
    }
    return this.getAllActivities(workspaceId, limit);
  }
  // --- Sync Runs ---
  createSyncRun(workspaceId = DEFAULT_WORKSPACE_ID) {
    const run = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      started_at: (/* @__PURE__ */ new Date()).toISOString(),
      rows_found: 0,
      records_created: 0,
      records_updated: 0,
      records_unchanged: 0,
      records_failed: 0,
      status: "running"
    };
    this.store.sync_runs.unshift(run);
    if (this.store.sync_runs.length > 50) {
      this.store.sync_runs = this.store.sync_runs.slice(0, 50);
    }
    this.saveStore();
    return run;
  }
  updateSyncRun(id, updates, workspaceId = DEFAULT_WORKSPACE_ID) {
    const run = this.store.sync_runs.find(
      (r) => r.id === id && r.workspace_id === workspaceId
    );
    if (!run) throw new Error("Sync run not found");
    Object.assign(run, updates);
    this.saveStore();
    return run;
  }
  getLatestSyncRun(workspaceId = DEFAULT_WORKSPACE_ID) {
    return this.store.sync_runs.find((r) => r.workspace_id === workspaceId) || null;
  }
  getSyncRuns(workspaceId = DEFAULT_WORKSPACE_ID) {
    return this.store.sync_runs.filter((r) => r.workspace_id === workspaceId);
  }
  getSyncStatus(workspaceId = DEFAULT_WORKSPACE_ID) {
    const latest = this.getLatestSyncRun(workspaceId);
    const settings = this.getSettings(workspaceId);
    return {
      latestRun: latest,
      status: latest?.status || "idle",
      lastSyncedAt: latest?.completed_at || latest?.started_at || null,
      autoSyncInterval: settings.auto_sync_interval
    };
  }
  getSyncHistory(workspaceId = DEFAULT_WORKSPACE_ID) {
    return this.getSyncRuns(workspaceId);
  }
  // --- Calendar Events ---
  getCalendarEvents(workspaceId = DEFAULT_WORKSPACE_ID) {
    return (this.store.calendar_events || []).filter((e) => e.workspace_id === workspaceId);
  }
  getCalendarEventByFollowUpId(followupId, workspaceId = DEFAULT_WORKSPACE_ID) {
    return (this.store.calendar_events || []).find(
      (e) => e.workspace_id === workspaceId && e.followup_id === followupId
    ) || null;
  }
  upsertCalendarEvent(data, workspaceId = DEFAULT_WORKSPACE_ID) {
    this.store.calendar_events = this.store.calendar_events || [];
    const existingIndex = this.store.calendar_events.findIndex(
      (e) => e.workspace_id === workspaceId && e.followup_id === data.followup_id
    );
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (existingIndex >= 0) {
      const existing = this.store.calendar_events[existingIndex];
      const updated = {
        ...existing,
        provider: data.provider || existing.provider,
        external_event_id: data.external_event_id !== void 0 ? data.external_event_id : existing.external_event_id,
        calendar_id: data.calendar_id !== void 0 ? data.calendar_id : existing.calendar_id,
        status: data.status || "updated",
        start_at: data.start_at || existing.start_at,
        end_at: data.end_at || existing.end_at,
        html_link: data.html_link !== void 0 ? data.html_link : existing.html_link,
        updated_at: now
      };
      this.store.calendar_events[existingIndex] = updated;
      this.saveStore();
      return updated;
    }
    const newEvent = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      followup_id: data.followup_id,
      provider: data.provider || "google",
      external_event_id: data.external_event_id || null,
      calendar_id: data.calendar_id || "primary",
      status: data.status || "active",
      start_at: data.start_at,
      end_at: data.end_at,
      html_link: data.html_link || null,
      created_at: now,
      updated_at: now
    };
    this.store.calendar_events.push(newEvent);
    this.saveStore();
    return newEvent;
  }
  deleteCalendarEvent(followupId, workspaceId = DEFAULT_WORKSPACE_ID) {
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
  bulkAssignFollowUps(followupIds, senderName, workspaceId = DEFAULT_WORKSPACE_ID) {
    let count = 0;
    const now = (/* @__PURE__ */ new Date()).toISOString();
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
            activity_type: "priority_changed",
            description: `Lead re-assigned to ${senderName} in bulk`,
            metadata: { assigned_to: senderName }
          });
          count++;
        }
      }
    }
    if (count > 0) this.saveStore();
    return { updatedCount: count };
  }
  bulkRescheduleFollowUps(followupIds, scheduledDate, notes, workspaceId = DEFAULT_WORKSPACE_ID) {
    let count = 0;
    for (const fId of followupIds) {
      try {
        this.rescheduleFollowUp(fId, scheduledDate, "10:30", notes, workspaceId);
        count++;
      } catch (e) {
        console.error(`Failed to bulk reschedule ${fId}:`, e);
      }
    }
    return { updatedCount: count };
  }
  // --- Complete Backup / Export ---
  getFullBackup(workspaceId = DEFAULT_WORKSPACE_ID) {
    return {
      exported_at: (/* @__PURE__ */ new Date()).toISOString(),
      workspace_id: workspaceId,
      quotations: this.store.quotations.filter((q) => q.workspace_id === workspaceId),
      clients: this.store.clients.filter((c) => c.workspace_id === workspaceId),
      followups: this.store.followups.filter((f) => f.workspace_id === workspaceId),
      activities: this.store.activities.filter((a) => a.workspace_id === workspaceId),
      settings: this.getSettings(workspaceId),
      sync_runs: this.store.sync_runs.filter((r) => r.workspace_id === workspaceId)
    };
  }
};
var db = new Database();

// server/syncService.ts
import Papa from "papaparse";

// src/utils/locationUtils.ts
var CITY_KEYWORDS = [
  {
    label: "Delhi NCR",
    keywords: [
      "delhi",
      "ncr",
      "gurgaon",
      "gurugram",
      "noida",
      "greater noida",
      "ghaziabad",
      "faridabad",
      "manesar",
      "sonipat",
      "dwarka",
      "saket",
      "vasant",
      "chhatarpur",
      "sainik farm"
    ]
  },
  {
    label: "Mumbai",
    keywords: [
      "mumbai",
      "bombay",
      "navi mumbai",
      "thane",
      "bandra",
      "andheri",
      "juhu",
      "worli",
      "borivali",
      "powai",
      "malad",
      "goregaon",
      "colaba",
      "dharavi"
    ]
  },
  {
    label: "Maharashtra & Goa",
    keywords: [
      "pune",
      "goa",
      "panaji",
      "panjim",
      "margao",
      "madgaon",
      "alibaug",
      "alibag",
      "lonavala",
      "khandala",
      "mahabaleshwar",
      "nagpur",
      "nashik",
      "aurangabad",
      "kolhapur",
      "satara",
      "solapur"
    ]
  },
  {
    label: "Bangalore / Karnataka",
    keywords: [
      "bangalore",
      "bengaluru",
      "mysore",
      "mysuru",
      "mangalore",
      "hubli",
      "whitefield",
      "koramangala",
      "indiranagar",
      "sarjapur",
      "electronic city",
      "yelahanka"
    ]
  },
  {
    label: "Hyderabad / Telangana",
    keywords: [
      "hyderabad",
      "secunderabad",
      "telangana",
      "cyberabad",
      "gachibowli",
      "jubilee hills",
      "banjara hills",
      "madhapur",
      "kondapur"
    ]
  },
  {
    label: "Tamil Nadu / Chennai",
    keywords: ["chennai", "madras", "coimbatore", "madurai", "ecr", "omr", "salem", "trichy"]
  },
  {
    label: "Rajasthan / Jaipur",
    keywords: ["jaipur", "udaipur", "jodhpur", "ajmer", "kota", "bhiwadi", "neemrana", "pushkar", "alwar"]
  },
  {
    label: "Gujarat",
    keywords: ["ahmedabad", "surat", "vadodara", "baroda", "rajkot", "gandhinagar", "bhavnagar", "vapi"]
  },
  {
    label: "Punjab / Chandigarh",
    keywords: ["chandigarh", "mohali", "panchkula", "ludhiana", "amritsar", "jalandhar", "patiala", "zirakpur"]
  },
  {
    label: "Uttar Pradesh",
    keywords: ["lucknow", "kanpur", "varanasi", "agra", "meerut", "prayagraj", "allahabad", "bareilly", "ayodhya"]
  },
  {
    label: "Kolkata / West Bengal",
    keywords: ["kolkata", "calcutta", "howrah", "salt lake", "new town", "siliguri", "durgapur"]
  },
  {
    label: "Uttarakhand / Dehradun",
    keywords: ["dehradun", "rishikesh", "haridwar", "mussoorie", "nainital", "haldwani", "roorkee"]
  },
  {
    label: "Himachal Pradesh",
    keywords: ["shimla", "manali", "kasauli", "dharamshala", "solan", "kullu"]
  },
  {
    label: "Kerala",
    keywords: ["kochi", "cochin", "trivandrum", "thiruvananthapuram", "calicut", "kozhikode", "wayanad", "kottayam", "munnar"]
  },
  {
    label: "Assam / Northeast",
    keywords: ["guwahati", "assam", "shillong", "dimapur", "imphal", "agartala"]
  }
];
var PHONE_PREFIX_MAP = {
  // Delhi NCR
  "9810": "Delhi NCR",
  "9811": "Delhi NCR",
  "9818": "Delhi NCR",
  "9899": "Delhi NCR",
  "9910": "Delhi NCR",
  "9971": "Delhi NCR",
  "9990": "Delhi NCR",
  "9999": "Delhi NCR",
  "9871": "Delhi NCR",
  "9873": "Delhi NCR",
  "9310": "Delhi NCR",
  "9311": "Delhi NCR",
  "9312": "Delhi NCR",
  "9313": "Delhi NCR",
  "9212": "Delhi NCR",
  "9213": "Delhi NCR",
  "9711": "Delhi NCR",
  "9717": "Delhi NCR",
  "9718": "Delhi NCR",
  "9650": "Delhi NCR",
  "9654": "Delhi NCR",
  "8800": "Delhi NCR",
  "8826": "Delhi NCR",
  "8527": "Delhi NCR",
  "8588": "Delhi NCR",
  "8447": "Delhi NCR",
  "8448": "Delhi NCR",
  "8377": "Delhi NCR",
  "8130": "Delhi NCR",
  "8010": "Delhi NCR",
  // Mumbai
  "9820": "Mumbai",
  "9821": "Mumbai",
  "9819": "Mumbai",
  "9833": "Mumbai",
  "9869": "Mumbai",
  "9892": "Mumbai",
  "9920": "Mumbai",
  "9930": "Mumbai",
  "9969": "Mumbai",
  "9987": "Mumbai",
  "9769": "Mumbai",
  "9702": "Mumbai",
  "9619": "Mumbai",
  "9664": "Mumbai",
  "9167": "Mumbai",
  "9029": "Mumbai",
  "9004": "Mumbai",
  "8879": "Mumbai",
  "8652": "Mumbai",
  "8655": "Mumbai",
  "8451": "Mumbai",
  "8452": "Mumbai",
  "8454": "Mumbai",
  "8291": "Mumbai",
  "8108": "Mumbai",
  "8591": "Mumbai",
  // Maharashtra & Goa
  "9822": "Maharashtra & Goa",
  "9823": "Maharashtra & Goa",
  "9850": "Maharashtra & Goa",
  "9860": "Maharashtra & Goa",
  "9881": "Maharashtra & Goa",
  "9890": "Maharashtra & Goa",
  "9921": "Maharashtra & Goa",
  "9922": "Maharashtra & Goa",
  "9923": "Maharashtra & Goa",
  "9960": "Maharashtra & Goa",
  "9970": "Maharashtra & Goa",
  "9975": "Maharashtra & Goa",
  "9604": "Maharashtra & Goa",
  "9637": "Maharashtra & Goa",
  "9762": "Maharashtra & Goa",
  "9763": "Maharashtra & Goa",
  "9764": "Maharashtra & Goa",
  "9765": "Maharashtra & Goa",
  "9766": "Maharashtra & Goa",
  "9767": "Maharashtra & Goa",
  "8446": "Maharashtra & Goa",
  "8007": "Maharashtra & Goa",
  "8380": "Maharashtra & Goa",
  "8390": "Maharashtra & Goa",
  "8888": "Maharashtra & Goa",
  "9158": "Maharashtra & Goa",
  "9011": "Maharashtra & Goa",
  "9028": "Maharashtra & Goa",
  "9049": "Maharashtra & Goa",
  "9096": "Maharashtra & Goa",
  "9130": "Maharashtra & Goa",
  "9145": "Maharashtra & Goa",
  "9146": "Maharashtra & Goa",
  "9175": "Maharashtra & Goa",
  // Bangalore / Karnataka
  "9845": "Bangalore / Karnataka",
  "9880": "Bangalore / Karnataka",
  "9886": "Bangalore / Karnataka",
  "9900": "Bangalore / Karnataka",
  "9901": "Bangalore / Karnataka",
  "9902": "Bangalore / Karnataka",
  "9945": "Bangalore / Karnataka",
  "9972": "Bangalore / Karnataka",
  "9980": "Bangalore / Karnataka",
  "9986": "Bangalore / Karnataka",
  "9731": "Bangalore / Karnataka",
  "9739": "Bangalore / Karnataka",
  "9740": "Bangalore / Karnataka",
  "9741": "Bangalore / Karnataka",
  "9742": "Bangalore / Karnataka",
  "9743": "Bangalore / Karnataka",
  "9611": "Bangalore / Karnataka",
  "9620": "Bangalore / Karnataka",
  "9632": "Bangalore / Karnataka",
  "9663": "Bangalore / Karnataka",
  "9686": "Bangalore / Karnataka",
  "8884": "Bangalore / Karnataka",
  "8892": "Bangalore / Karnataka",
  "8970": "Bangalore / Karnataka",
  "8971": "Bangalore / Karnataka",
  "8050": "Bangalore / Karnataka",
  "8088": "Bangalore / Karnataka",
  "8095": "Bangalore / Karnataka",
  "8105": "Bangalore / Karnataka",
  "8123": "Bangalore / Karnataka",
  "8147": "Bangalore / Karnataka",
  "8197": "Bangalore / Karnataka",
  "8277": "Bangalore / Karnataka",
  "8296": "Bangalore / Karnataka",
  "9538": "Bangalore / Karnataka",
  // Tamil Nadu / Chennai
  "9840": "Tamil Nadu / Chennai",
  "9841": "Tamil Nadu / Chennai",
  "9884": "Tamil Nadu / Chennai",
  "9940": "Tamil Nadu / Chennai",
  "9941": "Tamil Nadu / Chennai",
  "9952": "Tamil Nadu / Chennai",
  "9962": "Tamil Nadu / Chennai",
  "9789": "Tamil Nadu / Chennai",
  "9790": "Tamil Nadu / Chennai",
  "9791": "Tamil Nadu / Chennai",
  "9710": "Tamil Nadu / Chennai",
  "9600": "Tamil Nadu / Chennai",
  "9677": "Tamil Nadu / Chennai",
  "9486": "Tamil Nadu / Chennai",
  "9444": "Tamil Nadu / Chennai",
  "9445": "Tamil Nadu / Chennai",
  "9442": "Tamil Nadu / Chennai",
  "9443": "Tamil Nadu / Chennai",
  // Hyderabad / Telangana
  "9848": "Hyderabad / Telangana",
  "9849": "Hyderabad / Telangana",
  "9866": "Hyderabad / Telangana",
  "9885": "Hyderabad / Telangana",
  "9908": "Hyderabad / Telangana",
  "9912": "Hyderabad / Telangana",
  "9948": "Hyderabad / Telangana",
  "9949": "Hyderabad / Telangana",
  "9951": "Hyderabad / Telangana",
  "9959": "Hyderabad / Telangana",
  "9963": "Hyderabad / Telangana",
  "9966": "Hyderabad / Telangana",
  "9985": "Hyderabad / Telangana",
  "9989": "Hyderabad / Telangana",
  "9701": "Hyderabad / Telangana",
  "9703": "Hyderabad / Telangana",
  "9704": "Hyderabad / Telangana",
  "9705": "Hyderabad / Telangana",
  "9603": "Hyderabad / Telangana",
  "9618": "Hyderabad / Telangana",
  "9640": "Hyderabad / Telangana",
  "9642": "Hyderabad / Telangana",
  "9652": "Hyderabad / Telangana",
  "9666": "Hyderabad / Telangana",
  "9676": "Hyderabad / Telangana",
  "8978": "Hyderabad / Telangana",
  "8985": "Hyderabad / Telangana",
  "9000": "Hyderabad / Telangana",
  "9010": "Hyderabad / Telangana",
  "9030": "Hyderabad / Telangana",
  "9032": "Hyderabad / Telangana",
  "9052": "Hyderabad / Telangana",
  "9160": "Hyderabad / Telangana",
  "9177": "Hyderabad / Telangana",
  "9502": "Hyderabad / Telangana",
  "9505": "Hyderabad / Telangana",
  "9550": "Hyderabad / Telangana",
  "9553": "Hyderabad / Telangana",
  "9573": "Hyderabad / Telangana",
  "9581": "Hyderabad / Telangana",
  // Rajasthan / Jaipur
  "9828": "Rajasthan / Jaipur",
  "9829": "Rajasthan / Jaipur",
  "9887": "Rajasthan / Jaipur",
  "9928": "Rajasthan / Jaipur",
  "9929": "Rajasthan / Jaipur",
  "9950": "Rajasthan / Jaipur",
  "9982": "Rajasthan / Jaipur",
  "9983": "Rajasthan / Jaipur",
  "9782": "Rajasthan / Jaipur",
  "9783": "Rajasthan / Jaipur",
  "9784": "Rajasthan / Jaipur",
  "9785": "Rajasthan / Jaipur",
  "9799": "Rajasthan / Jaipur",
  "9602": "Rajasthan / Jaipur",
  "9610": "Rajasthan / Jaipur",
  "9636": "Rajasthan / Jaipur",
  "9649": "Rajasthan / Jaipur",
  "9660": "Rajasthan / Jaipur",
  "9667": "Rajasthan / Jaipur",
  "9672": "Rajasthan / Jaipur",
  "9680": "Rajasthan / Jaipur",
  "9694": "Rajasthan / Jaipur",
  "9772": "Rajasthan / Jaipur",
  "8003": "Rajasthan / Jaipur",
  "8005": "Rajasthan / Jaipur",
  "8094": "Rajasthan / Jaipur",
  "8104": "Rajasthan / Jaipur",
  "8107": "Rajasthan / Jaipur",
  "8233": "Rajasthan / Jaipur",
  "8239": "Rajasthan / Jaipur",
  "8290": "Rajasthan / Jaipur",
  "8824": "Rajasthan / Jaipur",
  "8875": "Rajasthan / Jaipur",
  "8890": "Rajasthan / Jaipur",
  "8946": "Rajasthan / Jaipur",
  "8947": "Rajasthan / Jaipur",
  "8952": "Rajasthan / Jaipur",
  "8955": "Rajasthan / Jaipur",
  "9001": "Rajasthan / Jaipur",
  "9024": "Rajasthan / Jaipur",
  "9057": "Rajasthan / Jaipur",
  "9116": "Rajasthan / Jaipur",
  "9119": "Rajasthan / Jaipur",
  "9166": "Rajasthan / Jaipur",
  "9413": "Rajasthan / Jaipur",
  "9414": "Rajasthan / Jaipur",
  "9460": "Rajasthan / Jaipur",
  "9461": "Rajasthan / Jaipur",
  "9462": "Rajasthan / Jaipur",
  // Gujarat
  "9824": "Gujarat",
  "9825": "Gujarat",
  "9879": "Gujarat",
  "9898": "Gujarat",
  "9904": "Gujarat",
  "9909": "Gujarat",
  "9913": "Gujarat",
  "9924": "Gujarat",
  "9925": "Gujarat",
  "9974": "Gujarat",
  "9978": "Gujarat",
  "9979": "Gujarat",
  "9998": "Gujarat",
  "9712": "Gujarat",
  "9714": "Gujarat",
  "9722": "Gujarat",
  "9723": "Gujarat",
  "9724": "Gujarat",
  "9725": "Gujarat",
  "9726": "Gujarat",
  "9727": "Gujarat",
  "9737": "Gujarat",
  "9601": "Gujarat",
  "9624": "Gujarat",
  "9638": "Gujarat",
  "9662": "Gujarat",
  "9687": "Gujarat",
  "8000": "Gujarat",
  "8128": "Gujarat",
  "8140": "Gujarat",
  "8141": "Gujarat",
  "8153": "Gujarat",
  "8154": "Gujarat",
  "8155": "Gujarat",
  "8156": "Gujarat",
  "8160": "Gujarat",
  "8200": "Gujarat",
  "8238": "Gujarat",
  "8320": "Gujarat",
  "8347": "Gujarat",
  "8401": "Gujarat",
  "8460": "Gujarat",
  "8469": "Gujarat",
  "8487": "Gujarat",
  "8488": "Gujarat",
  "8511": "Gujarat",
  "8732": "Gujarat",
  "8733": "Gujarat",
  "8734": "Gujarat",
  "8735": "Gujarat",
  "8758": "Gujarat",
  "8849": "Gujarat",
  "8866": "Gujarat",
  "8905": "Gujarat",
  "8980": "Gujarat",
  // Punjab / Chandigarh
  "9814": "Punjab / Chandigarh",
  "9815": "Punjab / Chandigarh",
  "9855": "Punjab / Chandigarh",
  "9872": "Punjab / Chandigarh",
  "9876": "Punjab / Chandigarh",
  "9878": "Punjab / Chandigarh",
  "9888": "Punjab / Chandigarh",
  "9914": "Punjab / Chandigarh",
  "9915": "Punjab / Chandigarh",
  "9988": "Punjab / Chandigarh",
  "9779": "Punjab / Chandigarh",
  "9780": "Punjab / Chandigarh",
  "9781": "Punjab / Chandigarh",
  "9646": "Punjab / Chandigarh",
  "9653": "Punjab / Chandigarh",
  "8054": "Punjab / Chandigarh",
  "8146": "Punjab / Chandigarh",
  "8194": "Punjab / Chandigarh",
  "8195": "Punjab / Chandigarh",
  "8196": "Punjab / Chandigarh",
  "8198": "Punjab / Chandigarh",
  "8283": "Punjab / Chandigarh",
  "8284": "Punjab / Chandigarh",
  "8288": "Punjab / Chandigarh",
  "8427": "Punjab / Chandigarh",
  "8437": "Punjab / Chandigarh",
  "8528": "Punjab / Chandigarh",
  "8556": "Punjab / Chandigarh",
  "8557": "Punjab / Chandigarh",
  "8558": "Punjab / Chandigarh",
  "8559": "Punjab / Chandigarh",
  "8566": "Punjab / Chandigarh",
  "8567": "Punjab / Chandigarh",
  "8568": "Punjab / Chandigarh",
  "8569": "Punjab / Chandigarh",
  "8699": "Punjab / Chandigarh",
  "8725": "Punjab / Chandigarh",
  "8727": "Punjab / Chandigarh",
  "8728": "Punjab / Chandigarh",
  "8729": "Punjab / Chandigarh",
  "8847": "Punjab / Chandigarh",
  "8872": "Punjab / Chandigarh",
  "8968": "Punjab / Chandigarh",
  "9023": "Punjab / Chandigarh",
  "9041": "Punjab / Chandigarh",
  "9056": "Punjab / Chandigarh",
  "9115": "Punjab / Chandigarh",
  "9417": "Punjab / Chandigarh",
  "9463": "Punjab / Chandigarh",
  "9464": "Punjab / Chandigarh",
  "9465": "Punjab / Chandigarh",
  // Uttar Pradesh
  "9838": "Uttar Pradesh",
  "9839": "Uttar Pradesh",
  "9889": "Uttar Pradesh",
  "9918": "Uttar Pradesh",
  "9919": "Uttar Pradesh",
  "9935": "Uttar Pradesh",
  "9936": "Uttar Pradesh",
  "9956": "Uttar Pradesh",
  "9984": "Uttar Pradesh",
  "9792": "Uttar Pradesh",
  "9793": "Uttar Pradesh",
  "9794": "Uttar Pradesh",
  "9795": "Uttar Pradesh",
  "9616": "Uttar Pradesh",
  "9621": "Uttar Pradesh",
  "9628": "Uttar Pradesh",
  "9648": "Uttar Pradesh",
  "9651": "Uttar Pradesh",
  "9670": "Uttar Pradesh",
  "9695": "Uttar Pradesh",
  "9696": "Uttar Pradesh",
  "8004": "Uttar Pradesh",
  "8009": "Uttar Pradesh",
  "8052": "Uttar Pradesh",
  "8090": "Uttar Pradesh",
  "8115": "Uttar Pradesh",
  "8127": "Uttar Pradesh",
  "8172": "Uttar Pradesh",
  "8173": "Uttar Pradesh",
  "8174": "Uttar Pradesh",
  "8175": "Uttar Pradesh",
  "8176": "Uttar Pradesh",
  "8181": "Uttar Pradesh",
  "8182": "Uttar Pradesh",
  "8188": "Uttar Pradesh",
  "8189": "Uttar Pradesh",
  "8191": "Uttar Pradesh",
  "8192": "Uttar Pradesh",
  "8193": "Uttar Pradesh",
  "8299": "Uttar Pradesh",
  "8318": "Uttar Pradesh",
  "8353": "Uttar Pradesh",
  "8354": "Uttar Pradesh",
  "8355": "Uttar Pradesh",
  "8381": "Uttar Pradesh",
  "8382": "Uttar Pradesh",
  "8400": "Uttar Pradesh",
  "8416": "Uttar Pradesh",
  "8417": "Uttar Pradesh",
  "8418": "Uttar Pradesh",
  "8419": "Uttar Pradesh",
  "8423": "Uttar Pradesh",
  "8429": "Uttar Pradesh",
  "8542": "Uttar Pradesh",
  "8543": "Uttar Pradesh",
  "8545": "Uttar Pradesh",
  "8573": "Uttar Pradesh",
  "8574": "Uttar Pradesh",
  "8576": "Uttar Pradesh",
  "8577": "Uttar Pradesh",
  "8601": "Uttar Pradesh",
  "8604": "Uttar Pradesh",
  "8707": "Uttar Pradesh",
  "8726": "Uttar Pradesh",
  "8736": "Uttar Pradesh",
  "8737": "Uttar Pradesh",
  "8738": "Uttar Pradesh",
  "8739": "Uttar Pradesh",
  "8756": "Uttar Pradesh",
  "8765": "Uttar Pradesh",
  "8795": "Uttar Pradesh",
  "8808": "Uttar Pradesh",
  "8840": "Uttar Pradesh",
  "8853": "Uttar Pradesh",
  "8858": "Uttar Pradesh",
  "8874": "Uttar Pradesh",
  "8887": "Uttar Pradesh",
  "8896": "Uttar Pradesh",
  "8922": "Uttar Pradesh",
  "8924": "Uttar Pradesh",
  "8931": "Uttar Pradesh",
  "8932": "Uttar Pradesh",
  "8933": "Uttar Pradesh",
  "8934": "Uttar Pradesh",
  "8935": "Uttar Pradesh",
  "8948": "Uttar Pradesh",
  "8953": "Uttar Pradesh",
  "8957": "Uttar Pradesh",
  "8960": "Uttar Pradesh",
  "9005": "Uttar Pradesh",
  "9026": "Uttar Pradesh",
  "9044": "Uttar Pradesh",
  "9125": "Uttar Pradesh",
  "9129": "Uttar Pradesh",
  "9140": "Uttar Pradesh",
  "9151": "Uttar Pradesh",
  "9161": "Uttar Pradesh",
  "9169": "Uttar Pradesh",
  "9198": "Uttar Pradesh",
  "9415": "Uttar Pradesh",
  "9450": "Uttar Pradesh",
  "9451": "Uttar Pradesh",
  "9452": "Uttar Pradesh",
  "9453": "Uttar Pradesh",
  "9454": "Uttar Pradesh",
  "9455": "Uttar Pradesh",
  // Kolkata / West Bengal
  "9830": "Kolkata / West Bengal",
  "9831": "Kolkata / West Bengal",
  "9832": "Kolkata / West Bengal",
  "9836": "Kolkata / West Bengal",
  "9874": "Kolkata / West Bengal",
  "9903": "Kolkata / West Bengal",
  "9748": "Kolkata / West Bengal",
  "9674": "Kolkata / West Bengal",
  "9051": "Kolkata / West Bengal",
  "9007": "Kolkata / West Bengal",
  "8981": "Kolkata / West Bengal",
  "8961": "Kolkata / West Bengal",
  "8697": "Kolkata / West Bengal",
  "8584": "Kolkata / West Bengal",
  "8583": "Kolkata / West Bengal",
  "8582": "Kolkata / West Bengal",
  "8420": "Kolkata / West Bengal",
  "8336": "Kolkata / West Bengal",
  "8335": "Kolkata / West Bengal",
  "8334": "Kolkata / West Bengal",
  "8100": "Kolkata / West Bengal",
  "8017": "Kolkata / West Bengal",
  "8013": "Kolkata / West Bengal",
  // Assam / Northeast
  "9401": "Assam / Northeast",
  "9435": "Assam / Northeast",
  "9864": "Assam / Northeast",
  "9854": "Assam / Northeast",
  "9954": "Assam / Northeast",
  "9957": "Assam / Northeast",
  "9706": "Assam / Northeast",
  "9678": "Assam / Northeast",
  "8876": "Assam / Northeast",
  "8811": "Assam / Northeast",
  "8812": "Assam / Northeast",
  "8822": "Assam / Northeast",
  "8011": "Assam / Northeast",
  "8486": "Assam / Northeast",
  "8473": "Assam / Northeast",
  "8472": "Assam / Northeast",
  "8471": "Assam / Northeast",
  // Kerala
  "9846": "Kerala",
  "9847": "Kerala",
  "9895": "Kerala",
  "9946": "Kerala",
  "9947": "Kerala",
  "9961": "Kerala",
  "9995": "Kerala",
  "9744": "Kerala",
  "9745": "Kerala",
  "9746": "Kerala",
  "9747": "Kerala",
  "9605": "Kerala",
  "9633": "Kerala",
  "9645": "Kerala",
  "9656": "Kerala",
  "8086": "Kerala",
  "8089": "Kerala",
  "8111": "Kerala",
  "8113": "Kerala",
  "8129": "Kerala",
  "8136": "Kerala",
  "8137": "Kerala",
  "8138": "Kerala",
  "8139": "Kerala",
  "8157": "Kerala",
  "8281": "Kerala",
  "8547": "Kerala",
  "8589": "Kerala",
  "8590": "Kerala",
  "8592": "Kerala",
  "8593": "Kerala",
  "8594": "Kerala",
  "8921": "Kerala",
  "8943": "Kerala",
  "9048": "Kerala",
  "9061": "Kerala",
  "9072": "Kerala",
  "9074": "Kerala",
  "9446": "Kerala",
  "9447": "Kerala",
  "9495": "Kerala",
  "9496": "Kerala",
  "9497": "Kerala"
};
function inferLocationFromText(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const entry of CITY_KEYWORDS) {
    for (const kw of entry.keywords) {
      const regex = new RegExp(`\\b${kw}\\b`, "i");
      if (regex.test(lower)) {
        return entry.label;
      }
    }
  }
  return null;
}
function inferLocationFromPhone(phoneStr) {
  if (!phoneStr) return null;
  const digits = phoneStr.replace(/\D/g, "");
  const tenDigit = digits.length >= 10 ? digits.slice(-10) : digits;
  if (tenDigit.length === 10) {
    const prefix4 = tenDigit.slice(0, 4);
    if (PHONE_PREFIX_MAP[prefix4]) {
      return PHONE_PREFIX_MAP[prefix4];
    }
    const prefix3 = tenDigit.slice(0, 3);
    for (const [key, loc] of Object.entries(PHONE_PREFIX_MAP)) {
      if (key.startsWith(prefix3)) {
        return loc;
      }
    }
  }
  return null;
}

// server/syncService.ts
var REQUIRED_COLUMNS = [
  "id",
  "Timestamp",
  "Client Name",
  "Quotation Price",
  "Sender Name",
  "Pool Dimensions",
  "Pool Type",
  "Contact Number",
  "Status"
];
var SyncService = class {
  /**
   * Fetches raw CSV from Google Sheet URL or custom content
   */
  static async fetchSheetCsv(sheetId, gid = "0") {
    const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
      sheetId
    )}/export?format=csv&gid=${encodeURIComponent(gid)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15e3);
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Quotation-FollowUp-Manager/1.0",
          Accept: "text/csv, text/plain, */*"
        },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(
          `Google Sheets responded with HTTP ${response.status}: ${response.statusText}. Please verify that the sheet is shared or accessible.`
        );
      }
      return await response.text();
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error("Google Sheets request timed out after 15 seconds.");
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
  /**
   * Main synchronization routine adhering to PRD Sections 7, 8, 9, 12, 13, 14, 36, 37
   */
  static async runSync(options) {
    const workspaceId = options?.workspaceId || DEFAULT_WORKSPACE_ID;
    const settings = db.getSettings(workspaceId);
    const sheetId = options?.sheetId || settings.sheet_id;
    const sheetGid = options?.sheetGid || settings.sheet_gid || "0";
    const syncRun = db.createSyncRun(workspaceId);
    try {
      let csvData = options?.csvContent;
      if (!csvData) {
        if (!sheetId) {
          throw new Error("No Google Sheet ID configured.");
        }
        csvData = await this.fetchSheetCsv(sheetId, sheetGid);
      }
      const parseResult = Papa.parse(csvData, {
        header: true,
        skipEmptyLines: "greedy"
      });
      if (parseResult.errors && parseResult.errors.length > 0) {
        console.warn("CSV parse warnings:", parseResult.errors);
      }
      const rows = parseResult.data;
      const headers = parseResult.meta.fields || [];
      const missingColumns = [];
      for (const reqCol of REQUIRED_COLUMNS) {
        const found = headers.some(
          (h) => h.trim().toLowerCase() === reqCol.toLowerCase()
        );
        if (!found) {
          missingColumns.push(reqCol);
        }
      }
      if (missingColumns.length > 0) {
        throw new Error(
          `Sheet schema validation failed. Missing required columns: ${missingColumns.join(
            ", "
          )}. Expected exactly: ${REQUIRED_COLUMNS.join(", ")}`
        );
      }
      const colMap = {};
      for (const reqCol of REQUIRED_COLUMNS) {
        const matchingHeader = headers.find(
          (h) => h.trim().toLowerCase() === reqCol.toLowerCase()
        );
        colMap[reqCol] = matchingHeader || reqCol;
      }
      const rowsFound = rows.length;
      let createdCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;
      let failedCount = 0;
      const errorDetails = [];
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const todayStr = now.split("T")[0];
      const seenSourceIds = /* @__PURE__ */ new Set();
      const followupDaysConfig = (settings.followup_days || "3,7,14,21,30").split(",").map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
      const defaultTime = settings.default_time || "10:30";
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const rawId = row[colMap["id"]];
          const rawClientName = row[colMap["Client Name"]];
          const rawTimestamp = row[colMap["Timestamp"]];
          const rawPrice = row[colMap["Quotation Price"]];
          const rawSender = row[colMap["Sender Name"]];
          const rawDimensions = row[colMap["Pool Dimensions"]];
          const rawPoolType = row[colMap["Pool Type"]];
          const rawContact = row[colMap["Contact Number"]];
          const rawStatus = row[colMap["Status"]];
          const rawFollowUpDate = row["FollowUpDate"] || row["followup_date"] || row["Follow Up Date"];
          const rawTemperature = row["Temperature"] || row["temperature"];
          const rawNotes = row["Notes"] || row["notes"];
          const rawNextAction = row["NextAction"] || row["next_action"];
          const sourceId = normalizeText(rawId);
          if (!sourceId) {
            throw new Error(`Row #${i + 1} has an empty 'id'`);
          }
          const clientName = normalizeText(rawClientName);
          if (!clientName) {
            throw new Error(`Row #${i + 1} (id: ${sourceId}) has an empty 'Client Name'`);
          }
          seenSourceIds.add(sourceId);
          const quotationDate = normalizeDate(rawTimestamp);
          const sheetFollowUpDate = rawFollowUpDate && String(rawFollowUpDate).trim() ? normalizeDate(rawFollowUpDate) : null;
          const quotationPrice = normalizePrice(rawPrice);
          const phoneObj = normalizePhone(rawContact);
          if (isTrialRecord(clientName, phoneObj.normalized, phoneObj.raw)) {
            const existingQuotation2 = db.findQuotationBySourceId(sourceId, workspaceId);
            if (existingQuotation2) {
              db.deleteQuotation(existingQuotation2.id, workspaceId);
            }
            continue;
          }
          const poolDimensions = normalizeText(rawDimensions);
          const poolType = normalizeText(rawPoolType);
          const senderName = normalizeText(rawSender);
          const sourceStatus = normalizeText(rawStatus) || "SENT";
          let initialTemperature = "warm";
          if (rawTemperature) {
            const t = String(rawTemperature).trim().toLowerCase();
            if (t === "hot" || t === "cold" || t === "warm") {
              initialTemperature = t;
            }
          }
          const initialNotes = rawNotes && String(rawNotes).trim() ? String(rawNotes).trim() : null;
          const rawLocation = row["Location"] || row["location"] || row["City"] || row["city"] || row["Region"] || row["region"];
          const explicitLocation = normalizeText(rawLocation);
          const inferredLocation = explicitLocation || inferLocationFromText(initialNotes) || inferLocationFromText(clientName) || inferLocationFromPhone(phoneObj.raw || phoneObj.normalized);
          const client = db.upsertClient(
            {
              name: clientName,
              phone: phoneObj.display || phoneObj.normalized,
              contact_number_raw: phoneObj.raw,
              location: inferredLocation || null
            },
            workspaceId
          );
          const existingQuotation = db.findQuotationBySourceId(sourceId, workspaceId);
          if (existingQuotation) {
            unchangedCount++;
            continue;
          }
          const newQuote = db.insertQuotation(
            {
              workspace_id: workspaceId,
              source_id: sourceId,
              client_id: client.id,
              quotation_date: quotationDate,
              client_name: clientName,
              quotation_price: quotationPrice,
              sender_name: senderName,
              pool_dimensions: poolDimensions,
              pool_type: poolType,
              contact_number: phoneObj.display || phoneObj.normalized,
              contact_number_raw: phoneObj.raw,
              source_status: sourceStatus,
              temperature: initialTemperature,
              priority: "normal",
              app_status: "New",
              source_present: true,
              source_last_seen_at: now,
              source_updated_at: now,
              archived_at: null,
              internal_notes: initialNotes,
              location: inferredLocation || null
            },
            workspaceId
          );
          if (sheetFollowUpDate) {
            db.createFollowUp(
              {
                quotation_id: newQuote.id,
                scheduled_date: sheetFollowUpDate,
                scheduled_time: defaultTime,
                type: "Call",
                notes: rawNextAction ? `Sheet next action: ${rawNextAction}` : "Follow-up date from Google Sheet"
              },
              workspaceId
            );
          } else {
            const ageDays = calculateQuotationAgeDays(quotationDate);
            if (ageDays <= 7) {
              const target = new Date(quotationDate);
              target.setDate(target.getDate() + 3);
              const targetDateStr = target.toISOString().split("T")[0];
              db.createFollowUp(
                {
                  quotation_id: newQuote.id,
                  scheduled_date: targetDateStr,
                  scheduled_time: defaultTime,
                  type: "Call",
                  notes: "Day 3 follow-up"
                },
                workspaceId
              );
            }
          }
          createdCount++;
        } catch (rowErr) {
          failedCount++;
          errorDetails.push({
            source_id: row?.[colMap["id"]] || void 0,
            client_name: row?.[colMap["Client Name"]] || void 0,
            error: rowErr.message || "Row processing error",
            raw: row
          });
        }
      }
      let finalStatus = "completed";
      if (failedCount > 0) {
        finalStatus = createdCount + updatedCount + unchangedCount > 0 ? "completed_with_errors" : "failed";
      }
      const completedRun = db.updateSyncRun(
        syncRun.id,
        {
          completed_at: (/* @__PURE__ */ new Date()).toISOString(),
          rows_found: rowsFound,
          records_created: createdCount,
          records_updated: updatedCount,
          records_unchanged: unchangedCount,
          records_failed: failedCount,
          status: finalStatus,
          error_details: errorDetails,
          error_message: failedCount > 0 ? `${failedCount} row(s) failed during sync.` : null
        },
        workspaceId
      );
      return completedRun;
    } catch (fatalErr) {
      console.error("Fatal sync failure:", fatalErr);
      return db.updateSyncRun(
        syncRun.id,
        {
          completed_at: (/* @__PURE__ */ new Date()).toISOString(),
          status: "failed",
          error_message: fatalErr.message || "Fatal synchronization failure"
        },
        workspaceId
      );
    }
  }
};

// server/app.ts
var hydrationPromise = null;
async function ensureDataReady() {
  if (db.getQuotations(DEFAULT_WORKSPACE_ID).length > 0) return;
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      try {
        const hydrated = await db.hydrateFromSupabase(DEFAULT_WORKSPACE_ID);
        if (!hydrated && db.getQuotations(DEFAULT_WORKSPACE_ID).length === 0) {
          await SyncService.runSync({ workspaceId: DEFAULT_WORKSPACE_ID });
        }
      } catch (e) {
        console.warn("[Data Init Warning]", e);
      } finally {
        hydrationPromise = null;
      }
    })();
  }
  await hydrationPromise;
}
function createExpressApp() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(async (req, res, next) => {
    try {
      if (db.getQuotations(DEFAULT_WORKSPACE_ID).length === 0) {
        await ensureDataReady();
      }
    } catch (e) {
      console.warn("[Cold-start hydration warning]", e);
    }
    next();
  });
  const apiRouter = express.Router();
  apiRouter.get("/health", (req, res) => {
    res.json({
      status: "ok",
      supabase: db.getSupabaseStatus(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  apiRouter.get("/dashboard", (req, res) => {
    try {
      let quotations = db.getQuotations(DEFAULT_WORKSPACE_ID).filter(
        (q) => !isTrialRecord(q.client_name, q.contact_number, q.contact_number_raw)
      );
      let followups = db.getFollowUps(DEFAULT_WORKSPACE_ID);
      const sender = req.query.sender || req.query.user;
      if (sender && sender !== "All") {
        quotations = quotations.filter(
          (q) => q.sender_name && q.sender_name.toLowerCase().includes(sender.toLowerCase())
        );
      }
      followups = followups.filter((f) => {
        const q = quotations.find((quote) => quote.id === f.quotation_id);
        return Boolean(q);
      });
      const activeStatuses = [
        "New",
        "Active",
        "In Discussion",
        "Waiting for Client",
        "On Hold"
      ];
      const totalQuotations = quotations.length;
      const activeQuotations = quotations.filter((q) => activeStatuses.includes(q.app_status));
      const wonQuotations = quotations.filter((q) => q.app_status === "Won");
      const lostQuotations = quotations.filter((q) => q.app_status === "Lost" || q.app_status === "Cancelled");
      const activeQuotedValue = activeQuotations.reduce((sum, q) => sum + (q.quotation_price || 0), 0);
      const wonQuotedValue = wonQuotations.reduce((sum, q) => sum + (q.quotation_price || 0), 0);
      const hotValue = activeQuotations.filter((q) => q.temperature === "hot").reduce((sum, q) => sum + (q.quotation_price || 0), 0);
      const warmValue = activeQuotations.filter((q) => q.temperature === "warm").reduce((sum, q) => sum + (q.quotation_price || 0), 0);
      const coldValue = activeQuotations.filter((q) => q.temperature === "cold").reduce((sum, q) => sum + (q.quotation_price || 0), 0);
      const overdueFollowups = followups.filter((f) => f.status === "Overdue");
      const dueTodayFollowups = followups.filter((f) => f.status === "Due");
      const upcomingFollowups = followups.filter((f) => f.status === "Scheduled");
      const quotationsWithNoNextAction = activeQuotations.filter((q) => {
        const hasFutureFollowup = followups.some(
          (f) => f.quotation_id === q.id && ["Scheduled", "Due", "Overdue"].includes(f.status)
        );
        if (hasFutureFollowup) return false;
        const hasActionTaken = followups.some(
          (f) => f.quotation_id === q.id && f.status === "Completed"
        );
        return !hasActionTaken;
      });
      res.json({
        totalQuotations,
        activeCount: activeQuotations.length,
        wonCount: wonQuotations.length,
        lostCount: lostQuotations.length,
        dueTodayCount: dueTodayFollowups.length,
        overdueCount: overdueFollowups.length,
        noNextActionCount: quotationsWithNoNextAction.length,
        upcomingCount: upcomingFollowups.length,
        activeQuotedValue,
        wonQuotedValue,
        formattedActiveValue: formatIndianCurrency(activeQuotedValue),
        formattedWonValue: formatIndianCurrency(wonQuotedValue),
        temperatureBreakdown: {
          hot: { count: activeQuotations.filter((q) => q.temperature === "hot").length, value: hotValue },
          warm: { count: activeQuotations.filter((q) => q.temperature === "warm").length, value: warmValue },
          cold: { count: activeQuotations.filter((q) => q.temperature === "cold").length, value: coldValue }
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.get("/quotations", (req, res) => {
    try {
      let list = db.getQuotations(DEFAULT_WORKSPACE_ID);
      const {
        search,
        status,
        temperature,
        priority,
        followup,
        pool_type,
        sender,
        age,
        sort
      } = req.query;
      if (search) {
        const q = search.trim().toLowerCase();
        list = list.filter(
          (item) => item.client_name.toLowerCase().includes(q) || item.contact_number.toLowerCase().includes(q) || item.contact_number_raw && item.contact_number_raw.includes(q) || item.pool_dimensions && item.pool_dimensions.toLowerCase().includes(q) || item.pool_type && item.pool_type.toLowerCase().includes(q) || item.sender_name && item.sender_name.toLowerCase().includes(q)
        );
      }
      if (status && status !== "All") {
        list = list.filter((item) => item.app_status.toLowerCase() === status.toLowerCase());
      }
      if (temperature && temperature !== "All") {
        list = list.filter((item) => item.temperature.toLowerCase() === temperature.toLowerCase());
      }
      if (priority && priority !== "All") {
        list = list.filter((item) => item.priority.toLowerCase() === priority.toLowerCase());
      }
      if (pool_type && pool_type !== "All") {
        list = list.filter(
          (item) => item.pool_type && item.pool_type.toLowerCase() === pool_type.toLowerCase()
        );
      }
      if (sender && sender !== "All") {
        list = list.filter(
          (item) => item.sender_name && item.sender_name.toLowerCase() === sender.toLowerCase()
        );
      }
      if (followup) {
        if (followup === "Overdue") {
          list = list.filter((item) => item.next_followup?.status === "Overdue");
        } else if (followup === "Due Today") {
          list = list.filter((item) => item.next_followup?.status === "Due");
        } else if (followup === "Upcoming") {
          list = list.filter((item) => item.next_followup?.status === "Scheduled");
        } else if (followup === "No Next Action") {
          list = list.filter((item) => !item.next_followup);
        }
      }
      if (age) {
        if (age === "0-7") {
          list = list.filter((item) => (item.age_days || 0) <= 7);
        } else if (age === "8-14") {
          list = list.filter((item) => (item.age_days || 0) >= 8 && (item.age_days || 0) <= 14);
        } else if (age === "15-30") {
          list = list.filter((item) => (item.age_days || 0) >= 15 && (item.age_days || 0) <= 30);
        } else if (age === "30+") {
          list = list.filter((item) => (item.age_days || 0) > 30);
        }
      }
      if (sort) {
        if (sort === "newest") {
          list.sort((a, b) => b.quotation_date.localeCompare(a.quotation_date));
        } else if (sort === "oldest") {
          list.sort((a, b) => a.quotation_date.localeCompare(b.quotation_date));
        } else if (sort === "highest_value") {
          list.sort((a, b) => (b.quotation_price || 0) - (a.quotation_price || 0));
        } else if (sort === "lowest_value") {
          list.sort((a, b) => (a.quotation_price || 0) - (b.quotation_price || 0));
        } else if (sort === "client_name") {
          list.sort((a, b) => a.client_name.localeCompare(b.client_name));
        } else if (sort === "next_followup") {
          list.sort((a, b) => {
            const dateA = a.next_followup ? a.next_followup.scheduled_date : "9999-99-99";
            const dateB = b.next_followup ? b.next_followup.scheduled_date : "9999-99-99";
            return dateA.localeCompare(dateB);
          });
        }
      } else {
        list.sort((a, b) => b.quotation_date.localeCompare(a.quotation_date));
      }
      const allQuotes = db.getQuotations(DEFAULT_WORKSPACE_ID);
      const uniquePoolTypes = Array.from(
        new Set(allQuotes.map((q) => q.pool_type).filter(Boolean))
      ).sort();
      const uniqueSenders = Array.from(
        new Set(allQuotes.map((q) => q.sender_name).filter(Boolean))
      ).sort();
      res.json({
        quotations: list,
        total: list.length,
        filterOptions: {
          poolTypes: uniquePoolTypes,
          senders: uniqueSenders
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.get("/quotations/:id", (req, res) => {
    try {
      const quote = db.getQuotationById(req.params.id, DEFAULT_WORKSPACE_ID);
      if (!quote) {
        return res.status(404).json({ error: "Quotation not found" });
      }
      res.json(quote);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.patch("/quotations/:id", (req, res) => {
    try {
      const { app_status, temperature, priority, internal_notes, location } = req.body;
      const updates = {};
      if (app_status) updates.app_status = app_status;
      if (temperature) updates.temperature = temperature;
      if (priority) updates.priority = priority;
      if (internal_notes !== void 0) updates.internal_notes = internal_notes;
      if (location !== void 0) updates.location = location;
      const updated = db.updateQuotation(req.params.id, updates, DEFAULT_WORKSPACE_ID);
      if (!updated) {
        return res.status(404).json({ error: "Quotation not found" });
      }
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.post("/quotations/:id/status", (req, res) => {
    try {
      const { status, reason } = req.body;
      if (!["Won", "Lost", "Cancelled", "Active", "In Discussion", "Waiting for Client", "On Hold"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      const quote = db.getQuotationById(req.params.id, DEFAULT_WORKSPACE_ID);
      if (!quote) {
        return res.status(404).json({ error: "Quotation not found" });
      }
      const updates = { app_status: status };
      if (reason) {
        updates.internal_notes = quote.internal_notes ? `${quote.internal_notes}
[Status update note]: ${reason}` : `[Status update note]: ${reason}`;
      }
      const updated = db.updateQuotation(req.params.id, updates, DEFAULT_WORKSPACE_ID);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.post("/quotations/:id/archive", (req, res) => {
    try {
      const updated = db.archiveQuotation(req.params.id, DEFAULT_WORKSPACE_ID);
      if (!updated) {
        return res.status(404).json({ error: "Quotation not found" });
      }
      res.json({ success: true, quotation: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.delete("/quotations/:id", (req, res) => {
    try {
      const success = db.deleteQuotation(req.params.id, DEFAULT_WORKSPACE_ID);
      if (!success) {
        return res.status(404).json({ error: "Quotation not found" });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.get("/followups", (req, res) => {
    try {
      let followups = db.getFollowUps(DEFAULT_WORKSPACE_ID);
      const { tab, quotation_id, date, status } = req.query;
      if (quotation_id) {
        followups = followups.filter((f) => f.quotation_id === quotation_id);
      }
      if (date) {
        followups = followups.filter((f) => f.scheduled_date === date);
      }
      if (status && status !== "All") {
        followups = followups.filter((f) => f.status.toLowerCase() === status.toLowerCase());
      }
      if (tab) {
        if (tab === "today") {
          followups = followups.filter((f) => f.status === "Due");
        } else if (tab === "overdue") {
          followups = followups.filter((f) => f.status === "Overdue");
        } else if (tab === "upcoming") {
          followups = followups.filter((f) => f.status === "Scheduled");
        } else if (tab === "completed") {
          followups = followups.filter((f) => f.status === "Completed");
        }
      }
      const sender = req.query.sender || req.query.user;
      if (sender && sender !== "All") {
        const quotes = db.getQuotations(DEFAULT_WORKSPACE_ID);
        followups = followups.filter((f) => {
          const q = quotes.find((quote) => quote.id === f.quotation_id);
          return q && q.sender_name && q.sender_name.toLowerCase().includes(sender.toLowerCase());
        });
      }
      followups.sort((a, b) => {
        if (a.status === "Overdue" && b.status !== "Overdue") return -1;
        if (b.status === "Overdue" && a.status !== "Overdue") return 1;
        if (a.status === "Due" && b.status !== "Due") return -1;
        if (b.status === "Due" && a.status !== "Due") return 1;
        return a.scheduled_date.localeCompare(b.scheduled_date);
      });
      res.json(followups);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.post("/followups", (req, res) => {
    try {
      const { quotation_id, scheduled_date, scheduled_time, type, notes } = req.body;
      if (!quotation_id || !scheduled_date) {
        return res.status(400).json({ error: "quotation_id and scheduled_date are required" });
      }
      const followup = db.createFollowUp(
        {
          quotation_id,
          scheduled_date,
          scheduled_time: scheduled_time || "10:30",
          type: type || "Call",
          notes
        },
        DEFAULT_WORKSPACE_ID
      );
      res.status(201).json(followup);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  apiRouter.post("/followups/:id/complete", (req, res) => {
    try {
      const {
        outcome,
        notes,
        next_followup_date,
        next_followup_time,
        next_followup_type,
        next_followup_notes,
        temperature,
        app_status
      } = req.body;
      if (!outcome) {
        return res.status(400).json({ error: "Outcome is required to log follow-up completion" });
      }
      let nextAction = void 0;
      if (req.body.nextAction) {
        nextAction = req.body.nextAction;
      } else if (next_followup_date) {
        nextAction = {
          type: "custom",
          customDate: next_followup_date,
          customTime: next_followup_time || "10:30",
          followupType: next_followup_type || "Call"
        };
      }
      const result = db.completeFollowUp(
        req.params.id,
        {
          outcome,
          notes,
          nextAction
        },
        DEFAULT_WORKSPACE_ID
      );
      if (temperature || app_status) {
        const quoteId = result?.completed?.quotation_id;
        if (quoteId) {
          db.updateQuotation(quoteId, { temperature, app_status }, DEFAULT_WORKSPACE_ID);
        }
      }
      res.json({ success: true, followup: result.completed, nextFollowup: result.nextFollowup });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  apiRouter.post("/followups/:id/reschedule", (req, res) => {
    try {
      const { scheduled_date, scheduled_time, reason } = req.body;
      if (!scheduled_date) {
        return res.status(400).json({ error: "scheduled_date is required" });
      }
      const updated = db.rescheduleFollowUp(
        req.params.id,
        scheduled_date,
        scheduled_time || "10:30",
        reason,
        DEFAULT_WORKSPACE_ID
      );
      if (!updated) {
        return res.status(404).json({ error: "Follow-up not found" });
      }
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  apiRouter.get("/calendar/events", (req, res) => {
    try {
      const events = db.getCalendarEvents(DEFAULT_WORKSPACE_ID);
      res.json(events);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.post("/calendar/sync", (req, res) => {
    try {
      const {
        followup_id,
        provider,
        external_event_id,
        calendar_id,
        status,
        start_at,
        end_at,
        html_link
      } = req.body;
      if (!followup_id || !start_at || !end_at) {
        return res.status(400).json({ error: "followup_id, start_at, and end_at are required" });
      }
      const calEvent = db.upsertCalendarEvent(
        {
          followup_id,
          provider: provider || "google",
          external_event_id,
          calendar_id: calendar_id || "primary",
          status: status || "active",
          start_at,
          end_at,
          html_link
        },
        DEFAULT_WORKSPACE_ID
      );
      res.json(calEvent);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.delete("/calendar/events/:followup_id", (req, res) => {
    try {
      const success = db.deleteCalendarEvent(req.params.followup_id, DEFAULT_WORKSPACE_ID);
      res.json({ success });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.get("/clients", (req, res) => {
    try {
      const clients = db.getClients(DEFAULT_WORKSPACE_ID);
      res.json(clients);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.get("/clients/:id", (req, res) => {
    try {
      const client = db.getClientById(req.params.id, DEFAULT_WORKSPACE_ID);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      const quotations = db.getQuotations(DEFAULT_WORKSPACE_ID).filter((q) => q.client_id === client.id);
      res.json({ client, quotations });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.patch("/clients/:id/notes", (req, res) => {
    try {
      const { notes } = req.body;
      const updated = db.updateClient(req.params.id, { notes }, DEFAULT_WORKSPACE_ID);
      if (!updated) {
        return res.status(404).json({ error: "Client not found" });
      }
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.patch("/clients/:id/location", (req, res) => {
    try {
      const { location } = req.body;
      const updated = db.updateClient(req.params.id, { location: location || null }, DEFAULT_WORKSPACE_ID);
      if (!updated) {
        return res.status(404).json({ error: "Client not found" });
      }
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.get("/activities", (req, res) => {
    try {
      const { quotation_id, limit } = req.query;
      const activities = db.getActivities(
        DEFAULT_WORKSPACE_ID,
        quotation_id,
        limit ? parseInt(limit, 10) : 50
      );
      res.json(activities);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.get("/sync/status", (req, res) => {
    try {
      const status = db.getSyncStatus(DEFAULT_WORKSPACE_ID);
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.get("/sync/history", (req, res) => {
    try {
      const history = db.getSyncHistory(DEFAULT_WORKSPACE_ID);
      res.json(history);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.post("/sync/run", async (req, res) => {
    try {
      const { sheet_id, sheet_gid } = req.body || {};
      const result = await SyncService.runSync({
        workspaceId: DEFAULT_WORKSPACE_ID,
        sheetId: sheet_id,
        sheetGid: sheet_gid
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.get("/settings", (req, res) => {
    try {
      const settings = db.getSettings(DEFAULT_WORKSPACE_ID);
      res.json({
        settings,
        supabase: db.getSupabaseStatus()
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.patch("/settings", (req, res) => {
    try {
      const { sheet_id, sheet_gid, auto_sync_interval, followup_days, default_time } = req.body;
      const updated = db.updateSettings(
        DEFAULT_WORKSPACE_ID,
        {
          sheet_id,
          sheet_gid,
          auto_sync_interval,
          followup_days,
          default_time
        }
      );
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.post("/supabase/connect", (req, res) => {
    try {
      const { url, key } = req.body;
      if (!url || !key) {
        return res.status(400).json({ error: "Supabase URL and Key are required" });
      }
      db.initSupabase(url, key);
      res.json({
        success: true,
        status: db.getSupabaseStatus()
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.post("/supabase/sync-all", async (req, res) => {
    try {
      await db.syncAllToSupabase(DEFAULT_WORKSPACE_ID);
      res.json({
        success: true,
        message: "All local quotation records synced to Supabase successfully."
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  apiRouter.post("/supabase/hydrate", async (req, res) => {
    try {
      const success = await db.hydrateFromSupabase(DEFAULT_WORKSPACE_ID);
      res.json({
        success,
        quotationsCount: db.getQuotations(DEFAULT_WORKSPACE_ID).length,
        clientsCount: db.getClients(DEFAULT_WORKSPACE_ID).length
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.use("/api", apiRouter);
  app.use("/", apiRouter);
  return app;
}

// api/index.ts
var appInstance = null;
function getApp() {
  if (!appInstance) {
    appInstance = createExpressApp();
  }
  return appInstance;
}
function handler(req, res) {
  try {
    const customReq = req;
    if (customReq.url === "/api" || customReq.url === "/" || customReq.url?.startsWith("/api?")) {
      const originalPath = customReq.headers?.["x-matched-path"] || customReq.headers?.["x-now-route-matches"];
      if (typeof originalPath === "string" && originalPath.startsWith("/api/")) {
        customReq.url = originalPath;
      }
    }
    const app = getApp();
    return app(req, res);
  } catch (err) {
    console.error("[Vercel Serverless Function Crash]", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: err?.message || "Internal Server Error" }));
    }
  }
}
export {
  handler as default
};
