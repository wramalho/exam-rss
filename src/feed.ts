import { Feed } from "feed";
import { FeedItem } from "./config.js";
import fs from "fs/promises";

export async function generateRSS(items: FeedItem[], outputPath: string) {
  const feed = new Feed({
    title: "Exam & Tech Updates RSS",
    description: "Custom RSS feed tracking public exam topics and tech docs.",
    id: "https://github.com/wramalho/exam-rss",
    link: "https://github.com/wramalho/exam-rss",
    language: "pt-BR",
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
          name: "RSS Bot",
        },
      ],
      date: new Date(item.date),
    });
  }

  // Write RSS 2.0 and Atom formats
  await fs.writeFile(outputPath, feed.rss2(), "utf-8");
  await fs.writeFile(outputPath.replace(".xml", ".atom"), feed.atom1(), "utf-8");
  console.log(`Feed generated at ${outputPath}`);
}
