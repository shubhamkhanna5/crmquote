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
} from 'lucide-react';
import { Quotation, FollowUpOutcome, FollowUpType, AppStatus } from '../types';
import { api } from '../services/api';
import { isGoogleCalendarConnected, syncFollowUpToGoogleCalendar } from '../services/googleCalendar';
import { getQuickScheduleDate, STAGE_OPTIONS } from '../utils/quotationActions';
import { formatIndianCurrency } from '../../server/normalizer';
import { useToast } from './Toast';

interface RecordActionModalProps {
  quotation: Quotation | null;
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

const OUTCOME_OPTIONS: { outcome: FollowUpOutcome; label: string; desc: string }[] = [
  { outcome: 'Spoke to client', label: 'Spoke with Client', desc: 'Discussed project requirements & scope' },
  { outcome: 'Sent quotation/specs', label: 'Sent Specs / Quote', desc: 'Sent drawing, estimate, or catalog' },
  { outcome: 'Interested', label: 'Client Interested', desc: 'Positive feedback, keen to move forward' },
  { outcome: 'Waiting for decision', label: 'Waiting for Decision', desc: 'Reviewing with family/partner/builder' },
  { outcome: 'Asked for revision', label: 'Requested Revision', desc: 'Changes needed to specs or sizes' },
  { outcome: 'Asked for better price', label: 'Negotiation / Discount', desc: 'Client requested price concession' },
  { outcome: 'Call back later', label: 'Call Back Later', desc: 'Client busy, requested later callback' },
  { outcome: 'Meeting fixed', label: 'Meeting Fixed', desc: 'Agreed on in-person/site appointment' },
  { outcome: 'No answer', label: 'Ringing / No Answer', desc: 'Call went unanswered' },
  { outcome: 'Not interested', label: 'Not Interested (Lost)', desc: 'Client cancelled or chose another vendor' },
  { outcome: 'Other', label: 'Other Outcome', desc: 'Custom follow-up notes' },
];

export const RecordActionModal: React.FC<RecordActionModalProps> = ({
  quotation,
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
  const [nextActionOption, setNextActionOption] = useState<
    'none' | 'tomorrow' | '3_days' | '7_days' | 'custom'
  >('3_days');
  const [customDate, setCustomDate] = useState(getQuickScheduleDate(1));
  const [customTime, setCustomTime] = useState('10:30');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!quotation) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // 1. Record the completed action on this quotation
      const targetStatus = outcome === 'Not interested' ? 'Lost' : appStatus;
      await api.recordQuotationAction(quotation.id, {
        type: actionType,
        outcome,
        notes: notes.trim() || undefined,
        app_status: targetStatus,
      });

      // 2. Schedule next follow-up if opted
      let nextFupMsg = '';
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
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Failed to record action', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl text-slate-800 my-6 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5 shrink-0 bg-slate-50/60 rounded-t-2xl">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Record Action Taken
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1 pl-10">
              <span className="font-semibold text-slate-800">{quotation.client_name}</span> ·{' '}
              {quotation.pool_type || 'Pool'} · {formatIndianCurrency(quotation.quotation_price)}
            </p>
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
                        setAppStatus('Lost');
                        setNextActionOption('none');
                      } else if (opt.outcome === 'Spoke to client' || opt.outcome === 'Interested') {
                        if (appStatus === 'New') setAppStatus('In Discussion');
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

          {/* Step 3: Discussion Notes */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              3. Touchpoint Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Discussed jacuzzi specs with client, requested updated quote including glass tiles..."
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 placeholder-slate-400 focus:border-teal-600 focus:outline-none shadow-xs"
            />
          </div>

          {/* Step 4: Lead Stage Update */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                4. Quotation Stage
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

          {/* Step 5: Next Follow-Up */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-600" />
                5. Schedule Next Action
              </span>
              {isGoogleCalendarConnected() && (
                <span className="text-[10px] text-emerald-700 bg-emerald-100 font-medium px-2 py-0.5 rounded-full">
                  Google Cal Connected
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => setNextActionOption('tomorrow')}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition ${
                  nextActionOption === 'tomorrow'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-amber-50'
                }`}
              >
                Tomorrow
              </button>
              <button
                type="button"
                onClick={() => setNextActionOption('3_days')}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition ${
                  nextActionOption === '3_days'
                    ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-teal-50'
                }`}
              >
                In 3 Days
              </button>
              <button
                type="button"
                onClick={() => setNextActionOption('7_days')}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition ${
                  nextActionOption === '7_days'
                    ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                In 1 Week
              </button>
              <button
                type="button"
                onClick={() => setNextActionOption('none')}
                className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition ${
                  nextActionOption === 'none'
                    ? 'bg-slate-600 text-white border-slate-600 shadow-xs'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
                }`}
              >
                No Follow-up
              </button>
            </div>

            {nextActionOption === 'custom' && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="block text-[10px] text-slate-500 font-semibold mb-1">Date</label>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                  />
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

        {/* Footer Buttons */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 p-4 sm:p-5 shrink-0 bg-slate-50/60 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2 text-xs font-bold text-white hover:bg-teal-700 transition active:scale-95 disabled:opacity-50 shadow-xs"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSubmitting ? 'Recording Action...' : 'Save & Record Action'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
