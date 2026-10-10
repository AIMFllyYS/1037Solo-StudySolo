import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServiceAuthClient } from "@/lib/auth/server/serviceClient";
import { SandboxError } from "./config.server";

export interface ArtifactStorage {
  /** null means an explicit missing object; transport failures must throw. */
  inspect(path: string, id: string): Promise<Uint8Array | null>;
  upload(path: string, id: string, bytes: Uint8Array): Promise<void>;
}
const directory = () => resolve(process.cwd(), ".local-archive/connectors-private/sandbox-artifacts");
export class PrivateArtifactStorage implements ArtifactStorage {
  async inspect(path: string, id: string) {
    if (process.env.NODE_ENV === "production") {
      const storage = createServiceAuthClient().storage;
      const result = await storage.from("ss-agent-artifacts").download(path);
      if (result.error) {
        const code = (result.error as { code?: string }).code;
        if (code === "NoSuchKey") return null;
        // Older Storage APIs use a generic 404. Establish that the fixed
        // private bucket exists before treating it as a missing object.
        if ((!code || code === "not_found") && String((result.error as { statusCode?: string }).statusCode) === "404") {
          const bucket = await storage.getBucket("ss-agent-artifacts");
          if (!bucket.error && bucket.data?.public === false) return null;
        }
        throw new SandboxError("SANDBOX_ARTIFACT_STORAGE_FAILED", 503);
      }
      if (!result.data) throw new SandboxError("SANDBOX_ARTIFACT_STORAGE_FAILED", 503);
      return new Uint8Array(await result.data.arrayBuffer());
    }
    try { return await readFile(resolve(directory(), id)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw new SandboxError("SANDBOX_ARTIFACT_STORAGE_FAILED", 503); }
  }
  async upload(path: string, id: string, bytes: Uint8Array) {
    if (process.env.NODE_ENV === "production") {
      const storage = createServiceAuthClient().storage;
      const bucket = await storage.getBucket("ss-agent-artifacts");
      if (bucket.error || bucket.data?.public !== false) throw new SandboxError("SANDBOX_ARTIFACT_STORAGE_FAILED", 503);
      const result = await storage.from("ss-agent-artifacts").upload(path, bytes, { upsert: false, contentType: "application/octet-stream" });
      if (result.error) throw new SandboxError("SANDBOX_ARTIFACT_STORAGE_FAILED", 503);
    } else {
      await mkdir(directory(), { recursive: true, mode: 0o700 });
      await writeFile(resolve(directory(), id), bytes, { flag: "wx", mode: 0o600 });
    }
  }
}
