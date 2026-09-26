import express from 'express';
import { db, DEFAULT_WORKSPACE_ID } from './db';
import { SyncService } from './syncService';
import { formatIndianCurrency, isTrialRecord } from './normalizer';
import { Quotation, FollowUp, AppStatus, Temperature, Priority } from './types';

let hydrationPromise: Promise<any> | null = null;
export async function ensureDataReady() {
  if (db.getQuotations(DEFAULT_WORKSPACE_ID).length > 0) return;
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      try {
        const hydrated = await db.hydrateFromSupabase(DEFAULT_WORKSPACE_ID);
        if (!hydrated && db.getQuotations(DEFAULT_WORKSPACE_ID).length === 0) {
          await SyncService.runSync({ workspaceId: DEFAULT_WORKSPACE_ID });
        }
      } catch (e) {
        console.warn('[Data Init Warning]', e);
      } finally {
        hydrationPromise = null;
      }
    })();
  }
  await hydrationPromise;
}

export function createExpressApp() {
  const app = express();

  app.use(express.json({ limit: '10mb' }));

  // Middleware to ensure data is loaded on serverless cold starts
  app.use(async (req, res, next) => {
    try {
      if (db.getQuotations(DEFAULT_WORKSPACE_ID).length === 0) {
        await ensureDataReady();
      }
    } catch (e) {
      console.warn('[Cold-start hydration warning]', e);
    }
    next();
  });

  // Create API router that works regardless of whether requests have /api prefix or not
  const apiRouter = express.Router();

  // Health & System Status
  apiRouter.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      supabase: db.getSupabaseStatus(),
      timestamp: new Date().toISOString(),
    });
  });

  // Dashboard Statistics (PRD Section 48 & 49)
  apiRouter.get('/dashboard', (req, res) => {
    try {
      let quotations = db.getQuotations(DEFAULT_WORKSPACE_ID).filter(
        (q) => !isTrialRecord(q.client_name, q.contact_number, q.contact_number_raw)
      );
      let followups = db.getFollowUps(DEFAULT_WORKSPACE_ID);

      const sender = (req.query.sender as string) || (req.query.user as string);
      if (sender && sender !== 'All') {
        quotations = quotations.filter(
          (q) => q.sender_name && q.sender_name.toLowerCase().includes(sender.toLowerCase())
        );
      }

      followups = followups.filter((f) => {
        const q = quotations.find((quote) => quote.id === f.quotation_id);
        return Boolean(q);
      });

      const activeStatuses: AppStatus[] = [
        'New',
        'Active',
        'In Discussion',
        'Waiting for Client',
        'On Hold',
      ];

      const totalQuotations = quotations.length;
      const activeQuotations = quotations.filter((q) => activeStatuses.includes(q.app_status));
      const wonQuotations = quotations.filter((q) => q.app_status === 'Won');
      const lostQuotations = quotations.filter((q) => q.app_status === 'Lost' || q.app_status === 'Cancelled');

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

      const overdueFollowups = followups.filter((f) => f.status === 'Overdue');
      const dueTodayFollowups = followups.filter((f) => f.status === 'Due');
      const upcomingFollowups = followups.filter((f) => f.status === 'Scheduled');

      const quotationsWithNoNextAction = activeQuotations.filter((q) => {
        const hasFutureFollowup = followups.some(
          (f) =>
            f.quotation_id === q.id &&
            ['Scheduled', 'Due', 'Overdue'].includes(f.status)
        );
        if (hasFutureFollowup) return false;

        const hasActionTaken = followups.some(
          (f) => f.quotation_id === q.id && f.status === 'Completed'
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
          hot: { count: activeQuotations.filter((q) => q.temperature === 'hot').length, value: hotValue },
          warm: { count: activeQuotations.filter((q) => q.temperature === 'warm').length, value: warmValue },
          cold: { count: activeQuotations.filter((q) => q.temperature === 'cold').length, value: coldValue },
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Quotations List & Filtering (PRD Section 50, 51, 52)
  apiRouter.get('/quotations', (req, res) => {
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
        sort,
      } = req.query as Record<string, string>;

      if (search) {
        const q = search.trim().toLowerCase();
        list = list.filter(
          (item) =>
            item.client_name.toLowerCase().includes(q) ||
            item.contact_number.toLowerCase().includes(q) ||
            (item.contact_number_raw && item.contact_number_raw.includes(q)) ||
            (item.pool_dimensions && item.pool_dimensions.toLowerCase().includes(q)) ||
            (item.pool_type && item.pool_type.toLowerCase().includes(q)) ||
            (item.sender_name && item.sender_name.toLowerCase().includes(q))
        );
      }

      if (status && status !== 'All') {
        list = list.filter((item) => item.app_status.toLowerCase() === status.toLowerCase());
      }

      if (temperature && temperature !== 'All') {
        list = list.filter((item) => item.temperature.toLowerCase() === temperature.toLowerCase());
      }

      if (priority && priority !== 'All') {
        list = list.filter((item) => item.priority.toLowerCase() === priority.toLowerCase());
      }

      if (pool_type && pool_type !== 'All') {
        list = list.filter(
          (item) => item.pool_type && item.pool_type.toLowerCase() === pool_type.toLowerCase()
        );
      }

      if (sender && sender !== 'All') {
        list = list.filter(
          (item) => item.sender_name && item.sender_name.toLowerCase() === sender.toLowerCase()
        );
      }

      if (followup) {
        if (followup === 'Overdue') {
          list = list.filter((item) => item.next_followup?.status === 'Overdue');
        } else if (followup === 'Due Today') {
          list = list.filter((item) => item.next_followup?.status === 'Due');
        } else if (followup === 'Upcoming') {
          list = list.filter((item) => item.next_followup?.status === 'Scheduled');
        } else if (followup === 'No Next Action') {
          list = list.filter((item) => !item.next_followup);
        }
      }

      if (age) {
        if (age === '0-7') {
          list = list.filter((item) => (item.age_days || 0) <= 7);
        } else if (age === '8-14') {
          list = list.filter((item) => (item.age_days || 0) >= 8 && (item.age_days || 0) <= 14);
        } else if (age === '15-30') {
          list = list.filter((item) => (item.age_days || 0) >= 15 && (item.age_days || 0) <= 30);
        } else if (age === '30+') {
          list = list.filter((item) => (item.age_days || 0) > 30);
        }
      }

      if (sort) {
        if (sort === 'newest') {
          list.sort((a, b) => b.quotation_date.localeCompare(a.quotation_date));
        } else if (sort === 'oldest') {
          list.sort((a, b) => a.quotation_date.localeCompare(b.quotation_date));
        } else if (sort === 'highest_value') {
          list.sort((a, b) => (b.quotation_price || 0) - (a.quotation_price || 0));
        } else if (sort === 'lowest_value') {
          list.sort((a, b) => (a.quotation_price || 0) - (b.quotation_price || 0));
        } else if (sort === 'client_name') {
          list.sort((a, b) => a.client_name.localeCompare(b.client_name));
        } else if (sort === 'next_followup') {
          list.sort((a, b) => {
            const dateA = a.next_followup ? a.next_followup.scheduled_date : '9999-99-99';
            const dateB = b.next_followup ? b.next_followup.scheduled_date : '9999-99-99';
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
          senders: uniqueSenders,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Quotation Details
  apiRouter.get('/quotations/:id', (req, res) => {
    try {
      const quote = db.getQuotationById(req.params.id, DEFAULT_WORKSPACE_ID);
      if (!quote) {
        return res.status(404).json({ error: 'Quotation not found' });
      }
      const client = quote.client_id ? db.getClientById(quote.client_id, DEFAULT_WORKSPACE_ID) : null;
      const followups = db.getFollowUpsByQuotationId(quote.id, DEFAULT_WORKSPACE_ID);
      const activities = db.getActivitiesByQuotationId(quote.id, DEFAULT_WORKSPACE_ID);

      res.json({
        quotation: quote,
        client,
        followups,
        activities,
        ...quote,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update Quotation Status / Temperature / Priority / Notes (PRD Section 38, 54, 55, 56)
  apiRouter.patch('/quotations/:id', (req, res) => {
    try {
      const { app_status, temperature, priority, internal_notes, location } = req.body;
      const updates: Partial<Quotation> = {};

      if (app_status) updates.app_status = app_status as AppStatus;
      if (temperature) updates.temperature = temperature as Temperature;
      if (priority) updates.priority = priority as Priority;
      if (internal_notes !== undefined) updates.internal_notes = internal_notes;
      if (location !== undefined) updates.location = location;

      const updated = db.updateQuotation(req.params.id, updates, DEFAULT_WORKSPACE_ID);
      if (!updated) {
        return res.status(404).json({ error: 'Quotation not found' });
      }

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Mark Quotation Won / Lost Shortcut
  apiRouter.post('/quotations/:id/status', (req, res) => {
    try {
      const { status, reason } = req.body;
      if (!['Won', 'Lost', 'Cancelled', 'Active', 'In Discussion', 'Waiting for Client', 'On Hold'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const quote = db.getQuotationById(req.params.id, DEFAULT_WORKSPACE_ID);
      if (!quote) {
        return res.status(404).json({ error: 'Quotation not found' });
      }

      const updates: Partial<Quotation> = { app_status: status as AppStatus };
      if (reason) {
        updates.internal_notes = quote.internal_notes
          ? `${quote.internal_notes}\n[Status update note]: ${reason}`
          : `[Status update note]: ${reason}`;
      }

      const updated = db.updateQuotation(req.params.id, updates, DEFAULT_WORKSPACE_ID);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Record Direct Action on Quotation
  apiRouter.post('/quotations/:id/action', (req, res) => {
    try {
      const { type, outcome, notes, app_status, temperature } = req.body;
      const quote = db.getQuotationById(req.params.id, DEFAULT_WORKSPACE_ID);
      if (!quote) {
        return res.status(404).json({ error: 'Quotation not found' });
      }

      const updates: Partial<Quotation> = {};
      if (app_status) updates.app_status = app_status;
      if (temperature) updates.temperature = temperature;
      if (outcome === 'Not interested') {
        updates.app_status = 'Lost';
        updates.temperature = 'cold';
      }
      if (notes) {
        updates.internal_notes = quote.internal_notes
          ? `${quote.internal_notes}\n[${type || 'Action'} - ${outcome || 'Logged'}]: ${notes}`
          : `[${type || 'Action'} - ${outcome || 'Logged'}]: ${notes}`;
      }

      const updatedQuote = db.updateQuotation(req.params.id, updates, DEFAULT_WORKSPACE_ID);

      const followup = db.createFollowUp(
        {
          quotation_id: quote.id,
          scheduled_date: new Date().toISOString().split('T')[0],
          scheduled_time: '10:30',
          type: type || 'Call',
          notes,
        },
        DEFAULT_WORKSPACE_ID
      );

      followup.status = 'Completed';
      followup.outcome = outcome || 'Spoke to client';
      followup.completed_at = new Date().toISOString();

      db.addActivity({
        workspace_id: DEFAULT_WORKSPACE_ID,
        quotation_id: quote.id,
        activity_type: 'followup_completed',
        description: `Action logged: ${type || 'Action'} — ${outcome || 'Completed'}${notes ? ` ("${notes}")` : ''}`,
        metadata: {
          type,
          outcome,
          notes,
        },
      });

      res.json({ followup, quotation: updatedQuote });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Archive Quotation (Soft Delete / Dismiss)
  apiRouter.post('/quotations/:id/archive', (req, res) => {
    try {
      const updated = db.archiveQuotation(req.params.id, DEFAULT_WORKSPACE_ID);
      if (!updated) {
        return res.status(404).json({ error: 'Quotation not found' });
      }
      res.json({ success: true, quotation: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete Quotation Permanently
  apiRouter.delete('/quotations/:id', (req, res) => {
    try {
      const success = db.deleteQuotation(req.params.id, DEFAULT_WORKSPACE_ID);
      if (!success) {
        return res.status(404).json({ error: 'Quotation not found' });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Follow-ups List & Filters (PRD Section 60, 61, 62)
  apiRouter.get('/followups', (req, res) => {
    try {
      let followups = db.getFollowUps(DEFAULT_WORKSPACE_ID);
      const { tab, quotation_id, date, status } = req.query as Record<string, string>;

      if (quotation_id) {
        followups = followups.filter((f) => f.quotation_id === quotation_id);
      }

      if (date) {
        followups = followups.filter((f) => f.scheduled_date === date);
      }

      if (status && status !== 'All') {
        followups = followups.filter((f) => f.status.toLowerCase() === status.toLowerCase());
      }

      if (tab) {
        if (tab === 'today') {
          followups = followups.filter((f) => f.status === 'Due');
        } else if (tab === 'overdue') {
          followups = followups.filter((f) => f.status === 'Overdue');
        } else if (tab === 'upcoming') {
          followups = followups.filter((f) => f.status === 'Scheduled');
        } else if (tab === 'completed') {
          followups = followups.filter((f) => f.status === 'Completed');
        }
      }

      const sender = (req.query.sender as string) || (req.query.user as string);
      if (sender && sender !== 'All') {
        const quotes = db.getQuotations(DEFAULT_WORKSPACE_ID);
        followups = followups.filter((f) => {
          const q = quotes.find((quote) => quote.id === f.quotation_id);
          return q && q.sender_name && q.sender_name.toLowerCase().includes(sender.toLowerCase());
        });
      }

      followups.sort((a, b) => {
        if (a.status === 'Overdue' && b.status !== 'Overdue') return -1;
        if (b.status === 'Overdue' && a.status !== 'Overdue') return 1;
        if (a.status === 'Due' && b.status !== 'Due') return -1;
        if (b.status === 'Due' && a.status !== 'Due') return 1;
        return a.scheduled_date.localeCompare(b.scheduled_date);
      });

      res.json(followups);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create Follow-up (Manual Schedule)
  apiRouter.post('/followups', (req, res) => {
    try {
      const { quotation_id, scheduled_date, scheduled_time, type, notes } = req.body;
      if (!quotation_id || !scheduled_date) {
        return res.status(400).json({ error: 'quotation_id and scheduled_date are required' });
      }

      const followup = db.createFollowUp(
        {
          quotation_id,
          scheduled_date,
          scheduled_time: scheduled_time || '10:30',
          type: type || 'Call',
          notes,
        },
        DEFAULT_WORKSPACE_ID
      );

      res.status(201).json(followup);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Complete Follow-up (PRD Section 42 & 43)
  apiRouter.post(['/followups/:id/complete', '/followups/:id/done'], (req, res) => {
    try {
      const {
        outcome,
        notes,
        next_followup_date,
        next_followup_time,
        next_followup_type,
        next_followup_notes,
        temperature,
        app_status,
      } = req.body;

      if (!outcome) {
        return res.status(400).json({ error: 'Outcome is required to log follow-up completion' });
      }

      let nextAction: any = undefined;
      if (req.body.nextAction) {
        nextAction = req.body.nextAction;
      } else if (next_followup_date) {
        nextAction = {
          type: 'custom',
          customDate: next_followup_date,
          customTime: next_followup_time || '10:30',
          followupType: next_followup_type || 'Call',
        };
      }

      const result = db.completeFollowUp(
        req.params.id,
        {
          outcome,
          notes,
          nextAction,
        },
        DEFAULT_WORKSPACE_ID
      );

      const finalTemp = outcome === 'Not interested' ? 'cold' : temperature;
      const finalStatus = outcome === 'Not interested' ? 'Lost' : app_status;
      if (finalTemp || finalStatus) {
        const quoteId = result?.completed?.quotation_id;
        if (quoteId) {
          db.updateQuotation(quoteId, { temperature: finalTemp, app_status: finalStatus }, DEFAULT_WORKSPACE_ID);
        }
      }

      res.json({ success: true, followup: result.completed, nextFollowup: result.nextFollowup });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Reschedule Follow-up (PRD Section 40)
  apiRouter.post('/followups/:id/reschedule', (req, res) => {
    try {
      const { scheduled_date, scheduled_time, reason } = req.body;
      if (!scheduled_date) {
        return res.status(400).json({ error: 'scheduled_date is required' });
      }

      const updated = db.rescheduleFollowUp(
        req.params.id,
        scheduled_date,
        scheduled_time || '10:30',
        reason,
        DEFAULT_WORKSPACE_ID
      );

      if (!updated) {
        return res.status(404).json({ error: 'Follow-up not found' });
      }

      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Calendar Event Integration Endpoints
  apiRouter.get('/calendar/events', (req, res) => {
    try {
      const events = db.getCalendarEvents(DEFAULT_WORKSPACE_ID);
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.post('/calendar/sync', (req, res) => {
    try {
      const {
        followup_id,
        provider,
        external_event_id,
        calendar_id,
        status,
        start_at,
        end_at,
        html_link,
      } = req.body;

      if (!followup_id || !start_at || !end_at) {
        return res.status(400).json({ error: 'followup_id, start_at, and end_at are required' });
      }

      const calEvent = db.upsertCalendarEvent(
        {
          followup_id,
          provider: provider || 'google',
          external_event_id,
          calendar_id: calendar_id || 'primary',
          status: status || 'active',
          start_at,
          end_at,
          html_link,
        },
        DEFAULT_WORKSPACE_ID
      );

      res.json(calEvent);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.delete('/calendar/events/:followup_id', (req, res) => {
    try {
      const success = db.deleteCalendarEvent(req.params.followup_id, DEFAULT_WORKSPACE_ID);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Clients List (PRD Section 19, 20, 53)
  apiRouter.get('/clients', (req, res) => {
    try {
      const clients = db.getClients(DEFAULT_WORKSPACE_ID);
      res.json(clients);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Client Details
  apiRouter.get('/clients/:id', (req, res) => {
    try {
      const client = db.getClientById(req.params.id, DEFAULT_WORKSPACE_ID);
      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }
      const quotations = db.getQuotations(DEFAULT_WORKSPACE_ID).filter((q) => q.client_id === client.id);
      res.json({ client, quotations });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update Client Notes
  apiRouter.patch('/clients/:id/notes', (req, res) => {
    try {
      const { notes } = req.body;
      const updated = db.updateClient(req.params.id, { notes }, DEFAULT_WORKSPACE_ID);
      if (!updated) {
        return res.status(404).json({ error: 'Client not found' });
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update Client Location
  apiRouter.patch('/clients/:id/location', (req, res) => {
    try {
      const { location } = req.body;
      const updated = db.updateClient(req.params.id, { location: location || null }, DEFAULT_WORKSPACE_ID);
      if (!updated) {
        return res.status(404).json({ error: 'Client not found' });
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Timeline / Activity Log (PRD Section 58 & 59)
  apiRouter.get('/activities', (req, res) => {
    try {
      const { quotation_id, limit } = req.query as Record<string, string>;
      const activities = db.getActivities(
        DEFAULT_WORKSPACE_ID,
        quotation_id,
        limit ? parseInt(limit, 10) : 50
      );
      res.json(activities);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Sync Status & Trigger (PRD Section 63 & 64)
  apiRouter.get('/sync/status', (req, res) => {
    try {
      const status = db.getSyncStatus(DEFAULT_WORKSPACE_ID);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.get('/sync/history', (req, res) => {
    try {
      const history = db.getSyncHistory(DEFAULT_WORKSPACE_ID);
      res.json(history);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.post('/sync/run', async (req, res) => {
    try {
      const { sheet_id, sheet_gid } = req.body || {};
      const result = await SyncService.runSync({
        workspaceId: DEFAULT_WORKSPACE_ID,
        sheetId: sheet_id,
        sheetGid: sheet_gid,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Settings
  apiRouter.get('/settings', (req, res) => {
    try {
      const settings = db.getSettings(DEFAULT_WORKSPACE_ID);
      res.json({
        settings,
        supabase: db.getSupabaseStatus(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.patch('/settings', (req, res) => {
    try {
      const { sheet_id, sheet_gid, auto_sync_interval, followup_days, default_time } = req.body;
      const updated = db.updateSettings(
        DEFAULT_WORKSPACE_ID,
        {
          sheet_id,
          sheet_gid,
          auto_sync_interval,
          followup_days,
          default_time,
        }
      );
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Supabase Manual Sync & Reconnect Endpoints
  apiRouter.post('/supabase/connect', (req, res) => {
    try {
      const { url, key } = req.body;
      if (!url || !key) {
        return res.status(400).json({ error: 'Supabase URL and Key are required' });
      }
      db.initSupabase(url, key);
      res.json({
        success: true,
        status: db.getSupabaseStatus(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.post('/supabase/sync-all', async (req, res) => {
    try {
      await db.syncAllToSupabase(DEFAULT_WORKSPACE_ID);
      res.json({
        success: true,
        message: 'All local quotation records synced to Supabase successfully.',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.post('/supabase/hydrate', async (req, res) => {
    try {
      const success = await db.hydrateFromSupabase(DEFAULT_WORKSPACE_ID);
      res.json({
        success,
        quotationsCount: db.getQuotations(DEFAULT_WORKSPACE_ID).length,
        clientsCount: db.getClients(DEFAULT_WORKSPACE_ID).length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Mount API router on BOTH /api and root / so any Vercel rewrite or direct path matches cleanly
  app.use('/api', apiRouter);
  app.use('/', apiRouter);

  return app;
}
