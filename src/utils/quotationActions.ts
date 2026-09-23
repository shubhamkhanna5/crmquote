import { formatIndianCurrency } from '../../server/normalizer';
import { AppStatus, Temperature, FollowUpType } from '../types';

export interface QuickSchedulePreset {
  label: string;
  shortLabel: string;
  days: number;
  type: FollowUpType;
}

export const QUICK_SCHEDULE_PRESETS: QuickSchedulePreset[] = [
  { label: 'Tomorrow', shortLabel: '+1d', days: 1, type: 'Call' },
  { label: 'In 3 Days', shortLabel: '+3d', days: 3, type: 'Call' },
  { label: 'In 1 Week', shortLabel: '+7d', days: 7, type: 'Call' },
  { label: 'In 2 Weeks', shortLabel: '+14d', days: 14, type: 'Call' },
];

/**
 * Calculates a local date string YYYY-MM-DD for `daysAhead` from today
 */
export function getQuickScheduleDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a clean, professional WhatsApp follow-up URL with template text
 */
export function generateWhatsAppUrl(
  contactNumber: string,
  clientName: string,
  poolType?: string,
  price?: number
): string {
  const digits = contactNumber.replace(/\D/g, '');
  const phone = digits.length === 10 ? `91${digits}` : digits;

  const quoteInfo = price && price > 0 ? ` of ${formatIndianCurrency(price)}` : '';
  const specInfo = poolType ? ` for your ${poolType}` : ' for your swimming pool';

  const text = `Hi ${clientName}, this is Shubham regarding your quotation${quoteInfo}${specInfo}. Following up to see if you have any questions or if you'd like to discuss the next steps!`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export const STAGE_OPTIONS: { status: AppStatus; label: string; color: string }[] = [
  { status: 'New', label: 'New', color: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
  { status: 'Active', label: 'Active', color: 'bg-blue-50 text-blue-700 border-blue-300' },
  { status: 'In Discussion', label: 'In Discussion', color: 'bg-purple-50 text-purple-700 border-purple-300' },
  { status: 'Waiting for Client', label: 'Waiting for Client', color: 'bg-amber-50 text-amber-700 border-amber-300' },
  { status: 'On Hold', label: 'On Hold', color: 'bg-slate-100 text-slate-700 border-slate-300' },
  { status: 'Won', label: 'Won 🏆', color: 'bg-emerald-600 text-white border-emerald-600' },
  { status: 'Lost', label: 'Lost', color: 'bg-rose-100 text-rose-700 border-rose-300' },
];

export const TEMPERATURE_OPTIONS: { temp: Temperature; label: string; icon: string }[] = [
  { temp: 'hot', label: 'Hot', icon: '🔥' },
  { temp: 'warm', label: 'Warm', icon: '🟠' },
  { temp: 'cold', label: 'Cold', icon: '🔵' },
];
