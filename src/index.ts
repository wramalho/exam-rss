import path from "path";
import crypto from "crypto";
import { loadConfig, loadState, saveState, FeedItem } from "./config.js";
import { scrapeTechUpdate } from "./scrapers/tech.js";
import { scrapeLawDripFeed } from "./scrapers/law.js";
import { generateRSS } from "./feed.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT_DIR, "sources.yaml");
const STATE_PATH = path.join(ROOT_DIR, "state.json");
const FEED_OUTPUT_PATH = path.join(ROOT_DIR, "public", "feed.xml");

// Keep the last 50 items in the feed
const MAX_FEED_ITEMS = 50;

async function main() {
  console.log("Starting RSS Feed Generator...");
  
  const config = await loadConfig(CONFIG_PATH);
  const state = await loadState(STATE_PATH);

  const now = new Date().toISOString();
  let newFeedItems: FeedItem[] = [];

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
            content: content,
            date: now,
          });
        } else {
           console.log(`-> No changes for ${source.name}.`);
        }
      } 
      
      else if (source.mode === "drip_feed") {
        const currentIndex = sourceState.currentIndex || 0;
        const { content, newIndex } = await scrapeLawDripFeed(source, currentIndex);
        
        state.sources[source.id] = { ...sourceState, currentIndex: newIndex };

        if (content) {
          console.log(`-> Drip-feeding item index ${currentIndex} for ${source.name}.`);
          
          // Try to extract a title from the content (e.g. "Art. X")
          const titleMatch = content.match(/Art\\.\\s*\\d+º?/i);
          const titleSuffix = titleMatch ? ` - ${titleMatch[0]}` : ` - Part ${currentIndex + 1}`;

          newFeedItems.push({
            id: `${source.id}-chunk-${currentIndex}`,
            title: `${source.name}${titleSuffix}`,
            link: `${source.url}#chunk${currentIndex}`,
            content: content,
            date: now,
          });
        }
      }
    } catch (e) {
       console.error(`Failed to process ${source.name}: `, e);
    }
  }

  // Merge new items with old items
  let allItems = [...newFeedItems, ...state.feedItems];
  
  // Sort descending by date
  allItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  // Truncate to MAX_FEED_ITEMS
  allItems = allItems.slice(0, MAX_FEED_ITEMS);

  // Update state
  state.feedItems = allItems;
  await saveState(STATE_PATH, state);

  // Create public dir if not exists
  await import("fs/promises").then(fs => fs.mkdir(path.join(ROOT_DIR, "public"), { recursive: true }));

  // Generate XML
  await generateRSS(allItems, FEED_OUTPUT_PATH);
  
  console.log("Finished successfully!");
}

main().catch(console.error);
