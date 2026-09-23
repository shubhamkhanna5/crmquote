import React, { useState } from 'react';
import { CheckCircle, X, Calendar, Clock, MessageSquare } from 'lucide-react';
import { FollowUp, FollowUpOutcome, FollowUpType } from '../types';

interface FollowUpDoneModalProps {
  followup: FollowUp | null;
  onClose: () => void;
  onSave: (data: {
    outcome: FollowUpOutcome;
    notes?: string;
    nextAction?: {
      type: 'tomorrow' | '3_days' | '7_days' | 'custom' | 'none';
      customDate?: string;
      customTime?: string;
      followupType?: FollowUpType;
    };
  }) => Promise<void>;
}

const OUTCOMES: FollowUpOutcome[] = [
  'Spoke to client',
  'Interested',
  'Asked for better price',
  'Asked for revision',
  'Waiting for decision',
  'Call back later',
  'No answer',
  'Decision maker not available',
  'Not interested',
  'Other',
];

export const FollowUpDoneModal: React.FC<FollowUpDoneModalProps> = ({
  followup,
  onClose,
  onSave,
}) => {
  const [selectedOutcome, setSelectedOutcome] = useState<FollowUpOutcome>('Spoke to client');
  const [notes, setNotes] = useState('');
  const [nextActionType, setNextActionType] = useState<
    'tomorrow' | '3_days' | '7_days' | 'custom' | 'none'
  >('3_days');

  // Tomorrow date default for custom
  const tomorrowStr = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];
  const [customDate, setCustomDate] = useState(tomorrowStr);
  const [customTime, setCustomTime] = useState('10:30');
  const [nextType, setNextType] = useState<FollowUpType>('Call');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!followup) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOutcome) return;
    setIsSubmitting(true);
    try {
      await onSave({
        outcome: selectedOutcome,
        notes: notes.trim() || undefined,
        nextAction: {
          type: nextActionType,
          customDate: nextActionType === 'custom' ? customDate : undefined,
          customTime: nextActionType === 'custom' ? customTime : undefined,
          followupType: nextType,
        },
      });
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to complete follow-up');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl text-slate-100 my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Complete Follow-Up</h2>
              <p className="text-xs text-slate-400">
                {followup.quotation?.client_name || 'Client'} · {followup.type}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-5">
          {/* 1. Outcome Section (PRD Section 40 & 41) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Follow-Up Outcome *
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
              {OUTCOMES.map((outcome) => {
                const isSelected = selectedOutcome === outcome;
                return (
                  <button
                    type="button"
                    key={outcome}
                    onClick={() => setSelectedOutcome(outcome)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-950/40 text-cyan-300 ring-1 ring-cyan-500'
                        : 'border-slate-800 bg-slate-950/50 text-slate-300 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    <span
                      className={`h-3 w-3 rounded-full border flex items-center justify-center ${
                        isSelected
                          ? 'border-cyan-400 bg-cyan-400'
                          : 'border-slate-600'
                      }`}
                    >
                      {isSelected && <span className="h-1 w-1 rounded-full bg-slate-950" />}
                    </span>
                    <span className="truncate">{outcome}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Notes Section */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Call / Discussion Notes
            </label>
            <div className="relative">
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Client requested revised pool layout with glass floor; discussing with family..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>

          {/* 3. Next Action Section (PRD Section 40) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Schedule Next Action
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {[
                { id: 'tomorrow', label: 'Tomorrow' },
                { id: '3_days', label: '3 days' },
                { id: '7_days', label: '7 days' },
                { id: 'custom', label: 'Custom' },
                { id: 'none', label: 'No follow-up' },
              ].map((act) => (
                <button
                  type="button"
                  key={act.id}
                  onClick={() => setNextActionType(act.id as any)}
                  className={`rounded-xl border py-2 px-2 text-center text-xs font-medium transition ${
                    nextActionType === act.id
                      ? 'border-cyan-500 bg-cyan-950/50 text-cyan-300 font-semibold'
                      : 'border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  {act.label}
                </button>
              ))}
            </div>

            {/* Custom Date / Time fields */}
            {nextActionType === 'custom' && (
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Time
                  </label>
                  <input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Next Action Type selector if follow-up is scheduled */}
            {nextActionType !== 'none' && (
              <div className="mt-2.5 flex items-center gap-2">
                <span className="text-xs text-slate-400">Action Type:</span>
                {(['Call', 'WhatsApp', 'Meeting', 'Site Visit'] as FollowUpType[]).map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setNextType(t)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                      nextType === t
                        ? 'bg-slate-700 text-cyan-300 font-semibold border border-cyan-500/40'
                        : 'bg-slate-950 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-800 px-4 py-2 text-xs sm:text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow-md hover:bg-emerald-500 transition active:scale-95 disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving...' : 'Save & Complete'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
