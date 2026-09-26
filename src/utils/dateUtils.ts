/**
 * Date formatting utility for the CRM.
 * Standardizes user-facing dates into DD-MM-YYYY format.
 */

/**
 * Formats a date string (e.g. YYYY-MM-DD or ISO 8601 string) or Date object into DD-MM-YYYY.
 * Examples:
 *   "2026-09-24" -> "24-09-2026"
 *   "2026-09-24T10:30:00.000Z" -> "24-09-2026"
 */
export function formatDDMMYYYY(dateInput?: string | Date | null): string {
  if (!dateInput) return '';

  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    // Direct match for YYYY-MM-DD (with optional trailing time or text)
    const ymdMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (ymdMatch) {
      const year = ymdMatch[1];
      const month = ymdMatch[2].padStart(2, '0');
      const day = ymdMatch[3].padStart(2, '0');
      return `${day}-${month}-${year}`;
    }

    // If already in DD-MM-YYYY or DD/MM/YYYY, normalize to DD-MM-YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      return `${day}-${month}-${year}`;
    }
  }

  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) {
      return typeof dateInput === 'string' ? dateInput : '';
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch {
    return typeof dateInput === 'string' ? dateInput : '';
  }
}

/**
 * Formats date and time: "24-09-2026 at 10:30"
 */
export function formatDateTimeDDMMYYYY(dateInput?: string | Date | null, timeStr?: string | null): string {
  const dmy = formatDDMMYYYY(dateInput);
  if (!dmy) return '';
  if (timeStr && timeStr.trim()) {
    return `${dmy} · ${timeStr.trim()}`;
  }
  return dmy;
}
