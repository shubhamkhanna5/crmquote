import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  RotateCw,
} from 'lucide-react';
import { FollowUp, Quotation, isTrialRecord } from '../types';
import { formatIndianCurrency } from '../../server/normalizer';
import { GoogleCalendarButton } from './GoogleCalendarButton';
import { formatDDMMYYYY } from '../utils/dateUtils';

interface CalendarViewProps {
  followups: FollowUp[];
  quotations: Quotation[];
  onOpenQuotation: (id: string) => void;
  onOpenDoneModal: (f: FollowUp) => void;
  onOpenRescheduleModal: (f: FollowUp) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  followups: rawFollowups,
  quotations,
  onOpenQuotation,
  onOpenDoneModal,
  onOpenRescheduleModal,
  onRefresh,
  isRefreshing,
}) => {
  const followups = rawFollowups.filter(
    (f) => !isTrialRecord(f.quotation?.client_name, f.quotation?.contact_number)
  );
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'agenda'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 'agenda' : 'month'
  );

  // Month navigation
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToday = () => {
    setCurrentDate(new Date());
  };

  // Build calendar matrix
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Group followups by date
  const followupsByDate: Record<string, FollowUp[]> = {};
  followups.forEach((f) => {
    if (!followupsByDate[f.scheduled_date]) {
      followupsByDate[f.scheduled_date] = [];
    }
    followupsByDate[f.scheduled_date].push(f);
  });

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-4 pb-mobile-nav md:pb-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Follow-Up Calendar
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Visual schedule of scheduled, due, and completed customer follow-ups
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <GoogleCalendarButton
            variant="pill"
            followups={followups}
            quotations={quotations}
            onSyncComplete={onRefresh}
          />

          {/* View Mode Toggle (macOS Segmented Style) */}
          <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs shadow-inner">
            <button
              onClick={() => setViewMode('month')}
              className={`rounded-md px-3 py-1 font-semibold transition ${
                viewMode === 'month' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode('agenda')}
              className={`rounded-md px-3 py-1 font-semibold transition ${
                viewMode === 'agenda' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Agenda
            </button>
          </div>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 text-[#007AFF] ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Month Navigation Toolbar */}
      <div className="flex items-center justify-between rounded-2xl border border-black/[0.06] bg-white p-3 sm:p-3.5 shadow-2xs">
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="rounded-lg border border-slate-200 p-1 text-slate-600 hover:bg-slate-100"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm sm:text-base font-bold text-slate-900 px-1 text-center truncate">
            {monthName}
          </span>
          <button
            onClick={nextMonth}
            className="rounded-lg border border-slate-200 p-1 text-slate-600 hover:bg-slate-100"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={goToday}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          Today
        </button>
      </div>

      {viewMode === 'month' ? (
        /* Month View Grid */
        <div className="rounded-2xl border border-black/[0.06] bg-white overflow-hidden shadow-2xs">
          {/* Day Headers */}
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500 py-2.5">
            <span>Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
          </div>

          {/* Calendar Cells */}
          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-100 text-xs">
            {/* Blank leading days */}
            {Array.from({ length: firstDayIndex }).map((_, idx) => (
              <div key={`blank-${idx}`} className="h-24 sm:h-28 bg-slate-50/50 p-1.5 opacity-40" />
            ))}

            {/* Days of Month */}
            {daysArray.map((day) => {
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(
                day
              ).padStart(2, '0')}`;
              const dayFollowups = followupsByDate[dateStr] || [];
              const isToday = dateStr === todayStr;

              return (
                <div
                  key={dateStr}
                  className={`h-24 sm:h-28 p-1 sm:p-2 flex flex-col justify-between transition hover:bg-slate-50 ${
                    isToday ? 'bg-blue-50/40' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                        isToday
                          ? 'bg-[#007AFF] text-white shadow-xs'
                          : 'text-slate-700'
                      }`}
                    >
                      {day}
                    </span>
                    {dayFollowups.length > 0 && (
                      <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                        {dayFollowups.length}
                      </span>
                    )}
                  </div>

                  {/* Day Events */}
                  <div className="space-y-1 overflow-y-auto max-h-16 mt-1">
                    {dayFollowups.slice(0, 2).map((f) => (
                      <div
                        key={f.id}
                        onClick={() => onOpenQuotation(f.quotation_id)}
                        className={`truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium cursor-pointer transition ${
                          f.status === 'Completed'
                            ? 'bg-slate-100 text-slate-500 border border-slate-200 line-through'
                            : f.status === 'Overdue'
                            ? 'bg-rose-50 text-[#FF3B30] border border-rose-200 font-semibold'
                            : 'bg-blue-50 text-[#007AFF] border border-blue-200'
                        }`}
                        title={`${f.quotation?.client_name || 'Client'} - ${f.scheduled_time} ${
                          f.type
                        }`}
                      >
                        {f.scheduled_time} {f.quotation?.client_name || 'Client'}
                      </div>
                    ))}
                    {dayFollowups.length > 2 && (
                      <span className="text-[9px] text-slate-400 block px-1">
                        +{dayFollowups.length - 2} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Agenda View */
        <div className="space-y-3">
          {Object.entries(followupsByDate)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dateKey, items]) => (
              <div
                key={dateKey}
                className="rounded-2xl border border-black/[0.06] bg-white p-4 space-y-3 shadow-2xs"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-[#007AFF]" />
                    <h3 className="text-sm font-bold text-slate-900">{formatDDMMYYYY(dateKey)}</h3>
                    {dateKey === todayStr && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-[#007AFF]">
                        TODAY
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500">{items.length} follow-ups</span>
                </div>

                <div className="space-y-2">
                  {items.map((f) => (
                    <div
                      key={f.id}
                      className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                    >
                      <div>
                        <button
                          onClick={() => onOpenQuotation(f.quotation_id)}
                          className="font-bold text-slate-900 hover:text-[#007AFF] text-xs sm:text-sm text-left"
                        >
                          {f.quotation?.client_name || 'Client'} ·{' '}
                          {formatIndianCurrency(f.quotation?.quotation_price || 0)}
                        </button>
                        <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span>
                            {f.type} at {f.scheduled_time} · {f.quotation?.pool_type || 'Pool'}
                            {f.quotation?.pool_dimensions ? ` · 📏 ${f.quotation.pool_dimensions}` : ''}
                          </span>
                          {f.calendar_event?.html_link && (
                            <a
                              href={f.calendar_event.html_link}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#007AFF] hover:underline"
                              title="Open event in Google Calendar"
                            >
                              <CalendarIcon className="w-3 h-3" />
                              <span>In Google Calendar ↗</span>
                            </a>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 mt-2 sm:mt-0">
                        {f.status === 'Completed' ? (
                          <span className="text-xs text-emerald-700 font-semibold px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200">
                            ✓ Completed
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => onOpenDoneModal(f)}
                              className="flex-1 sm:flex-initial min-h-[36px] flex items-center justify-center rounded-xl bg-[#007AFF] hover:bg-blue-600 px-3.5 py-1 text-xs font-bold text-white ios-tap-active touch-manipulation shadow-2xs transition"
                            >
                              ✓ Done
                            </button>
                            <button
                              onClick={() => onOpenRescheduleModal(f)}
                              className="flex-1 sm:flex-initial min-h-[36px] flex items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-100 px-3.5 py-1 text-xs font-semibold text-slate-700 ios-tap-active touch-manipulation transition shadow-2xs"
                            >
                              Reschedule
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};
