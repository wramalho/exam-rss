import * as cheerio from "cheerio";
import { FeedItem, Source } from "../config.js";
import { fetchText } from "../http.js";
import { selectNewFeedItems, toIsoDate } from "./collection.js";

interface JotaAuthor {
  name?: string;
}

interface JotaPost {
  id?: number | string;
  title?: string;
  excerpt?: string;
  date?: string;
  published_at?: string;
  link?: string;
  permalink?: string;
  slug?: string;
  hat?: string;
  inherits_from_PRO?: boolean;
  authors?: JotaAuthor[];
}

function extractNextData(html: string): Record<string, any> | null {
  const $ = cheerio.load(html);
  const raw = $("script#__NEXT_DATA__").html();
  if (!raw) return null;
  return JSON.parse(raw);
}

function cleanArticleHtml(html: string): string {
  const $ = cheerio.load(html);
  $(".jota-cta, script, style").remove();
  return $.root().html() || html;
}

async function fetchJotaArticleContent(url: string, fallbackHtml: string): Promise<string> {
  try {
    const html = await fetchText(url, "utf-8", 12000);
    const nextData = extractNextData(html);
    const post = nextData?.props?.pageProps?.post;
    if (post && typeof post.content === "string" && post.content.trim()) {
      return cleanArticleHtml(post.content);
    }
  } catch {
    // Keep excerpt fallback if individual article fetch fails.
  }
  return fallbackHtml;
}

function resolveJotaUrl(rawLink: string): string {
  if (rawLink.startsWith("http")) return rawLink;
  return `https://www.jota.info${rawLink.startsWith("/") ? "" : "/"}${rawLink}`;
}

/**
 * Scrapes a JOTA column page using its embedded Next.js payload and optionally fetches
 * full HTML for newly detected non-PRO articles.
 */
export async function scrapeJotaColumn(
  source: Source,
  previousSeenIds: string[] = []
): Promise<{ items: FeedItem[]; seenIds: string[] }> {
  try {
    const html = await fetchText(source.url);
    const nextData = extractNextData(html);
    const posts: JotaPost[] = nextData?.props?.pageProps?.posts || [];

    if (posts.length === 0) {
      console.warn(`No posts found in __NEXT_DATA__ for ${source.name}`);
      return { items: [], seenIds: previousSeenIds };
    }

    const nowIso = new Date().toISOString();
    const candidates: FeedItem[] = [];

    for (const post of posts) {
      const rawLink = post.link || post.permalink;
      if (!post.title || !rawLink) continue;

      const link = resolveJotaUrl(rawLink);
      const idSuffix = post.id ?? post.slug ?? link;
      const author =
        post.authors?.map((a) => a.name).filter(Boolean).join(", ") || source.name;
      const excerptHtml = post.excerpt ? `<p>${post.excerpt}</p>` : "";
      const fallbackHtml = `${excerptHtml}<p><a href="${link}">Ler na íntegra no JOTA</a></p>`;

      candidates.push({
        id: `${source.id}-${idSuffix}`,
        title: `${source.name}: ${post.title}`,
        link,
        content: fallbackHtml,
        date: toIsoDate(post.published_at || post.date, nowIso),
        author,
      });
    }

    const { items, seenIds } = selectNewFeedItems(source, candidates, previousSeenIds);

    if (source.fetch_full_content !== false) {
      const postByUrl = new Map<string, JotaPost>();
      for (const post of posts) {
        const rawLink = post.link || post.permalink;
        if (rawLink) postByUrl.set(resolveJotaUrl(rawLink), post);
      }

      for (const item of items) {
        const meta = postByUrl.get(item.link);
        if (meta && !meta.inherits_from_PRO) {
          item.content = await fetchJotaArticleContent(item.link, item.content);
        }
      }
    }

    return { items, seenIds };
  } catch (error) {
    console.error(`Error scraping JOTA column ${source.name}:`, error);
    return { items: [], seenIds: previousSeenIds };
  }
}
