import React, { useState } from 'react';
import { PlusCircle, X } from 'lucide-react';
import { Quotation, FollowUpType } from '../types';
import { formatIndianCurrency } from '../../server/normalizer';

interface NewFollowUpModalProps {
  quotations: Quotation[];
  initialQuotationId?: string | null;
  onClose: () => void;
  onSave: (data: {
    quotation_id: string;
    scheduled_date: string;
    scheduled_time: string;
    type: FollowUpType;
    notes?: string;
  }) => Promise<void>;
}

export const NewFollowUpModal: React.FC<NewFollowUpModalProps> = ({
  quotations,
  initialQuotationId,
  onClose,
  onSave,
}) => {
  const [quotationId, setQuotationId] = useState(
    initialQuotationId || (quotations.length > 0 ? quotations[0].id : '')
  );

  const tomorrowStr = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];
  const [date, setDate] = useState(tomorrowStr);
  const [time, setTime] = useState('10:30');
  const [type, setType] = useState<FollowUpType>('Call');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedQuote = quotations.find((q) => q.id === quotationId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quotationId || !date) return;
    setIsSubmitting(true);
    try {
      await onSave({
        quotation_id: quotationId,
        scheduled_date: date,
        scheduled_time: time,
        type,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to schedule follow-up');
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
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Schedule Follow-Up</h2>
              <p className="text-xs text-slate-500">Set next customer interaction</p>
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
          {/* Select Quotation */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Select Quotation *
            </label>
            <select
              value={quotationId}
              onChange={(e) => setQuotationId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 focus:border-cyan-600 focus:outline-none shadow-xs"
            >
              {quotations.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.client_name} — {formatIndianCurrency(q.quotation_price)} ({q.pool_type || 'Pool'})
                </option>
              ))}
            </select>
          </div>

          {selectedQuote && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs space-y-1">
              <p className="font-semibold text-slate-800">
                {selectedQuote.client_name} · 📞 {selectedQuote.contact_number}
              </p>
              <p className="text-[11px] text-slate-500">
                Specs: {selectedQuote.pool_type} ({selectedQuote.pool_dimensions}) · Status:{' '}
                <span className="font-medium text-slate-700">{selectedQuote.app_status}</span>
              </p>
            </div>
          )}

          {/* Action Type */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Action Type
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['Call', 'WhatsApp', 'Meeting', 'Site Visit'] as FollowUpType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setType(t)}
                  className={`rounded-xl border py-2 text-xs font-medium transition ${
                    type === t
                      ? 'border-cyan-600 bg-cyan-600 text-white font-bold shadow-xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-cyan-600 focus:outline-none shadow-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-cyan-600 focus:outline-none shadow-xs"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Instructions / Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Call to discuss site feasibility and filter options..."
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-cyan-600 focus:outline-none shadow-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 shadow-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-xl bg-cyan-600 px-5 py-2 text-xs font-bold text-white hover:bg-cyan-700 transition disabled:opacity-50 shadow-xs"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving...' : 'Set Follow-Up'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
