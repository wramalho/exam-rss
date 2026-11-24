import { FeedItem, Source } from "../config.js";

const MAX_SEEN_IDS = 200;

function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matchesKeywords(item: FeedItem, keywords?: string[]): boolean {
  if (!keywords || keywords.length === 0) return true;
  const plain = normalizeForSearch(
    `${item.title} ${item.content.replace(/<[^>]+>/g, " ")}`
  );
  return keywords.some((kw) => plain.includes(normalizeForSearch(kw)));
}

/**
 * Filters out previously seen items, applies optional keyword matching, and caps
 * emissions (smaller batch on initial seed so one new source doesn't flood the feed).
 */
export function selectNewFeedItems(
  source: Source,
  candidates: FeedItem[],
  previousSeenIds: string[] = []
): { items: FeedItem[]; seenIds: string[] } {
  const seenSet = new Set(previousSeenIds);
  const unseen = candidates.filter((item) => !seenSet.has(item.id));

  const isInitialSeed = previousSeenIds.length === 0;
  const limit = source.max_items ?? (isInitialSeed ? 3 : 10);

  const matched = unseen.filter((item) => matchesKeywords(item, source.keywords));
  const selected = matched.slice(0, limit);

  // Track all seen candidate IDs (not just matched ones) so rejected items aren't re-checked.
  const nextSeenIds = [
    ...unseen.map((item) => item.id),
    ...previousSeenIds,
  ].slice(0, MAX_SEEN_IDS);

  return { items: selected, seenIds: nextSeenIds };
}

/**
 * Parses an arbitrary date string into ISO-8601, falling back to fallbackIso on failure.
 */
export function toIsoDate(rawDate: string | undefined, fallbackIso: string): string {
  if (!rawDate) return fallbackIso;
  const trimmed = rawDate.trim();

  // Handle Brazilian DD/MM/YYYY [HHhMM] formats used by JOTA and Gov.br Plone.
  const brDateTimeMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2})[h:](\d{2}))?$/);
  if (brDateTimeMatch) {
    const [, day, month, year, hour = "12", minute = "00"] = brDateTimeMatch;
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:00-03:00`).toISOString();
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return fallbackIso;
}
