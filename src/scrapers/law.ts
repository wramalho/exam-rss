import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { Source } from "../config.js";
import { fetchText } from "../http.js";

function isStruckThrough($: cheerio.CheerioAPI, el: AnyNode): boolean {
  if ($(el).closest("strike, s, del").length > 0) return true;
  const tagName = ($(el).prop("tagName") || "").toUpperCase();
  if (tagName === "STRIKE" || tagName === "S" || tagName === "DEL") return true;
  const style = ($(el).attr("style") || "").toLowerCase();
  return style.includes("line-through");
}

function extractCleanParagraph($: cheerio.CheerioAPI, el: AnyNode): { text: string; html: string } | null {
  if (isStruckThrough($, el)) return null;

  const $clone = $(el).clone();
  // Strip revoked portions inside amended articles while keeping current wording.
  $clone.find("strike, s, del").remove();
  $clone.find("[style]").each((_, child) => {
    const childStyle = ($(child).attr("style") || "").toLowerCase();
    if (childStyle.includes("line-through")) {
      $(child).remove();
    }
  });

  const text = $clone.text().replace(/\s+/g, " ").trim();
  const html = ($clone.html() || "").trim();
  if (!text || !html) return null;

  return { text, html };
}

/**
 * Splits a Planalto law HTML document into article chunks and returns all chunks.
 */
export function parseLawChunks(html: string): string[] {
  const $ = cheerio.load(html);
  const chunks: string[] = [];
  let currentChunk = "";

  // Planalto places each article caput, inciso, and parágrafo in <p> elements.
  // Selecting only <p> avoids matching inner <span> tags and duplicating articles.
  $("p").each((_, el) => {
    const cleaned = extractCleanParagraph($, el);
    if (!cleaned) return;

    const isNewArticle = /^Art\.\s*\d+/i.test(cleaned.text);
    if (isNewArticle) {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = `<p>${cleaned.html}</p>`;
    } else if (currentChunk) {
      currentChunk += `<p>${cleaned.html}</p>`;
    }
  });

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

export async function scrapeLawDripFeed(
  source: Source,
  currentIndex: number
): Promise<{ content: string | null; newIndex: number }> {
  try {
    const html = await fetchText(source.url, "iso-8859-1");
    const chunks = parseLawChunks(html);

    if (chunks.length === 0) {
      console.warn(`No articles found for ${source.name}`);
      return { content: null, newIndex: currentIndex };
    }

    if (currentIndex >= chunks.length) {
      console.log(`Finished all articles for ${source.name}`);
      return { content: null, newIndex: currentIndex };
    }

    return {
      content: chunks[currentIndex],
      newIndex: currentIndex + 1,
    };
  } catch (error) {
    console.error(`Error scraping law ${source.name}:`, error);
    return { content: null, newIndex: currentIndex };
  }
}
