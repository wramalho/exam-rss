import path from "path";
import fs from "fs/promises";
import { loadConfig, loadState, saveState, FeedItem } from "./config.js";
import { scrapeTechUpdate } from "./scrapers/tech.js";
import { scrapeLawDripFeed } from "./scrapers/law.js";
import { scrapeRssFeed } from "./scrapers/rss.js";
import { scrapeJotaColumn } from "./scrapers/jota.js";
import { scrapeGovBrNews } from "./scrapers/govbr.js";
import { generateRSS } from "./feed.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT_DIR, "sources.yaml");
const STATE_PATH = path.join(ROOT_DIR, "state.json");
const FEED_OUTPUT_PATH = path.join(ROOT_DIR, "public", "feed.xml");

// Keep enough room for daily law articles plus columns and blogs
const MAX_FEED_ITEMS = 100;

async function main() {
  console.log("Starting RSS Feed Generator...");

  const config = await loadConfig(CONFIG_PATH);
  const state = await loadState(STATE_PATH);

  const now = new Date().toISOString();
  const newFeedItems: FeedItem[] = [];

  for (const source of config.sources) {
    console.log(`Processing source: ${source.name}`);
    const sourceState = state.sources[source.id] || {};

    try {
      if (source.mode === "update_tracker") {
        const { content, newHash } = await scrapeTechUpdate(source, sourceState.lastHash);
        state.sources[source.id] = { ...sourceState, lastHash: newHash };

        if (content) {
          console.log(`-> Changes detected for ${source.name}!`);
          newFeedItems.push({
            id: `${source.id}-${newHash}`,
            title: `Update: ${source.name}`,
            link: source.url,
            content,
            date: now,
          });
        } else {
          console.log(`-> No changes for ${source.name}.`);
        }
      } else if (source.mode === "drip_feed") {
        const currentIndex = sourceState.currentIndex || 0;
        const { content, newIndex } = await scrapeLawDripFeed(source, currentIndex);
        state.sources[source.id] = { ...sourceState, currentIndex: newIndex };

        if (content) {
          console.log(`-> Drip-feeding item index ${currentIndex} for ${source.name}.`);
          const titleMatch = content.replace(/\s+/g, " ").match(/Art\.\s*\d+(?:-[A-Z])?º?/i);
          const titleSuffix = titleMatch ? ` - ${titleMatch[0]}` : ` - Part ${currentIndex + 1}`;

          newFeedItems.push({
            id: `${source.id}-chunk-${currentIndex}`,
            title: `${source.name}${titleSuffix}`,
            link: `${source.url}#chunk${currentIndex}`,
            content,
            date: now,
          });
        }
      } else if (source.mode === "rss_feed") {
        const { items, seenIds } = await scrapeRssFeed(source, sourceState.seenIds);
        state.sources[source.id] = { ...sourceState, seenIds };
        console.log(`-> Found ${items.length} new item(s) for ${source.name}.`);
        newFeedItems.push(...items);
      } else if (source.mode === "jota_column") {
        const { items, seenIds } = await scrapeJotaColumn(source, sourceState.seenIds);
        state.sources[source.id] = { ...sourceState, seenIds };
        console.log(`-> Found ${items.length} new item(s) for ${source.name}.`);
        newFeedItems.push(...items);
      } else if (source.mode === "govbr_news") {
        const { items, seenIds } = await scrapeGovBrNews(source, sourceState.seenIds);
        state.sources[source.id] = { ...sourceState, seenIds };
        console.log(`-> Found ${items.length} new item(s) for ${source.name}.`);
        newFeedItems.push(...items);
      }
    } catch (e) {
      console.error(`Failed to process ${source.name}:`, e);
    }
  }

  // Merge new items with old items, deduplicating by id (newest wins)
  const seen = new Set<string>();
  let allItems: FeedItem[] = [];
  for (const item of [...newFeedItems, ...state.feedItems]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    allItems.push(item);
  }

  // Sort descending by date
  allItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Truncate to MAX_FEED_ITEMS
  allItems = allItems.slice(0, MAX_FEED_ITEMS);

  // Update state
  state.feedItems = allItems;
  await saveState(STATE_PATH, state);

  await fs.mkdir(path.join(ROOT_DIR, "public"), { recursive: true });
  await generateRSS(allItems, FEED_OUTPUT_PATH);

  console.log("Finished successfully!");
}

main().catch(console.error);
