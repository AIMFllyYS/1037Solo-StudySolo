import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeImageGenImages } from "./imageGenResponse.ts";

test("normalizeImageGenImages：SiliconFlow images[].url", () => {
  const images = normalizeImageGenImages({
    images: [{ url: "https://cdn.example/out.png" }],
    seed: 7,
  });
  assert.equal(images.length, 1);
  assert.equal(images[0].url, "https://cdn.example/out.png");
});

test("normalizeImageGenImages：OpenAI data[].b64_json", () => {
  const images = normalizeImageGenImages({
    data: [{ b64_json: "abc123", revised_prompt: "red circle" }],
  });
  assert.equal(images.length, 1);
  assert.equal(images[0].b64_json, "abc123");
  assert.equal(images[0].revised_prompt, "red circle");
});

test("normalizeImageGenImages：空项与非对象丢弃", () => {
  assert.deepEqual(normalizeImageGenImages(null), []);
  assert.deepEqual(normalizeImageGenImages({ images: [{ url: "" }, null, "x"] }), []);
  assert.deepEqual(normalizeImageGenImages({ data: [] }), []);
});
