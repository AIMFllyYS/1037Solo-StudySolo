import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import AttachmentPreviewViewer, { htmlPreviewCsp, prepareHtmlPreview } from "./AttachmentPreviewViewer";
import { openAttachmentPreview } from "@/lib/chat/openAttachmentPreview";
import { useWindowManager } from "@/lib/hooks/useWindowManager";
import { OPAQUE_ORIGIN_STORAGE_SHIM_MARKER } from "@/lib/sandbox/opaqueOriginStorageShim";
import { downloadHtmlFile } from "@/lib/utils/downloadHtml";

vi.mock("@/lib/utils/downloadHtml", () => ({ downloadHtmlFile: vi.fn() }));

const LESSON_HTML =
  '<!doctype html><html><head><title>课程</title></head><body><script>document.body.dataset.ready = "yes";</script><h1>力学</h1></body></html>';

function cspMetaOf(srcdoc: string): string {
  return /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(srcdoc)?.[1] ?? "";
}

describe("AttachmentPreviewViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  });

  it("renders uploaded HTML with scripts enabled but no remote sources", () => {
    openAttachmentPreview("html", { name: "lesson.html", mimeType: "text/html", kind: "html", content: LESSON_HTML });
    render(<AttachmentPreviewViewer />);

    const frame = screen.getByTitle("lesson.html");
    expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-popups allow-forms allow-modals allow-downloads");
    // opaque origin 是这套方案的安全底座：拿到 same-origin 就能碰父文档与 cookie。
    expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
    const srcdoc = frame.getAttribute("srcdoc") ?? "";
    expect(srcdoc).toContain("script-src 'unsafe-inline'");
    expect(srcdoc).toContain(OPAQUE_ORIGIN_STORAGE_SHIM_MARKER);
    expect(srcdoc).toContain("<h1>力学</h1>");
    expect(srcdoc).not.toContain("https:");
    // 附件窗不再挂「仅本地」徽标：它会给每种文档白加一条空标题栏，联网状态由开关自身表达。
    expect(screen.queryByText("仅本地")).not.toBeInTheDocument();
    expect(screen.getByTitle("仅本地预览 · 点击允许联网")).toHaveAttribute("aria-pressed", "false");
  });

  it("lets the user turn the network on and back off", () => {
    openAttachmentPreview("html", { name: "lesson.html", mimeType: "text/html", kind: "html", content: LESSON_HTML });
    render(<AttachmentPreviewViewer />);

    const toggle = screen.getByTitle("仅本地预览 · 点击允许联网");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);

    const frame = screen.getByTitle("lesson.html");
    expect(frame.getAttribute("srcdoc")).toContain("https:");
    expect(screen.getByTitle("已允许联网 · 点击改回仅本地")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByTitle("已允许联网 · 点击改回仅本地"));
    expect(screen.getByTitle("仅本地预览 · 点击允许联网")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTitle("lesson.html").getAttribute("srcdoc")).not.toContain("https:");
  });

  it("downloads the uploaded HTML from the window actions", () => {
    openAttachmentPreview("html", { name: "lesson.html", mimeType: "text/html", kind: "html", content: LESSON_HTML });
    render(<AttachmentPreviewViewer />);

    fireEvent.click(screen.getByTitle("下载 HTML"));
    expect(downloadHtmlFile).toHaveBeenCalledWith(LESSON_HTML, "lesson.html");
  });

  it("uses the shared macOS minimize control and keeps a taskbar-restorable window", () => {
    openAttachmentPreview("pdf", {
      name: "lecture.pdf", mimeType: "application/pdf", kind: "pdf",
      content: "blob:http://localhost/test-pdf",
    });
    render(<AttachmentPreviewViewer />);

    const win = screen.getByTestId("attachment-preview-window");
    expect(win).toBeInTheDocument();
    expect(screen.getByTestId("document-workspace-resize-handle")).toBeVisible();
    fireEvent.click(screen.getByTitle("最小化"));
    expect(useWindowManager.getState().windows[0]?.minimized).toBe(true);
    expect(win).toHaveStyle({ display: "none" });
  });

  it("reuses the shared Markdown renderer for .md previews", () => {
    openAttachmentPreview("md", {
      name: "outline.md", mimeType: "text/markdown", kind: "markdown",
      content: "# 复习提纲\n\n- 第一章",
    });
    render(<AttachmentPreviewViewer />);
    expect(screen.getByRole("heading", { name: "复习提纲" })).toBeVisible();
    expect(screen.getByText("第一章")).toBeVisible();
    // Markdown 目录以前是固定宽度、拖不动；现在所有工作区共用同一套可拖拽外壳。
    expect(screen.getByTestId("document-workspace-resize-handle")).toBeVisible();
  });

  it("shows PPTX slide text as local slide cards", async () => {
    const archive = zipSync({ "ppt/slides/slide1.xml": strToU8("<p:sld><a:t>考试重点</a:t></p:sld>") });
    const dataUrl = `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${Buffer.from(archive).toString("base64")}`;
    openAttachmentPreview("pptx", {
      name: "重点.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      kind: "ppt", content: dataUrl,
    });
    render(<AttachmentPreviewViewer />);
    await waitFor(() => {
      expect(screen.getAllByText("考试重点").length).toBeGreaterThan(0);
    });
    expect(screen.getByTestId("document-workspace-resize-handle")).toBeVisible();
  });

  it("does not send a pptx through the PDF renderer even if kind was stored as pdf", async () => {
    const archive = zipSync({ "ppt/slides/slide1.xml": strToU8("<p:sld><a:t>第一页标题</a:t></p:sld>") });
    const dataUrl = `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${Buffer.from(archive).toString("base64")}`;
    openAttachmentPreview("pptx-misfiled", {
      name: "课.slides.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      kind: "pdf",
      content: dataUrl,
    });
    render(<AttachmentPreviewViewer />);
    await waitFor(() => {
      expect(screen.getAllByText("第一页标题").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("无法渲染 PDF")).not.toBeInTheDocument();
    expect(screen.queryByText(/Invalid PDF structure/i)).not.toBeInTheDocument();
  });
});

describe("htmlPreviewCsp", () => {
  it("keeps every remote source out of the default policy", () => {
    const policy = htmlPreviewCsp(false);
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src 'unsafe-inline' 'unsafe-eval' blob:");
    expect(policy).toContain("form-action 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).not.toContain("http:");
  });

  it("only widens the six fetch directives when the network is allowed", () => {
    const policy = htmlPreviewCsp(true);
    expect(policy).toContain("script-src 'unsafe-inline' 'unsafe-eval' blob: https: http:");
    expect(policy).toContain("style-src 'unsafe-inline' https: http:");
    expect(policy).toContain("img-src data: blob: https: http:");
    expect(policy).toContain("font-src data: https: http:");
    expect(policy).toContain("media-src data: blob: https: http:");
    expect(policy).toContain("connect-src data: blob: https: http:");
    // 联网也不放开表单提交与 base 劫持，这两条与「加载 CDN 资源」无关。
    expect(policy).toContain("default-src 'none';");
    expect(policy).toContain("worker-src blob:;");
    expect(policy).toContain("form-action 'none'");
    expect(policy).toContain("base-uri 'none'");
  });
});

describe("prepareHtmlPreview", () => {
  it("inserts the policy right after <head>, before the page's own resources", () => {
    const prepared = prepareHtmlPreview(
      "<html><head><link rel='stylesheet' href='./lesson.css'><title>课程</title></head><body>ok</body></html>",
      { network: false },
    );
    expect(prepared.indexOf("Content-Security-Policy")).toBeLessThan(prepared.indexOf("<link"));
    expect(prepared.indexOf("Content-Security-Policy")).toBeLessThan(prepared.indexOf("<title>"));
    expect(prepared).toContain(OPAQUE_ORIGIN_STORAGE_SHIM_MARKER);
    expect(cspMetaOf(prepared)).toContain("script-src 'unsafe-inline'");
    expect(cspMetaOf(prepared)).not.toContain("<link");
  });

  it("stays idempotent when the same document is prepared twice", () => {
    const once = prepareHtmlPreview(LESSON_HTML, { network: false });
    const twice = prepareHtmlPreview(once, { network: false });
    expect(twice).toBe(once);
    expect(twice.match(/Content-Security-Policy/g)).toHaveLength(1);
    expect(twice.match(new RegExp(OPAQUE_ORIGIN_STORAGE_SHIM_MARKER, "g"))).toHaveLength(1);
  });

  it("still guards documents without a <head>", () => {
    const withHtml = prepareHtmlPreview("<html><body>ok</body></html>", { network: false });
    expect(withHtml.indexOf("Content-Security-Policy")).toBeLessThan(withHtml.indexOf("<body>"));
    expect(withHtml.indexOf(OPAQUE_ORIGIN_STORAGE_SHIM_MARKER)).toBeLessThan(withHtml.indexOf("<body>"));

    const fragment = prepareHtmlPreview("<p>ok</p>", { network: true });
    expect(fragment.indexOf("Content-Security-Policy")).toBeLessThan(fragment.indexOf("<p>"));
    expect(cspMetaOf(fragment)).toContain("https:");
  });
});
