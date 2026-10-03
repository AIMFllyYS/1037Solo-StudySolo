import assert from "node:assert/strict";
import test from "node:test";
import { gmailMime, mailHtmlText, eventBody } from "./api.server";
import { selectedPdfText } from "./pdf.server";

test("long Unicode MIME subjects and bodies fold correctly without header injection", () => {
  const raw = Buffer.from(gmailMime({ to: "recipient@example.test", subject: "学习计划".repeat(30), body: "学习材料\n".repeat(100) }, "sender@example.test"), "base64url").toString("utf8");
  assert.ok(raw.startsWith("From: sender@example.test\r\nTo: recipient@example.test"));
  assert.ok(raw.split("\r\n").every(line => line.length <= 998));
  const body = raw.split("\r\n\r\n")[1].replace(/\s/g, "");
  assert.equal(Buffer.from(body, "base64").toString("utf8"), "学习材料\n".repeat(100));
});
test("HTML-only mail yields readable text and calendar times require an explicit offset", () => {
  assert.equal(mailHtmlText("<style>hidden</style><p>课程 &amp; 作业</p><script>hidden()</script><p>&#x590D;习</p>"), "课程 & 作业\n复习");
  assert.throws(() => eventBody({ summary: "study", start: "2026-10-04 10:00:00", end: "2026-10-04 11:00:00", timeZone: "UTC" }, "fixture"), /INVALID_EVENT_TIME/);
});
test("selected PDFs extract bounded page text without enabling document scripts", async () => {
  const content = "BT /F1 12 Tf 10 20 Td (StudySolo fixture) Tj ET";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(source)); source += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(source);
  source += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const result = await selectedPdfText(new Uint8Array(Buffer.from(source)), 1, 1);
  assert.equal(result.totalPages, 1); assert.equal(result.pages[0].text, "StudySolo fixture"); assert.equal(result.morePages, false);
});
