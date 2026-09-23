-- ==========================================================
-- Quotation Follow-Up Manager: Complete Supabase PostgreSQL Schema
-- Migration: 20260101000000_init_quotation_crm.sql
-- Compatible with text IDs (default-workspace) and UUID strings
-- ==========================================================

-- 1. Workspaces Table
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Workspace Members Table
CREATE TABLE IF NOT EXISTS workspace_members (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member', -- owner, admin, member
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Clients Table
CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    contact_number_raw TEXT,
    location TEXT DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Quotations Table
CREATE TABLE IF NOT EXISTS quotations (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL, -- Sheet ID (e.g. sachin panse_8446006488)
    client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
    quotation_date DATE NOT NULL,
    client_name TEXT NOT NULL,
    quotation_price NUMERIC NOT NULL,
    sender_name TEXT,
    pool_dimensions TEXT,
    pool_type TEXT,
    contact_number TEXT NOT NULL,
    contact_number_raw TEXT,
    source_status TEXT NOT NULL DEFAULT 'SENT', -- SENT, LOST from Sheet
    temperature TEXT NOT NULL DEFAULT 'warm', -- hot, warm, cold
    priority TEXT NOT NULL DEFAULT 'normal', -- normal, high
    app_status TEXT NOT NULL DEFAULT 'New', -- New, Active, In Discussion, Waiting for Client, On Hold, Won, Lost, Cancelled
    source_present BOOLEAN NOT NULL DEFAULT true,
    source_last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    source_updated_at TIMESTAMPTZ DEFAULT NOW(),
    archived_at TIMESTAMPTZ DEFAULT NULL,
    internal_notes TEXT DEFAULT NULL,
    location TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_workspace_source_id UNIQUE (workspace_id, source_id)
);

-- 5. Follow-ups Table
CREATE TABLE IF NOT EXISTS followups (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    scheduled_time TEXT NOT NULL DEFAULT '10:30',
    type TEXT NOT NULL DEFAULT 'Call', -- Call, WhatsApp, Email, Meeting, Site Visit, Other
    status TEXT NOT NULL DEFAULT 'Scheduled', -- Scheduled, Due, Overdue, Completed, Rescheduled, Cancelled
    outcome TEXT DEFAULT NULL, -- Spoke to client, Interested, Asked for revision, Call back later, etc.
    notes TEXT DEFAULT NULL,
    completed_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Activities Log Table
CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    quotation_id TEXT REFERENCES quotations(id) ON DELETE CASCADE,
    user_id TEXT,
    activity_type TEXT NOT NULL, -- quotation_synced, followup_completed, etc.
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Calendar Events Table
CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    followup_id TEXT REFERENCES followups(id) ON DELETE CASCADE,
    external_provider TEXT NOT NULL DEFAULT 'ics', -- ics, google, apple, outlook
    external_event_id TEXT DEFAULT NULL,
    title TEXT NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Sync Runs History Table
CREATE TABLE IF NOT EXISTS sync_runs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    rows_found INTEGER NOT NULL DEFAULT 0,
    records_created INTEGER NOT NULL DEFAULT 0,
    records_updated INTEGER NOT NULL DEFAULT 0,
    records_unchanged INTEGER NOT NULL DEFAULT 0,
    records_failed INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'running', -- running, completed, completed_with_errors, failed
    error_message TEXT DEFAULT NULL,
    error_details JSONB DEFAULT '[]'::jsonb
);

-- 9. Workspace Settings Table
CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    workspace_id TEXT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    sheet_id TEXT NOT NULL DEFAULT '1ReM-fqeHpFqetNa4vPhfDhk4uapexmKKwwZMGPuJR84',
    sheet_gid TEXT NOT NULL DEFAULT '0',
    auto_sync_interval TEXT NOT NULL DEFAULT '15m', -- manual, 15m, 30m, 1h, 4h
    followup_days TEXT NOT NULL DEFAULT '3,7,14,21,30',
    default_time TEXT NOT NULL DEFAULT '10:30',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Minimum Required Database Indexes
CREATE INDEX IF NOT EXISTS idx_quotations_workspace_id ON quotations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_quotations_source_id ON quotations(source_id);
CREATE INDEX IF NOT EXISTS idx_quotations_client_id ON quotations(client_id);
CREATE INDEX IF NOT EXISTS idx_quotations_quotation_date ON quotations(quotation_date);
CREATE INDEX IF NOT EXISTS idx_quotations_app_status ON quotations(app_status);
CREATE INDEX IF NOT EXISTS idx_quotations_temperature ON quotations(temperature);
CREATE INDEX IF NOT EXISTS idx_quotations_priority ON quotations(priority);
CREATE INDEX IF NOT EXISTS idx_quotations_contact_number ON quotations(contact_number);
CREATE INDEX IF NOT EXISTS idx_quotations_archived_at ON quotations(archived_at);

CREATE INDEX IF NOT EXISTS idx_followups_workspace_id ON followups(workspace_id);
CREATE INDEX IF NOT EXISTS idx_followups_quotation_id ON followups(quotation_id);
CREATE INDEX IF NOT EXISTS idx_followups_scheduled_date ON followups(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_followups_status ON followups(status);

CREATE INDEX IF NOT EXISTS idx_clients_workspace_id ON clients(workspace_id);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);

CREATE INDEX IF NOT EXISTS idx_activities_quotation_id ON activities(quotation_id);
CREATE INDEX IF NOT EXISTS idx_activities_workspace_id ON activities(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sync_runs_workspace_id ON sync_runs(workspace_id);

-- Enable Row Level Security (RLS)
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Allow access to members of the workspace)
CREATE POLICY "Users access own workspaces" ON workspaces
    FOR ALL USING (
        id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Users access own workspace members" ON workspace_members
    FOR ALL USING (
        workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Users access own clients" ON clients
    FOR ALL USING (
        workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Users access own quotations" ON quotations
    FOR ALL USING (
        workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Users access own followups" ON followups
    FOR ALL USING (
        workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Users access own activities" ON activities
    FOR ALL USING (
        workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Users access own calendar events" ON calendar_events
    FOR ALL USING (
        workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Users access own sync runs" ON sync_runs
    FOR ALL USING (
        workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Users access own settings" ON settings
    FOR ALL USING (
        workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
    );

-- Idempotent column additions for existing installations
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS location TEXT DEFAULT NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS location TEXT DEFAULT NULL;

