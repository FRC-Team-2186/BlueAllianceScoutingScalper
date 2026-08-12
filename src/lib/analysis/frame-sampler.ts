import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
      return duration;
    }
  } catch {
    // Fall through to default FRC match length.
  }
  return 150;
}

async function getStreamUrl(videoId: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "yt-dlp",
    ["-f", "best[height<=480]/best", "--get-url", youtubeUrl(videoId)],
    { timeout: 45_000 },
  );

  const streamUrl = stdout.trim().split("\n")[0];
  if (!streamUrl) {
    throw new FrameSamplerError("yt-dlp did not return a stream URL");
  }
  return streamUrl;
}

export function buildSampleTimestamps(durationSec: number): Array<{
  timestampSec: number;
  phase: SampledFrame["phase"];
}> {
  const clamp = (value: number) =>
    Math.min(Math.max(value, 0), Math.max(durationSec - 1, 0));

  const auto = [0, 5, 10, 14, 15].map((sec) => ({
    timestampSec: clamp(sec),
    phase: "auto" as const,
  }));

  const teleopMid = clamp(Math.min(Math.max(durationSec * 0.45, 25), durationSec - 35));
  const teleop = [teleopMid - 10, teleopMid, teleopMid + 10].map((sec) => ({
    timestampSec: clamp(sec),
    phase: "teleop" as const,
  }));

  const endStart = clamp(Math.max(durationSec - 30, 16));
  const endgame = [endStart, endStart + 8, endStart + 16, endStart + 24, durationSec - 2]
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
    .slice(0, 15);
}

async function extractFrame(
  streamUrl: string,
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
      streamUrl,
      "-frames:v",
      "1",
      "-q:v",
      "4",
      "-y",
      outputPath,
    ],
    { timeout: 45_000 },
  );
}

export async function sampleMatchFrames(videoId: string): Promise<SampledFrame[]> {
  const durationSec = await getVideoDurationSec(videoId);
  const timestamps = buildSampleTimestamps(durationSec);
  const streamUrl = await getStreamUrl(videoId);
  const tempDir = await mkdtemp(path.join(tmpdir(), "frc-scout-frames-"));

  try {
    const frames: SampledFrame[] = [];

    for (const [index, sample] of timestamps.entries()) {
      const outputPath = path.join(tempDir, `frame-${index}.jpg`);
      try {
        await extractFrame(streamUrl, sample.timestampSec, outputPath);
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
      throw new FrameSamplerError("Failed to extract any frames from the match video");
    }

    return frames;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
