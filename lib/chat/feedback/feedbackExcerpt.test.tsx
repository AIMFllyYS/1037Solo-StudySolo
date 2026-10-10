import { describe, expect, it } from "vitest";
import { MAX_FEEDBACK_EXCERPT_CHARACTERS, MAX_FEEDBACK_TEXT_CHARACTERS, prepareFeedbackExcerpt, prepareFeedbackText } from "./feedbackExcerpt";

describe("prepareFeedbackExcerpt", () => {
  it("collapses whitespace and redacts common contact details and credentials", () => {
    const excerpt = prepareFeedbackExcerpt("Email user@example.com, phone 13800138000, Bearer abc.def and api_key=sk-live-value");
    expect(excerpt).not.toContain("user@example.com");
    expect(excerpt).not.toContain("13800138000");
    expect(excerpt).not.toContain("Bearer abc.def");
    expect(excerpt).not.toContain("api_key=sk-live-value");
    expect(excerpt).toContain("[邮箱已隐藏]");
    expect(excerpt).toContain("[手机号已隐藏]");
    expect(excerpt).toContain("[凭证已隐藏]");
  });

  it("limits the opt-in excerpt by Unicode character count", () => {
    expect(Array.from(prepareFeedbackExcerpt("汉".repeat(800))).length).toBe(MAX_FEEDBACK_EXCERPT_CHARACTERS);
  });

  it("redacts contact details from free text and applies the longer explanation limit", () => {
    const text = prepareFeedbackText("Please review user@example.invalid; Bearer synthetic-token.");
    expect(text).not.toContain("user@example.invalid");
    expect(text).not.toContain("Bearer synthetic-token");
    expect(Array.from(prepareFeedbackText("反馈".repeat(1_200))).length).toBe(MAX_FEEDBACK_TEXT_CHARACTERS);
  });
});
