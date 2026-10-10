import assert from "node:assert/strict";
import { test } from "node:test";
import { formatImageGenError, imageGenErrorHeading } from "./imageGenError.ts";

test("formatImageGenError：401 为未登录，与上游错误区分", () => {
  assert.equal(formatImageGenError(401, { error: "Unauthorized" }), "未登录，请先登录后再生成图片");
  assert.match(formatImageGenError(400, { code: "bad_endpoint", error: "生图端点不对" }), /端点不对/);
  assert.match(formatImageGenError(500, { code: "unconfigured", error: "生图 API 未配置" }), /未配置/);
  assert.match(formatImageGenError(502, { code: "upstream_auth", error: "上游拒绝" }), /上游拒绝/);
  assert.match(formatImageGenError(502, { code: "upstream", error: "生图上游拒绝：safety" }), /上游拒绝/);
  assert.match(
    formatImageGenError(402, { code: "quota_exhausted", error: "平台额度已用完。可改用 BYOK 继续使用。" }),
    /可改用 BYOK/,
  );
});

test("imageGenErrorHeading：401 不是「生图失败」", () => {
  const login = formatImageGenError(401, { error: "Unauthorized" });
  assert.equal(imageGenErrorHeading(login), "未登录");
  assert.equal(
    imageGenErrorHeading(formatImageGenError(502, { code: "bad_endpoint", error: "生图端点不对（上游返回 404）" })),
    "生图端点不对",
  );
  assert.equal(
    imageGenErrorHeading(formatImageGenError(502, { code: "upstream_auth", error: "生图上游拒绝访问，请检查端点与密钥" })),
    "上游拒绝",
  );
  assert.equal(imageGenErrorHeading(undefined), "生图失败");
  assert.equal(
    imageGenErrorHeading(formatImageGenError(402, { code: "quota_exhausted", error: "平台额度已用完。可改用 BYOK 继续使用。" })),
    "额度已用完",
  );
});
