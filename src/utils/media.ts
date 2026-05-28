import fs from "fs/promises";
import path from "path";
import { config } from "../config.js";

export async function ensureMediaDir(): Promise<void> {
  await fs.mkdir(config.MEDIA_STORAGE_DIR, { recursive: true });
}

export async function saveMediaFile(
  buffer: Buffer,
  filename: string
): Promise<{ localPath: string; publicUrl: string }> {
  await ensureMediaDir();
  const localPath = path.join(config.MEDIA_STORAGE_DIR, filename);
  await fs.writeFile(localPath, buffer);
  const publicUrl = `${config.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, "")}/${filename}`;
  return { localPath, publicUrl };
}
