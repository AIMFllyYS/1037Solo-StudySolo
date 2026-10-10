import assert from "node:assert/strict";
import { test } from "node:test";
import { createStreamUiThrottle } from "./streamUiThrottle.ts";

test("streamUiThrottle：窗口内多次 schedule 只执行最后一次 write", async () => {
  let count = 0;
  let last = "";
  const throttle = createStreamUiThrottle(40);

  throttle.schedule(() => {
    count += 1;
    last = "a";
  });
  throttle.schedule(() => {
    count += 1;
    last = "b";
  });
  throttle.schedule(() => {
    count += 1;
    last = "c";
  });

  assert.equal(count, 0);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(count, 1);
  assert.equal(last, "c");
});

test("streamUiThrottle：flush 立即执行挂起 write", () => {
  let count = 0;
  const throttle = createStreamUiThrottle(1000);
  throttle.schedule(() => {
    count += 1;
  });
  throttle.flush();
  assert.equal(count, 1);
});
