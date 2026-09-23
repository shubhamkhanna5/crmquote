import React, { useState, useMemo } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Flame,
  LayoutGrid,
  List,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  UserCheck,
  X,
  CalendarDays,
  Zap,
} from 'lucide-react';
import { FollowUp, Quotation, DashboardMetrics, isTrialRecord, AppStatus, Temperature, FollowUpType } from '../types';
import { formatIndianCurrency } from '../../server/normalizer';
import { useToast } from './Toast';
import { BulkRescheduleModal } from './BulkRescheduleModal';
import { RecordActionModal } from './RecordActionModal';
import { api } from '../services/api';
import {
  isGoogleCalendarConnected,
  syncFollowUpToGoogleCalendar,
} from '../services/googleCalendar';
import {
  QUICK_SCHEDULE_PRESETS,
  getQuickScheduleDate,
  generateWhatsAppUrl,
  STAGE_OPTIONS,
} from '../utils/quotationActions';
import { getQuotationLocation } from '../utils/locationUtils';

interface MyDayViewProps {
  metrics: DashboardMetrics | null;
  followups: FollowUp[];
  quotations: Quotation[];
  onOpenQuotation: (quotationId: string) => void;
  onOpenDoneModal: (followup: FollowUp) => void;
  onOpenRescheduleModal: (followup: FollowUp) => void;
  onOpenNewFollowUpForQuotation: (quotationId: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onBulkActionSuccess?: () => void;
}

type KpiFilter = 'all' | 'overdue' | 'due_today' | 'no_next_action' | 'upcoming';
type ViewMode = 'list' | 'cards';
type SortOption = 'urgency' | 'deadline_asc' | 'deadline_desc' | 'amount_desc' | 'amount_asc' | 'temperature';

export const MyDayView: React.FC<MyDayViewProps> = ({
  metrics,
  followups: rawFollowups,
  quotations: rawQuotations,
  onOpenQuotation,
  onOpenDoneModal,
  onOpenRescheduleModal,
  onOpenNewFollowUpForQuotation,
  onRefresh,
  isRefreshing,
  onBulkActionSuccess,
}) => {
  const { showToast } = useToast();
  const todayStr = new Date().toISOString().split('T')[0];

  // View preferences
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>('all');
  const [showFutureScheduled, setShowFutureScheduled] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tempFilter, setTempFilter] = useState<string>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [amountFilter, setAmountFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('urgency');

  // Expansion state for compact list view rows
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRescheduleOpen, setBulkRescheduleOpen] = useState(false);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // Filter out trial records
  const followups = useMemo(
    () =>
      rawFollowups.filter(
        (f) => !isTrialRecord(f.quotation?.client_name, f.quotation?.contact_number)
      ),
    [rawFollowups]
  );

  const quotations = useMemo(
    () =>
      rawQuotations.filter(
        (q) => !isTrialRecord(q.client_name, q.contact_number, q.contact_number_raw)
      ),
    [rawQuotations]
  );

  // Categorize
  const overdueFollowups = useMemo(
    () => followups.filter((f) => f.status === 'Overdue'),
    [followups]
  );

  const dueTodayFollowups = useMemo(
    () => followups.filter((f) => f.status === 'Due'),
    [followups]
  );

  const upcomingFollowups = useMemo(
    () => followups.filter((f) => f.status === 'Scheduled' && f.scheduled_date > todayStr),
    [followups, todayStr]
  );

  const activeStatuses = ['New', 'Active', 'In Discussion', 'Waiting for Client', 'On Hold'];
  const quotationsWithNoNextAction = useMemo(() => {
    return quotations
      .filter((q) => {
        if (!activeStatuses.includes(q.app_status)) return false;
        // Don't show if there is an active future follow-up
        const hasFuture = followups.some(
          (f) =>
            f.quotation_id === q.id &&
            ['Scheduled', 'Due', 'Overdue'].includes(f.status)
        );
        if (hasFuture) return false;

        // Don't show if an action has already been taken on this lead
        const hasCompletedFollowup = followups.some(
          (f) => f.quotation_id === q.id && f.status === 'Completed'
        );
        if (hasCompletedFollowup || q.has_action_taken) return false;

        return true;
      })
      .sort((a, b) => b.quotation_date.localeCompare(a.quotation_date));
  }, [quotations, followups]);

  // Combined workload items depending on active KPI filter
  const baseItems = useMemo(() => {
    if (kpiFilter === 'overdue') return overdueFollowups;
    if (kpiFilter === 'due_today') return dueTodayFollowups;
    if (kpiFilter === 'upcoming') return upcomingFollowups;
    if (kpiFilter === 'no_next_action') return []; // Handled in separate section or when filtered
    // 'all' shows active actionable followups requiring attention (Overdue + Due Today)
    // Future scheduled leads are excluded unless explicitly opted in or viewed in the 'Upcoming' KPI tab
    if (showFutureScheduled) {
      return [...overdueFollowups, ...dueTodayFollowups, ...upcomingFollowups];
    }
    return [...overdueFollowups, ...dueTodayFollowups];
  }, [kpiFilter, overdueFollowups, dueTodayFollowups, upcomingFollowups, showFutureScheduled]);

  // Apply filters, search and sorting to base follow-up workload
  const filteredFollowups = useMemo(() => {
    let list = [...baseItems];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((item) => {
        const client = item.quotation?.client_name?.toLowerCase() || '';
        const phone = item.quotation?.contact_number?.toLowerCase() || '';
        const pool = item.quotation?.pool_type?.toLowerCase() || '';
        const id = item.quotation_id?.toLowerCase() || '';
        const loc = item.quotation ? getQuotationLocation(item.quotation).toLowerCase() : '';
        return client.includes(q) || phone.includes(q) || pool.includes(q) || id.includes(q) || loc.includes(q);
      });
    }

    if (tempFilter !== 'all') {
      list = list.filter((item) => item.quotation?.temperature === tempFilter);
    }

    if (ownerFilter !== 'all') {
      list = list.filter((item) => {
        const sender = item.quotation?.sender_name?.toLowerCase() || '';
        return sender.includes(ownerFilter.toLowerCase());
      });
    }

    if (amountFilter !== 'all') {
      list = list.filter((item) => {
        const price = item.quotation?.quotation_price || 0;
        if (amountFilter === 'under_5l') return price < 500000;
        if (amountFilter === '5l_15l') return price >= 500000 && price <= 1500000;
        if (amountFilter === 'over_15l') return price > 1500000;
        return true;
      });
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === 'urgency') {
        const statusRank: Record<string, number> = { Overdue: 1, Due: 2, Scheduled: 3 };
        const rankA = statusRank[a.status] || 4;
        const rankB = statusRank[b.status] || 4;
        if (rankA !== rankB) return rankA - rankB;
        return a.scheduled_date.localeCompare(b.scheduled_date);
      }
      if (sortBy === 'deadline_asc') return a.scheduled_date.localeCompare(b.scheduled_date);
      if (sortBy === 'deadline_desc') return b.scheduled_date.localeCompare(a.scheduled_date);
      if (sortBy === 'amount_desc') {
        return (b.quotation?.quotation_price || 0) - (a.quotation?.quotation_price || 0);
      }
      if (sortBy === 'amount_asc') {
        return (a.quotation?.quotation_price || 0) - (b.quotation?.quotation_price || 0);
      }
      if (sortBy === 'temperature') {
        const tempRank: Record<string, number> = { hot: 1, warm: 2, cold: 3 };
        const rankA = tempRank[a.quotation?.temperature || ''] || 4;
        const rankB = tempRank[b.quotation?.temperature || ''] || 4;
        return rankA - rankB;
      }
      return 0;
    });

    return list;
  }, [baseItems, searchQuery, tempFilter, ownerFilter, amountFilter, sortBy]);

  // Filtered No Next Action quotes
  const filteredNoNextAction = useMemo(() => {
    if (kpiFilter !== 'all' && kpiFilter !== 'no_next_action') return [];
    let list = [...quotationsWithNoNextAction];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((item) => {
        const client = item.client_name?.toLowerCase() || '';
        const phone = item.contact_number?.toLowerCase() || '';
        const pool = item.pool_type?.toLowerCase() || '';
        const loc = getQuotationLocation(item).toLowerCase();
        return client.includes(q) || phone.includes(q) || pool.includes(q) || loc.includes(q);
      });
    }

    if (tempFilter !== 'all') {
      list = list.filter((item) => item.temperature === tempFilter);
    }

    if (ownerFilter !== 'all') {
      list = list.filter((item) => {
        const sender = item.sender_name?.toLowerCase() || '';
        return sender.includes(ownerFilter.toLowerCase());
      });
    }

    if (amountFilter !== 'all') {
      list = list.filter((item) => {
        const price = item.quotation_price || 0;
        if (amountFilter === 'under_5l') return price < 500000;
        if (amountFilter === '5l_15l') return price >= 500000 && price <= 1500000;
        if (amountFilter === 'over_15l') return price > 1500000;
        return true;
      });
    }

    return list;
  }, [quotationsWithNoNextAction, kpiFilter, searchQuery, tempFilter, ownerFilter, amountFilter]);

  // Active filters count
  const activeFiltersCount =
    (kpiFilter !== 'all' ? 1 : 0) +
    (tempFilter !== 'all' ? 1 : 0) +
    (ownerFilter !== 'all' ? 1 : 0) +
    (amountFilter !== 'all' ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0);

  const clearAllFilters = () => {
    setKpiFilter('all');
    setTempFilter('all');
    setOwnerFilter('all');
    setAmountFilter('all');
    setSearchQuery('');
  };

  // Toggle selection
  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredFollowups.length && filteredFollowups.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredFollowups.map((f) => f.id)));
    }
  };

  // Bulk actions
  const handleBulkAssign = async (senderName: string) => {
    if (selectedIds.size === 0) return;
    setIsBulkProcessing(true);
    try {
      const res = await api.bulkAssignFollowUps(Array.from(selectedIds), senderName);
      showToast(`Assigned ${res.updatedCount} leads to ${senderName}`, 'success');
      setSelectedIds(new Set());
      if (onBulkActionSuccess) onBulkActionSuccess();
      else onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Bulk assignment failed', 'error');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkRescheduleConfirm = async (date: string, notes?: string) => {
    if (selectedIds.size === 0) return;
    setIsBulkProcessing(true);
    try {
      const res = await api.bulkRescheduleFollowUps(Array.from(selectedIds), date, notes);
      if (isGoogleCalendarConnected()) {
        const rescheduledItems = followups.filter((f) => selectedIds.has(f.id));
        const syncPromises = rescheduledItems.map((f) => {
          const q = quotations.find((quote) => quote.id === f.quotation_id);
          return syncFollowUpToGoogleCalendar({ ...f, scheduled_date: date }, q);
        });
        await Promise.allSettled(syncPromises);
        showToast(
          `Rescheduled ${res.updatedCount} follow-ups & auto-updated in Google Calendar!`,
          'success'
        );
      } else {
        showToast(`Rescheduled ${res.updatedCount} follow-ups to ${date}`, 'success');
      }
      setSelectedIds(new Set());
      if (onBulkActionSuccess) onBulkActionSuccess();
      else onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Bulk reschedule failed', 'error');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  // Quick Action Handlers for Active Quotes
  const [schedulingQuoteId, setSchedulingQuoteId] = useState<string | null>(null);
  const [updatingStatusQuoteId, setUpdatingStatusQuoteId] = useState<string | null>(null);
  const [isBatchScheduling, setIsBatchScheduling] = useState(false);
  const [actionModalQuote, setActionModalQuote] = useState<{ quote: Quotation; initialType?: FollowUpType } | null>(null);

  const handleQuickScheduleForQuote = async (
    quote: Quotation,
    daysAhead: number,
    followupType: FollowUpType = 'Call'
  ) => {
    try {
      setSchedulingQuoteId(quote.id);
      const scheduledDate = getQuickScheduleDate(daysAhead);
      const newFollowup = await api.createFollowUp({
        quotation_id: quote.id,
        scheduled_date: scheduledDate,
        scheduled_time: '10:30',
        type: followupType,
        notes: `Quick scheduled ${followupType}`,
      });

      if (isGoogleCalendarConnected()) {
        const syncRes = await syncFollowUpToGoogleCalendar(newFollowup, quote);
        if (syncRes.success) {
          showToast(
            `Follow-up scheduled with ${quote.client_name} for ${scheduledDate} & added to Google Calendar!`,
            'success',
            5000,
            syncRes.link ? { link: { label: 'View in Calendar ↗', url: syncRes.link } } : undefined
          );
          onRefresh();
          return;
        }
      }

      showToast(`Follow-up scheduled with ${quote.client_name} for ${scheduledDate}`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to schedule follow-up', 'error');
    } finally {
      setSchedulingQuoteId(null);
    }
  };

  const handleQuickUpdateStatus = async (quote: Quotation, newStatus: AppStatus) => {
    try {
      setUpdatingStatusQuoteId(quote.id);
      await api.updateQuotationAppFields(quote.id, { app_status: newStatus });
      showToast(`${quote.client_name} moved to "${newStatus}"`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to update quote status', 'error');
    } finally {
      setUpdatingStatusQuoteId(null);
    }
  };

  const handleQuickUpdateTemp = async (quote: Quotation, newTemp: Temperature) => {
    try {
      await api.updateQuotationAppFields(quote.id, { temperature: newTemp });
      showToast(`${quote.client_name} temperature set to ${newTemp.toUpperCase()}`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to update temperature', 'error');
    }
  };

  const handleBatchScheduleNoNextAction = async (daysAhead: number) => {
    if (filteredNoNextAction.length === 0) return;
    setIsBatchScheduling(true);
    try {
      const scheduledDate = getQuickScheduleDate(daysAhead);
      let count = 0;
      for (const q of filteredNoNextAction) {
        const newFup = await api.createFollowUp({
          quotation_id: q.id,
          scheduled_date: scheduledDate,
          scheduled_time: '10:30',
          type: 'Call',
          notes: 'Batch scheduled follow-up',
        });
        if (isGoogleCalendarConnected()) {
          await syncFollowUpToGoogleCalendar(newFup, q).catch(() => null);
        }
        count++;
      }
      showToast(`Scheduled ${count} active quotes for ${scheduledDate} at 10:30 AM!`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to batch schedule quotes', 'error');
    } finally {
      setIsBatchScheduling(false);
    }
  };

  // Helper badge renderers
  const getTemperatureBadge = (temp?: string) => {
    if (temp === 'hot') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 border border-rose-200">
          <Flame className="w-3 h-3 text-rose-500 fill-rose-500" />
          Hot
        </span>
      );
    }
    if (temp === 'warm') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
          Warm
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200">
        Cold
      </span>
    );
  };

  const cleanPhoneForWa = (phone?: string) => {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
  };

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4 pb-20 md:pb-8">
      {/* Top Banner & Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">My Day Workload</h1>
            <span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 border border-slate-200 shadow-2xs">
              {new Date().toLocaleDateString('en-IN', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Prioritized quotation conversion and scheduled client touchpoints
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* View Mode Toggle */}
          <div className="inline-flex items-center rounded-lg bg-white border border-slate-200 p-0.5 shadow-2xs">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                viewMode === 'list'
                  ? 'bg-teal-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Compact list view"
            >
              <List className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                viewMode === 'cards'
                  ? 'bg-teal-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Card grid view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
          </div>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs transition disabled:opacity-50"
            title="Refresh latest follow-ups"
          >
            <RotateCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Compact Interactive KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {/* Overdue Card */}
        <div
          onClick={() => setKpiFilter((prev) => (prev === 'overdue' ? 'all' : 'overdue'))}
          className={`cursor-pointer rounded-xl border p-3 shadow-2xs transition-all duration-150 hover:-translate-y-0.5 ${
            kpiFilter === 'overdue'
              ? 'border-rose-500 bg-rose-50/50 ring-2 ring-rose-500/20 shadow-xs'
              : 'border-slate-200/80 bg-white hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-700 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              Overdue
            </span>
            <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <p className="text-2xl font-bold tracking-tight text-slate-900">
              {overdueFollowups.length}
            </p>
            {kpiFilter === 'overdue' && (
              <span className="text-[10px] font-bold text-rose-600 bg-rose-100 px-1.5 py-0.2 rounded">
                Filtered
              </span>
            )}
          </div>
        </div>

        {/* Due Today Card */}
        <div
          onClick={() => setKpiFilter((prev) => (prev === 'due_today' ? 'all' : 'due_today'))}
          className={`cursor-pointer rounded-xl border p-3 shadow-2xs transition-all duration-150 hover:-translate-y-0.5 ${
            kpiFilter === 'due_today'
              ? 'border-teal-500 bg-teal-50/50 ring-2 ring-teal-500/20 shadow-xs'
              : 'border-slate-200/80 bg-white hover:border-teal-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-teal-700 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-teal-500" />
              Due Today
            </span>
            <Clock className="w-3.5 h-3.5 text-teal-600" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <p className="text-2xl font-bold tracking-tight text-slate-900">
              {dueTodayFollowups.length}
            </p>
            {kpiFilter === 'due_today' && (
              <span className="text-[10px] font-bold text-teal-600 bg-teal-100 px-1.5 py-0.2 rounded">
                Filtered
              </span>
            )}
          </div>
        </div>

        {/* No Next Action Card */}
        <div
          onClick={() => setKpiFilter((prev) => (prev === 'no_next_action' ? 'all' : 'no_next_action'))}
          className={`cursor-pointer rounded-xl border p-3 shadow-2xs transition-all duration-150 hover:-translate-y-0.5 ${
            kpiFilter === 'no_next_action'
              ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/20 shadow-xs'
              : 'border-slate-200/80 bg-white hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              No Next Action
            </span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <p className="text-2xl font-bold tracking-tight text-slate-900">
              {quotationsWithNoNextAction.length}
            </p>
            {kpiFilter === 'no_next_action' && (
              <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.2 rounded">
                Filtered
              </span>
            )}
          </div>
        </div>

        {/* Upcoming Card */}
        <div
          onClick={() => setKpiFilter((prev) => (prev === 'upcoming' ? 'all' : 'upcoming'))}
          className={`cursor-pointer rounded-xl border p-3 shadow-2xs transition-all duration-150 hover:-translate-y-0.5 ${
            kpiFilter === 'upcoming'
              ? 'border-slate-500 bg-slate-100 ring-2 ring-slate-400/20 shadow-xs'
              : 'border-slate-200/80 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              Upcoming
            </span>
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <p className="text-2xl font-bold tracking-tight text-slate-900">
              {upcomingFollowups.length}
            </p>
            {kpiFilter === 'upcoming' && (
              <span className="text-[10px] font-bold text-slate-600 bg-slate-200 px-1.5 py-0.2 rounded">
                Filtered
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Useful Controls: Search, Filters, Sorters */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs space-y-2.5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by client, phone, quote ID, pool type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/60 pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {/* Temperature filter */}
            <select
              value={tempFilter}
              onChange={(e) => setTempFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700 text-xs focus:outline-none focus:border-teal-500 font-medium"
            >
              <option value="all">Temp: All</option>
              <option value="hot">🔥 Hot</option>
              <option value="warm">Warm</option>
              <option value="cold">Cold</option>
            </select>

            {/* Owner filter */}
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700 text-xs focus:outline-none focus:border-teal-500 font-medium"
            >
              <option value="all">Owner: All</option>
              <option value="Pranjal">Pranjal</option>
              <option value="Shubham">Shubham</option>
            </select>

            {/* Amount range filter */}
            <select
              value={amountFilter}
              onChange={(e) => setAmountFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700 text-xs focus:outline-none focus:border-teal-500 font-medium"
            >
              <option value="all">Value: All</option>
              <option value="under_5l">&lt; ₹5 Lakh</option>
              <option value="5l_15l">₹5L - ₹15L</option>
              <option value="over_15l">&gt; ₹15 Lakh</option>
            </select>

            {/* Sort by */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700 text-xs focus:outline-none focus:border-teal-500 font-medium"
            >
              <option value="urgency">Sort: Priority Urgency</option>
              <option value="deadline_asc">Deadline: Earliest First</option>
              <option value="deadline_desc">Deadline: Latest First</option>
              <option value="amount_desc">Amount: High to Low</option>
              <option value="amount_asc">Amount: Low to High</option>
              <option value="temperature">Lead: Hot First</option>
            </select>

            {/* Toggle future scheduled visibility in Actionable view */}
            {kpiFilter === 'all' && (
              <label
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium cursor-pointer transition select-none ${
                  showFutureScheduled
                    ? 'bg-teal-50 border-teal-300 text-teal-800'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
                title="Include future scheduled leads in Actionable Leads"
              >
                <input
                  type="checkbox"
                  checked={showFutureScheduled}
                  onChange={(e) => setShowFutureScheduled(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span>Include Future ({upcomingFollowups.length})</span>
              </label>
            )}
          </div>
        </div>

        {/* Active filter chips */}
        {activeFiltersCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-100 text-[11px]">
            <span className="text-slate-400 font-medium">Active:</span>

            {kpiFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 font-semibold">
                Status: {kpiFilter.replace('_', ' ')}
                <button onClick={() => setKpiFilter('all')} className="hover:text-teal-950">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {searchQuery && (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 font-medium">
                "{searchQuery}"
                <button onClick={() => setSearchQuery('')} className="hover:text-slate-950">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {tempFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 font-medium">
                Temp: {tempFilter}
                <button onClick={() => setTempFilter('all')} className="hover:text-slate-950">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {ownerFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 font-medium">
                Owner: {ownerFilter}
                <button onClick={() => setOwnerFilter('all')} className="hover:text-slate-950">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {amountFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 font-medium">
                Amount: {amountFilter}
                <button onClick={() => setAmountFilter('all')} className="hover:text-slate-950">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            <button
              onClick={clearAllFilters}
              className="text-teal-700 hover:text-teal-900 font-semibold underline underline-offset-2 ml-1"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Floating or Top Bulk Action Bar when items selected */}
      {selectedIds.size > 0 && (
        <div className="sticky top-2 z-30 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-900 text-white px-4 py-2.5 shadow-lg border border-slate-800 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500 text-[11px] font-bold text-slate-950">
              {selectedIds.size}
            </span>
            <span>Leads Selected</span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 text-[11px] hidden sm:inline">Assign to:</span>
            <button
              onClick={() => handleBulkAssign('Pranjal')}
              disabled={isBulkProcessing}
              className="rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1 text-xs font-medium transition disabled:opacity-50"
            >
              Pranjal
            </button>
            <button
              onClick={() => handleBulkAssign('Shubham')}
              disabled={isBulkProcessing}
              className="rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1 text-xs font-medium transition disabled:opacity-50"
            >
              Shubham
            </button>

            <button
              onClick={() => setBulkRescheduleOpen(true)}
              disabled={isBulkProcessing}
              className="flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 px-3 py-1 font-semibold text-white transition disabled:opacity-50"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Reschedule</span>
            </button>

            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-slate-400 hover:text-white transition p-1"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Workload Section Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={
              filteredFollowups.length > 0 && selectedIds.size === filteredFollowups.length
            }
            onChange={handleToggleSelectAll}
            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            title="Select all displayed leads"
          />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            {kpiFilter === 'all'
              ? `Actionable Leads (${filteredFollowups.length})`
              : kpiFilter === 'overdue'
              ? `Overdue Leads (${filteredFollowups.length})`
              : kpiFilter === 'due_today'
              ? `Due Today Leads (${filteredFollowups.length})`
              : kpiFilter === 'no_next_action'
              ? `No Next Action Quotes (${filteredNoNextAction.length})`
              : `Upcoming Leads (${filteredFollowups.length})`}
          </span>
        </div>

        <span className="text-[11px] text-slate-500 font-medium">
          Showing {filteredFollowups.length} item{filteredFollowups.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Main Workload Render (List or Cards) */}
      {kpiFilter !== 'no_next_action' && (
        <>
          {filteredFollowups.length === 0 ? (
            /* Empty State */
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-2xs">
              <Sparkles className="mx-auto h-7 w-7 text-teal-600 mb-2" />
              <p className="text-sm font-semibold text-slate-800">
                {activeFiltersCount > 0
                  ? 'No follow-ups match your current filters'
                  : 'All caught up! No pending follow-ups in this view.'}
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {activeFiltersCount > 0
                  ? 'Try clearing some filters or searching with a different client name or quotation number.'
                  : 'Check the upcoming pipeline or set next actions for active quotes below.'}
              </p>
              {activeFiltersCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="mt-3 inline-flex items-center gap-1 rounded-lg bg-teal-50 border border-teal-200 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : viewMode === 'list' ? (
            /* DENSE COMPACT LIST VIEW */
            <div className="space-y-1.5">
              {filteredFollowups.map((item) => {
                const quote = item.quotation;
                const isOverdue = item.status === 'Overdue';
                const isDueToday = item.status === 'Due';
                const isUpcoming = item.status === 'Scheduled' && item.scheduled_date > todayStr;
                const isSelected = selectedIds.has(item.id);
                const isExpanded = expandedIds.has(item.id);
                const rawPhone = quote?.contact_number || '';
                const waPhone = cleanPhoneForWa(rawPhone);

                return (
                  <div
                    key={item.id}
                    onClick={() => onOpenQuotation(item.quotation_id)}
                    className={`group relative rounded-xl border bg-white p-2.5 sm:px-3.5 sm:py-2.5 shadow-2xs transition-all duration-150 cursor-pointer hover:border-teal-400 hover:shadow-xs ${
                      isSelected
                        ? 'border-teal-500 bg-teal-50/30'
                        : isOverdue
                        ? 'border-rose-200/90'
                        : isDueToday
                        ? 'border-teal-200/90'
                        : isUpcoming
                        ? 'border-slate-200/70 bg-slate-50/50 opacity-75 hover:opacity-100'
                        : 'border-slate-200/80'
                    }`}
                  >
                    {/* Status accent indicator line */}
                    <span
                      className={`absolute left-0 top-2 bottom-2 w-1 rounded-r ${
                        isOverdue
                          ? 'bg-rose-500'
                          : isDueToday
                          ? 'bg-teal-500'
                          : isUpcoming
                          ? 'bg-slate-300'
                          : 'bg-slate-300'
                      }`}
                    />

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pl-2">
                      {/* Left: Checkbox + Client Name + Price + Temp */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onClick={(e) => handleToggleSelect(item.id, e)}
                          onChange={() => {}}
                          className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 shrink-0"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-900 truncate group-hover:text-teal-700 transition">
                              {quote?.client_name || 'Client'}
                            </span>
                            {getTemperatureBadge(quote?.temperature)}
                            {quote && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-cyan-50 border border-cyan-100 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800">
                                <MapPin className="w-2.5 h-2.5 text-cyan-600 shrink-0" />
                                {getQuotationLocation(quote)}
                              </span>
                            )}
                            {quote?.priority === 'high' && (
                              <span className="rounded bg-rose-100 px-1.5 py-0.2 text-[10px] font-bold uppercase text-rose-800">
                                High Priority
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
                            <span className="font-semibold text-slate-900">
                              {formatIndianCurrency(quote?.quotation_price || 0)}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className="truncate max-w-[140px] text-slate-700 font-medium">
                              {quote?.pool_type || 'Pool'}
                            </span>
                            {quote?.pool_dimensions && (
                              <span className="inline-flex items-center gap-1 rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800">
                                📏 {quote.pool_dimensions}
                              </span>
                            )}
                            {quote?.sender_name && (
                              <>
                                <span className="text-slate-300">•</span>
                                <span className="text-[11px] text-slate-500">
                                  Owner: {quote.sender_name}
                                </span>
                              </>
                            )}
                            {item.calendar_event?.html_link && (
                              <a
                                href={item.calendar_event.html_link}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200 transition"
                                title="Open in Google Calendar"
                              >
                                <Calendar className="w-3 h-3 text-blue-600" />
                                <span>In Calendar ↗</span>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Deadline + Actions */}
                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        {/* Deadline badge */}
                        <div className="text-left sm:text-right">
                          <span
                            className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-md ${
                              isOverdue
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : isDueToday
                                ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {isOverdue ? 'Overdue: ' : isDueToday ? 'Today: ' : ''}
                            {item.scheduled_date} {item.scheduled_time ? `· ${item.scheduled_time}` : ''}
                          </span>
                        </div>

                        {/* Direct Action Buttons */}
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Quick Call */}
                          {rawPhone && (
                            <a
                              href={`tel:${rawPhone.replace(/\s+/g, '')}`}
                              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
                              title={`Call ${quote?.client_name}`}
                            >
                              <Phone className="w-3.5 h-3.5 text-emerald-600" />
                            </a>
                          )}

                          {/* Quick WhatsApp */}
                          {waPhone && (
                            <a
                              href={`https://wa.me/${waPhone}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg p-1.5 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition"
                              title="Send WhatsApp message"
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                            </a>
                          )}

                          {/* Reschedule Button */}
                          <button
                            onClick={() => onOpenRescheduleModal(item)}
                            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-teal-700 transition"
                            title="Reschedule follow-up"
                          >
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          </button>

                          {/* Primary Action: Mark Done */}
                          <button
                            onClick={() => onOpenDoneModal(item)}
                            className="flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-xs font-bold shadow-2xs transition active:scale-95 ml-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Done</span>
                          </button>

                          {/* Expand chevron */}
                          <button
                            onClick={(e) => toggleExpand(item.id, e)}
                            className="rounded-lg p-1 text-slate-400 hover:text-slate-600 transition ml-0.5"
                            title="Toggle details"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expandable row details panel */}
                    {isExpanded && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2.5 pt-2.5 border-t border-slate-100 text-xs text-slate-600 grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50/70 p-2 rounded-lg"
                      >
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400">
                            Pool Specs
                          </span>
                          <p className="text-slate-800 font-medium">
                            {quote?.pool_type || 'Custom Pool'}{' '}
                            {quote?.pool_dimensions ? `(${quote.pool_dimensions})` : ''}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Quoted: {quote?.quotation_date || 'N/A'}
                          </p>
                        </div>

                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400">
                            Follow-Up Note
                          </span>
                          <p className="text-slate-800 italic">
                            "{item.notes || 'Routine follow-up call'}"
                          </p>
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onOpenQuotation(item.quotation_id)}
                            className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900 font-semibold text-xs bg-white border border-slate-200 px-2.5 py-1 rounded-md shadow-2xs"
                          >
                            <span>Open Details</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* POLISHED COMPACT CARD VIEW */
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3">
              {filteredFollowups.map((item) => {
                const quote = item.quotation;
                const isOverdue = item.status === 'Overdue';
                const isDueToday = item.status === 'Due';
                const isUpcoming = item.status === 'Scheduled' && item.scheduled_date > todayStr;
                const isSelected = selectedIds.has(item.id);
                const rawPhone = quote?.contact_number || '';
                const waPhone = cleanPhoneForWa(rawPhone);

                return (
                  <div
                    key={item.id}
                    onClick={() => onOpenQuotation(item.quotation_id)}
                    className={`group rounded-xl border p-3.5 shadow-2xs transition-all duration-150 flex flex-col justify-between bg-white cursor-pointer hover:shadow-xs hover:border-teal-400 ${
                      isSelected
                        ? 'border-teal-500 ring-2 ring-teal-500/20'
                        : isOverdue
                        ? 'border-rose-200 hover:border-rose-300'
                        : isDueToday
                        ? 'border-teal-200 hover:border-teal-300'
                        : isUpcoming
                        ? 'border-slate-200/80 bg-slate-50/50 opacity-80 hover:opacity-100'
                        : 'border-slate-200'
                    }`}
                  >
                    <div>
                      {/* Card Header: Checkbox + Badges + Deadline */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onClick={(e) => handleToggleSelect(item.id, e)}
                            onChange={() => {}}
                            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                          />
                          {getTemperatureBadge(quote?.temperature)}
                        </div>

                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                            isOverdue
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : isDueToday
                              ? 'bg-teal-50 text-teal-700 border border-teal-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {item.scheduled_date} {item.scheduled_time ? `· ${item.scheduled_time}` : ''}
                        </span>
                      </div>

                      {/* Title & Amount */}
                      <div className="mt-2 flex items-baseline justify-between gap-2">
                        <h3 className="text-sm font-bold text-slate-900 truncate group-hover:text-teal-700 transition">
                          {quote?.client_name || 'Client'}
                        </h3>
                        <p className="text-sm font-extrabold text-teal-700 shrink-0">
                          {formatIndianCurrency(quote?.quotation_price || 0)}
                        </p>
                      </div>

                      {/* Pool specifications */}
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {quote?.pool_type || 'Pool'}{' '}
                        {quote?.pool_dimensions ? `· ${quote.pool_dimensions}` : ''}
                      </p>

                      {/* Contact & Owner */}
                      <div className="mt-2 rounded-lg bg-slate-50 border border-slate-100 p-2 flex items-center justify-between text-xs flex-wrap gap-1">
                        <span className="font-semibold text-slate-800">
                          📞 {quote?.contact_number}
                        </span>
                        {quote && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-cyan-800">
                            <MapPin className="w-3 h-3 text-cyan-600 shrink-0" />
                            {getQuotationLocation(quote)}
                          </span>
                        )}
                        {quote?.sender_name && (
                          <span className="text-slate-500 text-[11px]">
                            {quote.sender_name}
                          </span>
                        )}
                      </div>

                      {item.notes && (
                        <p className="mt-1.5 rounded-md bg-amber-50/60 border border-amber-100 p-1.5 text-[11px] text-amber-900 italic line-clamp-2">
                          "{item.notes}"
                        </p>
                      )}
                    </div>

                    {/* Quick Action Footer */}
                    <div
                      className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-1">
                        {rawPhone && (
                          <a
                            href={`tel:${rawPhone.replace(/\s+/g, '')}`}
                            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                            title="Call"
                          >
                            <Phone className="w-3.5 h-3.5 text-emerald-600" />
                          </a>
                        )}
                        {waPhone && (
                          <a
                            href={`https://wa.me/${waPhone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100 transition shadow-2xs"
                            title="WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                          </a>
                        )}
                        <button
                          onClick={() => onOpenRescheduleModal(item)}
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                          title="Reschedule"
                        >
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        </button>
                      </div>

                      <button
                        onClick={() => onOpenDoneModal(item)}
                        className="flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 text-xs font-bold shadow-2xs transition active:scale-95"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>✓ Done</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* SECTION: NO NEXT ACTION (PRD Section 44 & 107) */}
      {(kpiFilter === 'all' || kpiFilter === 'no_next_action') &&
        filteredNoNextAction.length > 0 && (
          <section className="space-y-2.5 pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-amber-200/80 pb-2 gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-amber-800">
                  Active Quotes With No Next Action ({filteredNoNextAction.length})
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 hidden md:inline">
                  Quotes requiring next scheduled follow-up
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleBatchScheduleNoNextAction(3)}
                    disabled={isBatchScheduling}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 text-[11px] font-bold shadow-2xs transition active:scale-95 disabled:opacity-50"
                    title="Schedule follow-up for all shown quotes in +3 days"
                  >
                    <Zap className="w-3 h-3" />
                    <span>{isBatchScheduling ? 'Scheduling...' : 'Schedule All (+3 Days)'}</span>
                  </button>
                  <button
                    onClick={() => handleBatchScheduleNoNextAction(1)}
                    disabled={isBatchScheduling}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 px-2 py-1 text-[11px] font-semibold transition active:scale-95 disabled:opacity-50"
                    title="Schedule follow-up for all shown quotes for Tomorrow"
                  >
                    <span>Tomorrow</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3">
              {filteredNoNextAction.map((q) => {
                const phoneClean = q.contact_number.replace(/\s+/g, '');
                const waUrl = generateWhatsAppUrl(
                  q.contact_number,
                  q.client_name,
                  q.pool_type,
                  q.quotation_price
                );
                const isSchedulingThis = schedulingQuoteId === q.id;
                const isUpdatingThis = updatingStatusQuoteId === q.id;

                return (
                  <div
                    key={q.id}
                    onClick={() => onOpenQuotation(q.id)}
                    className="rounded-xl border border-amber-200 bg-white p-3.5 shadow-2xs flex flex-col justify-between hover:border-amber-300 transition cursor-pointer"
                  >
                    <div>
                      {/* Top Row: Client & Interactive Temperature */}
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 hover:text-teal-600 transition truncate flex-1">
                          {q.client_name}
                        </span>
                        <div onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            title="Click to toggle temperature"
                            onClick={() => {
                              const nextTemp =
                                q.temperature === 'hot'
                                  ? 'warm'
                                  : q.temperature === 'warm'
                                  ? 'cold'
                                  : 'hot';
                              handleQuickUpdateTemp(q, nextTemp);
                            }}
                            className="cursor-pointer transition active:scale-95"
                          >
                            {getTemperatureBadge(q.temperature)}
                          </button>
                        </div>
                      </div>

                      {/* Price & Dimensions */}
                      <div className="mt-1 flex items-baseline justify-between">
                        <p className="text-sm font-extrabold text-teal-700">
                          {formatIndianCurrency(q.quotation_price)}
                        </p>
                        <span className="text-xs text-slate-500 font-medium truncate max-w-[130px]">
                          {q.pool_type || 'Pool'}
                        </span>
                      </div>

                      {q.pool_dimensions && (
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          📏 {q.pool_dimensions}
                        </p>
                      )}

                      {/* Contact & Stage Row */}
                      <div
                        className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {phoneClean && (
                            <a
                              href={`tel:${phoneClean}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition active:scale-95"
                              title={`Call ${q.client_name}`}
                            >
                              <Phone className="w-3 h-3 text-emerald-600" />
                              <span>Call</span>
                            </a>
                          )}
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition active:scale-95"
                            title="Send WhatsApp Follow-Up Template"
                          >
                            <MessageCircle className="w-3 h-3 text-emerald-600" />
                            <span>WhatsApp</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => setActionModalQuote({ quote: q, initialType: 'Call' })}
                            className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition active:scale-95"
                            title="Record Action Taken for this quotation"
                          >
                            <CheckCircle2 className="w-3 h-3 text-teal-600" />
                            <span>Record Action</span>
                          </button>
                        </div>

                        {/* Quick Stage Dropdown */}
                        <div className="relative">
                          <select
                            value={q.app_status}
                            disabled={isUpdatingThis}
                            onChange={(e) =>
                              handleQuickUpdateStatus(q, e.target.value as AppStatus)
                            }
                            className="text-[11px] font-semibold rounded-lg border border-slate-200 bg-white py-1 px-1.5 text-slate-700 focus:outline-none focus:border-teal-500 cursor-pointer shadow-2xs"
                          >
                            {STAGE_OPTIONS.map((st) => (
                              <option key={st.status} value={st.status}>
                                {st.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Quick 1-Click Follow-Up Action Bar */}
                    <div
                      className="mt-3 pt-2.5 border-t border-amber-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-600" />
                          1-Click Schedule:
                        </span>
                        <button
                          onClick={() => onOpenNewFollowUpForQuotation(q.id)}
                          className="text-[11px] font-semibold text-teal-700 hover:underline"
                        >
                          + Custom
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          disabled={isSchedulingThis}
                          onClick={() => handleQuickScheduleForQuote(q, 1, 'Call')}
                          className="flex flex-col items-center justify-center rounded-lg bg-amber-50 hover:bg-amber-100/80 border border-amber-200 py-1 text-center transition active:scale-95 disabled:opacity-50"
                          title="Schedule for Tomorrow 10:30 AM"
                        >
                          <span className="text-[11px] font-bold text-amber-900">Tomorrow</span>
                          <span className="text-[9px] text-amber-700 font-mono">10:30 AM</span>
                        </button>

                        <button
                          disabled={isSchedulingThis}
                          onClick={() => handleQuickScheduleForQuote(q, 3, 'Call')}
                          className="flex flex-col items-center justify-center rounded-lg bg-teal-50 hover:bg-teal-100/80 border border-teal-200 py-1 text-center transition active:scale-95 disabled:opacity-50"
                          title="Schedule in 3 Days 10:30 AM"
                        >
                          <span className="text-[11px] font-bold text-teal-900">+3 Days</span>
                          <span className="text-[9px] text-teal-700 font-mono">10:30 AM</span>
                        </button>

                        <button
                          disabled={isSchedulingThis}
                          onClick={() => handleQuickScheduleForQuote(q, 7, 'Call')}
                          className="flex flex-col items-center justify-center rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 py-1 text-center transition active:scale-95 disabled:opacity-50"
                          title="Schedule in 1 Week 10:30 AM"
                        >
                          <span className="text-[11px] font-bold text-slate-800">+1 Week</span>
                          <span className="text-[9px] text-slate-500 font-mono">10:30 AM</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

      {/* Bulk Reschedule Modal */}
      <BulkRescheduleModal
        isOpen={bulkRescheduleOpen}
        onClose={() => setBulkRescheduleOpen(false)}
        selectedCount={selectedIds.size}
        onConfirm={handleBulkRescheduleConfirm}
      />

      {/* Record Direct Action Modal */}
      {actionModalQuote && (
        <RecordActionModal
          quotation={actionModalQuote.quote}
          initialType={actionModalQuote.initialType}
          onClose={() => setActionModalQuote(null)}
          onSuccess={onRefresh}
        />
      )}
    </div>
  );
};
