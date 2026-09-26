import React, { useState, useMemo } from 'react';
import {
  ChevronDown,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  RotateCw,
  Search,
  User,
  X,
} from 'lucide-react';
import { Client, Quotation, isTrialRecord } from '../types';
import { formatIndianCurrency } from '../../server/normalizer';
import { parsePoolDimensions } from '../utils/poolUtils';
import { getClientLocation } from '../utils/locationUtils';
import { formatDDMMYYYY } from '../utils/dateUtils';

interface ClientsViewProps {
  clients: Client[];
  quotations: Quotation[];
  onOpenQuotation: (id: string) => void;
  onOpenNewQuotation?: (clientId?: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const ClientsView: React.FC<ClientsViewProps> = ({
  clients,
  quotations,
  onOpenQuotation,
  onOpenNewQuotation,
  onRefresh,
  isRefreshing,
}) => {
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('All');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const validClients = useMemo(() => {
    return clients.filter((c) => !isTrialRecord(c.name, c.phone, c.contact_number_raw));
  }, [clients]);

  const locationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    validClients.forEach((c) => {
      const loc = getClientLocation(c, quotations);
      counts[loc] = (counts[loc] || 0) + 1;
    });
    return counts;
  }, [validClients, quotations]);

  const availableLocations = useMemo(() => {
    return Object.keys(locationCounts).sort((a, b) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return (locationCounts[b] || 0) - (locationCounts[a] || 0);
    });
  }, [locationCounts]);

  const filteredClients = validClients
    .filter((c) => {
      if (locationFilter !== 'All') {
        const loc = getClientLocation(c, quotations);
        if (loc !== locationFilter) return false;
      }
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      const loc = getClientLocation(c, quotations).toLowerCase();
      return (
        c.name.toLowerCase().includes(s) ||
        c.phone.toLowerCase().includes(s) ||
        (c.contact_number_raw && c.contact_number_raw.includes(s)) ||
        loc.includes(s)
      );
    })
    .sort((a, b) => {
      const quotesA = quotations.filter(
        (q) => q.client_id === a.id || q.client_name.toLowerCase() === a.name.toLowerCase()
      );
      const quotesB = quotations.filter(
        (q) => q.client_id === b.id || q.client_name.toLowerCase() === b.name.toLowerCase()
      );
      const latestA = quotesA.reduce((max, q) => (q.quotation_date > max ? q.quotation_date : max), '');
      const latestB = quotesB.reduce((max, q) => (q.quotation_date > max ? q.quotation_date : max), '');
      if (latestA !== latestB) return latestB.localeCompare(latestA);
      return a.name.localeCompare(b.name);
    });

  const selectedClient = clients.find((c) => c.id === selectedClientId) || null;
  const clientQuotations = selectedClient
    ? quotations
        .filter((q) => q.client_id === selectedClient.id || q.client_name.toLowerCase() === selectedClient.name.toLowerCase())
        .sort((a, b) => b.quotation_date.localeCompare(a.quotation_date))
    : [];

  return (
    <div className="space-y-5 pb-mobile-nav md:pb-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Clients
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            {filteredClients.length} clients registered across active quotations
          </p>
        </div>

        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="self-start sm:self-auto flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition disabled:opacity-50"
        >
          <RotateCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Search and Location Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 max-w-2xl">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients by name, phone, or location..."
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:border-cyan-600 focus:outline-none shadow-xs"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Location Dropdown */}
        <div className="relative shrink-0">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-cyan-600" />
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className={`w-full sm:w-auto appearance-none rounded-xl border py-2 pl-8 pr-8 text-xs font-medium focus:outline-none cursor-pointer transition ${
              locationFilter !== 'All'
                ? 'border-cyan-500 bg-cyan-50 text-cyan-800 font-semibold shadow-xs'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <option value="All">All Locations ({validClients.length})</option>
            {availableLocations.map((loc) => (
              <option key={loc} value={loc}>
                {loc} ({locationCounts[loc] || 0})
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        </div>
      </div>

      {/* Grid of Client Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredClients.map((client) => {
          const clientLoc = getClientLocation(client, quotations);
          const quotes = quotations.filter(
            (q) => q.client_id === client.id || q.client_name.toLowerCase() === client.name.toLowerCase()
          );
          const totalVal = quotes.reduce((acc, cur) => acc + (cur.quotation_price || 0), 0);
          const activeQuotes = quotes.filter((q) =>
            ['New', 'Active', 'In Discussion', 'Waiting for Client', 'On Hold'].includes(q.app_status)
          );

          return (
            <div
              key={client.id}
              onClick={() => setSelectedClientId(client.id)}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs hover:border-slate-300 transition cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 border border-cyan-100 font-bold">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 hover:text-cyan-600 transition truncate max-w-[180px]">
                        {client.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-slate-600 font-medium">📞 {client.phone}</p>
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-cyan-700 font-medium">
                          <MapPin className="w-3 h-3 text-cyan-600 shrink-0" />
                          {clientLoc}
                        </span>
                      </div>
                    </div>
                  </div>

                  <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    {quotes.length} {quotes.length === 1 ? 'Quote' : 'Quotes'}
                  </span>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between text-xs">
                  <span className="text-slate-500 font-medium">Total Quoted Value:</span>
                  <span className="font-extrabold text-cyan-700">
                    {formatIndianCurrency(totalVal)}
                  </span>
                </div>

                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Active pipeline:</span>
                  <span className="font-semibold text-emerald-700">
                    {activeQuotes.length} active
                  </span>
                </div>
              </div>

              {/* Quick Contacts */}
              <div
                className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <a
                  href={`tel:${client.phone.replace(/\s+/g, '')}`}
                  className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 touch-manipulation shadow-2xs transition"
                >
                  <Phone className="w-4 h-4 text-emerald-600" />
                  <span>Call</span>
                </a>
                <a
                  href={`https://wa.me/${client.phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 active:scale-95 touch-manipulation shadow-2xs transition"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-600" />
                  <span>WhatsApp</span>
                </a>
                {onOpenNewQuotation && (
                  <button
                    type="button"
                    onClick={() => onOpenNewQuotation(client.id)}
                    className="min-h-[44px] px-3 flex items-center justify-center gap-1 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold active:scale-95 touch-manipulation transition"
                    title="Create new quote for this client"
                  >
                    <Plus className="w-4 h-4 text-teal-600" />
                    <span className="hidden xs:inline">Quote</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Client Quotation Details Modal */}
      {selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl text-slate-800 max-h-[85vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">{selectedClient.name}</h3>
                <p className="text-xs text-slate-600 font-medium">📞 {selectedClient.phone}</p>
              </div>
              <button
                onClick={() => setSelectedClientId(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Linked Quotations ({clientQuotations.length})
              </h4>

              <div className="space-y-2">
                {clientQuotations.map((q) => (
                  <div
                    key={q.id}
                    onClick={() => {
                      setSelectedClientId(null);
                      onOpenQuotation(q.id);
                    }}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 hover:border-slate-300 transition cursor-pointer flex items-center justify-between"
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                        <span>{q.pool_type || 'Pool'}</span>
                        {q.pool_dimensions && (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-900 border border-slate-300">
                            📏 {parsePoolDimensions(q.pool_dimensions)?.formatted || q.pool_dimensions}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Date: {formatDDMMYYYY(q.quotation_date)} · Status: {q.app_status}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-cyan-700">
                        {formatIndianCurrency(q.quotation_price)}
                      </p>
                      <span className="text-[10px] text-slate-500 font-medium">View Quote →</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              {onOpenNewQuotation && (
                <button
                  type="button"
                  onClick={() => {
                    const cid = selectedClientId;
                    setSelectedClientId(null);
                    onOpenNewQuotation(cid || undefined);
                  }}
                  className="rounded-xl bg-cyan-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-cyan-500 transition flex items-center gap-1.5 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Quote for Client</span>
                </button>
              )}
              <button
                onClick={() => setSelectedClientId(null)}
                className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 shadow-xs ml-auto"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
