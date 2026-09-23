import React, { useState } from 'react';
import { RotateCw, X } from 'lucide-react';
import { FollowUp } from '../types';

interface RescheduleModalProps {
  followup: FollowUp | null;
  onClose: () => void;
  onReschedule: (id: string, newDate: string, newTime: string) => Promise<void>;
}

export const RescheduleModal: React.FC<RescheduleModalProps> = ({
  followup,
  onClose,
  onReschedule,
}) => {
  const [option, setOption] = useState<'tomorrow' | '3_days' | 'next_week' | 'custom'>('tomorrow');

  const getDateForOption = (opt: 'tomorrow' | '3_days' | 'next_week') => {
    const d = new Date();
    if (opt === 'tomorrow') d.setDate(d.getDate() + 1);
    else if (opt === '3_days') d.setDate(d.getDate() + 3);
    else if (opt === 'next_week') d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  };

  const [customDate, setCustomDate] = useState(getDateForOption('tomorrow'));
  const [time, setTime] = useState(followup?.scheduled_time || '10:30');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!followup) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      let finalDate = customDate;
      if (option !== 'custom') {
        finalDate = getDateForOption(option);
      }
      await onReschedule(followup.id, finalDate, time);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to reschedule');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl text-slate-800">
        <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 border border-cyan-100">
              <RotateCw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Reschedule Follow-Up</h2>
              <p className="text-xs text-slate-500">
                {followup.quotation?.client_name || 'Client'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-600">
            <p className="flex items-center justify-between">
              <span>Current Schedule:</span>
              <span className="font-semibold text-slate-800">
                {followup.scheduled_date} at {followup.scheduled_time}
              </span>
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
              Select New Schedule
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'tomorrow', label: 'Tomorrow' },
                { id: '3_days', label: 'In 3 Days' },
                { id: 'next_week', label: 'Next Week' },
                { id: 'custom', label: 'Custom Date' },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setOption(opt.id as any)}
                  className={`rounded-xl border p-3 text-left text-xs font-medium transition ${
                    option === opt.id
                      ? 'border-cyan-600 bg-cyan-50/70 text-cyan-800 ring-1 ring-cyan-600 shadow-xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <p className="font-semibold">{opt.label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {opt.id !== 'custom'
                      ? getDateForOption(opt.id as any)
                      : 'Pick custom day'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {option === 'custom' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Custom Date
              </label>
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-cyan-600 focus:outline-none shadow-xs"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Time (Asia/Kolkata)
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-cyan-600 focus:outline-none shadow-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-50 transition shadow-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-cyan-700 transition active:scale-95 disabled:opacity-50"
            >
              <RotateCw className="w-4 h-4" />
              <span>{isSubmitting ? 'Rescheduling...' : 'Confirm Reschedule'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
