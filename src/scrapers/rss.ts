import * as cheerio from "cheerio";
import { FeedItem, Source } from "../config.js";
import { fetchText } from "../http.js";
import { selectNewFeedItems, toIsoDate } from "./collection.js";

function sanitizeXml(xml: string): string {
  return xml.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

function parseRssItems($: cheerio.CheerioAPI, source: Source, fallbackIso: string): FeedItem[] {
  const items: FeedItem[] = [];

  $("channel > item").each((_, el) => {
    const $item = $(el);
    const title = $item.find("title").first().text().trim();
    const link = $item.find("link").first().text().trim();
    const rawId = $item.find("guid").first().text().trim() || link || title;
    const rawDate =
      $item.find("pubDate").first().text().trim() ||
      $item.find("dc\\:date").first().text().trim();
    const author =
      $item.find("dc\\:creator").first().text().trim() ||
      $item.find("author").first().text().trim() ||
      source.name;
    const body =
      $item.find("content\\:encoded").first().text().trim() ||
      $item.find("description").first().text().trim();

    if (!title || !link) return;

    items.push({
      id: `${source.id}-${rawId}`,
      title: `${source.name}: ${title}`,
      link,
      content: body || `<p><a href="${link}">${title}</a></p>`,
      date: toIsoDate(rawDate, fallbackIso),
      author,
    });
  });

  return items;
}

function parseAtomEntries($: cheerio.CheerioAPI, source: Source, fallbackIso: string): FeedItem[] {
  const items: FeedItem[] = [];

  $("feed > entry").each((_, el) => {
    const $entry = $(el);
    const title = $entry.find("title").first().text().trim();
    const link =
      $entry.find('link[rel="alternate"]').attr("href") ||
      $entry.find("link").first().attr("href") ||
      $entry.find("link").first().text().trim();
    const rawId = $entry.find("id").first().text().trim() || link || title;
    const rawDate =
      $entry.find("published").first().text().trim() ||
      $entry.find("updated").first().text().trim();
    const authors = $entry
      .find("author > name")
      .map((_, a) => $(a).text().trim())
      .get()
      .filter(Boolean);
    const author = authors.join(", ") || source.name;
    const rawBody =
      $entry.find("content").first().text().trim() ||
      $entry.find("summary").first().text().trim();
    const body =
      rawBody && !/<[a-z][\s\S]*>/i.test(rawBody)
        ? rawBody
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => `<p>${line}</p>`)
            .join("")
        : rawBody;

    if (!title || !link) return;

    items.push({
      id: `${source.id}-${rawId}`,
      title: `${source.name}: ${title}`,
      link,
      content: body || `<p><a href="${link}">${title}</a></p>`,
      date: toIsoDate(rawDate, fallbackIso),
      author,
    });
  });

  return items;
}

/**
 * Fetches an external RSS 2.0 or Atom 1.0 feed and returns unseen items.
 */
export async function scrapeRssFeed(
  source: Source,
  previousSeenIds: string[] = []
): Promise<{ items: FeedItem[]; seenIds: string[] }> {
  try {
    const xml = sanitizeXml(await fetchText(source.url));
    const $ = cheerio.load(xml, { xml: true });
    const nowIso = new Date().toISOString();

    const rssItems = parseRssItems($, source, nowIso);
    const candidates = rssItems.length > 0 ? rssItems : parseAtomEntries($, source, nowIso);

    return selectNewFeedItems(source, candidates, previousSeenIds);
  } catch (error) {
    console.error(`Error scraping RSS feed ${source.name}:`, error);
    return { items: [], seenIds: previousSeenIds };
  }
}
