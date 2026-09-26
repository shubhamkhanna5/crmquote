import {
  DashboardMetrics,
  Quotation,
  FollowUp,
  Client,
  Activity,
  SyncRun,
  WorkspaceSettings,
  FollowUpOutcome,
  FollowUpType,
  Temperature,
  Priority,
  AppStatus,
  CalendarEvent,
} from '../types';

export const api = {
  // Dashboard
  async getDashboard(sender?: string): Promise<DashboardMetrics> {
    const url = sender && sender !== 'All' ? `/api/dashboard?sender=${encodeURIComponent(sender)}` : '/api/dashboard';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load dashboard metrics');
    return res.json();
  },

  // Quotations
  async getQuotations(params?: {
    search?: string;
    status?: string;
    temperature?: string;
    priority?: string;
    followup?: string;
    pool_type?: string;
    sender?: string;
    age?: string;
    sort?: string;
  }): Promise<{
    quotations: Quotation[];
    total: number;
    filterOptions: { poolTypes: string[]; senders: string[] };
  }> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val) searchParams.set(key, val);
      });
    }
    const res = await fetch(`/api/quotations?${searchParams.toString()}`);
    if (!res.ok) throw new Error('Failed to load quotations');
    return res.json();
  },

  async getQuotationById(id: string): Promise<{
    quotation: Quotation;
    client: Client | null;
    followups: FollowUp[];
    activities: Activity[];
  }> {
    const res = await fetch(`/api/quotations/${id}`);
    if (!res.ok) throw new Error('Failed to load quotation');
    const data = await res.json();
    if (data && data.quotation) {
      return {
        quotation: data.quotation,
        client: data.client || null,
        followups: data.followups || [],
        activities: data.activities || [],
      };
    }
    return {
      quotation: data,
      client: data?.client || null,
      followups: data?.followups || [],
      activities: data?.activities || [],
    };
  },

  async updateQuotationAppFields(
    id: string,
    updates: {
      temperature?: Temperature;
      priority?: Priority;
      app_status?: AppStatus;
      internal_notes?: string;
      location?: string | null;
    }
  ): Promise<Quotation> {
    const res = await fetch(`/api/quotations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update quotation');
    return res.json();
  },

  async createQuotation(data: {
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
  }): Promise<{ quotation: Quotation; followup?: FollowUp | null }> {
    const res = await fetch('/api/quotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create quotation');
    }
    return res.json();
  },

  async recordQuotationAction(
    id: string,
    actionData: {
      type?: FollowUpType;
      outcome?: FollowUpOutcome;
      notes?: string;
      app_status?: AppStatus;
      temperature?: Temperature;
    }
  ): Promise<{ followup: FollowUp; quotation: Quotation }> {
    const res = await fetch(`/api/quotations/${id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(actionData),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to record quotation action');
    }
    return res.json();
  },

  // Follow-ups
  async getFollowUps(): Promise<FollowUp[]> {
    const res = await fetch('/api/followups');
    if (!res.ok) throw new Error('Failed to load follow-ups');
    return res.json();
  },

  async createFollowUp(data: {
    quotation_id: string;
    scheduled_date: string;
    scheduled_time?: string;
    type?: FollowUpType;
    notes?: string | null;
  }): Promise<FollowUp> {
    const res = await fetch('/api/followups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create follow-up');
    return res.json();
  },

  async completeFollowUp(
    id: string,
    data: {
      outcome: FollowUpOutcome;
      notes?: string;
      temperature?: Temperature;
      app_status?: AppStatus;
      nextAction?: {
        type: 'tomorrow' | '3_days' | '7_days' | 'custom' | 'none';
        customDate?: string;
        customTime?: string;
        followupType?: FollowUpType;
      };
    }
  ): Promise<{ completed: FollowUp; nextFollowup: FollowUp | null }> {
    const res = await fetch(`/api/followups/${id}/done`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to complete follow-up');
    return res.json();
  },

  async rescheduleFollowUp(
    id: string,
    newDate: string,
    newTime = '10:30'
  ): Promise<FollowUp> {
    const res = await fetch(`/api/followups/${id}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newDate, newTime }),
    });
    if (!res.ok) throw new Error('Failed to reschedule follow-up');
    return res.json();
  },

  async cancelFollowUp(id: string): Promise<FollowUp> {
    const res = await fetch(`/api/followups/${id}/cancel`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to cancel follow-up');
    return res.json();
  },

  // Bulk Operations
  async bulkAssignFollowUps(
    followupIds: string[],
    senderName: string
  ): Promise<{ updatedCount: number }> {
    const res = await fetch('/api/followups/bulk-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ followupIds, senderName }),
    });
    if (!res.ok) throw new Error('Failed to bulk assign follow-ups');
    return res.json();
  },

  async bulkRescheduleFollowUps(
    followupIds: string[],
    scheduledDate: string,
    notes?: string
  ): Promise<{ updatedCount: number }> {
    const res = await fetch('/api/followups/bulk-reschedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ followupIds, scheduledDate, notes }),
    });
    if (!res.ok) throw new Error('Failed to bulk reschedule follow-ups');
    return res.json();
  },

  // Calendar Sync
  async getCalendarEvents(): Promise<CalendarEvent[]> {
    const res = await fetch('/api/calendar/events');
    if (!res.ok) throw new Error('Failed to load calendar events');
    return res.json();
  },

  async recordCalendarSync(data: {
    followup_id: string;
    provider?: string;
    external_event_id?: string | null;
    calendar_id?: string | null;
    status?: string;
    start_at: string;
    end_at: string;
    html_link?: string | null;
  }): Promise<CalendarEvent> {
    const res = await fetch('/api/calendar/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to record calendar sync');
    return res.json();
  },

  async deleteCalendarSync(followupId: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/calendar/events/${followupId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete calendar event');
    return res.json();
  },

  // Clients
  async getClients(): Promise<Client[]> {
    const res = await fetch('/api/clients');
    if (!res.ok) throw new Error('Failed to load clients');
    return res.json();
  },

  async getClientById(id: string): Promise<{ client: Client; quotations: Quotation[] }> {
    const res = await fetch(`/api/clients/${id}`);
    if (!res.ok) throw new Error('Failed to load client details');
    return res.json();
  },

  async updateClientNotes(id: string, notes: string): Promise<Client> {
    const res = await fetch(`/api/clients/${id}/notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    if (!res.ok) throw new Error('Failed to update client notes');
    return res.json();
  },

  async updateClientLocation(id: string, location: string | null): Promise<Client> {
    const res = await fetch(`/api/clients/${id}/location`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location }),
    });
    if (!res.ok) throw new Error('Failed to update client location');
    return res.json();
  },

  // Activities
  async getActivities(): Promise<Activity[]> {
    const res = await fetch('/api/activities');
    if (!res.ok) throw new Error('Failed to load activities');
    return res.json();
  },

  // Sync
  async runSync(options?: {
    sheetId?: string;
    sheetGid?: string;
    csvContent?: string;
  }): Promise<SyncRun> {
    const res = await fetch('/api/sync/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    });
    if (!res.ok) throw new Error('Failed to trigger synchronization');
    return res.json();
  },

  async getSyncStatus(): Promise<{
    latestRun: SyncRun | null;
    settings: WorkspaceSettings;
  }> {
    const res = await fetch('/api/sync/status');
    if (!res.ok) throw new Error('Failed to load sync status');
    return res.json();
  },

  async getSyncHistory(): Promise<SyncRun[]> {
    const res = await fetch('/api/sync/history');
    if (!res.ok) throw new Error('Failed to load sync history');
    return res.json();
  },

  // Settings
  async getSettings(): Promise<{
    settings: WorkspaceSettings;
    supabase: { connected: boolean; url: string | null; hasKey: boolean };
  }> {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error('Failed to load settings');
    return res.json();
  },

  async updateSettings(data: Partial<WorkspaceSettings> & {
    supabase_url?: string;
    supabase_key?: string;
  }): Promise<{
    settings: WorkspaceSettings;
    supabase: { connected: boolean; url: string | null; hasKey: boolean };
  }> {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update settings');
    return res.json();
  },

  // Supabase Manual Sync
  async pushToSupabase(): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/supabase/push', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to sync to Supabase');
    }
    return res.json();
  },

  async pullFromSupabase(): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/supabase/pull', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to pull from Supabase');
    }
    return res.json();
  },
};
