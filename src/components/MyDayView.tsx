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
  Filter,
  Flame,
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
import { getQuotationLocation, getQuotationState } from '../utils/locationUtils';
import { UnifiedLeadCard } from './UnifiedLeadCard';
import { getActualNote } from '../utils/notesUtils';
import { formatDDMMYYYY } from '../utils/dateUtils';

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
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>('all');
  const [showFutureScheduled, setShowFutureScheduled] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tempFilter, setTempFilter] = useState<string>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [amountFilter, setAmountFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('urgency');

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
        const state = item.quotation ? getQuotationState(item.quotation).toLowerCase() : '';
        return (
          client.includes(q) ||
          phone.includes(q) ||
          pool.includes(q) ||
          id.includes(q) ||
          loc.includes(q) ||
          state.includes(q)
        );
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
        const state = getQuotationState(item).toLowerCase();
        return (
          client.includes(q) ||
          phone.includes(q) ||
          pool.includes(q) ||
          loc.includes(q) ||
          state.includes(q)
        );
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
    (sortBy !== 'urgency' ? 1 : 0) +
    (showFutureScheduled ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0);

  const clearAllFilters = () => {
    setKpiFilter('all');
    setTempFilter('all');
    setOwnerFilter('all');
    setAmountFilter('all');
    setSortBy('urgency');
    setShowFutureScheduled(false);
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
  const [actionModalQuote, setActionModalQuote] = useState<{
    quote: Quotation;
    followup?: FollowUp | null;
    initialType?: FollowUpType;
  } | null>(null);

  // Mobile Filter Drawer & Post-Touchpoint Prompt State
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [pendingActionPrompt, setPendingActionPrompt] = useState<{
    quote: Quotation;
    followup?: FollowUp;
    type: 'Call' | 'WhatsApp';
  } | null>(null);

  const handleTouchpointInitiated = (
    quote: Quotation,
    followup: FollowUp | undefined,
    type: 'Call' | 'WhatsApp'
  ) => {
    setPendingActionPrompt({
      quote,
      followup,
      type,
    });
  };

  const mobileActiveFilterCount = useMemo(() => {
    let count = 0;
    if (tempFilter !== 'all') count++;
    if (ownerFilter !== 'all') count++;
    if (amountFilter !== 'all') count++;
    if (sortBy !== 'urgency') count++;
    if (showFutureScheduled) count++;
    return count;
  }, [tempFilter, ownerFilter, amountFilter, sortBy, showFutureScheduled]);

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
        notes: null,
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

  return (
    <div className="space-y-4 pb-mobile-nav md:pb-8">
      {/* Top Banner & Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">My Day Workload</h1>
            <span className="rounded-md bg-white px-2 py-0.5 text-xs font-bold text-teal-800 border border-slate-200 shadow-2xs font-mono">
              {formatDDMMYYYY(todayStr)}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Prioritized quotation conversion and scheduled client touchpoints
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
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

      {/* Mobile Compact KPI Strip (< sm): Overdue & Due Today first, zero vertical bloat */}
      <div className="sm:hidden -mx-3 px-3 overflow-x-auto no-scrollbar pb-1">
        <div className="flex items-center gap-1.5 min-w-max">
          {/* Overdue */}
          <button
            type="button"
            onClick={() => setKpiFilter((prev) => (prev === 'overdue' ? 'all' : 'overdue'))}
            className={`min-h-[34px] flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ios-tap-active touch-manipulation transition shrink-0 border ${
              kpiFilter === 'overdue'
                ? 'bg-[#FF3B30] border-[#FF3B30] text-white shadow-xs'
                : 'bg-[#FF3B30]/10 border-[#FF3B30]/25 text-[#FF3B30] hover:bg-[#FF3B30]/15'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${kpiFilter === 'overdue' ? 'bg-white' : 'bg-[#FF3B30]'}`} />
            <span>Overdue</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[11px] font-extrabold ${
                kpiFilter === 'overdue' ? 'bg-black/20 text-white' : 'bg-[#FF3B30]/20 text-[#FF3B30]'
              }`}
            >
              {overdueFollowups.length}
            </span>
          </button>

          {/* Due Today */}
          <button
            type="button"
            onClick={() => setKpiFilter((prev) => (prev === 'due_today' ? 'all' : 'due_today'))}
            className={`min-h-[34px] flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ios-tap-active touch-manipulation transition shrink-0 border ${
              kpiFilter === 'due_today'
                ? 'bg-[#007AFF] border-[#007AFF] text-white shadow-xs'
                : 'bg-[#007AFF]/10 border-[#007AFF]/25 text-[#007AFF] hover:bg-[#007AFF]/15'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${kpiFilter === 'due_today' ? 'bg-white' : 'bg-[#007AFF]'}`} />
            <span>Due Today</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[11px] font-extrabold ${
                kpiFilter === 'due_today' ? 'bg-black/20 text-white' : 'bg-[#007AFF]/20 text-[#007AFF]'
              }`}
            >
              {dueTodayFollowups.length}
            </span>
          </button>

          {/* No Next Action */}
          <button
            type="button"
            onClick={() => setKpiFilter((prev) => (prev === 'no_next_action' ? 'all' : 'no_next_action'))}
            className={`min-h-[34px] flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ios-tap-active touch-manipulation transition shrink-0 border ${
              kpiFilter === 'no_next_action'
                ? 'bg-[#FF9500] border-[#FF9500] text-white shadow-xs'
                : 'bg-[#FF9500]/10 border-[#FF9500]/25 text-[#FF9500] hover:bg-[#FF9500]/15'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${kpiFilter === 'no_next_action' ? 'bg-white' : 'bg-[#FF9500]'}`} />
            <span>No Action</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[11px] font-extrabold ${
                kpiFilter === 'no_next_action' ? 'bg-black/20 text-white' : 'bg-[#FF9500]/20 text-[#FF9500]'
              }`}
            >
              {quotationsWithNoNextAction.length}
            </span>
          </button>

          {/* Upcoming */}
          <button
            type="button"
            onClick={() => setKpiFilter((prev) => (prev === 'upcoming' ? 'all' : 'upcoming'))}
            className={`min-h-[34px] flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ios-tap-active touch-manipulation transition shrink-0 border ${
              kpiFilter === 'upcoming'
                ? 'bg-slate-800 border-slate-900 text-white shadow-xs'
                : 'bg-slate-200/80 border-slate-300/70 text-slate-700 hover:bg-slate-300/80'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${kpiFilter === 'upcoming' ? 'bg-white' : 'bg-slate-400'}`} />
            <span>Upcoming</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[11px] font-extrabold ${
                kpiFilter === 'upcoming' ? 'bg-slate-700 text-white' : 'bg-slate-300 text-slate-800'
              }`}
            >
              {upcomingFollowups.length}
            </span>
          </button>

          {/* Reset / All */}
          {kpiFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setKpiFilter('all')}
              className="min-h-[34px] flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 ios-tap-active touch-manipulation transition shrink-0 shadow-2xs"
            >
              <span>View All</span>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Desktop KPI Summary Cards (macOS style >= sm) */}
      <div className="hidden sm:grid sm:grid-cols-4 sm:gap-3">
        {/* Overdue Card */}
        <div
          onClick={() => setKpiFilter((prev) => (prev === 'overdue' ? 'all' : 'overdue'))}
          className={`cursor-pointer rounded-2xl border p-3.5 shadow-2xs transition-all duration-150 hover:-translate-y-0.5 ${
            kpiFilter === 'overdue'
              ? 'border-[#FF3B30] bg-[#FF3B30]/5 ring-2 ring-[#FF3B30]/20 shadow-xs'
              : 'border-slate-200/80 bg-white hover:border-[#FF3B30]/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#FF3B30] flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#FF3B30]" />
              Overdue
            </span>
            <AlertCircle className="w-3.5 h-3.5 text-[#FF3B30]" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <p className="text-2xl font-bold tracking-tight text-slate-900">
              {overdueFollowups.length}
            </p>
            {kpiFilter === 'overdue' && (
              <span className="text-[10px] font-bold text-[#FF3B30] bg-[#FF3B30]/10 px-1.5 py-0.2 rounded-md">
                Filtered
              </span>
            )}
          </div>
        </div>

        {/* Due Today Card */}
        <div
          onClick={() => setKpiFilter((prev) => (prev === 'due_today' ? 'all' : 'due_today'))}
          className={`cursor-pointer rounded-2xl border p-3.5 shadow-2xs transition-all duration-150 hover:-translate-y-0.5 ${
            kpiFilter === 'due_today'
              ? 'border-[#007AFF] bg-[#007AFF]/5 ring-2 ring-[#007AFF]/20 shadow-xs'
              : 'border-slate-200/80 bg-white hover:border-[#007AFF]/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#007AFF] flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#007AFF]" />
              Due Today
            </span>
            <Clock className="w-3.5 h-3.5 text-[#007AFF]" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <p className="text-2xl font-bold tracking-tight text-slate-900">
              {dueTodayFollowups.length}
            </p>
            {kpiFilter === 'due_today' && (
              <span className="text-[10px] font-bold text-[#007AFF] bg-[#007AFF]/10 px-1.5 py-0.2 rounded-md">
                Filtered
              </span>
            )}
          </div>
        </div>

        {/* No Next Action Card */}
        <div
          onClick={() => setKpiFilter((prev) => (prev === 'no_next_action' ? 'all' : 'no_next_action'))}
          className={`cursor-pointer rounded-2xl border p-3.5 shadow-2xs transition-all duration-150 hover:-translate-y-0.5 ${
            kpiFilter === 'no_next_action'
              ? 'border-[#FF9500] bg-[#FF9500]/5 ring-2 ring-[#FF9500]/20 shadow-xs'
              : 'border-slate-200/80 bg-white hover:border-[#FF9500]/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#FF9500] flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#FF9500]" />
              No Next Action
            </span>
            <AlertTriangle className="w-3.5 h-3.5 text-[#FF9500]" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <p className="text-2xl font-bold tracking-tight text-slate-900">
              {quotationsWithNoNextAction.length}
            </p>
            {kpiFilter === 'no_next_action' && (
              <span className="text-[10px] font-bold text-[#FF9500] bg-[#FF9500]/10 px-1.5 py-0.2 rounded-md">
                Filtered
              </span>
            )}
          </div>
        </div>

        {/* Upcoming Card */}
        <div
          onClick={() => setKpiFilter((prev) => (prev === 'upcoming' ? 'all' : 'upcoming'))}
          className={`cursor-pointer rounded-2xl border p-3.5 shadow-2xs transition-all duration-150 hover:-translate-y-0.5 ${
            kpiFilter === 'upcoming'
              ? 'border-slate-500 bg-slate-100 ring-2 ring-slate-400/20 shadow-xs'
              : 'border-slate-200/80 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
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
              <span className="text-[10px] font-bold text-slate-600 bg-slate-200 px-1.5 py-0.2 rounded-md">
                Filtered
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Useful Controls: Search, Filters, Sorters (iOS / macOS HIG design) */}
      <div className="rounded-2xl border border-black/[0.06] bg-white p-3 shadow-2xs space-y-2">
        {/* Mobile View: Search Bar + Single Filter Button (< md) */}
        <div className="md:hidden flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search client, phone, quote..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-black/[0.06] bg-slate-100/80 pl-8 pr-7 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-[#007AFF] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileFilterOpen(true)}
            className={`min-h-[38px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition shrink-0 ios-tap-active touch-manipulation ${
              mobileActiveFilterCount > 0
                ? 'bg-[#007AFF]/10 border-[#007AFF]/30 text-[#007AFF] shadow-2xs'
                : 'bg-white border-black/[0.08] text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-3.5 h-3.5 text-slate-600" />
            <span>Filter</span>
            {mobileActiveFilterCount > 0 && (
              <span className="h-4 min-w-[16px] px-1 rounded-full bg-[#007AFF] text-white text-[10px] font-extrabold flex items-center justify-center">
                {mobileActiveFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Desktop View: Full Search + Sorters Row (>= md) */}
        <div className="hidden md:flex md:items-center md:justify-between gap-2">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by client, phone, quote ID, pool type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-black/[0.06] bg-slate-100/70 pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-[#007AFF] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#007AFF] transition"
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
              className="rounded-lg border border-black/[0.08] bg-white px-2.5 py-1 text-slate-700 text-xs focus:outline-none focus:border-[#007AFF] font-medium shadow-2xs"
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
              className="rounded-lg border border-black/[0.08] bg-white px-2.5 py-1 text-slate-700 text-xs focus:outline-none focus:border-[#007AFF] font-medium shadow-2xs"
            >
              <option value="all">Owner: All</option>
              <option value="Pranjal">Pranjal</option>
              <option value="Shubham">Shubham</option>
            </select>

            {/* Amount range filter */}
            <select
              value={amountFilter}
              onChange={(e) => setAmountFilter(e.target.value)}
              className="rounded-lg border border-black/[0.08] bg-white px-2.5 py-1 text-slate-700 text-xs focus:outline-none focus:border-[#007AFF] font-medium shadow-2xs"
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
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-2.5">
              {filteredFollowups.map((item) => {
                const quote = item.quotation;
                const fullQuotation =
                  quotations.find((q) => q.id === item.quotation_id) ||
                  (quote
                    ? ({
                        ...quote,
                        id: item.quotation_id,
                        workspace_id: item.workspace_id,
                        source_id: item.quotation_id,
                        source_status: quote.app_status,
                        is_active: true,
                        items: [],
                        grand_total: quote.quotation_price,
                        created_at: quote.quotation_date || item.created_at,
                        updated_at: item.updated_at,
                      } as unknown as Quotation)
                    : null);

                if (!fullQuotation) return null;

                return (
                  <UnifiedLeadCard
                    key={item.id}
                    quotation={fullQuotation}
                    followup={item}
                    isSelected={selectedIds.has(item.id)}
                    showCheckbox={true}
                    onToggleSelect={(id, e) => handleToggleSelect(item.id, e)}
                    onOpenQuotation={onOpenQuotation}
                    onOpenDoneModal={onOpenDoneModal}
                    onOpenRecordAction={(q, initialType) =>
                      setActionModalQuote({ quote: q, initialType })
                    }
                    onOpenRescheduleModal={onOpenRescheduleModal}
                    onQuickUpdateTemp={handleQuickUpdateTemp}
                  />
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-2.5">
              {filteredNoNextAction.map((q) => (
                <UnifiedLeadCard
                  key={q.id}
                  quotation={q}
                  followup={undefined}
                  isSelected={selectedIds.has(q.id)}
                  showCheckbox={false}
                  onOpenQuotation={onOpenQuotation}
                  onOpenDoneModal={(fup) => onOpenDoneModal(fup)}
                  onOpenRecordAction={(quote, initialType) =>
                    setActionModalQuote({ quote, initialType })
                  }
                  onQuickUpdateTemp={handleQuickUpdateTemp}
                />
              ))}
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

      {/* Record Direct Action / Follow-Up Completion Modal */}
      {actionModalQuote && (
        <RecordActionModal
          quotation={actionModalQuote.quote}
          followup={actionModalQuote.followup}
          initialType={actionModalQuote.initialType}
          onClose={() => setActionModalQuote(null)}
          onSuccess={onRefresh}
        />
      )}

      {/* Floating Prompt to record outcome after Call / WhatsApp */}
      {pendingActionPrompt && (
        <div className="fixed bottom-20 sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-40 bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-slate-700/80 animate-in slide-in-from-bottom-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
                {pendingActionPrompt.type === 'Call' ? (
                  <Phone className="w-4 h-4" />
                ) : (
                  <MessageCircle className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-300">
                  {pendingActionPrompt.type === 'Call' ? 'Phone dialer opened' : 'WhatsApp opened'}
                </p>
                <p className="text-sm font-bold text-white truncate">
                  {pendingActionPrompt.quote.client_name}
                </p>
              </div>
            </div>
            <button
              onClick={() => setPendingActionPrompt(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => {
                const prompt = pendingActionPrompt;
                setPendingActionPrompt(null);
                if (prompt.followup) {
                  onOpenDoneModal(prompt.followup);
                } else {
                  setActionModalQuote({
                    quote: prompt.quote,
                    initialType: prompt.type,
                  });
                }
              }}
              className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs py-2 shadow-xs transition active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Record Outcome</span>
            </button>
            <button
              onClick={() => setPendingActionPrompt(null)}
              className="px-3 min-h-[40px] text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition"
            >
              Later
            </button>
          </div>
        </div>
      )}

      {/* Mobile Filter & Sort Drawer / Bottom Sheet */}
      {mobileFilterOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileFilterOpen(false)}
          />

          {/* Sheet */}
          <div className="relative w-full max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl border-t border-slate-200 z-10 animate-in slide-in-from-bottom-5">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-teal-600" />
                <h3 className="text-base font-bold text-slate-900">Filter & Sort Leads</h3>
                {activeFiltersCount > 0 && (
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-bold text-teal-800">
                    {activeFiltersCount}
                  </span>
                )}
              </div>
              <button
                onClick={() => setMobileFilterOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 py-4">
              {/* Temperature */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Lead Temperature
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['all', 'hot', 'warm', 'cold'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTempFilter(t)}
                      className={`min-h-[38px] rounded-xl text-xs font-semibold capitalize border transition active:scale-95 ${
                        tempFilter === t
                          ? 'bg-teal-600 border-teal-700 text-white shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Deal Size */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Deal Size
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'all', label: 'All Values' },
                    { id: 'under_5l', label: '< ₹5 Lakhs' },
                    { id: '5l_15l', label: '₹5L - ₹15L' },
                    { id: 'over_15l', label: '> ₹15 Lakhs' },
                  ].map((range) => (
                    <button
                      key={range.id}
                      type="button"
                      onClick={() => setAmountFilter(range.id)}
                      className={`min-h-[38px] rounded-xl text-xs font-semibold border transition active:scale-95 ${
                        amountFilter === range.id
                          ? 'bg-teal-600 border-teal-700 text-white shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort By */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Sort Order
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'urgency', label: 'Urgency' },
                    { id: 'amount_desc', label: 'Value: High' },
                    { id: 'temperature', label: 'Hot First' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSortBy(s.id as SortOption)}
                      className={`min-h-[38px] rounded-xl text-xs font-semibold border transition active:scale-95 ${
                        sortBy === s.id
                          ? 'bg-teal-600 border-teal-700 text-white shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Owner */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Sales Owner
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'Pranjal', label: 'Pranjal' },
                    { id: 'Shubham', label: 'Shubham' },
                  ].map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setOwnerFilter(o.id)}
                      className={`min-h-[38px] rounded-xl text-xs font-semibold border transition active:scale-95 ${
                        ownerFilter === o.id
                          ? 'bg-teal-600 border-teal-700 text-white shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Future scheduled followups toggle */}
              <div className="pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer bg-slate-50 border border-slate-200 p-3 rounded-xl">
                  <input
                    type="checkbox"
                    checked={showFutureScheduled}
                    onChange={(e) => setShowFutureScheduled(e.target.checked)}
                    className="w-4 h-4 rounded text-teal-600 border-slate-300 focus:ring-teal-500"
                  />
                  <span className="text-xs font-semibold text-slate-800">
                    Include upcoming follow-ups beyond today
                  </span>
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-2 pt-3 border-t border-slate-100 flex items-center gap-2">
              {activeFiltersCount > 0 && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition"
                >
                  Clear All
                </button>
              )}
              <button
                type="button"
                onClick={() => setMobileFilterOpen(false)}
                className="flex-1 min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs py-2 shadow-2xs active:scale-95 transition"
              >
                Apply & View Leads ({filteredFollowups.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
