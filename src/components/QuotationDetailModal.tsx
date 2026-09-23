import React, { useEffect, useState } from 'react';
import {
  Activity as ActivityIcon,
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Save,
  X,
  Zap,
} from 'lucide-react';
import {
  Quotation,
  Client,
  FollowUp,
  Activity,
  Temperature,
  Priority,
  AppStatus,
} from '../types';
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
  generateWhatsAppUrl,
  getQuickScheduleDate,
  STAGE_OPTIONS,
  TEMPERATURE_OPTIONS,
} from '../utils/quotationActions';
import { getQuotationLocation, POPULAR_LOCATIONS } from '../utils/locationUtils';

interface QuotationDetailModalProps {
  quotationId: string | null;
  onClose: () => void;
  onOpenDoneModal: (followup: FollowUp) => void;
  onOpenRescheduleModal: (followup: FollowUp) => void;
  onOpenNewFollowUpForQuotation: (quotationId: string) => void;
  onQuotationUpdated: () => void;
}

export const QuotationDetailModal: React.FC<QuotationDetailModalProps> = ({
  quotationId,
  onClose,
  onOpenDoneModal,
  onOpenRescheduleModal,
  onOpenNewFollowUpForQuotation,
  onQuotationUpdated,
}) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    quotation: Quotation;
    client: Client | null;
    followups: FollowUp[];
    activities: Activity[];
  } | null>(null);

  // App editable fields
  const [temperature, setTemperature] = useState<Temperature>('warm');
  const [priority, setPriority] = useState<Priority>('normal');
  const [appStatus, setAppStatus] = useState<AppStatus>('Active');
  const [internalNotes, setInternalNotes] = useState('');
  const [location, setLocation] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [recordActionModalOpen, setRecordActionModalOpen] = useState(false);

  const loadDetails = React.useCallback(() => {
    if (!quotationId) return;
    setLoading(true);
    api
      .getQuotationById(quotationId)
      .then((res) => {
        setData(res);
        setTemperature(res.quotation.temperature);
        setPriority(res.quotation.priority);
        setAppStatus(res.quotation.app_status);
        setInternalNotes(res.quotation.internal_notes || '');
        const initialLoc =
          res.quotation.location ||
          (res.client && res.client.location) ||
          getQuotationLocation(res.quotation, res.client ? [res.client] : []);
        setLocation(initialLoc || '');
        setHasChanges(false);
      })
      .catch((err) => {
        alert(err.message || 'Failed to load quotation');
        onClose();
      })
      .finally(() => setLoading(false));
  }, [quotationId, onClose]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  if (!quotationId) return null;

  const handleSaveAppFields = async () => {
    setIsSaving(true);
    try {
      await api.updateQuotationAppFields(quotationId, {
        temperature,
        priority,
        app_status: appStatus,
        internal_notes: internalNotes.trim(),
        location: location.trim() || null,
      });
      setHasChanges(false);
      onQuotationUpdated();
      // reload details
      const updated = await api.getQuotationById(quotationId);
      setData(updated);
      showToast('Quotation updated successfully', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to save changes', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickSetStatus = async (newStatus: AppStatus) => {
    if (!quotationId) return;
    try {
      await api.updateQuotationAppFields(quotationId, { app_status: newStatus });
      setAppStatus(newStatus);
      showToast(`Status updated to "${newStatus}"`, 'success');
      onQuotationUpdated();
      const updated = await api.getQuotationById(quotationId);
      setData(updated);
    } catch (err: any) {
      showToast(err.message || 'Failed to update status', 'error');
    }
  };

  const handleQuickSetTemperature = async (newTemp: Temperature) => {
    if (!quotationId) return;
    try {
      await api.updateQuotationAppFields(quotationId, { temperature: newTemp });
      setTemperature(newTemp);
      showToast(`Temperature set to ${newTemp.toUpperCase()}`, 'success');
      onQuotationUpdated();
      const updated = await api.getQuotationById(quotationId);
      setData(updated);
    } catch (err: any) {
      showToast(err.message || 'Failed to update temperature', 'error');
    }
  };

  const [isQuickScheduling, setIsQuickScheduling] = useState(false);
  const handleQuickSchedule = async (daysAhead: number) => {
    if (!data?.quotation) return;
    const q = data.quotation;
    setIsQuickScheduling(true);
    try {
      const scheduledDate = getQuickScheduleDate(daysAhead);
      const newFup = await api.createFollowUp({
        quotation_id: q.id,
        scheduled_date: scheduledDate,
        scheduled_time: '10:30',
        type: 'Call',
        notes: 'Quick scheduled follow-up',
      });
      if (isGoogleCalendarConnected()) {
        const syncRes = await syncFollowUpToGoogleCalendar(newFup, q);
        if (syncRes.success) {
          showToast(
            `Follow-up scheduled for ${scheduledDate} & synced to Google Calendar!`,
            'success',
            5000,
            syncRes.link ? { link: { label: 'View in Calendar ↗', url: syncRes.link } } : undefined
          );
        } else {
          showToast(`Follow-up scheduled for ${scheduledDate}`, 'success');
        }
      } else {
        showToast(`Follow-up scheduled for ${scheduledDate}`, 'success');
      }
      onQuotationUpdated();
      const updated = await api.getQuotationById(q.id);
      setData(updated);
    } catch (err: any) {
      showToast(err.message || 'Failed to schedule follow-up', 'error');
    } finally {
      setIsQuickScheduling(false);
    }
  };

  // Generate .ics Calendar Event or sync directly to Google Calendar (PRD Section 60)
  const handleExportICS = async () => {
    if (!data?.quotation) return;
    const q = data.quotation;
    const activeFup = data.followups.find((f) =>
      ['Scheduled', 'Due', 'Overdue'].includes(f.status)
    );

    if (isGoogleCalendarConnected() && activeFup) {
      const res = await syncFollowUpToGoogleCalendar(activeFup, q);
      if (res.success) {
        showToast(
          'Follow-up synced to your Google Calendar!',
          'success',
          5000,
          res.link ? { link: { label: 'View in Calendar ↗', url: res.link } } : undefined
        );
        loadDetails();
        onQuotationUpdated();
        return;
      }
    }

    const eventDate = activeFup?.scheduled_date || q.quotation_date;
    const [year, month, day] = eventDate.split('-').map(Number);
    const [hour, minute] = (activeFup?.scheduled_time || '10:30').split(':').map(Number);

    const dtStart = new Date(Date.UTC(year, month - 1, day, hour, minute));
    const dtEnd = new Date(Date.UTC(year, month - 1, day, hour + 1, minute));

    const formatDateForICS = (d: Date) =>
      d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Quotation Follow-Up Manager//EN',
      'BEGIN:VEVENT',
      `UID:${q.id}-${Date.now()}@quotationcrm.app`,
      `DTSTAMP:${formatDateForICS(new Date())}`,
      `DTSTART:${formatDateForICS(dtStart)}`,
      `DTEND:${formatDateForICS(dtEnd)}`,
      `SUMMARY:Quotation Follow-Up: ${q.client_name}`,
      `DESCRIPTION:Client: ${q.client_name}\\nQuotation: ${formatIndianCurrency(
        q.quotation_price
      )}\\nPool: ${q.pool_type} (${q.pool_dimensions})\\nContact: ${
        q.contact_number
      }\\nNotes: ${q.internal_notes || 'None'}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `Followup_${q.client_name.replace(/\s+/g, '_')}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const q = data?.quotation;
  const activeFollowup = data?.followups.find((f) =>
    ['Scheduled', 'Due', 'Overdue'].includes(f.status)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl text-slate-800 my-6 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                {loading ? 'Loading...' : q?.client_name}
              </h2>
              {q?.source_present ? (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                  Sheet Synced
                </span>
              ) : (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                  Sheet Archived
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 flex-wrap">
              <span>Source ID: #{q?.source_id} · Quoted on {q?.quotation_date} ({q?.age_days} days ago)</span>
              {(location || q?.location) && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded-md border border-cyan-200">
                  <MapPin className="w-3 h-3 text-cyan-600" />
                  {location || q?.location}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        {loading || !q ? (
          <div className="p-12 text-center text-slate-400">Loading quotation details...</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {/* Quick Stage & Temperature Action Bar */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-3.5 space-y-2.5 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Lead Stage:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {STAGE_OPTIONS.map((st) => {
                      const isSelected = q.app_status === st.status;
                      return (
                        <button
                          key={st.status}
                          type="button"
                          onClick={() => handleQuickSetStatus(st.status)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition active:scale-95 border ${
                            isSelected
                              ? `${st.color} shadow-xs ring-2 ring-teal-500/20`
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                        >
                          {st.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-start sm:self-auto">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Temp:
                  </span>
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
                    {TEMPERATURE_OPTIONS.map((t) => (
                      <button
                        key={t.temp}
                        type="button"
                        onClick={() => handleQuickSetTemperature(t.temp)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold transition active:scale-95 ${
                          q.temperature === t.temp
                            ? 'bg-slate-900 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                      >
                        <span>{t.icon}</span>
                        <span className="capitalize">{t.temp}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Action Contact Bar (PRD Section 55) */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <a
                href={`tel:${q.contact_number.replace(/\s+/g, '')}`}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition active:scale-95 shadow-xs"
              >
                <Phone className="w-4 h-4 text-emerald-600" />
                <span>Call Client</span>
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
                className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-2.5 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition active:scale-95 shadow-xs"
                title="Send pre-filled WhatsApp quotation template"
              >
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <span>WhatsApp Quote</span>
              </a>

              <button
                type="button"
                onClick={() => setRecordActionModalOpen(true)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 py-2.5 px-2 text-xs font-semibold text-teal-800 hover:bg-teal-100 transition active:scale-95 shadow-xs"
                title="Record touchpoint or direct action taken"
              >
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
                <span>Record Action</span>
              </button>

              <button
                onClick={handleExportICS}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition active:scale-95 shadow-xs"
                title="Download .ics calendar event"
              >
                <Calendar className="w-4 h-4 text-cyan-600" />
                <span>Add to Cal</span>
              </button>

              <button
                onClick={() => onOpenNewFollowUpForQuotation(q.id)}
                className="flex items-center justify-center gap-2 rounded-xl bg-cyan-600 py-2.5 px-3 text-xs font-semibold text-white hover:bg-cyan-700 transition active:scale-95 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>+ Custom</span>
              </button>
            </div>

            {/* Active Next Follow-Up Banner */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-cyan-600" />
                  Active Next Follow-Up
                </span>
                {activeFollowup && (
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                      activeFollowup.status === 'Overdue'
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : activeFollowup.status === 'Due'
                        ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {activeFollowup.status}
                  </span>
                )}
              </div>

              {activeFollowup ? (
                <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {activeFollowup.scheduled_date} at {activeFollowup.scheduled_time} (
                      {activeFollowup.type})
                    </p>
                    {activeFollowup.notes && (
                      <p className="text-xs text-slate-500 mt-1">
                        Note: {activeFollowup.notes}
                      </p>
                    )}
                    {activeFollowup.calendar_event?.html_link && (
                      <a
                        href={activeFollowup.calendar_event.html_link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 mt-1.5"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>In Google Calendar ↗</span>
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onOpenDoneModal(activeFollowup)}
                      className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs"
                    >
                      ✓ Mark Done
                    </button>
                    <button
                      onClick={() => onOpenRescheduleModal(activeFollowup)}
                      className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-xs"
                    >
                      Reschedule
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-amber-700 flex items-center gap-1.5 font-medium">
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                      No active follow-up scheduled for this quotation
                    </span>
                    <button
                      onClick={() => onOpenNewFollowUpForQuotation(q.id)}
                      className="text-xs font-semibold text-teal-700 hover:underline"
                    >
                      + Custom Date/Time
                    </button>
                  </div>

                  {/* 1-Click Schedule Presets */}
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      1-Click Schedule (10:30 AM):
                    </span>
                    <button
                      disabled={isQuickScheduling}
                      onClick={() => handleQuickSchedule(1)}
                      className="rounded-lg bg-white border border-amber-300 hover:bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900 shadow-2xs transition active:scale-95 disabled:opacity-50"
                    >
                      Tomorrow
                    </button>
                    <button
                      disabled={isQuickScheduling}
                      onClick={() => handleQuickSchedule(3)}
                      className="rounded-lg bg-white border border-teal-300 hover:bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-900 shadow-2xs transition active:scale-95 disabled:opacity-50"
                    >
                      In 3 Days
                    </button>
                    <button
                      disabled={isQuickScheduling}
                      onClick={() => handleQuickSchedule(7)}
                      className="rounded-lg bg-white border border-slate-300 hover:bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-800 shadow-2xs transition active:scale-95 disabled:opacity-50"
                    >
                      In 1 Week
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecordActionModalOpen(true)}
                      className="rounded-lg bg-teal-50 border border-teal-300 hover:bg-teal-100 text-teal-900 font-bold px-2.5 py-1 text-xs shadow-2xs transition active:scale-95 flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                      <span>Record Action Taken</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Read-Only Google Sheet Fields (PRD Section 54) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Google Sheet Specifications
                </span>
                <span className="text-[11px] text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  Sync Read-Only
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 text-xs">
                <div>
                  <span className="text-slate-500">Quotation Price</span>
                  <p className="text-base font-extrabold text-cyan-700 mt-0.5">
                    {formatIndianCurrency(q.quotation_price)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Pool Type</span>
                  <p className="font-semibold text-slate-900 mt-0.5">{q.pool_type || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-500">Pool Dimensions & Size</span>
                  <div className="mt-0.5">
                    {q.pool_dimensions ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-slate-900">
                          📏 {parsePoolDimensions(q.pool_dimensions)?.formatted || q.pool_dimensions}
                        </span>
                        {parsePoolDimensions(q.pool_dimensions)?.surfaceAreaSqFt ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-800 bg-cyan-50 px-1.5 py-0.5 rounded w-fit border border-cyan-200">
                            {parsePoolDimensions(q.pool_dimensions)?.surfaceAreaSqFt} sq.ft ({parsePoolDimensions(q.pool_dimensions)?.surfaceAreaSqM} m²)
                            {parsePoolDimensions(q.pool_dimensions)?.category ? ` · ${parsePoolDimensions(q.pool_dimensions)?.category}` : ''}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="font-semibold text-slate-900">—</span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Sender / Salesperson</span>
                  <p className="font-medium text-slate-700 mt-0.5">
                    {q.sender_name || '—'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Phone (Raw)</span>
                  <p className="font-mono text-slate-700 mt-0.5">
                    {q.contact_number_raw || q.contact_number}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Sheet Status</span>
                  <p className="font-mono text-slate-700 mt-0.5">{q.source_status}</p>
                </div>
              </div>
            </div>

            {/* Editable App Fields (PRD Section 54) */}
            <div className="space-y-4 rounded-2xl border border-cyan-200 bg-cyan-50/30 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-800">
                  CRM Management (App-Owned)
                </span>
                {hasChanges && (
                  <span className="text-[11px] text-amber-700 font-semibold animate-pulse">
                    ● Unsaved Changes
                  </span>
                )}
              </div>

              {/* Status, Priority & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Application Status
                  </label>
                  <select
                    value={appStatus}
                    onChange={(e) => {
                      setAppStatus(e.target.value as AppStatus);
                      setHasChanges(true);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-cyan-600 shadow-xs"
                  >
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

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Lead Temperature
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {(['hot', 'warm', 'cold'] as Temperature[]).map((t) => (
                      <button
                        type="button"
                        key={t}
                        onClick={() => {
                          setTemperature(t);
                          setHasChanges(true);
                        }}
                        className={`rounded-lg py-1.5 text-xs font-medium capitalize border transition ${
                          temperature === t
                            ? 'bg-cyan-600 text-white font-bold border-cyan-600 shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {t === 'hot' ? '🔥 Hot' : t === 'warm' ? '🟠 Warm' : '🔵 Cold'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Priority
                  </label>
                  <div className="grid grid-cols-2 gap-1">
                    {(['normal', 'high'] as Priority[]).map((p) => (
                      <button
                        type="button"
                        key={p}
                        onClick={() => {
                          setPriority(p);
                          setHasChanges(true);
                        }}
                        className={`rounded-lg py-1.5 text-xs font-medium capitalize border transition ${
                          priority === p
                            ? 'bg-rose-600 text-white font-bold border-rose-600 shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-cyan-600" />
                      Location
                    </span>
                  </label>
                  <input
                    type="text"
                    list="detail-popular-locations"
                    value={location}
                    onChange={(e) => {
                      setLocation(e.target.value);
                      setHasChanges(true);
                    }}
                    placeholder="e.g. Mumbai, Delhi NCR"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-cyan-600 shadow-xs"
                  />
                  <datalist id="detail-popular-locations">
                    {POPULAR_LOCATIONS.map((loc) => (
                      <option key={loc} value={loc} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Internal Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Internal Notes & Discussion Log
                </label>
                <textarea
                  rows={3}
                  value={internalNotes}
                  onChange={(e) => {
                    setInternalNotes(e.target.value);
                    setHasChanges(true);
                  }}
                  placeholder="Add private team notes, client preferences, budget objections, etc..."
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 placeholder-slate-400 focus:border-cyan-600 focus:outline-none shadow-xs"
                />
              </div>

              {/* Save Button */}
              {hasChanges && (
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveAppFields}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-700 transition active:scale-95 disabled:opacity-50 shadow-xs"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'Saving...' : 'Save App Fields'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Chronological Activity Timeline (PRD Section 57 & 58) */}
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <ActivityIcon className="w-3.5 h-3.5 text-cyan-600" />
                Activity Timeline ({data.activities.length})
              </span>

              {data.activities.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No activity recorded yet.</p>
              ) : (
                <div className="space-y-2.5 border-l-2 border-slate-200 ml-2 pl-3">
                  {data.activities.map((act) => (
                    <div key={act.id} className="relative text-xs">
                      <span className="absolute -left-[19px] top-1 h-2 w-2 rounded-full bg-cyan-600" />
                      <p className="text-slate-800 font-medium">{act.description}</p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {new Date(act.created_at).toLocaleString([], {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 p-4 sm:p-5 shrink-0 bg-slate-50/50">
          <div className="text-xs text-slate-500">
            Last seen in Sheet:{' '}
            {q?.source_last_seen_at
              ? new Date(q.source_last_seen_at).toLocaleDateString()
              : '—'}
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-xs"
          >
            Close
          </button>
        </div>
      </div>

      {/* Record Direct Action Modal */}
      {recordActionModalOpen && q && (
        <RecordActionModal
          quotation={q}
          onClose={() => setRecordActionModalOpen(false)}
          onSuccess={async () => {
            onQuotationUpdated();
            const updated = await api.getQuotationById(q.id);
            setData(updated);
          }}
        />
      )}
    </div>
  );
};
