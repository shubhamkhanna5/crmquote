export interface ParsedPoolSize {
  raw: string;
  formatted: string;
  length?: number;
  width?: number;
  depth?: number;
  unit: 'ft' | 'm' | 'unknown';
  surfaceAreaSqFt?: number;
  surfaceAreaSqM?: number;
  estimatedVolumeLitres?: number;
  category: 'Plunge' | 'Medium' | 'Large' | 'Commercial' | 'Custom';
}

/**
 * Parses and normalizes pool dimension strings like "20x10 ft", "29.52756x11.48294 ft", "6x3 m", "30 x 15 x 4.5 ft"
 */
export function parsePoolDimensions(raw?: string | null): ParsedPoolSize | null {
  if (!raw || !raw.trim()) return null;
  const str = raw.trim();

  // Detect unit
  const lower = str.toLowerCase();
  const unit: 'ft' | 'm' | 'unknown' = lower.includes('m') && !lower.includes('ft') ? 'm' : 'ft';

  // Extract numeric parts (e.g., 20x10 or 30 x 15 x 4.5)
  // Clean off units and replace 'by' or '*' or 'X' with 'x'
  const cleaned = lower
    .replace(/(feet|foot|ft|meters|meter|mtrs|mtr|m)/g, '')
    .replace(/['"”’]/g, '')
    .replace(/(\s+by\s+|\s*\*\s*|\s*x\s*)/gi, 'x')
    .trim();

  const parts = cleaned
    .split('x')
    .map((p) => parseFloat(p.trim()))
    .filter((n) => !isNaN(n) && n > 0);

  if (parts.length >= 2) {
    const length = Math.max(parts[0], parts[1]);
    const width = Math.min(parts[0], parts[1]);
    const depth = parts[2] ? parts[2] : unit === 'm' ? 1.35 : 4.5; // default 4.5ft / 1.35m depth if not specified

    // Round for clean display (e.g. 29.52756 -> 29.5)
    const formatNum = (num: number) => (Number.isInteger(num) ? num.toString() : num.toFixed(1));

    const formatted = parts.length >= 3
      ? `${formatNum(parts[0])} × ${formatNum(parts[1])} × ${formatNum(parts[2])} ${unit}`
      : `${formatNum(parts[0])} × ${formatNum(parts[1])} ${unit}`;

    let surfaceAreaSqFt = 0;
    let surfaceAreaSqM = 0;

    if (unit === 'ft') {
      surfaceAreaSqFt = Math.round(length * width);
      surfaceAreaSqM = Math.round((surfaceAreaSqFt * 0.092903) * 10) / 10;
    } else {
      surfaceAreaSqM = Math.round((length * width) * 10) / 10;
      surfaceAreaSqFt = Math.round(surfaceAreaSqM * 10.7639);
    }

    // Water volume estimate: length * width * depth in m³ * 1000 = Litres
    const depthInM = unit === 'm' ? depth : depth * 0.3048;
    const estimatedVolumeLitres = Math.round(surfaceAreaSqM * depthInM * 1000);

    let category: 'Plunge' | 'Medium' | 'Large' | 'Commercial' | 'Custom' = 'Medium';
    if (surfaceAreaSqFt < 180) {
      category = 'Plunge';
    } else if (surfaceAreaSqFt <= 450) {
      category = 'Medium';
    } else if (surfaceAreaSqFt <= 850) {
      category = 'Large';
    } else {
      category = 'Commercial';
    }

    return {
      raw,
      formatted,
      length,
      width,
      depth: parts[2],
      unit,
      surfaceAreaSqFt,
      surfaceAreaSqM,
      estimatedVolumeLitres,
      category,
    };
  }

  return {
    raw,
    formatted: raw,
    unit: 'unknown',
    category: 'Custom',
  };
}

/**
 * Returns a short display string for pool size, e.g. "20 × 10 ft (200 sq.ft)"
 */
export function formatPoolSizeBadge(raw?: string | null): string {
  const parsed = parsePoolDimensions(raw);
  if (!parsed) return 'Size not specified';
  if (parsed.surfaceAreaSqFt) {
    return `${parsed.formatted} · ${parsed.surfaceAreaSqFt} sq.ft`;
  }
  return parsed.formatted;
}
