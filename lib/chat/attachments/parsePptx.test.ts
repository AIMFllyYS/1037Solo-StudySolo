import assert from "node:assert/strict";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { parsePptxSlideText } from "./parsePptx.ts";

test("parsePptxSlideText：离线提取 PPTX 各页文字", () => {
  const archive = zipSync({
    "ppt/slides/slide2.xml": strToU8("<p:sld><a:t>第二页</a:t><a:t>&amp; 重点</a:t></p:sld>"),
    "ppt/slides/slide1.xml": strToU8("<p:sld><a:t>第一页</a:t></p:sld>"),
  });
  const dataUrl = `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${Buffer.from(archive).toString("base64")}`;
  assert.deepEqual(parsePptxSlideText(dataUrl), [
    { number: 1, text: "第一页" },
    { number: 2, text: "第二页 & 重点" },
  ]);
});
