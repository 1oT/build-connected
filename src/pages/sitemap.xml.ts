import type { APIRoute } from "astro";
import { getEpisodePath, publishedEpisodes } from "../data/episodes";

export const prerender = true;

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export const GET: APIRoute = ({ site }) => {
  if (!site) throw new Error("The Astro site URL is required to generate sitemap.xml.");

  const urls = publishedEpisodes.map((episode) => {
    const location = new URL(getEpisodePath(episode), site).href;
    return `  <url>\n    <loc>${escapeXml(location)}</loc>\n  </url>`;
  });

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
