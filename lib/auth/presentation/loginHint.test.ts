import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_LOGIN_REQUIRED_MESSAGE, formatLoginRequiredError, isLoginRequiredError } from "./loginHint.ts";

test("loginHint：Unauthorized 与 401 走登录说明，模型密钥 401 不改写", () => {
  assert.equal(isLoginRequiredError("Unauthorized"), true);
  assert.equal(formatLoginRequiredError("Unauthorized"), AI_LOGIN_REQUIRED_MESSAGE);
  assert.match(AI_LOGIN_REQUIRED_MESSAGE, /左下角「设置」/);
  assert.equal(isLoginRequiredError("模型服务拒绝认证（HTTP 401），请检查 API 密钥和模型访问权限。"), false);
});
