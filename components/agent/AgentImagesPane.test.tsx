import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AgentImagesPane from "./AgentImagesPane";
import { translate } from "@/lib/i18n";
import type { AgentImageItem } from "@/lib/agent/sessionImages";
import { useLightbox } from "@/lib/stores/workspace/lightbox";

const zh = (key: string) => translate("zh", key);

const images: AgentImageItem[] = [
  { id: "web:1", kind: "web", src: "https://img.example/1.jpg", title: "细胞膜", query: "细胞膜" },
  { id: "gen:1:0", kind: "generated", src: "data:image/png;base64,AAA", title: "示意图" },
];

afterEach(() => {
  cleanup();
  useLightbox.getState().close();
});

describe("AgentImagesPane", () => {
  it("explains the empty state", () => {
    render(<AgentImagesPane images={[]} />);
    expect(screen.getByTestId("agent-images-empty")).toBeVisible();
    expect(screen.getByText(zh("agent.images.empty"))).toBeVisible();
  });

  it("groups generated images separately from searched ones", () => {
    render(<AgentImagesPane images={images} />);
    expect(screen.getByText(zh("agent.images.generated"))).toBeVisible();
    expect(screen.getByText(zh("agent.images.search"))).toBeVisible();
  });

  it("opens the shared lightbox when an image is clicked", () => {
    render(<AgentImagesPane images={images} />);
    fireEvent.click(screen.getByText("细胞膜"));
    expect(useLightbox.getState().src).toBe("https://img.example/1.jpg");
  });
});
