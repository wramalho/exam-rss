import { Feed } from "feed";
import { FeedItem } from "./config.js";
import fs from "fs/promises";
import path from "path";

const PAGES_BASE_URL = "https://wramalho.github.io/exam-rss";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildLandingHtml(items: FeedItem[]): string {
  const listItems = items
    .slice(0, 30)
    .map((item) => {
      const dateStr = new Date(item.date).toLocaleDateString("pt-BR");
      const author = item.author ? ` — ${escapeHtml(item.author)}` : "";
      return `<li><a href="${escapeHtml(item.link)}">${escapeHtml(item.title)}</a> <small>(${dateStr}${author})</small></li>`;
    })
    .join("\n      ");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Exam &amp; Public Sector RSS</title>
  <link rel="alternate" type="application/rss+xml" title="RSS 2.0" href="feed.xml">
  <link rel="alternate" type="application/atom+xml" title="Atom 1.0" href="feed.atom">
  <style>
    body { font-family: system-ui, sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
    code { background: #f3f4f6; padding: 0.15rem 0.35rem; border-radius: 4px; }
    li { margin-bottom: 0.5rem; }
  </style>
</head>
<body>
  <h1>Exam &amp; Public Sector RSS</h1>
  <p>Feeds disponíveis:</p>
  <ul>
    <li>RSS 2.0: <a href="feed.xml"><code>${PAGES_BASE_URL}/feed.xml</code></a></li>
    <li>Atom 1.0: <a href="feed.atom"><code>${PAGES_BASE_URL}/feed.atom</code></a></li>
  </ul>
  <h2>Últimos itens (${items.length} no feed)</h2>
  <ul>
    ${listItems}
  </ul>
</body>
</html>
`;
}

export async function generateRSS(items: FeedItem[], outputPath: string) {
  const feed = new Feed({
    title: "Exam & Tech Updates RSS",
    description: "Custom RSS feed tracking public exam topics, public control, privacy, fiscal policy, and tech docs.",
    id: `${PAGES_BASE_URL}/`,
    link: "https://github.com/wramalho/exam-rss",
    language: "pt-BR",
    feedLinks: {
      rss: `${PAGES_BASE_URL}/feed.xml`,
      atom: `${PAGES_BASE_URL}/feed.atom`,
    },
    image: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
    favicon: "https://github.githubassets.com/favicons/favicon.png",
    copyright: "All rights reserved",
    updated: new Date(),
    generator: "Custom TypeScript RSS Generator",
  });

  // Sort items by date descending
  const sortedItems = [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  for (const item of sortedItems) {
    feed.addItem({
      title: item.title,
      id: item.id,
      link: item.link,
      description: item.content,
      content: item.content,
      author: [
        {
          name: item.author || "RSS Bot",
        },
      ],
      date: new Date(item.date),
    });
  }

  // Write RSS 2.0, Atom 1.0, and landing index.html
  await fs.writeFile(outputPath, feed.rss2(), "utf-8");
  await fs.writeFile(outputPath.replace(".xml", ".atom"), feed.atom1(), "utf-8");
  await fs.writeFile(path.join(path.dirname(outputPath), "index.html"), buildLandingHtml(sortedItems), "utf-8");
  console.log(`Feed generated at ${outputPath}`);
}
