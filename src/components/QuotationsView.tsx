import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Filter,
  Flame,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  RotateCw,
  Search,
  X,
  Zap,
} from 'lucide-react';
import { Quotation, FollowUp, DashboardMetrics, Temperature, Priority, AppStatus, ActiveUser, isTrialRecord } from '../types';
import { api } from '../services/api';
import { formatIndianCurrency } from '../../server/normalizer';
import { parsePoolDimensions } from '../utils/poolUtils';
import { useToast } from './Toast';
import { RecordActionModal } from './RecordActionModal';
import {
  isGoogleCalendarConnected,
  syncFollowUpToGoogleCalendar,
} from '../services/googleCalendar';
import {
  getQuickScheduleDate,
  generateWhatsAppUrl,
  STAGE_OPTIONS,
  TEMPERATURE_OPTIONS,
} from '../utils/quotationActions';
import { getQuotationLocation } from '../utils/locationUtils';

interface QuotationsViewProps {
  quotations: Quotation[];
  metrics: DashboardMetrics | null;
  filterOptions: { poolTypes: string[]; senders: string[] };
  activeUser?: ActiveUser;
  onOpenQuotation: (id: string) => void;
  onOpenNewFollowUpForQuotation: (id: string) => void;
  onOpenDoneModal: (followup: FollowUp) => void;
  onOpenRescheduleModal: (followup: FollowUp) => void;
  onOpenNewQuotation?: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const QuotationsView: React.FC<QuotationsViewProps> = ({
  quotations,
  metrics,
  filterOptions,
  activeUser,
  onOpenQuotation,
  onOpenNewFollowUpForQuotation,
  onOpenDoneModal,
  onOpenRescheduleModal,
  onOpenNewQuotation,
  onRefresh,
  isRefreshing,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [tempFilter, setTempFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [followupFilter, setFollowupFilter] = useState('All');
  const [poolTypeFilter, setPoolTypeFilter] = useState('All');
  const [poolSizeFilter, setPoolSizeFilter] = useState<'All' | 'compact' | 'medium' | 'large'>('All');
  const [senderFilter, setSenderFilter] = useState('All');
  const [ageFilter, setAgeFilter] = useState('All');
  const [locationFilter, setLocationFilter] = useState('All');
  const [sortOption, setSortOption] = useState('newest');
  const [showFiltersModal, setShowFiltersModal] = useState(false);

  const { showToast } = useToast();
  const [schedulingQuoteId, setSchedulingQuoteId] = useState<string | null>(null);
  const [updatingQuoteId, setUpdatingQuoteId] = useState<string | null>(null);
  const [actionModalQuote, setActionModalQuote] = useState<Quotation | null>(null);

  const handleQuickSchedule = async (quote: Quotation, daysAhead: number) => {
    try {
      setSchedulingQuoteId(quote.id);
      const scheduledDate = getQuickScheduleDate(daysAhead);
      const newFollowup = await api.createFollowUp({
        quotation_id: quote.id,
        scheduled_date: scheduledDate,
        scheduled_time: '10:30',
        type: 'Call',
        notes: 'Quick scheduled call',
      });

      if (isGoogleCalendarConnected()) {
        const syncRes = await syncFollowUpToGoogleCalendar(newFollowup, quote);
        if (syncRes.success) {
          showToast(
            `Follow-up scheduled with ${quote.client_name} for ${scheduledDate} & added to Calendar!`,
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
      setUpdatingQuoteId(quote.id);
      await api.updateQuotationAppFields(quote.id, { app_status: newStatus });
      showToast(`${quote.client_name} moved to "${newStatus}"`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to update quote status', 'error');
    } finally {
      setUpdatingQuoteId(null);
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

  // Financial KPI calculations directly from the active user's quotations (strictly excluding trial records)
  const activeStatuses: AppStatus[] = [
    'New',
    'Active',
    'In Discussion',
    'Waiting for Client',
    'On Hold',
  ];

  const validUserQuotes = useMemo(() => {
    return quotations.filter(
      (q) => !isTrialRecord(q.client_name, q.contact_number, q.contact_number_raw)
    );
  }, [quotations]);

  const activeQuotations = useMemo(
    () => validUserQuotes.filter((q) => activeStatuses.includes(q.app_status)),
    [validUserQuotes]
  );

  const wonQuotations = useMemo(
    () => validUserQuotes.filter((q) => q.app_status === 'Won'),
    [validUserQuotes]
  );

  const activeQuotedValue = useMemo(
    () => activeQuotations.reduce((sum, q) => sum + (q.quotation_price || 0), 0),
    [activeQuotations]
  );

  const hotValue = useMemo(
    () =>
      activeQuotations
        .filter((q) => q.temperature === 'hot')
        .reduce((sum, q) => sum + (q.quotation_price || 0), 0),
    [activeQuotations]
  );

  const warmValue = useMemo(
    () =>
      activeQuotations
        .filter((q) => q.temperature === 'warm')
        .reduce((sum, q) => sum + (q.quotation_price || 0), 0),
    [activeQuotations]
  );

  const wonQuotedValue = useMemo(
    () => wonQuotations.reduce((sum, q) => sum + (q.quotation_price || 0), 0),
    [wonQuotations]
  );

  // Derive unique locations with counts from all valid quotations
  const locationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    validUserQuotes.forEach((q) => {
      const loc = getQuotationLocation(q);
      counts[loc] = (counts[loc] || 0) + 1;
    });
    return counts;
  }, [validUserQuotes]);

  const availableLocations = useMemo(() => {
    return Object.keys(locationCounts).sort((a, b) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return (locationCounts[b] || 0) - (locationCounts[a] || 0);
    });
  }, [locationCounts]);

  // Filter and sort client-side
  const filteredQuotations = quotations.filter((q) => {
    // Exclude trial records
    if (isTrialRecord(q.client_name, q.contact_number, q.contact_number_raw)) {
      return false;
    }

    // Search
    if (searchQuery.trim()) {
      const s = searchQuery.toLowerCase();
      const match =
        q.client_name.toLowerCase().includes(s) ||
        q.contact_number.toLowerCase().includes(s) ||
        (q.contact_number_raw && q.contact_number_raw.includes(s)) ||
        (q.pool_dimensions && q.pool_dimensions.toLowerCase().includes(s)) ||
        (q.pool_type && q.pool_type.toLowerCase().includes(s)) ||
        (q.sender_name && q.sender_name.toLowerCase().includes(s)) ||
        (getQuotationLocation(q).toLowerCase().includes(s));
      if (!match) return false;
    }

    // App Status
    if (statusFilter !== 'All' && q.app_status !== statusFilter) return false;

    // Temperature
    if (tempFilter !== 'All' && q.temperature !== tempFilter) return false;

    // Priority
    if (priorityFilter !== 'All' && q.priority !== priorityFilter) return false;

    // Location Filter
    if (locationFilter !== 'All') {
      const loc = getQuotationLocation(q);
      if (loc !== locationFilter) return false;
    }

    // Pool Type
    if (poolTypeFilter !== 'All' && q.pool_type !== poolTypeFilter) return false;

    // Pool Size Filter (Derived from pool dimensions)
    if (poolSizeFilter !== 'All') {
      const parsed = parsePoolDimensions(q.pool_dimensions);
      const sqFt = parsed?.surfaceAreaSqFt || 0;
      if (poolSizeFilter === 'compact' && (sqFt === 0 || sqFt > 200)) return false;
      if (poolSizeFilter === 'medium' && (sqFt < 200 || sqFt > 450)) return false;
      if (poolSizeFilter === 'large' && sqFt <= 450) return false;
    }

    // Sender
    if (senderFilter !== 'All' && q.sender_name !== senderFilter) return false;

    // Follow-up status
    if (followupFilter !== 'All') {
      if (followupFilter === 'Overdue' && q.next_followup?.status !== 'Overdue') return false;
      if (followupFilter === 'Due Today' && q.next_followup?.status !== 'Due') return false;
      if (followupFilter === 'Upcoming' && q.next_followup?.status !== 'Scheduled') return false;
      if (
        followupFilter === 'No Next Action' &&
        (q.next_followup || q.has_action_taken || q.latest_completed_followup)
      )
        return false;
    }

    // Age buckets
    if (ageFilter !== 'All') {
      const age = q.age_days || 0;
      if (ageFilter === '0-7' && age > 7) return false;
      if (ageFilter === '8-14' && (age < 8 || age > 14)) return false;
      if (ageFilter === '15-30' && (age < 15 || age > 30)) return false;
      if (ageFilter === '30+' && age <= 30) return false;
    }

    return true;
  });

  // Sorting
  filteredQuotations.sort((a, b) => {
    if (sortOption === 'newest') return b.quotation_date.localeCompare(a.quotation_date);
    if (sortOption === 'oldest') return a.quotation_date.localeCompare(b.quotation_date);
    if (sortOption === 'highest_value') return (b.quotation_price || 0) - (a.quotation_price || 0);
    if (sortOption === 'lowest_value') return (a.quotation_price || 0) - (b.quotation_price || 0);
    if (sortOption === 'client_name') return a.client_name.localeCompare(b.client_name);
    if (sortOption === 'next_followup') {
      const dateA = a.next_followup?.scheduled_date || '9999-99-99';
      const dateB = b.next_followup?.scheduled_date || '9999-99-99';
      return dateA.localeCompare(dateB);
    }
    return 0;
  });

  const resetFilters = () => {
    setStatusFilter('All');
    setTempFilter('All');
    setPriorityFilter('All');
    setFollowupFilter('All');
    setPoolTypeFilter('All');
    setPoolSizeFilter('All');
    setSenderFilter('All');
    setAgeFilter('All');
    setLocationFilter('All');
    setSearchQuery('');
  };

  const activeFiltersCount = [
    statusFilter !== 'All',
    tempFilter !== 'All',
    priorityFilter !== 'All',
    followupFilter !== 'All',
    poolTypeFilter !== 'All',
    poolSizeFilter !== 'All',
    senderFilter !== 'All',
    ageFilter !== 'All',
    locationFilter !== 'All',
  ].filter(Boolean).length;

  const getStatusBadge = (status: AppStatus) => {
    const colors: Record<AppStatus, string> = {
      New: 'bg-cyan-950/80 text-cyan-300 border-cyan-800',
      Active: 'bg-blue-950/80 text-blue-300 border-blue-800',
      'In Discussion': 'bg-indigo-950/80 text-indigo-300 border-indigo-800',
      'Waiting for Client': 'bg-amber-950/80 text-amber-300 border-amber-800',
      'On Hold': 'bg-slate-800 text-slate-300 border-slate-700',
      Won: 'bg-emerald-950/80 text-emerald-300 border-emerald-700 font-bold',
      Lost: 'bg-rose-950/80 text-rose-300 border-rose-800',
      Cancelled: 'bg-slate-900 text-slate-500 border-slate-800 line-through',
    };
    return (
      <span
        className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-medium ${
          colors[status] || 'bg-slate-800 text-slate-300 border-slate-700'
        }`}
      >
        {status}
      </span>
    );
  };

  const getTemperatureBadge = (temp: Temperature) => {
    if (temp === 'hot') {
      return <span className="text-xs font-semibold text-rose-400">🔥 Hot</span>;
    }
    if (temp === 'warm') {
      return <span className="text-xs font-semibold text-amber-400">🟠 Warm</span>;
    }
    return <span className="text-xs font-semibold text-sky-400">🔵 Cold</span>;
  };

  return (
    <div className="space-y-5 pb-20 md:pb-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Quotations
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            {filteredQuotations.length} of {quotations.length} quotations shown
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {onOpenNewQuotation && (
            <button
              type="button"
              onClick={onOpenNewQuotation}
              className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-cyan-500 transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>New Quote</span>
            </button>
          )}

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Financial KPI Summary Bar (User-specific pipeline value, strictly excluding trial quotes) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 sm:p-4 shadow-sm">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[11px] font-medium text-slate-400">Active Pipeline Value</span>
            {activeUser && activeUser !== 'All' && (
              <span className="inline-flex items-center px-1.5 py-0.2 text-[9px] font-semibold tracking-wide text-cyan-300 bg-cyan-950/90 border border-cyan-700/60 rounded">
                {activeUser}&apos;s
              </span>
            )}
          </div>
          <p className="text-lg sm:text-xl font-bold text-cyan-400">
            {formatIndianCurrency(activeQuotedValue)}
          </p>
          <p className="text-[10px] text-slate-500">{activeQuotations.length} active quotations</p>
        </div>
        <div>
          <span className="text-[11px] font-medium text-rose-400">🔥 Hot Value</span>
          <p className="text-base sm:text-lg font-bold text-white">
            {formatIndianCurrency(hotValue)}
          </p>
          <p className="text-[10px] text-slate-500">Ready to close</p>
        </div>
        <div>
          <span className="text-[11px] font-medium text-amber-400">🟠 Warm Value</span>
          <p className="text-base sm:text-lg font-bold text-white">
            {formatIndianCurrency(warmValue)}
          </p>
          <p className="text-[10px] text-slate-500">In discussion</p>
        </div>
        <div>
          <span className="text-[11px] font-medium text-emerald-400">Won Value</span>
          <p className="text-base sm:text-lg font-bold text-emerald-300">
            {formatIndianCurrency(wonQuotedValue)}
          </p>
          <p className="text-[10px] text-slate-500">{wonQuotations.length} closed won</p>
        </div>
      </div>

      {/* Search and Filters Toolbar */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        {/* Search Field */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            id="input-quotations-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search client, phone, dimensions, pool type, sender..."
            className="w-full rounded-xl border border-slate-800 bg-slate-900/90 pl-10 pr-9 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Quick Filter Pill Buttons & Sort */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setShowFiltersModal(true)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition shrink-0 ${
              activeFiltersCount > 0
                ? 'border-cyan-500 bg-cyan-950/40 text-cyan-300 font-semibold'
                : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filters {activeFiltersCount > 0 ? `(${activeFiltersCount})` : ''}</span>
          </button>

          {/* Location Filter Dropdown */}
          <div className="relative shrink-0">
            <MapPin className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-cyan-400" />
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className={`appearance-none rounded-xl border py-2 pl-7 pr-8 text-xs font-medium focus:outline-none cursor-pointer transition ${
                locationFilter !== 'All'
                  ? 'border-cyan-500 bg-cyan-950/70 text-cyan-300 font-semibold shadow-xs'
                  : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800'
              }`}
              title="Filter quotations by region or city"
            >
              <option value="All">All Locations ({validUserQuotes.length})</option>
              {availableLocations.map((loc) => (
                <option key={loc} value={loc} className="bg-slate-900 text-slate-200">
                  {loc} ({locationCounts[loc] || 0})
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          </div>

          {/* Sort Dropdown */}
          <div className="relative shrink-0">
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="appearance-none rounded-xl border border-slate-800 bg-slate-900 py-2 pl-3 pr-8 text-xs font-medium text-slate-300 hover:bg-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="newest">Newest Quote</option>
              <option value="oldest">Oldest Quote</option>
              <option value="highest_value">Highest Value</option>
              <option value="lowest_value">Lowest Value</option>
              <option value="next_followup">Next Follow-Up</option>
              <option value="client_name">Client Name (A-Z)</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          </div>

          {activeFiltersCount > 0 && (
            <button
              onClick={resetFilters}
              className="text-xs text-rose-400 hover:underline shrink-0 px-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Filter Modal / Drawer */}
      {showFiltersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Filter className="w-4 h-4 text-cyan-400" />
                Filter Quotations
              </h3>
              <button
                onClick={() => setShowFiltersModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Application Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white"
              >
                <option value="All">All Statuses</option>
                <option value="New">New</option>
                <option value="Active">Active</option>
                <option value="In Discussion">In Discussion</option>
                <option value="Waiting for Client">Waiting for Client</option>
                <option value="On Hold">On Hold</option>
                <option value="Won">Won</option>
                <option value="Lost">Lost</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            {/* Temperature Filter */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Lead Temperature
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {['All', 'hot', 'warm', 'cold'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTempFilter(t)}
                    className={`rounded-xl border py-2 text-xs font-medium capitalize ${
                      tempFilter === t
                        ? 'border-cyan-500 bg-cyan-950 text-cyan-300 font-bold'
                        : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    {t === 'hot' ? '🔥 Hot' : t === 'warm' ? '🟠 Warm' : t === 'cold' ? '🔵 Cold' : 'All'}
                  </button>
                ))}
              </div>
            </div>

            {/* Location / Region Filter */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                  Location / Region
                </span>
                {locationFilter !== 'All' && (
                  <button
                    type="button"
                    onClick={() => setLocationFilter('All')}
                    className="text-[10px] text-cyan-400 hover:underline"
                  >
                    Reset
                  </button>
                )}
              </label>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white"
              >
                <option value="All">All Locations ({validUserQuotes.length})</option>
                {availableLocations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc} ({locationCounts[loc] || 0})
                  </option>
                ))}
              </select>
            </div>

            {/* Follow-up State Filter */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Follow-Up Status
              </label>
              <select
                value={followupFilter}
                onChange={(e) => setFollowupFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white"
              >
                <option value="All">All Follow-Up States</option>
                <option value="Overdue">Overdue</option>
                <option value="Due Today">Due Today</option>
                <option value="Upcoming">Upcoming</option>
                <option value="No Next Action">⚠️ No Next Action</option>
              </select>
            </div>

            {/* Age Filter */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Quotation Age (Days)
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {['All', '0-7', '8-14', '15-30', '30+'].map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAgeFilter(a)}
                    className={`rounded-xl border py-2 text-xs font-medium ${
                      ageFilter === a
                        ? 'border-cyan-500 bg-cyan-950 text-cyan-300 font-bold'
                        : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    {a === 'All' ? 'All Ages' : `${a} d`}
                  </button>
                ))}
              </div>
            </div>

            {/* Pool Type Filter */}
            {filterOptions.poolTypes.length > 0 && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Pool Type
                </label>
                <select
                  value={poolTypeFilter}
                  onChange={(e) => setPoolTypeFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white"
                >
                  <option value="All">All Pool Types</option>
                  {filterOptions.poolTypes.map((pt) => (
                    <option key={pt} value={pt}>
                      {pt}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Pool Size Filter */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Pool Size
              </label>
              <select
                value={poolSizeFilter}
                onChange={(e) => setPoolSizeFilter(e.target.value as any)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white"
              >
                <option value="All">All Pool Sizes</option>
                <option value="compact">Plunge / Compact (&lt; 200 sq.ft)</option>
                <option value="medium">Medium Villa (200 – 450 sq.ft)</option>
                <option value="large">Large / Resort (450+ sq.ft)</option>
              </select>
            </div>

            {/* Sender Filter */}
            {filterOptions.senders.length > 0 && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Sender / Salesperson
                </label>
                <select
                  value={senderFilter}
                  onChange={(e) => setSenderFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white"
                >
                  <option value="All">All Senders</option>
                  {filterOptions.senders.map((snd) => (
                    <option key={snd} value={snd}>
                      {snd}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs text-rose-400 hover:underline"
              >
                Clear all filters
              </button>
              <button
                type="button"
                onClick={() => setShowFiltersModal(false)}
                className="rounded-xl bg-cyan-600 px-5 py-2 text-xs font-semibold text-white hover:bg-cyan-500"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {filteredQuotations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-slate-500 mb-3" />
          <p className="text-base font-semibold text-slate-200">No quotations found</p>
          <p className="text-xs text-slate-400 mt-1">
            Try adjusting your search query or reset your filters.
          </p>
          <button
            onClick={resetFilters}
            className="mt-4 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-cyan-400 hover:bg-slate-700"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <>
          {/* Desktop Table Layout (hidden on mobile, visible on md+) - PRD Section 70 & 99 */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="border-b border-slate-800 bg-slate-950/70 text-slate-400 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Price</th>
                  <th className="py-3 px-4">Pool Specs & Size</th>
                  <th className="py-3 px-4">Sender</th>
                  <th className="py-3 px-4">Date / Age</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Lead</th>
                  <th className="py-3 px-4">Next Action</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {filteredQuotations.map((q) => {
                  const phoneClean = q.contact_number.replace(/\s+/g, '');
                  const waClean = q.contact_number.replace(/\D/g, '');

                  return (
                    <tr
                      key={q.id}
                      className="hover:bg-slate-800/40 transition group cursor-pointer"
                      onClick={() => onOpenQuotation(q.id)}
                    >
                      {/* Client */}
                      <td className="py-3.5 px-4 font-bold text-white max-w-[190px] truncate">
                        <div className="truncate text-sm">{q.client_name}</div>
                        <div className="text-[11px] text-slate-400 font-normal">
                          {q.contact_number}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-cyan-300 font-medium mt-0.5">
                          <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
                          <span className="truncate">{getQuotationLocation(q)}</span>
                        </div>
                      </td>

                      {/* Price */}
                      <td className="py-3.5 px-4 font-bold text-cyan-400 text-sm whitespace-nowrap">
                        {formatIndianCurrency(q.quotation_price)}
                      </td>

                      {/* Pool Specs & Size */}
                      <td className="py-3.5 px-4 min-w-[160px] max-w-[210px]">
                        <div className="font-semibold text-white truncate">{q.pool_type || 'Pool'}</div>
                        {q.pool_dimensions ? (
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 rounded bg-slate-800 border border-slate-700/80 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300">
                              📏 {parsePoolDimensions(q.pool_dimensions)?.formatted || q.pool_dimensions}
                            </span>
                            {parsePoolDimensions(q.pool_dimensions)?.surfaceAreaSqFt ? (
                              <span className="text-[10px] text-slate-400 font-mono">
                                {parsePoolDimensions(q.pool_dimensions)?.surfaceAreaSqFt} sq.ft
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-500">—</div>
                        )}
                      </td>

                      {/* Sender */}
                      <td className="py-3.5 px-4 text-slate-300 truncate max-w-[120px]">
                        {q.sender_name || '—'}
                      </td>

                      {/* Date & Aging */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div>{q.quotation_date}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {q.age_days} days old
                        </div>
                      </td>

                      {/* App Status (In-place quick changer) */}
                      <td
                        className="py-3.5 px-4 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          value={q.app_status}
                          disabled={updatingQuoteId === q.id}
                          onChange={(e) =>
                            handleQuickUpdateStatus(q, e.target.value as AppStatus)
                          }
                          className="text-xs font-semibold rounded-lg border border-slate-700 bg-slate-800/90 py-1 px-2 text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer shadow-xs hover:border-slate-600 transition"
                          title="Click to change lead stage"
                        >
                          {STAGE_OPTIONS.map((st) => (
                            <option
                              key={st.status}
                              value={st.status}
                              className="bg-slate-900 text-slate-200"
                            >
                              {st.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Temperature & Priority */}
                      <td
                        className="py-3.5 px-4 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            title="Click to cycle temperature (Hot / Warm / Cold)"
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
                          {q.priority === 'high' && (
                            <span className="text-[10px] font-bold text-rose-400 uppercase">
                              P1
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Next Action */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {q.next_followup ? (
                          <div>
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                                q.next_followup.status === 'Overdue'
                                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                  : q.next_followup.status === 'Due'
                                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {q.next_followup.scheduled_date}
                            </span>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {q.next_followup.type} at {q.next_followup.scheduled_time}
                            </div>
                          </div>
                        ) : q.has_action_taken || q.latest_completed_followup ? (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span className="truncate max-w-[130px]">
                                {q.latest_completed_followup?.outcome || 'Action Taken'}
                              </span>
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {q.latest_completed_followup?.type || 'Completed'}
                            </span>
                          </div>
                        ) : (
                          <div
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-[10px] text-amber-400 font-semibold mr-0.5">
                              Set:
                            </span>
                            <button
                              disabled={schedulingQuoteId === q.id}
                              onClick={() => handleQuickSchedule(q, 1)}
                              className="rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 transition active:scale-95 disabled:opacity-50"
                              title="Schedule call for Tomorrow 10:30 AM"
                            >
                              +1d
                            </button>
                            <button
                              disabled={schedulingQuoteId === q.id}
                              onClick={() => handleQuickSchedule(q, 3)}
                              className="rounded bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 px-1.5 py-0.5 text-[10px] font-bold text-teal-300 transition active:scale-95 disabled:opacity-50"
                              title="Schedule call in 3 Days 10:30 AM"
                            >
                              +3d
                            </button>
                            <button
                              disabled={schedulingQuoteId === q.id}
                              onClick={() => handleQuickSchedule(q, 7)}
                              className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-slate-300 transition active:scale-95 disabled:opacity-50"
                              title="Schedule call in 1 Week 10:30 AM"
                            >
                              +7d
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td
                        className="py-3.5 px-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <a
                            href={`tel:${phoneClean}`}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-emerald-400 transition"
                            title="Call client"
                          >
                            <Phone className="w-4 h-4" />
                          </a>
                          <a
                            href={generateWhatsAppUrl(
                              q.contact_number,
                              q.client_name,
                              q.pool_type,
                              q.quotation_price
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-emerald-400 transition"
                            title="Open pre-filled WhatsApp follow-up"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>
                          {q.next_followup ? (
                            <button
                              onClick={() => onOpenDoneModal(q.next_followup!)}
                              className="rounded-lg bg-emerald-600/80 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-500 transition"
                              title="Mark Done"
                            >
                              ✓ Done
                            </button>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setActionModalQuote(q)}
                                className="rounded-lg bg-teal-600/80 px-2 py-1 text-[11px] font-semibold text-white hover:bg-teal-500 transition"
                                title="Record touchpoint or action taken"
                              >
                                Record
                              </button>
                              <button
                                onClick={() => onOpenNewFollowUpForQuotation(q.id)}
                                className="rounded-lg bg-amber-600/80 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-500 transition"
                                title="Open custom follow-up scheduler"
                              >
                                + Custom
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards Layout (visible on mobile, hidden on md+) - PRD Section 70 & 99 */}
          <div className="md:hidden space-y-3">
            {filteredQuotations.map((q) => {
              const phoneClean = q.contact_number.replace(/\s+/g, '');
              const waUrl = generateWhatsAppUrl(
                q.contact_number,
                q.client_name,
                q.pool_type,
                q.quotation_price
              );
              const isSchedulingThis = schedulingQuoteId === q.id;

              return (
                <div
                  key={q.id}
                  onClick={() => onOpenQuotation(q.id)}
                  className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-sm active:bg-slate-800/60 transition"
                >
                  {/* Card Header: Client & Temperature */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-white leading-tight">
                        {q.client_name}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                        <span>📞 {q.contact_number}</span>
                        <span className="inline-flex items-center gap-0.5 text-cyan-300 font-medium">
                          <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
                          {getQuotationLocation(q)}
                        </span>
                      </div>
                    </div>
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

                  {/* Price & Specs */}
                  <div className="mt-2.5 flex items-baseline justify-between border-t border-slate-800/80 pt-2">
                    <p className="text-lg font-extrabold text-cyan-400">
                      {formatIndianCurrency(q.quotation_price)}
                    </p>
                    <span className="text-xs text-slate-300 font-medium">
                      {q.pool_type || 'Pool'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 mt-1.5 gap-2 flex-wrap">
                    {q.pool_dimensions ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 rounded bg-slate-800 border border-slate-700/80 px-2 py-0.5 text-[11px] font-semibold text-cyan-300">
                          📏 {parsePoolDimensions(q.pool_dimensions)?.formatted || q.pool_dimensions}
                        </span>
                        {parsePoolDimensions(q.pool_dimensions)?.surfaceAreaSqFt ? (
                          <span className="text-[11px] text-slate-400 font-medium">
                            ({parsePoolDimensions(q.pool_dimensions)?.surfaceAreaSqFt} sq.ft)
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-slate-500 text-xs">Size: —</span>
                    )}

                    {/* Interactive Mobile Stage Changer */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <select
                        value={q.app_status}
                        disabled={updatingQuoteId === q.id}
                        onChange={(e) =>
                          handleQuickUpdateStatus(q, e.target.value as AppStatus)
                        }
                        className="text-[11px] font-semibold rounded-lg border border-slate-700 bg-slate-800 py-1 px-1.5 text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer shadow-2xs"
                      >
                        {STAGE_OPTIONS.map((st) => (
                          <option key={st.status} value={st.status} className="bg-slate-900 text-slate-200">
                            {st.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Next Follow-up Banner */}
                  <div className="mt-3 rounded-xl bg-slate-950/70 p-2.5 flex items-center justify-between text-xs border border-slate-800/60">
                    <span className="text-slate-400">Next Action:</span>
                    {q.next_followup ? (
                      <span
                        className={`font-semibold px-2 py-0.5 rounded-md ${
                          q.next_followup.status === 'Overdue'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : q.next_followup.status === 'Due'
                            ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {q.next_followup.scheduled_date} · {q.next_followup.type}
                      </span>
                    ) : q.has_action_taken || q.latest_completed_followup ? (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {q.latest_completed_followup?.outcome || 'Action Taken'}
                      </span>
                    ) : (
                      <span className="text-amber-400 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        No Next Action
                      </span>
                    )}
                  </div>

                  {/* Quick Mobile Action Bar */}
                  <div
                    className="mt-3 pt-2.5 border-t border-slate-800/80"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {q.next_followup ? (
                      <div className="grid grid-cols-4 gap-2">
                        <a
                          href={`tel:${phoneClean}`}
                          className="flex flex-col items-center justify-center rounded-xl bg-slate-800 py-2 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
                        >
                          <Phone className="w-3.5 h-3.5 text-emerald-400 mb-0.5" />
                          <span>Call</span>
                        </a>

                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-col items-center justify-center rounded-xl bg-emerald-950/50 border border-emerald-900/60 py-2 text-[11px] font-medium text-emerald-300 hover:bg-emerald-900"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-emerald-400 mb-0.5" />
                          <span>WhatsApp</span>
                        </a>

                        <button
                          onClick={() => onOpenDoneModal(q.next_followup!)}
                          className="flex flex-col items-center justify-center rounded-xl bg-emerald-600 py-2 text-[11px] font-bold text-white hover:bg-emerald-500"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mb-0.5" />
                          <span>Done</span>
                        </button>
                        <button
                          onClick={() => onOpenRescheduleModal(q.next_followup!)}
                          className="flex flex-col items-center justify-center rounded-xl bg-slate-950 border border-slate-800 py-2 text-[11px] font-medium text-slate-300"
                        >
                          <RotateCw className="w-3.5 h-3.5 text-cyan-400 mb-0.5" />
                          <span>Later</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-1.5">
                          <a
                            href={`tel:${phoneClean}`}
                            className="flex items-center justify-center gap-1 rounded-xl bg-slate-800 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                          >
                            <Phone className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Call</span>
                          </a>

                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1 rounded-xl bg-emerald-950/50 border border-emerald-900/60 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-900"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                            <span>WhatsApp</span>
                          </a>

                          <button
                            type="button"
                            onClick={() => setActionModalQuote(q)}
                            className="flex items-center justify-center gap-1 rounded-xl bg-teal-950/60 border border-teal-800/80 py-2 text-xs font-semibold text-teal-300 hover:bg-teal-900 transition active:scale-95"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                            <span>Action</span>
                          </button>
                        </div>

                        {/* 1-Click Schedule Chips on Mobile Card */}
                        <div className="flex items-center gap-1.5 pt-1">
                          <button
                            disabled={isSchedulingThis}
                            onClick={() => handleQuickSchedule(q, 1)}
                            className="flex-1 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[11px] font-bold text-amber-300 text-center transition active:scale-95 disabled:opacity-50"
                          >
                            Tomorrow
                          </button>
                          <button
                            disabled={isSchedulingThis}
                            onClick={() => handleQuickSchedule(q, 3)}
                            className="flex-1 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-[11px] font-bold text-teal-300 text-center transition active:scale-95 disabled:opacity-50"
                          >
                            +3 Days
                          </button>
                          <button
                            onClick={() => onOpenNewFollowUpForQuotation(q.id)}
                            className="py-1.5 px-2 rounded-lg bg-slate-800 border border-slate-700 text-[11px] font-semibold text-slate-300 text-center transition active:scale-95"
                          >
                            + Custom
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Record Direct Action Modal */}
      {actionModalQuote && (
        <RecordActionModal
          quotation={actionModalQuote}
          onClose={() => setActionModalQuote(null)}
          onSuccess={onRefresh}
        />
      )}
    </div>
  );
};
