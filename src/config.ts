import { z } from "zod";
import fs from "fs/promises";
import yaml from "js-yaml";
import path from "path";

// --- Configuration Schema ---
const SourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  type: z.enum(["tech_doc", "brazilian_law"]),
  mode: z.enum(["update_tracker", "drip_feed"]),
  css_selector: z.string().optional(),
  chunk_by: z.string().optional(),
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
});

export type FeedItem = z.infer<typeof FeedItemSchema>;

const SourceStateSchema = z.object({
  lastHash: z.string().optional(),
  currentIndex: z.number().optional(), // For drip-feed
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
