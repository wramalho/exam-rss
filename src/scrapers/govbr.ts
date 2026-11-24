import * as cheerio from "cheerio";
import { FeedItem, Source } from "../config.js";
import { fetchText } from "../http.js";
import { selectNewFeedItems, toIsoDate } from "./collection.js";

function resolveGovBrUrl(rawLink: string, baseUrl: string): string {
  if (rawLink.startsWith("http")) return rawLink;
  return new URL(rawLink, baseUrl).toString();
}

async function fetchGovBrArticleBody(url: string, fallbackHtml: string): Promise<string> {
  try {
    const html = await fetchText(url, "utf-8", 12000);
    const $ = cheerio.load(html);
    const bodyEl = $("#parent-fieldname-text [property='rnews:articleBody']").first().length
      ? $("#parent-fieldname-text [property='rnews:articleBody']").first()
      : $("#parent-fieldname-text").first();

    if (bodyEl.length > 0) {
      bodyEl.find("script, style").remove();
      const inner = (bodyEl.html() || "").trim();
      if (inner) return `${inner}<p><a href="${url}">Ler na íntegra no gov.br</a></p>`;
    }
  } catch {
    // Fall back to listing description when article fetch fails.
  }
  return fallbackHtml;
}

/**
 * Scrapes news cards (`article.tileItem`) from Gov.br Plone portals (e.g., CGU).
 */
export async function scrapeGovBrNews(
  source: Source,
  previousSeenIds: string[] = []
): Promise<{ items: FeedItem[]; seenIds: string[] }> {
  try {
    const html = await fetchText(source.url);
    const $ = cheerio.load(html);
    const nowIso = new Date().toISOString();
    const candidates: FeedItem[] = [];

    $("article.tileItem").each((_, el) => {
      const $article = $(el);
      const $link = $article.find("h2.tileHeadline a, h3.tileHeadline a").first();
      const title = $link.text().replace(/\s+/g, " ").trim();
      const rawHref = $link.attr("href")?.trim();
      if (!title || !rawHref) return;

      const link = resolveGovBrUrl(rawHref, source.url);
      const subtitle = $article.find(".subtitle").first().text().replace(/\s+/g, " ").trim();
      const description = $article.find(".description").first().text().replace(/\s+/g, " ").trim();
      const bylineText = $article.find(".documentByLine").text().replace(/\s+/g, " ");
      const dateMatch = bylineText.match(/(\d{2}\/\d{2}\/\d{4})(?:.*?(\d{2}h\d{2}))?/);
      const rawDate = dateMatch
        ? `${dateMatch[1]}${dateMatch[2] ? ` ${dateMatch[2]}` : ""}`
        : undefined;

      const prefix = subtitle ? `[${subtitle}] ` : "";
      const fallbackHtml = `${description ? `<p>${description}</p>` : ""}<p><a href="${link}">Ler na íntegra no gov.br</a></p>`;

      candidates.push({
        id: `${source.id}-${link}`,
        title: `${source.name}: ${prefix}${title}`,
        link,
        content: fallbackHtml,
        date: toIsoDate(rawDate, nowIso),
        author: source.name,
      });
    });

    if (candidates.length === 0) {
      console.warn(`No article.tileItem entries found for ${source.name}`);
      return { items: [], seenIds: previousSeenIds };
    }

    const { items, seenIds } = selectNewFeedItems(source, candidates, previousSeenIds);

    if (source.fetch_full_content !== false) {
      for (const item of items) {
        item.content = await fetchGovBrArticleBody(item.link, item.content);
      }
    }

    return { items, seenIds };
  } catch (error) {
    console.error(`Error scraping Gov.br news ${source.name}:`, error);
    return { items: [], seenIds: previousSeenIds };
  }
}
