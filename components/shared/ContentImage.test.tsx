import { afterEach, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import displayImages from "@/lib/content-data/display-images.generated.json";
import { useLightbox } from "@/lib/stores/lightbox";
import { ContentImage } from "./ContentImage";

afterEach(() => useLightbox.getState().close());

it("uses a bounded display derivative and opens the unchanged original for detail", () => {
  const source = Object.keys(displayImages)[0];
  const derivative = (displayImages as Record<string, { src: string; width: number }>)[source];
  render(<ContentImage src={source} alt="pathology" />);
  const image = screen.getByRole("button", { name: "pathology" }) as HTMLImageElement;
  expect(image.src).toContain(derivative.src);
  expect(image.width).toBe(derivative.width);
  fireEvent.click(image);
  expect(useLightbox.getState().src).toBe(source);
});

it("falls back to original when a derivative cannot load", () => {
  const source = Object.keys(displayImages)[0];
  render(<ContentImage src={source} alt="medical image" />);
  const image = screen.getByRole("button", { name: "medical image" }) as HTMLImageElement;
  fireEvent.error(image);
  expect(image.src).toContain(source);
  fireEvent.error(image);
  expect(screen.getByRole("img", { name: "medical image" })).toHaveTextContent("medical image");
});
