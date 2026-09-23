import React, { useState, useMemo } from 'react';
import {
  X,
  Plus,
  Calendar,
  Phone,
  User,
  IndianRupee,
  Layers,
  Flame,
  CheckCircle2,
  Sparkles,
  Calculator,
  Compass,
} from 'lucide-react';
import {
  Client,
  Temperature,
  Priority,
  AppStatus,
  FollowUpType,
  ActiveUser,
  Quotation,
  FollowUp,
} from '../types';
import { formatIndianCurrency } from '../../server/normalizer';
import { parsePoolDimensions } from '../utils/poolUtils';
import {
  isGoogleCalendarConnected,
  syncFollowUpToGoogleCalendar,
} from '../services/googleCalendar';
import { useToast } from './Toast';
import { api } from '../services/api';

interface NewQuotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (quotation: Quotation, followup?: FollowUp | null) => void;
  clients?: Client[];
  activeUser?: ActiveUser;
  knownSenders?: string[];
  initialClientId?: string;
}

const POOL_TYPES = [
  'Skimmer Pool',
  'Overflow / Infinity Pool',
  'Jacuzzi / Hot Tub',
  'Glass Wall Pool',
  'Modular Steel Pool',
  'Commercial / Resort Pool',
  'Plunge Pool',
  'Lap Pool',
  'Custom Pool',
];

const PRESET_SIZES = [
  { label: '15 × 8 ft', desc: 'Plunge / Compact (120 sq.ft)', l: 15, w: 8, d: 4, unit: 'ft' },
  { label: '20 × 10 ft', desc: 'Villa Compact (200 sq.ft)', l: 20, w: 10, d: 4.5, unit: 'ft' },
  { label: '25 × 12 ft', desc: 'Villa Medium (300 sq.ft)', l: 25, w: 12, d: 4.5, unit: 'ft' },
  { label: '30 × 15 ft', desc: 'Luxury Standard (450 sq.ft)', l: 30, w: 15, d: 4.5, unit: 'ft' },
  { label: '40 × 20 ft', desc: 'Estate Large (800 sq.ft)', l: 40, w: 20, d: 5, unit: 'ft' },
  { label: '6 × 3 m', desc: 'European Size (18 m² / 194 sq.ft)', l: 6, w: 3, d: 1.35, unit: 'm' },
  { label: '10 × 5 m', desc: 'Resort Size (50 m² / 538 sq.ft)', l: 10, w: 5, d: 1.5, unit: 'm' },
];

export const NewQuotationModal: React.FC<NewQuotationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  clients = [],
  activeUser,
  knownSenders = [],
  initialClientId,
}) => {
  const { showToast } = useToast();
  const todayStr = new Date().toISOString().split('T')[0];

  // Form states
  const [clientName, setClientName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [quotationPrice, setQuotationPrice] = useState<string>('');
  const [quotationDate, setQuotationDate] = useState(todayStr);
  const [senderName, setSenderName] = useState(
    activeUser && activeUser !== 'All' ? activeUser : 'Direct Sales'
  );
  const [poolType, setPoolType] = useState('Skimmer Pool');
  const [customPoolType, setCustomPoolType] = useState('');

  // Pool Dimensions & Size controls
  const [sizeMode, setSizeMode] = useState<'calculator' | 'custom'>('calculator');
  const [unit, setUnit] = useState<'ft' | 'm'>('ft');
  const [length, setLength] = useState<string>('30');
  const [width, setWidth] = useState<string>('15');
  const [depth, setDepth] = useState<string>('4.5');
  const [customDimensions, setCustomDimensions] = useState('');

  // Lead status & prioritization
  const [temperature, setTemperature] = useState<Temperature>('warm');
  const [priority, setPriority] = useState<Priority>('normal');
  const [appStatus, setAppStatus] = useState<AppStatus>('New');
  const [internalNotes, setInternalNotes] = useState('');

  // Initial follow-up
  const [scheduleFollowUp, setScheduleFollowUp] = useState(true);
  const [followUpDate, setFollowUpDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  const [followUpTime, setFollowUpTime] = useState('10:30');
  const [followUpType, setFollowUpType] = useState<FollowUpType>('Call');
  const [followUpNotes, setFollowUpNotes] = useState('Initial follow-up to discuss quote and pool specifications');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  // Initialize from initialClientId if passed
  React.useEffect(() => {
    if (initialClientId) {
      const c = clients.find((item) => item.id === initialClientId);
      if (c) {
        setClientName(c.name);
        setContactNumber(c.phone || c.contact_number_raw || '');
      }
    }
  }, [initialClientId, clients]);

  // Derived pool dimension string & stats
  const poolDimensionString = useMemo(() => {
    if (sizeMode === 'custom') {
      return customDimensions.trim();
    }
    const l = parseFloat(length);
    const w = parseFloat(width);
    const d = parseFloat(depth);
    if (!isNaN(l) && !isNaN(w) && l > 0 && w > 0) {
      if (!isNaN(d) && d > 0) {
        return `${l} × ${w} × ${d} ${unit}`;
      }
      return `${l} × ${w} ${unit}`;
    }
    return '';
  }, [sizeMode, customDimensions, length, width, depth, unit]);

  const poolStats = useMemo(() => {
    return parsePoolDimensions(poolDimensionString);
  }, [poolDimensionString]);

  // Client suggestions
  const clientSuggestions = useMemo(() => {
    if (!clientSearch.trim()) return [];
    const q = clientSearch.toLowerCase();
    return clients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q))
      )
      .slice(0, 5);
  }, [clients, clientSearch]);

  const handleSelectClient = (c: Client) => {
    setClientName(c.name);
    setContactNumber(c.phone || c.contact_number_raw || '');
    setClientSearch('');
    setShowClientDropdown(false);
  };

  const handleApplyPreset = (preset: typeof PRESET_SIZES[0]) => {
    setSizeMode('calculator');
    setUnit(preset.unit as 'ft' | 'm');
    setLength(preset.l.toString());
    setWidth(preset.w.toString());
    setDepth(preset.d.toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      showToast('Please enter a client name', 'error');
      return;
    }
    if (!contactNumber.trim()) {
      showToast('Please enter a contact number', 'error');
      return;
    }

    const priceNum = parseFloat(quotationPrice.replace(/[^0-9.]/g, '')) || 0;
    const finalPoolType = poolType === 'Custom Pool' ? (customPoolType.trim() || 'Custom Pool') : poolType;

    setIsSubmitting(true);
    try {
      const payload = {
        client_name: clientName.trim(),
        contact_number: contactNumber.trim(),
        quotation_price: priceNum,
        quotation_date: quotationDate,
        sender_name: senderName.trim(),
        pool_type: finalPoolType,
        pool_dimensions: poolDimensionString,
        temperature,
        priority,
        app_status: appStatus,
        internal_notes: internalNotes.trim() || undefined,
        initial_followup: scheduleFollowUp
          ? {
              scheduled_date: followUpDate,
              scheduled_time: followUpTime,
              type: followUpType,
              notes: followUpNotes.trim(),
            }
          : undefined,
      };

      const result = await api.createQuotation(payload);

      // If follow-up was created and Google Calendar is connected, auto-sync to Calendar
      if (result.followup && isGoogleCalendarConnected()) {
        try {
          const syncRes = await syncFollowUpToGoogleCalendar(result.followup, result.quotation);
          if (syncRes.success) {
            showToast(
              `Quotation created & follow-up added to Google Calendar!`,
              'success',
              6000,
              syncRes.link ? { link: { label: 'View in Calendar ↗', url: syncRes.link } } : undefined
            );
            onSuccess(result.quotation, result.followup);
            onClose();
            return;
          }
        } catch (calErr) {
          console.error('Auto sync to Google Calendar error:', calErr);
        }
      }

      showToast(`Quotation created for ${result.quotation.client_name}!`, 'success');
      onSuccess(result.quotation, result.followup);
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Failed to create quotation', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const rawNum = parseFloat(quotationPrice.replace(/[^0-9.]/g, '')) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-700/80 bg-slate-900 text-slate-100 shadow-2xl my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5 bg-slate-950/60 rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-600/20 text-cyan-400 border border-cyan-500/30">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>New Quotation</span>
                <span className="text-[10px] uppercase font-semibold tracking-wider text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800">
                  Direct CRM
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Add quote directly with pool size dimensions & optional calendar follow-up
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-5 flex-1">
          {/* Section: Client & Contact */}
          <div className="rounded-xl border border-slate-800/90 bg-slate-950/50 p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-cyan-400" />
                Client Information
              </span>
              {clients.length > 0 && (
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search existing clients..."
                    value={clientSearch}
                    onChange={(e) => {
                      setClientSearch(e.target.value);
                      setShowClientDropdown(true);
                    }}
                    onFocus={() => setShowClientDropdown(true)}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 w-44 focus:border-cyan-500 focus:outline-hidden"
                  />
                  {showClientDropdown && clientSuggestions.length > 0 && (
                    <div className="absolute right-0 mt-1 w-64 rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-xl z-20">
                      {clientSuggestions.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectClient(c)}
                          className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-slate-800 text-xs text-slate-200 flex flex-col"
                        >
                          <span className="font-semibold text-white">{c.name}</span>
                          <span className="text-[11px] text-slate-400">{c.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Client Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vikram Singhania"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Contact Phone <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    placeholder="+91 98765 43210"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-hidden font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section: Price, Date & Salesperson */}
          <div className="rounded-xl border border-slate-800/90 bg-slate-950/50 p-4 space-y-3.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <IndianRupee className="w-3.5 h-3.5 text-cyan-400" />
              Quotation Value & Attribution
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Quotation Price (₹) <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-sm font-semibold text-cyan-400">₹</span>
                  <input
                    type="text"
                    required
                    placeholder="12,50,000"
                    value={quotationPrice}
                    onChange={(e) => setQuotationPrice(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 pl-7 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-hidden font-bold"
                  />
                </div>
                {rawNum > 0 && (
                  <p className="text-[11px] text-cyan-400 font-semibold mt-1">
                    {formatIndianCurrency(rawNum)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Quotation Date
                </label>
                <input
                  type="date"
                  value={quotationDate}
                  onChange={(e) => setQuotationDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-hidden font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Salesperson / Sender
                </label>
                <input
                  type="text"
                  placeholder="e.g. Shubham / Varun"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section: Pool Type & Pool Sizes (Requested Feature) */}
          <div className="rounded-xl border border-cyan-800/60 bg-cyan-950/20 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-cyan-400" />
                Pool Specifications & Pool Sizes
              </span>

              {/* Dimension Mode Toggle */}
              <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setSizeMode('calculator')}
                  className={`rounded-md px-2.5 py-1 font-medium transition ${
                    sizeMode === 'calculator'
                      ? 'bg-cyan-600 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Calculator className="w-3 h-3 inline mr-1" />
                  Dimensions Builder
                </button>
                <button
                  type="button"
                  onClick={() => setSizeMode('custom')}
                  className={`rounded-md px-2.5 py-1 font-medium transition ${
                    sizeMode === 'custom'
                      ? 'bg-cyan-600 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Custom Text
                </button>
              </div>
            </div>

            {/* Pool Type Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Pool Type
                </label>
                <select
                  value={poolType}
                  onChange={(e) => setPoolType(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-hidden"
                >
                  {POOL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {poolType === 'Custom Pool' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Custom Pool Type Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Natural Bio Pool"
                    value={customPoolType}
                    onChange={(e) => setCustomPoolType(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-hidden"
                  />
                </div>
              )}
            </div>

            {/* Quick Preset Buttons */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                Quick Preset Pool Sizes:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_SIZES.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className="rounded-lg border border-slate-700/80 bg-slate-900/90 px-2.5 py-1 text-[11px] text-slate-300 hover:border-cyan-500 hover:text-cyan-300 transition"
                    title={preset.desc}
                  >
                    <span className="font-semibold">{preset.label}</span>
                    <span className="text-[10px] text-slate-500 ml-1.5 hidden sm:inline">
                      ({preset.unit === 'm' ? 'metric' : `${preset.l * preset.w} sq.ft`})
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Pool Dimension Inputs */}
            {sizeMode === 'calculator' ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">
                    Dimensions & Measurements
                  </span>
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-slate-400 text-[11px] mr-1">Unit:</span>
                    <button
                      type="button"
                      onClick={() => setUnit('ft')}
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        unit === 'ft'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Feet (ft)
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnit('m')}
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        unit === 'm'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Meters (m)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-0.5">Length ({unit})</label>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      value={length}
                      onChange={(e) => setLength(e.target.value)}
                      placeholder="30"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-0.5">Width ({unit})</label>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      placeholder="15"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-0.5">Depth ({unit})</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
                      value={depth}
                      onChange={(e) => setDepth(e.target.value)}
                      placeholder="4.5"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Pool Size Live Computed Badges */}
                {poolStats && poolStats.surfaceAreaSqFt ? (
                  <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-800/80 text-xs">
                    <span className="font-semibold text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800">
                      📐 {poolStats.formatted}
                    </span>
                    <span className="font-semibold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                      🌊 {poolStats.surfaceAreaSqFt} sq.ft ({poolStats.surfaceAreaSqM} m²)
                    </span>
                    {poolStats.estimatedVolumeLitres && (
                      <span className="text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                        💧 ~{poolStats.estimatedVolumeLitres.toLocaleString()} L
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                      {poolStats.category} Pool
                    </span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Custom Pool Dimensions & Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. 32' x 16' x 4.5' with 6' round jacuzzi"
                  value={customDimensions}
                  onChange={(e) => setCustomDimensions(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-hidden"
                />
              </div>
            )}
          </div>

          {/* Section: Temperature, Priority & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-slate-800/90 bg-slate-950/50 p-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Lead Temperature
              </label>
              <div className="grid grid-cols-3 gap-1">
                {(['hot', 'warm', 'cold'] as Temperature[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTemperature(t)}
                    className={`rounded-lg border py-1.5 text-xs font-medium capitalize transition ${
                      temperature === t
                        ? t === 'hot'
                          ? 'border-rose-500 bg-rose-950 text-rose-300 font-bold'
                          : t === 'warm'
                          ? 'border-amber-500 bg-amber-950 text-amber-300 font-bold'
                          : 'border-sky-500 bg-sky-950 text-sky-300 font-bold'
                        : 'border-slate-800 bg-slate-900 text-slate-400'
                    }`}
                  >
                    {t === 'hot' ? '🔥 Hot' : t === 'warm' ? '🟠 Warm' : '🔵 Cold'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Priority</label>
              <div className="grid grid-cols-2 gap-1">
                {(['normal', 'high'] as Priority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`rounded-lg border py-1.5 text-xs font-medium capitalize transition ${
                      priority === p
                        ? p === 'high'
                          ? 'border-rose-500 bg-rose-950 text-rose-300 font-bold'
                          : 'border-cyan-500 bg-cyan-950 text-cyan-300 font-bold'
                        : 'border-slate-800 bg-slate-900 text-slate-400'
                    }`}
                  >
                    {p === 'high' ? 'High (P1)' : 'Normal'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Initial Status
              </label>
              <select
                value={appStatus}
                onChange={(e) => setAppStatus(e.target.value as AppStatus)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-hidden"
              >
                <option value="New">New</option>
                <option value="Active">Active</option>
                <option value="In Discussion">In Discussion</option>
                <option value="Waiting for Client">Waiting for Client</option>
                <option value="On Hold">On Hold</option>
              </select>
            </div>
          </div>

          {/* Section: Schedule Initial Follow-Up (Auto-syncs to Google Calendar) */}
          <div className="rounded-xl border border-slate-800/90 bg-slate-950/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={scheduleFollowUp}
                  onChange={(e) => setScheduleFollowUp(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-600 focus:ring-cyan-500"
                />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                  Schedule Initial Follow-up
                </span>
              </label>

              {isGoogleCalendarConnected() && scheduleFollowUp && (
                <span className="text-[10px] font-semibold text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800">
                  📅 Auto-syncs to Google Calendar
                </span>
              )}
            </div>

            {scheduleFollowUp && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Follow-up Date
                  </label>
                  <input
                    type="date"
                    required={scheduleFollowUp}
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-hidden font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Time</label>
                  <input
                    type="time"
                    value={followUpTime}
                    onChange={(e) => setFollowUpTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-hidden font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Action Type</label>
                  <select
                    value={followUpType}
                    onChange={(e) => setFollowUpType(e.target.value as FollowUpType)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-hidden"
                  >
                    <option value="Call">Call</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Meeting">Meeting</option>
                    <option value="Site Visit">Site Visit</option>
                    <option value="Email">Email</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Follow-up Notes / Agenda
                  </label>
                  <input
                    type="text"
                    value={followUpNotes}
                    onChange={(e) => setFollowUpNotes(e.target.value)}
                    placeholder="e.g. Call to discuss quotation breakdown and site survey"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-hidden"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section: Internal Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Internal Quotation Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="e.g. Client requested Italian mosaic tiles and filtration pump specifications..."
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-hidden"
            />
          </div>

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 transition"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-2 text-xs font-bold text-white hover:bg-cyan-500 transition shadow-sm active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Creating Quotation...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Create Quotation</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
