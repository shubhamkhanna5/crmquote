import React, { useState } from 'react';
import {
  CheckCircle2,
  X,
  Phone,
  MessageCircle,
  Calendar,
  Clock,
  MapPin,
  Users,
  Flame,
  Sun,
  Snowflake,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CalendarCheck,
} from 'lucide-react';
import { Quotation, FollowUp, FollowUpOutcome, FollowUpType, Temperature, AppStatus } from '../types';
import { formatIndianCurrency } from '../../server/normalizer';
import { isGoogleCalendarConnected } from '../services/googleCalendar';
import { getQuickScheduleDate } from '../utils/quotationActions';
import { formatDDMMYYYY } from '../utils/dateUtils';
import { useToast } from './Toast';

export interface FollowUpDoneModalProps {
  followup: FollowUp | null;
  quotation?: Quotation | null;
  onClose: () => void;
  onSave: (data: {
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
  }) => Promise<void>;
}

interface OutcomeOption {
  outcome: FollowUpOutcome;
  label: string;
  desc: string;
  icon: string;
  group: 'connected' | 'discussion' | 'unreachable';
  defaultNext: 'tomorrow' | '3_days' | '7_days' | 'none';
  defaultType: FollowUpType;
  colorClass: string;
  suggestedTemp?: Temperature;
}

const OUTCOME_GROUPS: {
  title: string;
  category: 'connected' | 'discussion' | 'unreachable';
  options: OutcomeOption[];
}[] = [
  {
    title: 'Connected & Positive',
    category: 'connected',
    options: [
      {
        outcome: 'Spoke to client',
        label: 'Spoke to Client',
        desc: 'Discussed project scope & pricing',
        icon: '📞',
        group: 'connected',
        defaultNext: '3_days',
        defaultType: 'Call',
        colorClass: 'border-emerald-200 bg-emerald-50/50 hover:border-emerald-400 text-emerald-950',
        suggestedTemp: 'warm',
      },
      {
        outcome: 'Interested',
        label: 'Client Interested',
        desc: 'Keen to proceed with installation',
        icon: '⭐️',
        group: 'connected',
        defaultNext: '3_days',
        defaultType: 'Call',
        colorClass: 'border-emerald-200 bg-emerald-50/50 hover:border-emerald-400 text-emerald-950',
        suggestedTemp: 'hot',
      },
      {
        outcome: 'Sent quotation/specs',
        label: 'Sent Specs / Quote',
        desc: 'Shared PDF estimate & drawing',
        icon: '📄',
        group: 'connected',
        defaultNext: '3_days',
        defaultType: 'WhatsApp',
        colorClass: 'border-teal-200 bg-teal-50/50 hover:border-teal-400 text-teal-950',
        suggestedTemp: 'warm',
      },
      {
        outcome: 'Meeting fixed',
        label: 'Meeting / Visit Fixed',
        desc: 'Confirmed site or office appointment',
        icon: '🤝',
        group: 'connected',
        defaultNext: '3_days',
        defaultType: 'Meeting',
        colorClass: 'border-blue-200 bg-blue-50/50 hover:border-blue-400 text-blue-950',
        suggestedTemp: 'hot',
      },
    ],
  },
  {
    title: 'In Discussion / Negotiation',
    category: 'discussion',
    options: [
      {
        outcome: 'Waiting for decision',
        label: 'Waiting for Decision',
        desc: 'Consulting with family or architect',
        icon: '⏳',
        group: 'discussion',
        defaultNext: '3_days',
        defaultType: 'WhatsApp',
        colorClass: 'border-amber-200 bg-amber-50/50 hover:border-amber-400 text-amber-950',
        suggestedTemp: 'warm',
      },
      {
        outcome: 'Asked for revision',
        label: 'Requested Revision',
        desc: 'Needs updated size, specs or tiles',
        icon: '🔄',
        group: 'discussion',
        defaultNext: 'tomorrow',
        defaultType: 'Call',
        colorClass: 'border-amber-200 bg-amber-50/50 hover:border-amber-400 text-amber-950',
        suggestedTemp: 'warm',
      },
      {
        outcome: 'Asked for better price',
        label: 'Price Negotiation',
        desc: 'Client requested concession or discount',
        icon: '💰',
        group: 'discussion',
        defaultNext: 'tomorrow',
        defaultType: 'Call',
        colorClass: 'border-amber-200 bg-amber-50/50 hover:border-amber-400 text-amber-950',
        suggestedTemp: 'warm',
      },
      {
        outcome: 'Call back later',
        label: 'Call Back Later',
        desc: 'Client busy right now, requested callback',
        icon: '⏰',
        group: 'discussion',
        defaultNext: 'tomorrow',
        defaultType: 'Call',
        colorClass: 'border-indigo-200 bg-indigo-50/50 hover:border-indigo-400 text-indigo-950',
      },
    ],
  },
  {
    title: 'Unreachable / Inactive / Lost',
    category: 'unreachable',
    options: [
      {
        outcome: 'No answer',
        label: 'Ringing / No Answer',
        desc: 'Call went unanswered',
        icon: '📵',
        group: 'unreachable',
        defaultNext: 'tomorrow',
        defaultType: 'Call',
        colorClass: 'border-slate-200 bg-slate-50/60 hover:border-slate-400 text-slate-800',
      },
      {
        outcome: 'Decision maker not available',
        label: 'Decision Maker Away',
        desc: 'Spoke to assistant, spouse or staff',
        icon: '👤',
        group: 'unreachable',
        defaultNext: 'tomorrow',
        defaultType: 'Call',
        colorClass: 'border-slate-200 bg-slate-50/60 hover:border-slate-400 text-slate-800',
      },
      {
        outcome: 'Not interested',
        label: 'Not Interested (Drop)',
        desc: 'Client cancelled or chose another vendor',
        icon: '❌',
        group: 'unreachable',
        defaultNext: 'none',
        defaultType: 'Call',
        colorClass: 'border-rose-200 bg-rose-50/50 hover:border-rose-400 text-rose-950',
        suggestedTemp: 'cold',
      },
      {
        outcome: 'Other',
        label: 'Other Outcome',
        desc: 'Custom outcome (add details in notes)',
        icon: '💬',
        group: 'unreachable',
        defaultNext: '3_days',
        defaultType: 'Call',
        colorClass: 'border-slate-200 bg-slate-50/60 hover:border-slate-400 text-slate-800',
      },
    ],
  },
];

const QUICK_NOTE_SNIPPETS = [
  'Quotation PDF sent on WhatsApp',
  'Discussing with family / partner',
  'Requested discount / best price',
  'Requested site visit for layout',
  'Client busy in meeting, call back tomorrow',
  'Civil work / excavation in progress',
  'Comparing other pool quotes',
  'Positive response, finalizing order',
];

export const FollowUpDoneModal: React.FC<FollowUpDoneModalProps> = ({
  followup,
  quotation,
  onClose,
  onSave,
}) => {
  const { showToast } = useToast();
  const [selectedOutcome, setSelectedOutcome] = useState<FollowUpOutcome>(
    followup?.type === 'WhatsApp' ? 'Sent quotation/specs' : 'Spoke to client'
  );
  const [notes, setNotes] = useState('');
  const [nextActionType, setNextActionType] = useState<
    'tomorrow' | '3_days' | '7_days' | 'custom' | 'none'
  >('7_days');
  const [hasUserChosenNextAction, setHasUserChosenNextAction] = useState(false);
  const [customDate, setCustomDate] = useState(getQuickScheduleDate(7));
  const [customTime, setCustomTime] = useState('10:30');
  const [nextType, setNextType] = useState<FollowUpType>(followup?.type || 'Call');
  const [presetNotice, setPresetNotice] = useState<string | null>(null);

  // Temperature selection (directly editable from record outcome)
  const quoteData = quotation || followup?.quotation;
  const [temperature, setTemperature] = useState<Temperature>(
    (quotation?.temperature || followup?.quotation?.temperature || 'warm') as Temperature
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!followup) return null;

  // Resolve lead contact & specs
  const clientName = quoteData?.client_name || 'Client';
  const rawPhone = quoteData?.contact_number || '';
  const cleanPhone = rawPhone.replace(/\D/g, '');
  const waPhone = cleanPhone.startsWith('91')
    ? cleanPhone
    : cleanPhone.length === 10
    ? `91${cleanPhone}`
    : cleanPhone;

  const poolType = quoteData?.pool_type || 'Swimming Pool';
  const poolDims = quoteData?.pool_dimensions || '';
  const price = quoteData?.quotation_price;

  // Handle outcome selection: automatically update temperature & status accordingly,
  // and keep 1 week selected unless explicitly chosen by the user
  const handleSelectOutcome = (opt: OutcomeOption) => {
    setSelectedOutcome(opt.outcome);
    setNextType(opt.defaultType);

    if (opt.outcome === 'Not interested') {
      setTemperature('cold');
      setNextActionType('none');
      setPresetNotice('Auto-set: Cold ❄️ | Sequence Closed (Lost)');
    } else if (opt.outcome === 'Interested' || opt.outcome === 'Meeting fixed') {
      setTemperature('hot');
      if (!hasUserChosenNextAction) {
        setNextActionType('7_days');
        setPresetNotice(`Auto-set: Hot 🔥 | Next Follow-up in 1 Week`);
      } else {
        setPresetNotice('Auto-set: Hot 🔥');
      }
    } else if (opt.suggestedTemp) {
      if (temperature === 'cold') {
        setTemperature(opt.suggestedTemp);
        setPresetNotice(`Auto-set: ${opt.suggestedTemp === 'warm' ? 'Warm ☀️' : 'Hot 🔥'}`);
      }
      if (!hasUserChosenNextAction) {
        setNextActionType('7_days');
      }
    } else {
      if (!hasUserChosenNextAction) {
        setNextActionType('7_days');
      }
    }
  };

  // Add quick note snippet
  const handleAddSnippet = (snippet: string) => {
    setNotes((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return snippet;
      if (trimmed.includes(snippet)) return prev;
      return `${trimmed}; ${snippet}`;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOutcome || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const finalTemp = selectedOutcome === 'Not interested' ? 'cold' : temperature;
      const finalStatus = selectedOutcome === 'Not interested' ? 'Lost' : undefined;

      await onSave({
        outcome: selectedOutcome,
        notes: notes.trim() || undefined,
        temperature: finalTemp,
        app_status: finalStatus,
        nextAction:
          nextActionType === 'none'
            ? { type: 'none' }
            : {
                type: nextActionType,
                customDate: nextActionType === 'custom' ? customDate : undefined,
                customTime: nextActionType === 'custom' ? customTime : undefined,
                followupType: nextType,
              },
      });
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Failed to complete follow-up', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white shadow-2xl text-slate-800 my-0 sm:my-6 max-h-[94vh] sm:max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0 sm:fade-in duration-200">
        {/* Mobile drag handle indicator */}
        <div className="sm:hidden mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-slate-300 shrink-0" />

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4 shrink-0 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-700 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                Complete Follow-Up
              </h2>
              <div className="flex flex-col gap-0.5 mt-0.5">
                <p className="text-xs text-slate-500">
                  Scheduled: <span className="font-semibold text-slate-700">{formatDDMMYYYY(followup.scheduled_date)}</span> · {followup.type}
                </p>
                <span className="text-[10px] sm:text-[11px] text-teal-800 bg-teal-50 border border-teal-200/80 px-2 py-0.5 rounded-md font-medium w-fit">
                  💡 Done logs this follow-up touchpoint (does not mean deal was won)
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition active:scale-95"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Client Quick Context Card */}
        <div className="border-b border-slate-100 bg-gradient-to-r from-teal-50/50 to-slate-50/50 px-4 py-3 sm:px-5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm sm:text-base font-bold text-slate-900 truncate">
                  {clientName}
                </span>
                {price !== undefined && (
                  <span className="rounded-md bg-teal-100 px-2 py-0.5 text-xs font-extrabold text-teal-800">
                    {formatIndianCurrency(price)}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                <span className="font-medium text-slate-700">{poolType}</span>
                {poolDims && (
                  <span className="font-semibold text-slate-900">
                    · 📏 {poolDims}
                  </span>
                )}
              </div>
            </div>

            {/* Quick 1-tap Call & WhatsApp right in header */}
            <div className="flex items-center gap-1.5 shrink-0">
              {rawPhone && (
                <a
                  href={`tel:${cleanPhone}`}
                  className="min-h-[42px] px-3 flex items-center justify-center gap-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold active:scale-95 transition"
                  title={`Call ${clientName}`}
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden xs:inline">Call</span>
                </a>
              )}
              {waPhone && (
                <a
                  href={`https://wa.me/${waPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[42px] px-3 flex items-center justify-center gap-1 rounded-xl bg-emerald-600 text-white text-xs font-bold active:scale-95 transition shadow-2xs"
                  title="WhatsApp"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span className="hidden xs:inline">Chat</span>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 space-y-5">
          {/* 1. Outcome Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                1. What happened on this follow-up? *
              </label>
              {presetNotice && (
                <span className="text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-full animate-in fade-in duration-150">
                  {presetNotice}
                </span>
              )}
            </div>

            <div className="space-y-3">
              {OUTCOME_GROUPS.map((group) => (
                <div key={group.category} className="space-y-1.5">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-0.5">
                    {group.title}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.options.map((opt) => {
                      const isSelected = selectedOutcome === opt.outcome;
                      return (
                        <button
                          key={opt.outcome}
                          type="button"
                          onClick={() => handleSelectOutcome(opt)}
                          className={`min-h-[50px] p-2.5 rounded-xl border text-left transition active:scale-98 flex items-start gap-2.5 ${
                            isSelected
                              ? 'border-teal-600 bg-teal-50/90 shadow-xs ring-2 ring-teal-500/20'
                              : `${opt.colorClass} border-slate-200 bg-white`
                          }`}
                        >
                          <span className="text-lg leading-none mt-0.5 shrink-0" role="img" aria-hidden="true">
                            {opt.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span
                                className={`text-xs font-bold ${
                                  isSelected ? 'text-teal-950' : 'text-slate-900'
                                }`}
                              >
                                {opt.label}
                              </span>
                              {isSelected && (
                                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 ml-1" />
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1 leading-tight">
                              {opt.desc}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Quick Note Chips & Notes Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                2. Touchpoint Notes
              </label>
              <span className="text-[11px] text-slate-500 font-medium">Tap chips for instant notes</span>
            </div>

            {/* Quick 1-Tap Snippet Chips for mobile phone users */}
            <div className="mb-2 flex flex-wrap gap-1.5">
              {QUICK_NOTE_SNIPPETS.map((snippet) => (
                <button
                  key={snippet}
                  type="button"
                  onClick={() => handleAddSnippet(snippet)}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-medium border border-slate-200 bg-slate-50 text-slate-700 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-900 active:scale-95 transition"
                >
                  + {snippet}
                </button>
              ))}
            </div>

            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Client requested revised pool layout with glass floor; discussing with family..."
              className="w-full min-h-[64px] rounded-xl border border-slate-200 bg-white p-3 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 shadow-2xs"
            />
          </div>

          {/* 3. Lead Temperature (Direct 1-tap update) */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-rose-500" />
                3. Lead Temperature
              </label>
              <span className="text-[11px] font-semibold text-slate-600">
                Selected: <span className="uppercase font-bold text-teal-700">{temperature}</span>
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  temp: 'hot',
                  label: 'Hot 🔥',
                  sub: 'High intent / Immediate',
                  activeStyle: 'border-rose-500 bg-rose-500 text-white shadow-xs ring-2 ring-rose-500/20',
                  inactiveStyle: 'border-rose-200 bg-rose-50/40 text-rose-950 hover:bg-rose-50',
                },
                {
                  temp: 'warm',
                  label: 'Warm ☀️',
                  sub: 'Interested / Active',
                  activeStyle: 'border-amber-500 bg-amber-500 text-white shadow-xs ring-2 ring-amber-500/20',
                  inactiveStyle: 'border-amber-200 bg-amber-50/40 text-amber-950 hover:bg-amber-50',
                },
                {
                  temp: 'cold',
                  label: 'Cold ❄️',
                  sub: 'Delayed / Low urgency',
                  activeStyle: 'border-blue-500 bg-blue-500 text-white shadow-xs ring-2 ring-blue-500/20',
                  inactiveStyle: 'border-blue-200 bg-blue-50/40 text-blue-950 hover:bg-blue-50',
                },
              ].map((t) => {
                const isSelected = temperature === t.temp;
                return (
                  <button
                    key={t.temp}
                    type="button"
                    onClick={() => setTemperature(t.temp as Temperature)}
                    className={`min-h-[50px] py-1.5 px-2 rounded-xl text-center border transition active:scale-95 flex flex-col items-center justify-center ${
                      isSelected ? t.activeStyle : t.inactiveStyle
                    }`}
                  >
                    <span className="text-xs font-bold">{t.label}</span>
                    <span className={`text-[10px] line-clamp-1 ${isSelected ? 'text-white/90' : 'text-slate-500'}`}>
                      {t.sub}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Schedule Next Action */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <label className="text-xs font-bold uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-amber-600" />
                4. Schedule Next Action
              </label>
              {isGoogleCalendarConnected() && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <CalendarCheck className="w-3 h-3 text-emerald-600" />
                  Google Cal Sync
                </span>
              )}
            </div>

            {/* Next Action Timeframe Buttons: In 1 Week selected by default */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {[
                { id: 'tomorrow', label: 'Tomorrow' },
                { id: '3_days', label: 'In 3 Days' },
                { id: '7_days', label: 'In 1 Week' },
                { id: 'custom', label: 'Custom Date' },
                { id: 'none', label: 'No Follow-up' },
              ].map((act) => (
                <button
                  type="button"
                  key={act.id}
                  onClick={() => {
                    setNextActionType(act.id as any);
                    setHasUserChosenNextAction(true);
                    setPresetNotice(null);
                  }}
                  className={`min-h-[44px] px-2 rounded-xl text-xs font-bold border transition active:scale-95 flex items-center justify-center text-center ${
                    nextActionType === act.id
                      ? act.id === 'none'
                        ? 'border-slate-800 bg-slate-800 text-white shadow-2xs'
                        : 'border-teal-600 bg-teal-600 text-white shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {act.label}
                </button>
              ))}
            </div>

            {/* Custom Date & Time Fields */}
            {nextActionType === 'custom' && (
              <div className="pt-1 grid grid-cols-1 sm:grid-cols-2 gap-2 animate-in fade-in">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Follow-Up Date
                  </label>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 shadow-2xs focus:border-teal-500 focus:outline-none"
                  />
                  {customDate && (
                    <span className="text-[10px] text-teal-700 font-mono mt-0.5 block">
                      Target: {formatDDMMYYYY(customDate)}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Preferred Time
                  </label>
                  <input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 shadow-2xs focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Next Action Type Selector */}
            {nextActionType !== 'none' && (
              <div className="pt-1">
                <p className="text-[11px] font-bold text-slate-700 mb-1.5">Action Channel:</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      { type: 'Call', icon: <Phone className="w-3.5 h-3.5" />, label: 'Call' },
                      { type: 'WhatsApp', icon: <MessageCircle className="w-3.5 h-3.5" />, label: 'WhatsApp' },
                      { type: 'Meeting', icon: <Users className="w-3.5 h-3.5" />, label: 'Meeting' },
                      { type: 'Site Visit', icon: <MapPin className="w-3.5 h-3.5" />, label: 'Site Visit' },
                    ] as const
                  ).map((ch) => (
                    <button
                      key={ch.type}
                      type="button"
                      onClick={() => setNextType(ch.type)}
                      className={`min-h-[38px] px-1 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1 transition active:scale-95 ${
                        nextType === ch.type
                          ? 'bg-slate-900 border-slate-900 text-white shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {ch.icon}
                      <span>{ch.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Sticky Thumb-Zone Action Footer for Mobile */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 sm:p-4 flex items-center gap-2.5 z-20 shadow-lg">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-[46px] px-4 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 min-h-[46px] flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs sm:text-sm shadow-md transition active:scale-95 disabled:opacity-50"
          >
            <CheckCircle2 className="w-5 h-5 text-teal-100" />
            <span>
              {isSubmitting
                ? 'Completing...'
                : nextActionType === 'none'
                ? 'Complete Follow-Up'
                : `Complete & Next: ${
                    nextActionType === 'tomorrow'
                      ? 'Tomorrow'
                      : nextActionType === '3_days'
                      ? 'In 3 Days'
                      : nextActionType === '7_days'
                      ? 'In 1 Week'
                      : 'Scheduled'
                  }`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
