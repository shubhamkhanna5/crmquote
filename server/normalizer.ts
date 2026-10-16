// Deterministic normalizers as specified in the PRD (NO AI)

export interface NormalizedPhone {
  raw: string;
  normalized: string; // e.g. +918446006488
  display: string;    // e.g. +91 8446006488
  digitsOnly: string; // e.g. 918446006488
}

export function normalizePhone(raw: string | number | undefined | null): NormalizedPhone {
  const rawStr = String(raw || '').trim();
  const digits = rawStr.replace(/\D/g, '');

  let normalized = '';
  let digitsOnly = '';

  if (digits.length === 10) {
    normalized = `+91${digits}`;
    digitsOnly = `91${digits}`;
  } else if (digits.length === 11 && digits.startsWith('0')) {
    normalized = `+91${digits.slice(1)}`;
    digitsOnly = `91${digits.slice(1)}`;
  } else if (digits.length === 12 && digits.startsWith('91')) {
    normalized = `+${digits}`;
    digitsOnly = digits;
  } else if (digits.length > 0) {
    normalized = rawStr.startsWith('+') ? `+${digits}` : `+91${digits.slice(-10)}`;
    digitsOnly = normalized.replace(/\D/g, '');
  } else {
    normalized = '';
    digitsOnly = '';
  }

  // Display formatting: +91 8446006488
  let display = normalized;
  if (normalized.startsWith('+91') && normalized.length === 13) {
    display = `+91 ${normalized.slice(3)}`;
  }

  return {
    raw: rawStr,
    normalized,
    display,
    digitsOnly,
  };
}

export function normalizePrice(raw: string | number | undefined | null): number {
  if (typeof raw === 'number') {
    return isNaN(raw) ? 0 : Math.round(raw);
  }
  const clean = String(raw || '')
    .replace(/[₹,$\s]/g, '')
    .trim();
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : Math.round(parsed);
}

// Indian Numbering System formatting (e.g. ₹8,21,700 or ₹75,56,250)
export function formatIndianCurrency(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) return '₹0';
  const isNegative = amount < 0;
  const abs = Math.abs(Math.round(amount));
  const s = abs.toString();
  if (s.length <= 3) {
    return `${isNegative ? '-' : ''}₹${s}`;
  }
  const lastThree = s.substring(s.length - 3);
  const otherNumbers = s.substring(0, s.length - 3);
  const formattedOther = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${isNegative ? '-' : ''}₹${formattedOther},${lastThree}`;
}

export function normalizeDate(raw: string | undefined | null): string {
  if (!raw) {
    return new Date().toISOString().split('T')[0];
  }
  const str = String(raw).trim();

  // Handle standard YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // Handle M/D/YYYY or MM/DD/YYYY
  const slashParts = str.split('/');
  if (slashParts.length === 3) {
    let [m, d, y] = slashParts;
    if (y.length === 2) y = `20${y}`;
    const mm = m.padStart(2, '0');
    const dd = d.padStart(2, '0');
    // Sanity check if first is month or day
    const mNum = parseInt(m, 10);
    const dNum = parseInt(d, 10);
    if (mNum > 12 && dNum <= 12) {
      // DD/MM/YYYY format
      return `${y}-${d.padStart(2, '0')}-${m.padStart(2, '0')}`;
    }
    return `${y}-${mm}-${dd}`;
  }

  // Handle Date.parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return new Date().toISOString().split('T')[0];
}

export function normalizeOptionalDate(raw: string | undefined | null): string | null {
  if (!raw || !String(raw).trim()) {
    return null;
  }
  return normalizeDate(raw);
}

export function formatDisplayDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const mIdx = parseInt(m, 10) - 1;
      if (mIdx >= 0 && mIdx < 12) {
        return `${parseInt(d, 10)} ${monthNames[mIdx]} ${y}`;
      }
    }
    return dateStr;
  } catch {
    return dateStr || '';
  }
}

export function normalizeText(raw: string | undefined | null): string {
  return String(raw || '').trim();
}

export function isTrialRecord(
  name?: string | null,
  phone?: string | null,
  rawPhone?: string | null
): boolean {
  if (name) {
    const lower = name.toLowerCase();
    if (
      lower.includes('valued client') ||
      lower.includes('trial') ||
      lower.includes('test client') ||
      lower.trim() === 'test'
    ) {
      return true;
    }
  }
  const clean = (val?: string | null) => (val ? String(val).replace(/\D/g, '') : '');
  if (clean(phone).includes('9650081896') || clean(rawPhone).includes('9650081896')) {
    return true;
  }
  return false;
}

export function calculateQuotationAgeDays(quotationDateStr: string): number {
  try {
    const qDate = new Date(quotationDateStr);
    const today = new Date();
    // Midnight comparison in local/Kolkata
    qDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - qDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 ? diffDays : 0;
  } catch {
    return 0;
  }
}

/**
 * Normalizes a client name for deduplication:
 * strips parentheticals (e.g. "(30x20ft)"), company/property suffixes after comma,
 * common descriptors like "guest house", and extra whitespace.
 */
export function normalizeClientBaseName(name?: string | null): string {
  if (!name) return '';
  let clean = String(name).toLowerCase().trim();
  // Strip parentheticals like "(30x20ft)", "(pool)", etc.
  clean = clean.replace(/\(.*?\)/g, '').trim();
  // Strip company/property suffixes after comma, e.g. ", Deep Real Estate", ", Aquadrop", ", Rajmahal Hotel"
  if (clean.includes(',')) {
    clean = clean.split(',')[0].trim();
  }
  // Strip common business/hospitality suffixes
  clean = clean.replace(/-\s*pet boarding/gi, '').trim();
  clean = clean.replace(/\bguest house\b/gi, '').trim();
  clean = clean.replace(/\bhotel\b/gi, '').trim();
  clean = clean.replace(/[^a-z0-9\s]/gi, '').replace(/\s+/g, ' ').trim();
  return clean;
}

/**
 * Checks whether two phone strings match or share a non-trivial prefix (minimum 3 digits),
 * handling truncated/incomplete phone rows in the sheet (e.g., 959 vs 9592958600).
 */
export function phonesMatchOrPrefix(p1?: string | null, p2?: string | null): boolean {
  const d1 = String(p1 || '').replace(/\D/g, '');
  const d2 = String(p2 || '').replace(/\D/g, '');
  if (!d1 || !d2) return false;
  if (d1 === d2) return true;

  // Normalize leading 91 or 0
  const stripLeading = (d: string) => {
    if (d.length > 10 && d.startsWith('91')) return d.slice(2);
    if (d.length > 10 && d.startsWith('0')) return d.slice(1);
    // Also if 10-digit number starts with 91 followed by 8 digits (accidental country code truncation in 10-digit cell)
    if (d.length === 10 && d.startsWith('91')) return d.slice(2);
    return d;
  };

  const norm1 = stripLeading(d1);
  const norm2 = stripLeading(d2);

  if (norm1 === norm2) return true;
  if (norm1.length >= 3 && norm2.startsWith(norm1)) return true;
  if (norm2.length >= 3 && norm1.startsWith(norm2)) return true;
  return false;
}
