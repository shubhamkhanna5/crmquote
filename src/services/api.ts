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

async function requestJson<T = any>(
  url: string,
  options?: RequestInit,
  fallbackError = 'Request failed'
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (netErr: any) {
    throw new Error(`Network error connecting to server: ${netErr?.message || 'Check connection'}`);
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    let errMsg = fallbackError;
    if (isJson) {
      try {
        const body = await res.json();
        errMsg = body.error || body.message || fallbackError;
      } catch {
        // Failed to parse JSON error
      }
    } else {
      const text = await res.text().catch(() => '');
      if (text && !text.trim().startsWith('<')) {
        errMsg = text.slice(0, 200);
      } else {
        errMsg = `${fallbackError} (${res.status} ${res.statusText || 'Error'})`;
      }
    }
    throw new Error(errMsg);
  }

  if (!isJson) {
    const text = await res.text().catch(() => '');
    if (text.trim().startsWith('<')) {
      throw new Error(`Server returned HTML instead of expected JSON for ${url}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  return res.json();
}

export const api = {
  // Dashboard
  async getDashboard(sender?: string): Promise<DashboardMetrics> {
    const url = sender && sender !== 'All' ? `/api/dashboard?sender=${encodeURIComponent(sender)}` : '/api/dashboard';
    return requestJson<DashboardMetrics>(url, undefined, 'Failed to load dashboard metrics');
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
    return requestJson(`/api/quotations?${searchParams.toString()}`, undefined, 'Failed to load quotations');
  },

  async getQuotationById(id: string): Promise<{
    quotation: Quotation;
    client: Client | null;
    followups: FollowUp[];
    activities: Activity[];
  }> {
    const data = await requestJson<any>(`/api/quotations/${id}`, undefined, 'Failed to load quotation');
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
    return requestJson<Quotation>(
      `/api/quotations/${id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      },
      'Failed to update quotation'
    );
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
    return requestJson(
      '/api/quotations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
      'Failed to create quotation'
    );
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
    return requestJson(
      `/api/quotations/${id}/action`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actionData),
      },
      'Failed to record quotation action'
    );
  },

  // Follow-ups
  async getFollowUps(): Promise<FollowUp[]> {
    return requestJson<FollowUp[]>('/api/followups', undefined, 'Failed to load follow-ups');
  },

  async createFollowUp(data: {
    quotation_id: string;
    scheduled_date: string;
    scheduled_time?: string;
    type?: FollowUpType;
    notes?: string | null;
  }): Promise<FollowUp> {
    return requestJson<FollowUp>(
      '/api/followups',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
      'Failed to create follow-up'
    );
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
    return requestJson(
      `/api/followups/${id}/done`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
      'Failed to complete follow-up'
    );
  },

  async rescheduleFollowUp(
    id: string,
    newDate: string,
    newTime = '10:30'
  ): Promise<FollowUp> {
    return requestJson<FollowUp>(
      `/api/followups/${id}/reschedule`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newDate, newTime }),
      },
      'Failed to reschedule follow-up'
    );
  },

  async cancelFollowUp(id: string): Promise<FollowUp> {
    return requestJson<FollowUp>(
      `/api/followups/${id}/cancel`,
      {
        method: 'POST',
      },
      'Failed to cancel follow-up'
    );
  },

  // Bulk Operations
  async bulkAssignFollowUps(
    followupIds: string[],
    senderName: string
  ): Promise<{ updatedCount: number }> {
    return requestJson(
      '/api/followups/bulk-assign',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followupIds, senderName }),
      },
      'Failed to bulk assign follow-ups'
    );
  },

  async bulkRescheduleFollowUps(
    followupIds: string[],
    scheduledDate: string,
    notes?: string
  ): Promise<{ updatedCount: number }> {
    return requestJson(
      '/api/followups/bulk-reschedule',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followupIds, scheduledDate, notes }),
      },
      'Failed to bulk reschedule follow-ups'
    );
  },

  // Calendar Sync
  async getCalendarEvents(): Promise<CalendarEvent[]> {
    return requestJson<CalendarEvent[]>('/api/calendar/events', undefined, 'Failed to load calendar events');
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
    return requestJson<CalendarEvent>(
      '/api/calendar/sync',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
      'Failed to record calendar sync'
    );
  },

  async deleteCalendarSync(followupId: string): Promise<{ success: boolean }> {
    return requestJson<{ success: boolean }>(
      `/api/calendar/events/${followupId}`,
      {
        method: 'DELETE',
      },
      'Failed to delete calendar event'
    );
  },

  // Clients
  async getClients(): Promise<Client[]> {
    return requestJson<Client[]>('/api/clients', undefined, 'Failed to load clients');
  },

  async getClientById(id: string): Promise<{ client: Client; quotations: Quotation[] }> {
    return requestJson<{ client: Client; quotations: Quotation[] }>(
      `/api/clients/${id}`,
      undefined,
      'Failed to load client details'
    );
  },

  async updateClientNotes(id: string, notes: string): Promise<Client> {
    return requestJson<Client>(
      `/api/clients/${id}/notes`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      },
      'Failed to update client notes'
    );
  },

  async updateClientLocation(id: string, location: string | null): Promise<Client> {
    return requestJson<Client>(
      `/api/clients/${id}/location`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location }),
      },
      'Failed to update client location'
    );
  },

  // Activities
  async getActivities(): Promise<Activity[]> {
    return requestJson<Activity[]>('/api/activities', undefined, 'Failed to load activities');
  },

  // Sync
  async runSync(options?: {
    sheetId?: string;
    sheetGid?: string;
    csvContent?: string;
  }): Promise<SyncRun> {
    return requestJson<SyncRun>(
      '/api/sync/run',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {}),
      },
      'Failed to trigger synchronization'
    );
  },

  async getSyncStatus(): Promise<{
    latestRun: SyncRun | null;
    settings: WorkspaceSettings;
  }> {
    return requestJson('/api/sync/status', undefined, 'Failed to load sync status');
  },

  async getSyncHistory(): Promise<SyncRun[]> {
    return requestJson<SyncRun[]>('/api/sync/history', undefined, 'Failed to load sync history');
  },

  // Settings
  async getSettings(): Promise<{
    settings: WorkspaceSettings;
    supabase: { connected: boolean; url: string | null; hasKey: boolean };
  }> {
    return requestJson('/api/settings', undefined, 'Failed to load settings');
  },

  async updateSettings(data: Partial<WorkspaceSettings> & {
    supabase_url?: string;
    supabase_key?: string;
  }): Promise<{
    settings: WorkspaceSettings;
    supabase: { connected: boolean; url: string | null; hasKey: boolean };
  }> {
    return requestJson(
      '/api/settings',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
      'Failed to update settings'
    );
  },

  // Supabase Manual Sync
  async pushToSupabase(): Promise<{ success: boolean; message: string }> {
    return requestJson<{ success: boolean; message: string }>(
      '/api/supabase/push',
      { method: 'POST' },
      'Failed to sync to Supabase'
    );
  },

  async pullFromSupabase(): Promise<{ success: boolean; message: string }> {
    return requestJson<{ success: boolean; message: string }>(
      '/api/supabase/pull',
      { method: 'POST' },
      'Failed to pull from Supabase'
    );
  },
};
