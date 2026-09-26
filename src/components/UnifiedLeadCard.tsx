import React from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  MapPin,
  MessageCircle,
  Phone,
  Sparkles,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import { FollowUp, Quotation, Temperature, AppStatus } from '../types';
import { formatIndianCurrency } from '../../server/normalizer';
import { parsePoolDimensions } from '../utils/poolUtils';
import { getQuotationLocation } from '../utils/locationUtils';
import { generateWhatsAppUrl } from '../utils/quotationActions';
import { getDisplayNote } from '../utils/notesUtils';
import { formatDDMMYYYY } from '../utils/dateUtils';

export interface UnifiedLeadCardProps {
  quotation: Quotation;
  followup?: FollowUp | null;
  isSelected?: boolean;
  showCheckbox?: boolean;
  onToggleSelect?: (id: string, e: React.MouseEvent) => void;
  onOpenQuotation: (quotationId: string) => void;
  onOpenDoneModal: (followup: FollowUp) => void;
  onOpenRecordAction: (quotation: Quotation, initialType: 'Call' | 'WhatsApp') => void;
  onOpenRescheduleModal?: (followup: FollowUp) => void;
  onQuickUpdateTemp?: (quotation: Quotation, nextTemp: Temperature) => void;
}

/**
 * Returns formatted pool dimension guaranteeing both length and width are displayed clearly
 */
export function formatPoolDimensions(raw?: string | null): string {
  if (!raw || !raw.trim()) return '';
  const parsed = parsePoolDimensions(raw);
  if (parsed && parsed.length && parsed.width) {
    const formatNum = (num: number) => (Number.isInteger(num) ? num.toString() : num.toFixed(1));
    const depthPart = parsed.depth ? ` × ${formatNum(parsed.depth)}` : '';
    return `${formatNum(parsed.length)} × ${formatNum(parsed.width)}${depthPart} ${parsed.unit || 'ft'}`;
  }
  return raw;
}

export const UnifiedLeadCard: React.FC<UnifiedLeadCardProps> = ({
  quotation,
  followup,
  isSelected = false,
  showCheckbox = true,
  onToggleSelect,
  onOpenQuotation,
  onOpenDoneModal,
  onOpenRecordAction,
  onOpenRescheduleModal,
  onQuickUpdateTemp,
}) => {
  const isOverdue = followup?.status === 'Overdue';
  const isDueToday = followup?.status === 'Due';
  const isUpcoming = followup?.status === 'Scheduled' && !isOverdue && !isDueToday;
  const isNoNextAction = !followup && !quotation.next_followup;

  const rawPhone = quotation.contact_number || '';
  const cleanPhone = rawPhone.replace(/\D/g, '');
  const waPhone = cleanPhone.startsWith('91')
    ? cleanPhone
    : cleanPhone.length === 10
    ? `91${cleanPhone}`
    : cleanPhone;

  const location = getQuotationLocation(quotation);

  // Temperature icon & badge
  const renderTempBadge = () => {
    const temp = quotation.temperature || 'warm';
    const isHot = temp === 'hot';
    const isCold = temp === 'cold';

    const cycleTemp = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!onQuickUpdateTemp) return;
      const next: Temperature = isHot ? 'warm' : isCold ? 'hot' : 'cold';
      onQuickUpdateTemp(quotation, next);
    };

    return (
      <button
        type="button"
        onClick={cycleTemp}
        title="Tap to toggle temperature (Hot / Warm / Cold)"
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border transition active:scale-95 touch-manipulation ${
          isHot
            ? 'bg-rose-50 border-rose-200 text-rose-700'
            : isCold
            ? 'bg-blue-50 border-blue-200 text-blue-700'
            : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}
      >
        <span>{isHot ? '🔥 Hot' : isCold ? '❄️ Cold' : '☀️ Warm'}</span>
      </button>
    );
  };

  // Due state badge
  const renderDueState = () => {
    if (isOverdue) {
      return (
        <span className="inline-flex items-center gap-1 font-bold text-[10px] sm:text-[11px] px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
          <AlertCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-rose-600 shrink-0" />
          <span>Overdue · {formatDDMMYYYY(followup?.scheduled_date)}</span>
        </span>
      );
    }
    if (isDueToday) {
      return (
        <span className="inline-flex items-center gap-1 font-bold text-[10px] sm:text-[11px] px-1.5 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200">
          <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-teal-600 shrink-0" />
          <span>Due Today · {followup?.scheduled_time || '10:30'}</span>
        </span>
      );
    }
    if (isUpcoming) {
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-[10px] sm:text-[11px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
          <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-slate-500 shrink-0" />
          <span>{formatDDMMYYYY(followup?.scheduled_date)} · {followup?.type}</span>
        </span>
      );
    }
    if (isNoNextAction) {
      return (
        <span className="inline-flex items-center gap-1 font-bold text-[10px] sm:text-[11px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
          <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-600 shrink-0" />
          <span>No Action {quotation.quotation_date ? `· ${formatDDMMYYYY(quotation.quotation_date)}` : ''}</span>
        </span>
      );
    }
    return null;
  };

  // Immediate Outcome Trigger Handlers
  const handleCallClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (rawPhone) {
      window.location.href = `tel:${rawPhone.replace(/\s+/g, '')}`;
    }
    // Immediately open outcome sheet so follow-up is logged
    setTimeout(() => {
      if (followup) {
        onOpenDoneModal(followup);
      } else {
        onOpenRecordAction(quotation, 'Call');
      }
    }, 450);
  };

  const handleWhatsAppClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (waPhone) {
      const waUrl = generateWhatsAppUrl(
        quotation.contact_number,
        quotation.client_name,
        quotation.pool_type,
        quotation.quotation_price
      );
      window.open(waUrl, '_blank');
    }
    // Immediately open outcome sheet so follow-up is logged
    setTimeout(() => {
      if (followup) {
        onOpenDoneModal(followup);
      } else {
        onOpenRecordAction(quotation, 'WhatsApp');
      }
    }, 450);
  };

  const handleDoneClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (followup) {
      onOpenDoneModal(followup);
    } else {
      onOpenRecordAction(quotation, 'Call');
    }
  };

  const handleCardClick = () => {
    onOpenQuotation(quotation.id);
  };

  // Card tone border styling
  const borderAccentClass = isOverdue
    ? 'border-l-[3.5px] border-l-[#FF3B30] border-slate-200/90'
    : isDueToday
    ? 'border-l-[3.5px] border-l-[#007AFF] border-slate-200/90'
    : isNoNextAction
    ? 'border-l-[3.5px] border-l-[#FF9500] border-slate-200/90'
    : 'border-l-[3.5px] border-l-slate-300 border-slate-200/90';

  return (
    <div
      onClick={handleCardClick}
      className={`group relative rounded-2xl border bg-white p-3 shadow-2xs hover:shadow-xs transition duration-150 cursor-pointer flex flex-col justify-between gap-2.5 ${borderAccentClass} ${
        isSelected ? 'ring-2 ring-[#007AFF] bg-blue-50/20' : ''
      }`}
    >
      {/* TIER 1: Primary Info (Top) */}
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          {/* Checkbox + Client Name */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {showCheckbox && onToggleSelect && (
              <input
                type="checkbox"
                checked={isSelected}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(followup?.id || quotation.id, e);
                }}
                onChange={() => {}}
                className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 shrink-0"
              />
            )}
            <span className="text-xs sm:text-sm font-bold text-slate-900 truncate tracking-tight group-hover:text-teal-700 transition">
              {quotation.client_name || 'Client'}
            </span>
          </div>

          {/* Quote Value */}
          <span className="text-xs sm:text-sm font-extrabold text-teal-800 font-mono tracking-tight shrink-0">
            {formatIndianCurrency(quotation.quotation_price || 0)}
          </span>
        </div>

        {/* Due State & Temperature Row */}
        <div className="flex items-center justify-between gap-1 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {renderDueState()}
            {quotation.app_status && (
              <span className="text-[10px] sm:text-[11px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                {quotation.app_status}
              </span>
            )}
            {location && (
              <span className="inline-flex items-center gap-0.5 text-slate-500 text-[10px] sm:text-[11px]">
                <MapPin className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                <span>{location}</span>
              </span>
            )}
          </div>
          <div>{renderTempBadge()}</div>
        </div>
      </div>

      {/* Touchpoint / Follow-up Notes (only when there are actual user notes) */}
      {(() => {
        const actualNote = getDisplayNote(followup, quotation);
        if (!actualNote) return null;
        return (
          <div className="border-t border-slate-100 pt-1">
            <p className="text-[10px] sm:text-[11px] text-slate-600 italic line-clamp-1 bg-slate-50/90 px-1.5 py-0.5 rounded border border-slate-200/80">
              "{actualNote}"
            </p>
          </div>
        );
      })()}

      {/* TIER 3: Actions Grouped at Bottom */}
      <div
        className="pt-1.5 border-t border-slate-100 space-y-1"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Primary 3-column action row: Call, WhatsApp, Done */}
        <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
          {/* 1. Call Button */}
          {rawPhone ? (
            <button
              type="button"
              onClick={handleCallClick}
              className="min-h-[34px] sm:min-h-[38px] flex items-center justify-center gap-1 rounded-xl bg-[#34C759]/12 border border-[#34C759]/30 py-1 px-1.5 text-[11px] sm:text-xs font-bold text-[#248A3D] ios-tap-active touch-manipulation transition shadow-2xs hover:bg-[#34C759]/20"
              title={`Call ${quotation.client_name} & log outcome`}
            >
              <Phone className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#248A3D] shrink-0" />
              <span>Call</span>
            </button>
          ) : (
            <div className="min-h-[34px] sm:min-h-[38px] flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200 text-[10px] text-slate-400 font-medium">
              No Phone
            </div>
          )}

          {/* 2. WhatsApp Button */}
          {waPhone ? (
            <button
              type="button"
              onClick={handleWhatsAppClick}
              className="min-h-[34px] sm:min-h-[38px] flex items-center justify-center gap-1 rounded-xl bg-[#25D366] py-1 px-1.5 text-[11px] sm:text-xs font-bold text-white ios-tap-active touch-manipulation transition shadow-2xs hover:bg-[#20BD5A]"
              title="Open WhatsApp & log outcome"
            >
              <MessageCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
              <span>WhatsApp</span>
            </button>
          ) : (
            <div className="min-h-[34px] sm:min-h-[38px] flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200 text-[10px] text-slate-400 font-medium">
              No WA
            </div>
          )}

          {/* 3. Done Button (Records follow-up, doesn't win deal) */}
          <button
            type="button"
            onClick={handleDoneClick}
            className="min-h-[34px] sm:min-h-[38px] flex items-center justify-center gap-1 rounded-xl bg-[#007AFF] hover:bg-[#0066D6] py-1 px-1.5 text-[11px] sm:text-xs font-bold text-white ios-tap-active touch-manipulation transition shadow-2xs"
            title="Mark follow-up recorded (Note: Done records the touchpoint, does not win deal)"
          >
            <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[2.5]" />
            <span>Done</span>
          </button>
        </div>

        {/* Secondary Row: Reschedule (if follow-up exists) + Details */}
        <div className="flex items-center justify-between gap-1.5 pt-0.5 text-xs">
          {followup && onOpenRescheduleModal ? (
            <button
              type="button"
              onClick={() => onOpenRescheduleModal(followup)}
              className="flex-1 min-h-[26px] sm:min-h-[28px] flex items-center justify-center gap-1 rounded-lg border border-slate-200/90 bg-slate-50 hover:bg-slate-100 py-0.5 px-2 text-[10px] sm:text-[11px] font-semibold text-slate-700 ios-tap-active touch-manipulation transition"
              title="Reschedule this follow-up"
            >
              <Calendar className="w-2.5 h-2.5 text-slate-500" />
              <span>Reschedule</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenRecordAction(quotation, 'Call')}
              className="flex-1 min-h-[26px] sm:min-h-[28px] flex items-center justify-center gap-1 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 py-0.5 px-2 text-[10px] sm:text-[11px] font-semibold text-amber-800 ios-tap-active touch-manipulation transition"
              title="Set next action for this quotation"
            >
              <Calendar className="w-2.5 h-2.5 text-amber-600" />
              <span>+ Set Next Action</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCardClick}
            className="min-h-[26px] sm:min-h-[28px] px-2.5 flex items-center justify-center gap-1 rounded-lg border border-slate-200/90 bg-slate-50 hover:bg-slate-100 text-[10px] sm:text-[11px] font-medium text-slate-600 ios-tap-active touch-manipulation transition"
            title="Open Quotation Details"
          >
            <span>Details</span>
            <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
          </button>
        </div>
      </div>
    </div>
  );
};
