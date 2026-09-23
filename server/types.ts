export type Temperature = 'hot' | 'warm' | 'cold';
export type Priority = 'normal' | 'high';
export type AppStatus =
  | 'New'
  | 'Active'
  | 'In Discussion'
  | 'Waiting for Client'
  | 'On Hold'
  | 'Won'
  | 'Lost'
  | 'Cancelled';

export type FollowUpType =
  | 'Call'
  | 'WhatsApp'
  | 'Email'
  | 'Meeting'
  | 'Site Visit'
  | 'Other';

export type FollowUpStatus =
  | 'Scheduled'
  | 'Due'
  | 'Overdue'
  | 'Completed'
  | 'Rescheduled'
  | 'Cancelled';

export type FollowUpOutcome =
  | 'No answer'
  | 'Spoke to client'
  | 'Interested'
  | 'Asked for revision'
  | 'Asked for better price'
  | 'Waiting for decision'
  | 'Decision maker not available'
  | 'Call back later'
  | 'Not interested'
  | 'Sent quotation/specs'
  | 'Meeting fixed'
  | 'Negotiation ongoing'
  | 'Other';

export interface Quotation {
  id: string;
  workspace_id: string;
  source_id: string;
  client_id?: string | null;
  quotation_date: string; // YYYY-MM-DD
  client_name: string;
  quotation_price: number;
  sender_name: string;
  pool_dimensions: string;
  pool_type: string;
  contact_number: string;
  contact_number_raw?: string;
  source_status: string; // SENT, LOST
  temperature: Temperature;
  priority: Priority;
  app_status: AppStatus;
  source_present: boolean;
  source_last_seen_at: string;
  source_updated_at: string;
  archived_at?: string | null;
  internal_notes?: string | null;
  location?: string | null;
  created_at: string;
  updated_at: string;
  // Computed client-side / join fields
  next_followup?: FollowUp | null;
  latest_completed_followup?: FollowUp | null;
  has_action_taken?: boolean;
  age_days?: number;
}

export interface Client {
  id: string;
  workspace_id: string;
  name: string;
  phone: string;
  contact_number_raw?: string;
  location?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  quotations_count?: number;
  active_quotations_count?: number;
  total_quoted_value?: number;
}

export interface FollowUp {
  id: string;
  workspace_id: string;
  quotation_id: string;
  scheduled_date: string; // YYYY-MM-DD
  scheduled_time: string; // HH:mm
  type: FollowUpType;
  status: FollowUpStatus;
  outcome?: FollowUpOutcome | null;
  notes?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  // Populated details
  quotation?: {
    client_name: string;
    quotation_price: number;
    pool_type: string;
    pool_dimensions: string;
    contact_number: string;
    temperature: Temperature;
    priority: Priority;
    app_status: AppStatus;
    sender_name: string;
    quotation_date?: string;
    location?: string | null;
  };
  calendar_event?: CalendarEvent | null;
}

export type CalendarProvider = 'google' | 'apple' | 'outlook' | 'ics';

export interface CalendarEvent {
  id: string;
  workspace_id: string;
  followup_id: string;
  provider: CalendarProvider;
  external_event_id?: string | null;
  calendar_id?: string | null;
  status: 'active' | 'cancelled' | 'updated';
  start_at: string;
  end_at: string;
  html_link?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  workspace_id: string;
  quotation_id?: string | null;
  user_id?: string | null;
  activity_type:
    | 'quotation_synced'
    | 'quotation_created'
    | 'quotation_updated'
    | 'followup_created'
    | 'followup_completed'
    | 'followup_rescheduled'
    | 'followup_cancelled'
    | 'status_changed'
    | 'temperature_changed'
    | 'priority_changed'
    | 'note_added'
    | 'calendar_event_created'
    | 'calendar_event_updated'
    | 'calendar_event_cancelled';
  description: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface SyncRun {
  id: string;
  workspace_id: string;
  started_at: string;
  completed_at?: string | null;
  rows_found: number;
  records_created: number;
  records_updated: number;
  records_unchanged: number;
  records_failed: number;
  status: 'running' | 'completed' | 'completed_with_errors' | 'failed';
  error_message?: string | null;
  error_details?: Array<{
    source_id?: string;
    client_name?: string;
    error: string;
    raw?: any;
  }>;
}

export interface WorkspaceSettings {
  id: string;
  workspace_id: string;
  sheet_id: string;
  sheet_gid: string;
  auto_sync_interval: 'manual' | '15m' | '30m' | '1h' | '4h';
  followup_days: string; // e.g. "3,7,14,21,30"
  default_time: string;  // e.g. "10:30"
  updated_at: string;
}

export interface SheetRowValidation {
  valid: boolean;
  errors: string[];
  row?: {
    source_id: string;
    quotation_date: string;
    client_name: string;
    quotation_price: number;
    sender_name: string;
    pool_dimensions: string;
    pool_type: string;
    contact_number: string;
    contact_number_raw: string;
    source_status: string;
  };
}
