import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Cap analyzed video length at 2:30 to avoid CPU/memory timeouts. */
export const MAX_ANALYSIS_DURATION_SEC = 150;

/** Target FPS for Gemini pre-processing (within 10–15). */
export const ANALYSIS_TARGET_FPS = 12;

/** Preferred output height; fall back to 720p when source is higher quality. */
export const ANALYSIS_HEIGHT_PREFERRED = 480;
export const ANALYSIS_HEIGHT_MAX = 720;

export interface SampledFrame {
  timestampSec: number;
  phase: "auto" | "teleop" | "endgame";
  base64: string;
  mimeType: "image/jpeg";
}

export class FrameSamplerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrameSamplerError";
  }
}

function youtubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export async function getVideoDurationSec(videoId: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      "yt-dlp",
      ["--print", "duration", youtubeUrl(videoId)],
      { timeout: 30_000 },
    );
    const duration = Number.parseFloat(stdout.trim());
    if (Number.isFinite(duration) && duration > 0) {
      return Math.min(duration, MAX_ANALYSIS_DURATION_SEC);
    }
  } catch {
    // Fall through to default FRC match length.
  }
  return MAX_ANALYSIS_DURATION_SEC;
}

async function getStreamUrl(videoId: string): Promise<string> {
  // Prefer ≤720p streams; yt-dlp falls back to best available.
  const { stdout } = await execFileAsync(
    "yt-dlp",
    [
      "-f",
      `best[height<=${ANALYSIS_HEIGHT_MAX}]/best[height<=${ANALYSIS_HEIGHT_PREFERRED}]/best`,
      "--get-url",
      youtubeUrl(videoId),
    ],
    { timeout: 45_000 },
  );

  const streamUrl = stdout.trim().split("\n")[0];
  if (!streamUrl) {
    throw new FrameSamplerError("yt-dlp did not return a stream URL");
  }
  return streamUrl;
}

export function phaseForTimestamp(
  timestampSec: number,
  durationSec: number,
): SampledFrame["phase"] {
  if (timestampSec <= 15) return "auto";
  if (timestampSec >= Math.max(durationSec - 30, 16)) return "endgame";
  return "teleop";
}

/**
 * Sparse sample timestamps across auto / teleop / endgame within the capped clip.
 * Dense FPS is applied during FFmpeg pre-processing; Gemini still receives a
 * bounded set of JPEGs to stay within free-tier payload limits.
 */
export function buildSampleTimestamps(durationSec: number): Array<{
  timestampSec: number;
  phase: SampledFrame["phase"];
}> {
  const capped = Math.min(durationSec, MAX_ANALYSIS_DURATION_SEC);
  const clamp = (value: number) =>
    Math.min(Math.max(value, 0), Math.max(capped - 1, 0));

  const auto = [0, 5, 10, 14, 15].map((sec) => ({
    timestampSec: clamp(sec),
    phase: "auto" as const,
  }));

  const teleopMid = clamp(Math.min(Math.max(capped * 0.45, 25), capped - 35));
  const teleop = [
    teleopMid - 12,
    teleopMid - 4,
    teleopMid,
    teleopMid + 4,
    teleopMid + 12,
  ].map((sec) => ({
    timestampSec: clamp(sec),
    phase: "teleop" as const,
  }));

  const endStart = clamp(Math.max(capped - 30, 16));
  const endgame = [
    endStart,
    endStart + 8,
    endStart + 16,
    endStart + 24,
    capped - 2,
  ]
    .map((sec) => clamp(sec))
    .filter((sec, index, arr) => arr.indexOf(sec) === index)
    .map((timestampSec) => ({
      timestampSec,
      phase: "endgame" as const,
    }));

  const unique = new Map<number, SampledFrame["phase"]>();
  for (const sample of [...auto, ...teleop, ...endgame]) {
    unique.set(sample.timestampSec, sample.phase);
  }

  return [...unique.entries()]
    .map(([timestampSec, phase]) => ({ timestampSec, phase }))
    .sort((a, b) => a.timestampSec - b.timestampSec)
    .slice(0, 18);
}

/**
 * Downscale a stream segment to 480p (max 720p) at 10–15 FPS, capped at 2:30.
 */
export async function preprocessVideoSegment(
  streamUrl: string,
  outputPath: string,
  durationSec: number,
  height: number = ANALYSIS_HEIGHT_PREFERRED,
): Promise<void> {
  const cappedDuration = Math.min(durationSec, MAX_ANALYSIS_DURATION_SEC);
  const scaleFilter = `fps=${ANALYSIS_TARGET_FPS},scale=-2:${height}:flags=fast_bilinear`;

  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      streamUrl,
      "-t",
      String(cappedDuration),
      "-an",
      "-vf",
      scaleFilter,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "28",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    { timeout: 180_000 },
  );
}

async function extractFrameFromFile(
  videoPath: string,
  timestampSec: number,
  outputPath: string,
): Promise<void> {
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(timestampSec),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-q:v",
      "4",
      "-y",
      outputPath,
    ],
    { timeout: 30_000 },
  );
}

async function tryPreprocess(
  streamUrl: string,
  outputPath: string,
  durationSec: number,
): Promise<string> {
  try {
    await preprocessVideoSegment(
      streamUrl,
      outputPath,
      durationSec,
      ANALYSIS_HEIGHT_PREFERRED,
    );
    return outputPath;
  } catch {
    // Retry at 720p if 480p encode fails (codec/filter edge cases).
    await preprocessVideoSegment(
      streamUrl,
      outputPath,
      durationSec,
      ANALYSIS_HEIGHT_MAX,
    );
    return outputPath;
  }
}

export async function sampleMatchFrames(videoId: string): Promise<SampledFrame[]> {
  const durationSec = await getVideoDurationSec(videoId);
  const timestamps = buildSampleTimestamps(durationSec);
  const streamUrl = await getStreamUrl(videoId);
  const tempDir = await mkdtemp(path.join(tmpdir(), "frc-scout-frames-"));
  const processedPath = path.join(tempDir, "segment.mp4");

  try {
    await tryPreprocess(streamUrl, processedPath, durationSec);

    const frames: SampledFrame[] = [];

    for (const [index, sample] of timestamps.entries()) {
      const outputPath = path.join(tempDir, `frame-${index}.jpg`);
      try {
        await extractFrameFromFile(
          processedPath,
          sample.timestampSec,
          outputPath,
        );
        const buffer = await readFile(outputPath);
        if (buffer.byteLength === 0) continue;
        frames.push({
          timestampSec: sample.timestampSec,
          phase: sample.phase,
          base64: buffer.toString("base64"),
          mimeType: "image/jpeg",
        });
      } catch {
        // Skip individual frame failures and continue sampling.
      }
    }

    if (frames.length === 0) {
      // Last resort: pull stills directly from the stream without local encode.
      for (const [index, sample] of timestamps.entries()) {
        const outputPath = path.join(tempDir, `fallback-${index}.jpg`);
        try {
          await extractFrameFromFile(streamUrl, sample.timestampSec, outputPath);
          const buffer = await readFile(outputPath);
          if (buffer.byteLength === 0) continue;
          frames.push({
            timestampSec: sample.timestampSec,
            phase: sample.phase,
            base64: buffer.toString("base64"),
            mimeType: "image/jpeg",
          });
        } catch {
          // continue
        }
      }
    }

    if (frames.length === 0) {
      throw new FrameSamplerError(
        "Failed to extract any frames from the pre-processed match video",
      );
    }

    return frames;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
