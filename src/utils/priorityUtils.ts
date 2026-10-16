import { Quotation, FollowUp, Priority } from '../types';

export interface PriorityDetails {
  score: number;
  level: Priority; // 'high' | 'normal' | 'low'
  badgeText: string;
  badgeColor: string; // Tailwind color classes
  reasons: string[];
  methodLabel: string; // e.g. 'Smart FIFO/LIFO'
}

/**
 * Automatically calculates an intelligent priority score for a quotation/follow-up.
 * Blends LIFO (Speed-to-lead: striking while fresh inquiry is hot) with
 * FIFO (Neglect prevention: preventing older active quotes from dying of silence),
 * while incorporating real deal value, follow-up urgency, and customer temperature.
 */
export function computeQuotationPriority(
  quotation: Partial<Quotation>,
  followup?: FollowUp | null
): PriorityDetails {
  let score = 50; // Base score
  const reasons: string[] = [];

  const todayStr = new Date().toISOString().split('T')[0];
  const quoteDate = quotation.quotation_date || todayStr;

  // Calculate age in days
  const quoteTime = new Date(quoteDate).getTime();
  const nowTime = new Date(todayStr).getTime();
  const ageDays = Math.max(0, Math.floor((nowTime - quoteTime) / (1000 * 60 * 60 * 24)));

  // 1. Follow-up Urgency (Top Priority Component)
  if (followup) {
    if (followup.status === 'Overdue') {
      const scheduledTime = new Date(followup.scheduled_date).getTime();
      const overdueDays = Math.max(1, Math.floor((nowTime - scheduledTime) / (1000 * 60 * 60 * 24)));
      const overdueBonus = Math.min(60, overdueDays * 10);
      score += 150 + overdueBonus;
      reasons.push(`🚨 Overdue Follow-up (${overdueDays}d past due)`);
    } else if (followup.status === 'Due') {
      score += 100;
      reasons.push('📅 Follow-up Due Today');
    } else if (followup.status === 'Scheduled') {
      score += 20;
    }
  } else {
    // No Next Action Section: Figure out FIFO vs LIFO priority automatically
    const isUntouched = !quotation.has_action_taken && !quotation.latest_completed_followup;

    if (ageDays <= 2 && isUntouched) {
      // LIFO priority: Brand new inbound quote requiring immediate speed-to-lead
      score += 130;
      reasons.push('⚡ Fresh Inbound (LIFO: Contact within 24h)');
    } else if (ageDays <= 5 && isUntouched) {
      score += 85;
      reasons.push('⚡ New Inquiry (LIFO: Reviewing specs)');
    } else if (ageDays >= 14) {
      // FIFO priority: Older quotation at risk of being neglected/lost to competitor
      score += 95;
      reasons.push(`⏳ Waiting Client (FIFO: ${ageDays}d idle)`);
    } else if (ageDays >= 7) {
      score += 65;
      reasons.push(`⏳ Follow-up Needed (${ageDays}d old)`);
    } else {
      score += 45;
      reasons.push('Action Needed (No next follow-up)');
    }
  }

  // 2. Customer Engagement & Temperature
  if (quotation.temperature === 'hot') {
    score += 60;
    reasons.push('🔥 Hot Lead');
  } else if (quotation.temperature === 'warm') {
    score += 30;
    reasons.push('🟠 Warm Interest');
  } else if (quotation.temperature === 'cold') {
    score -= 25;
  }

  // 3. High Deal Value
  const price = quotation.quotation_price || 0;
  if (price >= 1500000) {
    score += 55;
    reasons.push('💎 High Value (₹15L+)');
  } else if (price >= 800000) {
    score += 35;
    reasons.push('💰 High Value (₹8L+)');
  } else if (price >= 400000) {
    score += 15;
  }

  // 4. Manual override priority if user flagged as high
  if (quotation.priority === 'high') {
    score += 50;
    reasons.push('⭐ User High Priority');
  } else if ((quotation.priority as string) === 'low') {
    score -= 40;
  }

  // 5. Stage adjustment
  if (quotation.app_status === 'In Discussion') {
    score += 25;
  } else if (quotation.app_status === 'Waiting for Client') {
    score += 15;
  } else if (quotation.app_status === 'Won' || quotation.app_status === 'Lost') {
    score -= 200;
  }

  // Map to Priority Level
  let level: Priority = 'normal';
  let badgeText = 'Normal Priority';
  let badgeColor = 'bg-slate-100 text-slate-700 border-slate-200';

  if (score >= 140) {
    level = 'high';
    badgeText = reasons[0] || 'High Priority';
    badgeColor = 'bg-rose-50 text-rose-700 border-rose-300 font-bold';
  } else if (score >= 75) {
    level = 'normal';
    badgeText = reasons[0] || 'Medium Priority';
    badgeColor = 'bg-amber-50 text-amber-800 border-amber-300 font-semibold';
  } else {
    level = 'normal';
    badgeText = 'Low Priority';
    badgeColor = 'bg-slate-50 text-slate-500 border-slate-200';
  }

  return {
    score,
    level,
    badgeText,
    badgeColor,
    reasons,
    methodLabel: score >= 140 && ageDays <= 3 ? 'LIFO (Fresh)' : score >= 140 && ageDays >= 14 ? 'FIFO (Queue)' : 'Smart Rank',
  };
}

/**
 * Sorts items by Smart Automatic Priority (Highest priority score first).
 * If scores tie, uses due date urgency, then quotation recency.
 */
export function sortBySmartPriority<T>(
  items: T[],
  getQuote: (item: T) => Quotation,
  getFollowup?: (item: T) => FollowUp | undefined | null
): T[] {
  return [...items].sort((a, b) => {
    const quoteA = getQuote(a);
    const quoteB = getQuote(b);
    const fupA = getFollowup ? getFollowup(a) : quoteA.next_followup;
    const fupB = getFollowup ? getFollowup(b) : quoteB.next_followup;

    const scoreA = computeQuotationPriority(quoteA, fupA).score;
    const scoreB = computeQuotationPriority(quoteB, fupB).score;

    if (scoreA !== scoreB) {
      return scoreB - scoreA; // Highest score first
    }

    // Tie breaker 1: Follow-up scheduled date
    if (fupA?.scheduled_date && fupB?.scheduled_date) {
      const cmp = fupA.scheduled_date.localeCompare(fupB.scheduled_date);
      if (cmp !== 0) return cmp;
    }

    // Tie breaker 2: Newest quotation first (speed-to-lead)
    return (quoteB.quotation_date || '').localeCompare(quoteA.quotation_date || '');
  });
}

/**
 * Sorts items by FIFO (First In, First Out).
 * Oldest quotation date first: clients who have waited the longest get processed first.
 */
export function sortByFIFO<T>(items: T[], getQuote: (item: T) => Quotation): T[] {
  return [...items].sort((a, b) => {
    const dateA = getQuote(a).quotation_date || '9999-99-99';
    const dateB = getQuote(b).quotation_date || '9999-99-99';
    const diff = dateA.localeCompare(dateB);
    if (diff !== 0) return diff;
    return (getQuote(a).id || '').localeCompare(getQuote(b).id || '');
  });
}

/**
 * Sorts items by LIFO (Last In, First Out).
 * Newest quotation date first: fresh inquiries handled immediately while interest is peaking.
 */
export function sortByLIFO<T>(items: T[], getQuote: (item: T) => Quotation): T[] {
  return [...items].sort((a, b) => {
    const dateA = getQuote(a).quotation_date || '';
    const dateB = getQuote(b).quotation_date || '';
    const diff = dateB.localeCompare(dateA);
    if (diff !== 0) return diff;
    return (getQuote(b).id || '').localeCompare(getQuote(a).id || '');
  });
}
