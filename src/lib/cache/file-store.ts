import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_ROOT = path.join(process.cwd(), "data", "cache");

export class FileStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileStoreError";
  }
}

function resolveCachePath(segments: string[]): string {
  const normalized = segments.map((segment) =>
    segment.replace(/[^a-zA-Z0-9._-]/g, "_"),
  );
  return path.join(CACHE_ROOT, ...normalized);
}

export async function ensureCacheDir(segments: string[]): Promise<string> {
  const dirPath = resolveCachePath(segments);
  await mkdir(dirPath, { recursive: true });
  return dirPath;
}

export async function readJsonCache<T>(segments: string[]): Promise<T | null> {
  const filePath = resolveCachePath(segments);
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeJsonCache<T>(
  segments: string[],
  data: T,
): Promise<string> {
  const filePath = resolveCachePath(segments);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return filePath;
}

export async function deleteJsonCache(segments: string[]): Promise<boolean> {
  const filePath = resolveCachePath(segments);
  try {
    await rm(filePath, { force: true });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function listJsonCacheFiles(
  segments: string[],
): Promise<string[]> {
  const dirPath = resolveCachePath(segments);
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name.replace(/\.json$/, ""));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export function getCacheRoot(): string {
  return CACHE_ROOT;
}
