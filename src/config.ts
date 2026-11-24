import { z } from "zod";
import fs from "fs/promises";
import yaml from "js-yaml";

// --- Configuration Schema ---
const SourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  type: z.enum(["tech_doc", "column", "blog", "rss", "gov"]),
  mode: z.enum(["update_tracker", "rss_feed", "jota_column"]),
  css_selector: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  max_items: z.number().int().positive().optional(),
  fetch_full_content: z.boolean().optional(),
});

export const ConfigSchema = z.object({
  sources: z.array(SourceSchema),
});

export type Source = z.infer<typeof SourceSchema>;
export type Config = z.infer<typeof ConfigSchema>;

// --- State Schema ---
const FeedItemSchema = z.object({
  title: z.string(),
  id: z.string(),
  link: z.string(),
  content: z.string(),
  date: z.string(), // Store as ISO string
  author: z.string().optional(),
});

export type FeedItem = z.infer<typeof FeedItemSchema>;

const SourceStateSchema = z.object({
  lastHash: z.string().optional(),
  seenIds: z.array(z.string()).optional(), // For rss_feed and jota_column
});

export const StateSchema = z.object({
  sources: z.record(z.string(), SourceStateSchema),
  feedItems: z.array(FeedItemSchema),
});

export type State = z.infer<typeof StateSchema>;

export async function loadConfig(filePath: string): Promise<Config> {
  const content = await fs.readFile(filePath, "utf-8");
  const parsed = yaml.load(content);
  return ConfigSchema.parse(parsed);
}

export async function loadState(filePath: string): Promise<State> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return StateSchema.parse(JSON.parse(content));
  } catch (e) {
    // If state doesn't exist or is invalid, return default
    return { sources: {}, feedItems: [] };
  }
}

export async function saveState(filePath: string, state: State): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf-8");
}
