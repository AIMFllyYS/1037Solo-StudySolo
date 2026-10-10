import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CDFVisualizer from "./ch02/CDFVisualizer";
import MarginalExplorer from "./ch03/MarginalExplorer";
import SamplingDistExplorer from "./ch06/SamplingDistExplorer";
import MomentEstimator from "./ch07/MomentEstimator";
import MeanTestExplorer from "./ch08/MeanTestExplorer";
import VarianceTestExplorer from "./ch08/VarianceTestExplorer";
import PDFExplorer from "./ch02/PDFExplorer";
import ErrorTypeDemo from "./ch08/ErrorTypeDemo";
import HypTestDemo from "./ch08/HypTestDemo";
import JointDistExplorer from "./ch03/JointDistExplorer";
import MLEExplorer from "./ch07/MLEExplorer";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function numberInput(label: string): HTMLInputElement {
  const input = screen.getByText(label, { exact: true }).parentElement?.querySelector("input");
  if (!input) throw new Error(`Missing input for ${label}`);
  return input;
}

describe("probability interactives after responsibility split", () => {
  it.each([
    { name: "density", Component: PDFExplorer },
    { name: "error types", Component: ErrorTypeDemo },
    { name: "hypothesis test", Component: HypTestDemo },
    { name: "joint distribution", Component: JointDistExplorer },
    { name: "maximum likelihood", Component: MLEExplorer },
  ])("shared numeric consumer $name still mounts its controls", ({ Component }) => {
    const { container } = render(<Component />);
    expect(container.querySelector("h3")).toBeInTheDocument();
    expect(container.querySelector("button,input")).toBeInTheDocument();
  });
  it("CDF scene keeps SVG drag linked to state and stops on mouseup", () => {
    const { container } = render(<CDFVisualizer />);
    fireEvent.click(screen.getByRole("button", { name: "连续 N(μ, σ²)" }));
    expect(screen.getAllByText("0.5000").length).toBeGreaterThan(0);
    const svg = container.querySelector("svg")!;
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width: 540, height: 200, right: 540, bottom: 200, toJSON: () => ({}) });
    const handle = svg.querySelector('g[style*="ew-resize"]')!;
    fireEvent.mouseDown(handle, { clientX: 284 });
    fireEvent.mouseMove(window, { clientX: 343 });
    fireEvent.mouseUp(window);
    expect(screen.getAllByText("0.8413").length).toBeGreaterThan(0);
    fireEvent.mouseMove(window, { clientX: 400 });
    expect(screen.getAllByText("0.8413").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /CDF/ }));
    expect(svg.textContent).toContain("F(x)");
    fireEvent.click(screen.getByRole("button", { name: "连续 Exp(λ)" }));
    expect(screen.getAllByText("0.6321").length).toBeGreaterThan(0);
  });

  it("mean-test controls update statistics and retain t-test selection", () => {
    render(<MeanTestExplorer />);
    fireEvent.change(numberInput("样本均值 X̄"), { target: { value: "100" } });
    expect(screen.getAllByText("1.0000").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /t\s*检验/ }));
    expect(screen.getByText("T 值", { exact: true })).toBeVisible();
    expect(screen.getAllByText("1.0000").length).toBeGreaterThan(0);
  });

  it("variance-test controls preserve the sample-degree statistic", () => {
    render(<VarianceTestExplorer />);
    fireEvent.change(numberInput("样本量 n"), { target: { value: "10" } });
    fireEvent.change(numberInput("假设方差 σ₀²"), { target: { value: "1" } });
    fireEvent.change(numberInput("样本方差 S²"), { target: { value: "2" } });
    expect(screen.getAllByText("18.0000").length).toBeGreaterThan(0);
  });

  it("sampling distribution switches between chi-square, t and F plots", () => {
    const { container } = render(<SamplingDistExplorer />);
    fireEvent.click(screen.getByRole("button", { name: "t(n)" }));
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.getAllByText(/自由度 n = 5/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "F(m,n)" }));
    expect(screen.getAllByText(/自由度 m = 5, n = 10/).length).toBeGreaterThan(0);
  });

  it("moment estimation parses manual samples and updates the estimate", () => {
    render(<MomentEstimator />);
    fireEvent.change(screen.getByPlaceholderText("输入样本值，逗号/空格分隔"), { target: { value: "1，2；3" } });
    expect(screen.getAllByText("0.500").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2.0000").length).toBeGreaterThan(0);
  });

  it("marginal explorer retains the distinct joint-distribution counterexample", () => {
    render(<MarginalExplorer />);
    fireEvent.click(screen.getByRole("button", { name: "反例：同边缘，异联合" }));
    expect(screen.getByText("联合分布 A", { exact: true })).toBeVisible();
    expect(screen.getByText("联合分布 B", { exact: true })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "主探索器" }));
    expect(screen.getByRole("button", { name: "固定 X → 对 Y 求和" })).toBeVisible();
  });
});
