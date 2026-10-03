import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export function seal(value: unknown, key: Buffer, context: string): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return JSON.stringify({ version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") });
}
export function unseal<T>(record: string, key: Buffer, context: string): T {
  const data = JSON.parse(record);
  if (data.version !== 1) throw new Error("vault_version_invalid");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(data.iv, "base64"));
  decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(Buffer.from(data.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.ciphertext, "base64")), decipher.final()]).toString("utf8")) as T;
}
