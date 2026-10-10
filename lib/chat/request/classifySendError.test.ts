import assert from "node:assert/strict";
import { test } from "node:test";
import { classifySendError, STALL_IDLE_MESSAGE, stallMaxWaitMessage } from "./classifySendError.ts";

test("classifySendError：超时优先于其它错误", () => {
  assert.equal(
    classifySendError(new Error("ignored"), { stalled: "idle", aborted: true }),
    STALL_IDLE_MESSAGE,
  );
});

test("classifySendError：「最长等待时间」到顶给的是可操作文案，不是连接错误", () => {
  const message = classifySendError(new Error("ignored"), {
    stalled: "max-wait",
    aborted: true,
    maxWaitMs: 300_000,
  });
  assert.equal(message, stallMaxWaitMessage(300_000));
  assert.match(message ?? "", /300 秒/);
  assert.match(message ?? "", /最长等待时间/);
  // 不能被误认成"连接断了"或静默超时。
  assert.doesNotMatch(message ?? "", /没有响应/);
});

test("classifySendError：用户取消或 AbortError 不展示", () => {
  assert.equal(classifySendError(new Error("x"), { stalled: false, aborted: true }), null);
  const abort = new Error("生成被中断");
  abort.name = "AbortError";
  assert.equal(classifySendError(abort, { stalled: false, aborted: false }), null);
});

test("classifySendError：其它错误取 message，非 Error 用通用文案", () => {
  assert.equal(classifySendError(new Error("上游返回错误"), { stalled: false, aborted: false }), "上游返回错误");
  assert.equal(classifySendError("boom", { stalled: false, aborted: false }), "发生未知错误");
});

test("classifySendError：未登录 401 指向左下角设置登录", () => {
  const hint = classifySendError(new Error("Unauthorized"), { stalled: false, aborted: false });
  assert.match(hint ?? "", /左下角「设置」/);
  assert.match(hint ?? "", /登录/);
  assert.match(hint ?? "", /邮箱验证码/);
  assert.equal(
    classifySendError(new Error("API 请求失败: 401 Unauthorized - Unauthorized"), { stalled: false, aborted: false }),
    hint,
  );
  assert.match(
    classifySendError(new Error("模型服务拒绝认证（HTTP 401），请检查 API 密钥和模型访问权限。"), {
      stalled: false,
      aborted: false,
    }) ?? "",
    /API 密钥/,
  );
});

test("classifySendError：413 / nginx HTML 映射可读文案", () => {
  assert.match(
    classifySendError(new Error("API 请求失败: 413 Request Entity Too Large - <html>nginx/1.18.0</html>"), {
      stalled: false,
      aborted: false,
    }) ?? "",
    /原对话与附件已保留/,
  );
  assert.doesNotMatch(
    classifySendError(new Error("<html>413 Request Entity Too Large</html>"), { stalled: false, aborted: false }) ?? "",
    /nginx|<!DOCTYPE|<html/i,
  );
});
