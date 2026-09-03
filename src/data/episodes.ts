import { parse } from "yaml";
import { z } from "zod";
import source from "./episodes.yaml?raw";

const episodeSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: z.enum(["draft", "announced", "published"]),
  copyFinal: z.boolean(),
  episodeNumber: z.string().min(1),
  companyName: z.string().min(1),
  episodeHeadline: z.string().min(1),
  shortIntroduction: z.string().min(1),
  seoTitle: z.string().min(1),
  seoDescription: z.string().min(1),
  publicationDate: z.string().min(1),
  publicationDateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duration: z.string().regex(/^\d+ min$/),
  youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/).optional(),
  videoAvailable: z.boolean().default(false),
  backgroundVideo: z.string(),
  posterImage: z.string().min(1),
  thumbnail: z.string().min(1),
  companyUrl: z.string().url(),
  buttonLabel: z.string().min(1),
}).strict();

export type Episode = z.infer<typeof episodeSchema>;

export const episodes = z.array(episodeSchema).min(1).parse(parse(source));

export const publishedEpisodes = episodes.filter((episode) => episode.status === "published");

export function getEpisodePath(episode: Episode) {
  return episode.slug === "introduction" ? "/" : `/${episode.slug}/`;
}
