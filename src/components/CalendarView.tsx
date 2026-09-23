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
    <div className="space-y-5 pb-20 md:pb-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Follow-Up Calendar
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
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

          {/* View Mode Toggle */}
          <div className="flex rounded-xl border border-slate-800 bg-slate-900 p-1 text-xs">
            <button
              onClick={() => setViewMode('month')}
              className={`rounded-lg px-3 py-1 font-medium transition ${
                viewMode === 'month' ? 'bg-cyan-600 text-white' : 'text-slate-400'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode('agenda')}
              className={`rounded-lg px-3 py-1 font-medium transition ${
                viewMode === 'agenda' ? 'bg-cyan-600 text-white' : 'text-slate-400'
              }`}
            >
              Agenda
            </button>
          </div>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Month Navigation Toolbar */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="rounded-lg border border-slate-800 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm sm:text-base font-bold text-white px-1 text-center truncate">
            {monthName}
          </span>
          <button
            onClick={nextMonth}
            className="rounded-lg border border-slate-800 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={goToday}
          className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
        >
          Today
        </button>
      </div>

      {viewMode === 'month' ? (
        /* Month View Grid */
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 overflow-hidden shadow-sm">
          {/* Day Headers */}
          <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-950/80 text-center text-xs font-semibold uppercase tracking-wider text-slate-400 py-2.5">
            <span>Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
          </div>

          {/* Calendar Cells */}
          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-800/80 text-xs">
            {/* Blank leading days */}
            {Array.from({ length: firstDayIndex }).map((_, idx) => (
              <div key={`blank-${idx}`} className="h-24 sm:h-28 bg-slate-950/30 p-1.5 opacity-40" />
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
                  className={`h-24 sm:h-28 p-1 sm:p-2 flex flex-col justify-between transition hover:bg-slate-800/30 ${
                    isToday ? 'bg-cyan-950/20' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                        isToday
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-300'
                      }`}
                    >
                      {day}
                    </span>
                    {dayFollowups.length > 0 && (
                      <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
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
                        className={`truncate rounded px-1.5 py-0.5 text-[10px] font-medium cursor-pointer transition ${
                          f.status === 'Completed'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-900 line-through'
                            : f.status === 'Overdue'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800 font-semibold'
                            : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
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
                className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3 shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-sm font-bold text-white">{dateKey}</h3>
                    {dateKey === todayStr && (
                      <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                        TODAY
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">{items.length} follow-ups</span>
                </div>

                <div className="space-y-2">
                  {items.map((f) => (
                    <div
                      key={f.id}
                      className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                    >
                      <div>
                        <button
                          onClick={() => onOpenQuotation(f.quotation_id)}
                          className="font-bold text-white hover:text-cyan-400 text-xs sm:text-sm text-left"
                        >
                          {f.quotation?.client_name || 'Client'} ·{' '}
                          {formatIndianCurrency(f.quotation?.quotation_price || 0)}
                        </button>
                        <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
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
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-cyan-400 hover:text-cyan-300"
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
                          <span className="text-xs text-emerald-400 font-semibold px-2 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800">
                            ✓ Completed
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => onOpenDoneModal(f)}
                              className="flex-1 sm:flex-initial min-h-[44px] flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 active:scale-95 touch-manipulation shadow-2xs transition"
                            >
                              ✓ Done
                            </button>
                            <button
                              onClick={() => onOpenRescheduleModal(f)}
                              className="flex-1 sm:flex-initial min-h-[44px] flex items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 active:scale-95 touch-manipulation transition"
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
