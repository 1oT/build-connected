import type { APIRoute } from "astro";

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  if (!site) throw new Error("The Astro site URL is required to generate robots.txt.");

  const sitemapUrl = new URL("/sitemap.xml", site).href;
  const body = ["User-agent: *", "Allow: /", "", `Sitemap: ${sitemapUrl}`, ""].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
