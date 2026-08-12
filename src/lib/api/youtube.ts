import type { TbaMatch, TbaMatchVideo } from "@/lib/types/tba";

export function extractYoutubeVideoId(match: TbaMatch): string | null {
  const youtubeVideo = match.videos.find((video) => video.type === "youtube");
  return youtubeVideo?.key ?? null;
}

export function getYoutubeEmbedUrl(videoId: string, startSeconds?: number): string {
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
  });
  if (startSeconds !== undefined && startSeconds > 0) {
    params.set("start", String(Math.floor(startSeconds)));
  }
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function getYoutubeWatchUrl(videoId: string, startSeconds?: number): string {
  const url = new URL(`https://www.youtube.com/watch?v=${videoId}`);
  if (startSeconds !== undefined && startSeconds > 0) {
    url.searchParams.set("t", `${Math.floor(startSeconds)}s`);
  }
  return url.toString();
}

export function formatMatchVideoLabel(video: TbaMatchVideo): string {
  return video.type === "youtube"
    ? `YouTube (${video.key})`
    : `TBA (${video.key})`;
}

export function getTeamAlliance(
  match: TbaMatch,
  teamKey: string,
): "red" | "blue" | null {
  if (match.alliances.red.team_keys.includes(teamKey)) return "red";
  if (match.alliances.blue.team_keys.includes(teamKey)) return "blue";
  return null;
}
