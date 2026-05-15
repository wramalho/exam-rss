import * as cheerio from "cheerio";
import { Source } from "../config.js";

export async function scrapeLawDripFeed(source: Source, currentIndex: number): Promise<{ content: string | null; newIndex: number }> {
  try {
    const response = await fetch(source.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (!response.ok) throw new Error(`Failed to fetch ${source.url}`);
    
    // Windows-1252 is often used by planalto, but fetch decodes to UTF-8. 
    // Usually it's fine, but if encoding issues occur we might need arrayBuffer() + TextDecoder.
    // Let's use arrayBuffer to be safe and use TextDecoder for latin1/windows-1252 as planalto often uses iso-8859-1
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('iso-8859-1');
    const html = decoder.decode(buffer);

    const $ = cheerio.load(html);

    // Planalto laws are usually a series of paragraphs.
    // We want to extract chunks that start with "Art. "
    const chunks: string[] = [];
    let currentChunk = "";

    // Iterate through all text-containing elements in the body
    $("p, div, span").each((_, el) => {
      // Skip struck-through text (revoked articles)
      if ($(el).find("strike").length > 0 || $(el).prop("tagName") === "STRIKE" || $(el).css("text-decoration") === "line-through") {
        return;
      }

      const text = $(el).text().trim();
      if (!text) return;

      const isNewArticle = text.match(/^Art\.\s*\d+/i);

      if (isNewArticle) {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        currentChunk = `<p>${$(el).html()}</p>`;
      } else if (currentChunk) {
        // Append to current article if we are already inside one
        currentChunk += `<p>${$(el).html()}</p>`;
      }
    });

    // Push the last one
    if (currentChunk) {
      chunks.push(currentChunk);
    }

    if (chunks.length === 0) {
      console.warn(`No articles found for ${source.name}`);
      return { content: null, newIndex: currentIndex };
    }

    // Ensure we don't go out of bounds
    if (currentIndex >= chunks.length) {
       console.log(`Finished all articles for ${source.name}`);
       return { content: null, newIndex: currentIndex };
    }

    const nextArticle = chunks[currentIndex];
    
    return {
      content: nextArticle,
      newIndex: currentIndex + 1
    };

  } catch (error) {
    console.error(`Error scraping law ${source.name}:`, error);
    return { content: null, newIndex: currentIndex };
  }
}
