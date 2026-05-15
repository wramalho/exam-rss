import * as cheerio from "cheerio";
import crypto from "crypto";
import { Source } from "../config.js";

function hashString(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex");
}

export async function scrapeTechUpdate(source: Source, lastHash?: string): Promise<{ content: string | null; newHash: string }> {
  try {
    const response = await fetch(source.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (!response.ok) throw new Error(`Failed to fetch ${source.url}`);
    
    const html = await response.text();
    const $ = cheerio.load(html);

    const selector = source.css_selector || "body";
    const contentElement = $(selector);

    if (contentElement.length === 0) {
      console.warn(`Selector "${selector}" not found on ${source.name}`);
      return { content: null, newHash: lastHash || "" };
    }

    // Clean up scripts, styles, etc
    contentElement.find("script, style, nav, footer").remove();
    
    // We hash the raw text to detect actual content changes, ignoring minor HTML formatting changes
    const textContent = contentElement.text().replace(/\\s+/g, " ").trim();
    const currentHash = hashString(textContent);

    if (currentHash !== lastHash) {
      // Something changed! Return the HTML snippet so it looks good in RSS.
      // We will grab the first few paragraphs or a summary if it's too big.
      let snippetHtml = "";
      
      const paragraphs = contentElement.find("p, h1, h2, h3, ul, li");
      let charCount = 0;
      
      paragraphs.each((_, el) => {
        if (charCount > 2000) return false; // Limit length for the feed
        const html = $(el).prop('outerHTML');
        if (html) {
           snippetHtml += html;
           charCount += $(el).text().length;
        }
      });

      if (!snippetHtml) {
         snippetHtml = `<p>${textContent.substring(0, 1000)}...</p>`;
      }

      snippetHtml += `<br><p><a href="${source.url}">Read more on the official site.</a></p>`;

      return {
        content: snippetHtml,
        newHash: currentHash
      };
    }

    return { content: null, newHash: currentHash }; // No changes

  } catch (error) {
    console.error(`Error scraping tech doc ${source.name}:`, error);
    return { content: null, newHash: lastHash || "" };
  }
}
