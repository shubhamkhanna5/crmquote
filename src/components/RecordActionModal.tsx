import React, { useState } from 'react';
import {
  CheckCircle2,
  X,
  Phone,
  MessageCircle,
  Users,
  MapPin,
  Mail,
  Calendar,
  Clock,
  Zap,
  Sparkles,
  FileText,
  Flame,
} from 'lucide-react';
import { Quotation, FollowUp, FollowUpOutcome, FollowUpType, AppStatus, Temperature } from '../types';
import { api } from '../services/api';
import { isGoogleCalendarConnected, syncFollowUpToGoogleCalendar } from '../services/googleCalendar';
import { getQuickScheduleDate, STAGE_OPTIONS } from '../utils/quotationActions';
import { formatIndianCurrency } from '../../server/normalizer';
import { useToast } from './Toast';
import { formatDDMMYYYY } from '../utils/dateUtils';

interface RecordActionModalProps {
  quotation: Quotation | null;
  followup?: FollowUp | null;
  initialType?: FollowUpType;
  onClose: () => void;
  onSuccess: () => void;
}

const ACTION_TYPES: { type: FollowUpType; label: string; icon: React.ReactNode }[] = [
  { type: 'Call', label: 'Phone Call', icon: <Phone className="w-4 h-4 text-emerald-600" /> },
  { type: 'WhatsApp', label: 'WhatsApp', icon: <MessageCircle className="w-4 h-4 text-emerald-600" /> },
  { type: 'Meeting', label: 'In-Person Meeting', icon: <Users className="w-4 h-4 text-blue-600" /> },
  { type: 'Site Visit', label: 'Site Inspection', icon: <MapPin className="w-4 h-4 text-purple-600" /> },
  { type: 'Email', label: 'Email Sent', icon: <Mail className="w-4 h-4 text-amber-600" /> },
  { type: 'Other', label: 'Other Touchpoint', icon: <Sparkles className="w-4 h-4 text-slate-600" /> },
];

const OUTCOME_OPTIONS: {
  outcome: FollowUpOutcome;
  label: string;
  desc: string;
  suggestedTemp?: Temperature;
}[] = [
  { outcome: 'Spoke to client', label: 'Spoke with Client', desc: 'Discussed project requirements & scope', suggestedTemp: 'warm' },
  { outcome: 'Sent quotation/specs', label: 'Sent Specs / Quote', desc: 'Sent drawing, estimate, or catalog', suggestedTemp: 'warm' },
  { outcome: 'Interested', label: 'Client Interested', desc: 'Positive feedback, keen to move forward', suggestedTemp: 'hot' },
  { outcome: 'Waiting for decision', label: 'Waiting for Decision', desc: 'Reviewing with family/partner/builder', suggestedTemp: 'warm' },
  { outcome: 'Asked for revision', label: 'Requested Revision', desc: 'Changes needed to specs or sizes', suggestedTemp: 'warm' },
  { outcome: 'Asked for better price', label: 'Negotiation / Discount', desc: 'Client requested price concession', suggestedTemp: 'warm' },
  { outcome: 'Meeting fixed', label: 'Meeting Fixed', desc: 'Agreed on in-person/site appointment', suggestedTemp: 'hot' },
  { outcome: 'Call back later', label: 'Call Back Later', desc: 'Client busy, requested later callback' },
  { outcome: 'No answer', label: 'Ringing / No Answer', desc: 'Call went unanswered' },
  { outcome: 'Not interested', label: 'Not Interested (Lost)', desc: 'Client cancelled or chose another vendor', suggestedTemp: 'cold' },
  { outcome: 'Other', label: 'Other Outcome', desc: 'Custom follow-up notes' },
];

export const RecordActionModal: React.FC<RecordActionModalProps> = ({
  quotation,
  followup,
  initialType = 'Call',
  onClose,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const [actionType, setActionType] = useState<FollowUpType>(initialType);
  const [outcome, setOutcome] = useState<FollowUpOutcome>(
    initialType === 'WhatsApp' ? 'Sent quotation/specs' : 'Spoke to client'
  );
  const [notes, setNotes] = useState('');
  const [appStatus, setAppStatus] = useState<AppStatus>(quotation?.app_status || 'In Discussion');
  const [temperature, setTemperature] = useState<Temperature>(
    (quotation?.temperature || 'warm') as Temperature
  );
  const [nextActionOption, setNextActionOption] = useState<
    'none' | 'tomorrow' | '3_days' | '7_days' | 'custom'
  >('7_days');
  const [hasUserChosenNextAction, setHasUserChosenNextAction] = useState(false);
  const [customDate, setCustomDate] = useState(getQuickScheduleDate(7));
  const [customTime, setCustomTime] = useState('10:30');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!quotation) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      let nextFupMsg = '';

      const finalTemp = outcome === 'Not interested' ? 'cold' : temperature;
      const targetStatus = outcome === 'Not interested' ? 'Lost' : appStatus;

      if (followup) {
        // Complete the scheduled follow-up
        const result = await api.completeFollowUp(followup.id, {
          outcome,
          notes: notes.trim() || undefined,
          temperature: finalTemp,
          app_status: targetStatus,
          nextAction:
            nextActionOption === 'none'
              ? { type: 'none' }
              : {
                  type: nextActionOption,
                  customDate: nextActionOption === 'custom' ? customDate : undefined,
                  customTime: nextActionOption === 'custom' ? customTime : undefined,
                  followupType: actionType,
                },
        });

        // Always update quotation temperature and status
        await api.updateQuotationAppFields(quotation.id, {
          app_status: targetStatus,
          temperature: finalTemp,
        });

        if (result.nextFollowup) {
          if (isGoogleCalendarConnected()) {
            const syncRes = await syncFollowUpToGoogleCalendar(result.nextFollowup, quotation).catch(() => null);
            if (syncRes?.success) {
              nextFupMsg = ` & next follow-up added to Google Calendar (${formatDDMMYYYY(result.nextFollowup.scheduled_date)})`;
            } else {
              nextFupMsg = ` & next follow-up set for ${formatDDMMYYYY(result.nextFollowup.scheduled_date)}`;
            }
          } else {
            nextFupMsg = ` & next follow-up set for ${formatDDMMYYYY(result.nextFollowup.scheduled_date)}`;
          }
        }

        showToast(`Follow-up completed for ${quotation.client_name}${nextFupMsg}!`, 'success');
      } else {
        // Direct action on quotation
        await api.recordQuotationAction(quotation.id, {
          type: actionType,
          outcome,
          notes: notes.trim() || undefined,
          app_status: targetStatus,
          temperature: finalTemp,
        });

        // Always update quotation temperature and status
        await api.updateQuotationAppFields(quotation.id, {
          app_status: targetStatus,
          temperature: finalTemp,
        });

        // Schedule next follow-up if opted
        if (nextActionOption !== 'none') {
          let scheduleDate = customDate;
          let scheduleTime = customTime;
          if (nextActionOption === 'tomorrow') {
            scheduleDate = getQuickScheduleDate(1);
            scheduleTime = '10:30';
          } else if (nextActionOption === '3_days') {
            scheduleDate = getQuickScheduleDate(3);
            scheduleTime = '10:30';
          } else if (nextActionOption === '7_days') {
            scheduleDate = getQuickScheduleDate(7);
            scheduleTime = '10:30';
          }

          const newFup = await api.createFollowUp({
            quotation_id: quotation.id,
            scheduled_date: scheduleDate,
            scheduled_time: scheduleTime,
            type: actionType,
            notes: notes.trim() ? `Follow-up after ${actionType}: ${notes.trim()}` : `Follow-up after ${actionType}`,
          });

          if (isGoogleCalendarConnected()) {
            const syncRes = await syncFollowUpToGoogleCalendar(newFup, quotation).catch(() => null);
            if (syncRes?.success) {
              nextFupMsg = ` and next follow-up synced to Google Calendar (${scheduleDate})`;
            } else {
              nextFupMsg = ` and scheduled for ${scheduleDate}`;
            }
          } else {
            nextFupMsg = ` and next follow-up scheduled for ${scheduleDate}`;
          }
        }

        showToast(
          `Action recorded for ${quotation.client_name}${nextFupMsg}!`,
          'success'
        );
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Failed to record action', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white shadow-2xl text-slate-800 my-0 sm:my-6 max-h-[92vh] flex flex-col animate-in slide-in-from-bottom-5 duration-200">
        {/* Mobile handle indicator */}
        <div className="sm:hidden mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-slate-300 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5 shrink-0 bg-slate-50/60 rounded-t-3xl sm:rounded-t-2xl">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                {followup ? 'Record Outcome & Complete' : 'Record Action Taken'}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1 pl-10">
              <span className="font-semibold text-slate-800">{quotation.client_name}</span> ·{' '}
              {quotation.pool_type || 'Pool'} · {formatIndianCurrency(quotation.quotation_price)}
              {followup && (
                <span className="ml-1 text-teal-700 font-medium">
                  · Scheduled: {formatDDMMYYYY(followup.scheduled_date)}
                </span>
              )}
            </p>
            <div className="mt-1 pl-10">
              <span className="text-[10px] sm:text-[11px] text-teal-800 bg-teal-50 border border-teal-200/80 px-2 py-0.5 rounded-md font-medium inline-block">
                💡 Records this follow-up touchpoint (deal remains active until won/lost)
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Step 1: Communication Channel */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              1. Communication Channel
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ACTION_TYPES.map((ch) => {
                const isSelected = actionType === ch.type;
                return (
                  <button
                    key={ch.type}
                    type="button"
                    onClick={() => {
                      setActionType(ch.type);
                      if (ch.type === 'WhatsApp' && outcome === 'Spoke to client') {
                        setOutcome('Sent quotation/specs');
                      }
                    }}
                    className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs font-semibold text-left transition active:scale-95 ${
                      isSelected
                        ? 'border-teal-600 bg-teal-50/80 text-teal-900 shadow-xs ring-1 ring-teal-500'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {ch.icon}
                    <span className="truncate">{ch.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Outcome */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              2. Interaction Outcome
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {OUTCOME_OPTIONS.map((opt) => {
                const isSelected = outcome === opt.outcome;
                return (
                  <button
                    key={opt.outcome}
                    type="button"
                    onClick={() => {
                      setOutcome(opt.outcome);
                      if (opt.outcome === 'Not interested') {
                        setTemperature('cold');
                        setAppStatus('Lost');
                        setNextActionOption('none');
                      } else if (opt.outcome === 'Interested' || opt.outcome === 'Meeting fixed') {
                        setTemperature('hot');
                        if (appStatus === 'New' || appStatus === 'Lost') setAppStatus('In Discussion');
                        if (!hasUserChosenNextAction) {
                          setNextActionOption('7_days');
                        }
                      } else if (opt.suggestedTemp) {
                        if (temperature === 'cold') {
                          setTemperature(opt.suggestedTemp);
                        }
                        if (appStatus === 'New' || appStatus === 'Lost') setAppStatus('In Discussion');
                        if (!hasUserChosenNextAction) {
                          setNextActionOption('7_days');
                        }
                      } else {
                        if (!hasUserChosenNextAction) {
                          setNextActionOption('7_days');
                        }
                      }
                    }}
                    className={`rounded-xl border p-2 text-left transition active:scale-95 ${
                      isSelected
                        ? 'border-teal-600 bg-teal-50/90 shadow-xs ring-1 ring-teal-500'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                      <span>{opt.label}</span>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0 ml-1" />}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 3: Lead Temperature (Direct 1-tap update) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-3.5 space-y-2">
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
                    className={`min-h-[48px] py-1.5 px-2 rounded-xl text-center border transition active:scale-95 flex flex-col items-center justify-center ${
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

          {/* Step 4: Discussion Notes */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                4. Touchpoint Notes (Optional)
              </label>
              <span className="text-[11px] text-slate-500 font-medium">Tap chips for instant notes</span>
            </div>

            {/* Quick 1-tap note chips */}
            <div className="mb-2 flex flex-wrap gap-1.5">
              {[
                'Quotation sent on WhatsApp',
                'Discussing with family',
                'Requested discount / best price',
                'Site visit requested',
                'Client in meeting, call back later',
                'Civil work in progress',
                'Positive response, finalizing',
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    setNotes((prev) => {
                      const trimmed = prev.trim();
                      if (!trimmed) return chip;
                      if (trimmed.includes(chip)) return prev;
                      return `${trimmed}; ${chip}`;
                    });
                  }}
                  className="min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-medium border border-slate-200 bg-slate-50 text-slate-700 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-900 active:scale-95 transition"
                >
                  + {chip}
                </button>
              ))}
            </div>

            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Discussed jacuzzi specs with client, requested updated quote including glass tiles..."
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 placeholder-slate-400 focus:border-teal-600 focus:outline-none shadow-xs"
            />
          </div>

          {/* Step 5: Lead Stage Update */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                5. Quotation Stage
              </label>
              <span className="text-[11px] text-slate-500 font-mono">Current: {quotation.app_status}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STAGE_OPTIONS.map((st) => (
                <button
                  key={st.status}
                  type="button"
                  onClick={() => setAppStatus(st.status)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition active:scale-95 border ${
                    appStatus === st.status
                      ? `${st.color} shadow-xs ring-2 ring-teal-500/30`
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Step 6: Next Follow-Up */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-600" />
                6. Schedule Next Action
              </span>
              {isGoogleCalendarConnected() && (
                <span className="text-[10px] text-emerald-700 bg-emerald-100 font-medium px-2 py-0.5 rounded-full">
                  Google Cal Connected
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {[
                { id: 'tomorrow', label: 'Tomorrow' },
                { id: '3_days', label: 'In 3 Days' },
                { id: '7_days', label: 'In 1 Week' },
                { id: 'custom', label: 'Custom Date' },
                { id: 'none', label: 'No Follow-up' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setNextActionOption(opt.id as any);
                    setHasUserChosenNextAction(true);
                  }}
                  className={`min-h-[44px] py-1.5 px-2 rounded-xl text-xs font-bold border transition active:scale-95 flex items-center justify-center text-center ${
                    nextActionOption === opt.id
                      ? opt.id === 'none'
                        ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                        : 'bg-teal-600 text-white border-teal-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {nextActionOption === 'custom' && (
              <div className="grid grid-cols-2 gap-2 pt-1 animate-in fade-in">
                <div>
                  <label className="block text-[10px] text-slate-500 font-semibold mb-1">Date</label>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                  />
                  {customDate && (
                    <span className="text-[10px] text-teal-700 font-mono mt-0.5 block">
                      Target: {formatDDMMYYYY(customDate)}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 font-semibold mb-1">Time</label>
                  <input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Sticky Mobile-Friendly Footer */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 sm:p-4 flex items-center justify-end gap-2.5 shrink-0 z-20 shadow-lg rounded-b-3xl sm:rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-[46px] px-4 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-50 active:scale-95 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 sm:flex-initial min-h-[46px] flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-teal-700 transition active:scale-95 disabled:opacity-50 shadow-md"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSubmitting ? 'Recording Action...' : 'Save & Record Action'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
