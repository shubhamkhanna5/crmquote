/**
 * Utility to identify whether a note string contains actual user-entered notes
 * vs automated placeholder/boilerplate text from import scripts or default values.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PLACEHOLDER_NOTES = new Set([
  'initial follow-up for imported quotation',
  'initial follow-up to discuss quote and pool specifications',
  'initial follow-up',
  'batch scheduled follow-up',
  'follow-up date from google sheet',
  'day 3 follow-up',
  'quick scheduled call',
  'quick scheduled whatsapp',
  'quick scheduled email',
  'quick scheduled visit',
  'quick scheduled follow-up',
  'routine follow-up call',
  'routine follow-up',
  'scheduled follow-up',
  'follow-up',
  'followup',
  'none',
  'n/a',
  'null',
  'undefined',
  '-',
  '--',
  'no notes',
  'action taken',
]);

export function isActualNote(note?: string | null): boolean {
  if (!note) return false;
  const trimmed = note.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();

  // Filter exact known placeholders
  if (PLACEHOLDER_NOTES.has(lower)) return false;

  // Filter UUIDs (e.g. workspace id or quotation id accidentally saved in note)
  if (UUID_REGEX.test(trimmed)) return false;

  // Filter dynamic prefixes like "quick scheduled ..." or "batch scheduled ..."
  if (lower.startsWith('quick scheduled') || lower.startsWith('batch scheduled')) {
    return false;
  }

  // Filter "Initial follow-up for ..." variations
  if (lower.startsWith('initial follow-up for') || lower.startsWith('initial follow up for')) {
    return false;
  }

  return true;
}

export function getActualNote(note?: string | null): string | null {
  if (!isActualNote(note)) return null;
  return note!.trim();
}

/**
 * Returns the highest priority actual note between a follow-up note and quotation internal notes.
 */
export function getDisplayNote(
  followup?: { notes?: string | null } | null,
  quotation?: { internal_notes?: string | null } | null
): string | null {
  const fupNote = getActualNote(followup?.notes);
  if (fupNote) return fupNote;

  const quoteNote = getActualNote(quotation?.internal_notes);
  if (quoteNote) return quoteNote;

  return null;
}
