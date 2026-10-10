import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Interactive0 from "./probability/ch03/ConvolutionDemo";
import Interactive1 from "./probability/ch06/NormalSamplingDemo";
import Interactive2 from "./probability/ch07/MLEExplorer";
import Interactive3 from "./probability/ch03/IndependenceChecker";
import Interactive4 from "./probability/ch02/FuncDistDemo";
import Interactive5 from "./probability/ch05/CLTSimulator";
import Interactive6 from "./probability/ch07/EstimatorComparator";
import Interactive7 from "./probability/ch06/QuantileExplorer";
import Interactive8 from "./probability/ch08/HypTestDemo";
import Interactive9 from "./probability/ch02/RVMapper";
import Interactive10 from "./probability/ch04/CovMatrixDemo";
import Interactive11 from "./probability/ch03/JointDistExplorer";
import Interactive12 from "./probability/ch02/PDFExplorer";
import Interactive13 from "./probability/ch04/ExpectationExplorer";
import Interactive14 from "./probability/ch02/BinomialExplorer";
import Interactive15 from "./probability/ch05/LLNSimulator";
import Interactive16 from "./probability/ch06/StatisticCalculator";
import Interactive17 from "./probability/ch01/ClassicalProbLab";
import Interactive18 from "./probability/ch07/ConfidenceIntervalExplorer";
import Interactive19 from "./probability/ch04/VarianceExplorer";
import Interactive20 from "./probability/ch08/ErrorTypeDemo";
import Interactive21 from "./probability/ch05/ChebyshevDemo";
import Interactive22 from "./probability/ch04/CorrelationExplorer";
import Interactive23 from "./probability/ch01/ReliabilityExplorer";
import Interactive24 from "./probability/ch03/ConditionalExplorer";
import Interactive25 from "./probability/ch01/SampleSpaceBuilder";
import Interactive26 from "./chemistry/ch09/RSConfigPractice";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("interactive domain boundaries", () => {
  it.each([{ name: "ConvolutionDemo", Component: Interactive0 },
{ name: "NormalSamplingDemo", Component: Interactive1 },
{ name: "MLEExplorer", Component: Interactive2 },
{ name: "IndependenceChecker", Component: Interactive3 },
{ name: "FuncDistDemo", Component: Interactive4 },
{ name: "CLTSimulator", Component: Interactive5 },
{ name: "EstimatorComparator", Component: Interactive6 },
{ name: "QuantileExplorer", Component: Interactive7 },
{ name: "HypTestDemo", Component: Interactive8 },
{ name: "RVMapper", Component: Interactive9 },
{ name: "CovMatrixDemo", Component: Interactive10 },
{ name: "JointDistExplorer", Component: Interactive11 },
{ name: "PDFExplorer", Component: Interactive12 },
{ name: "ExpectationExplorer", Component: Interactive13 },
{ name: "BinomialExplorer", Component: Interactive14 },
{ name: "LLNSimulator", Component: Interactive15 },
{ name: "StatisticCalculator", Component: Interactive16 },
{ name: "ClassicalProbLab", Component: Interactive17 },
{ name: "ConfidenceIntervalExplorer", Component: Interactive18 },
{ name: "VarianceExplorer", Component: Interactive19 },
{ name: "ErrorTypeDemo", Component: Interactive20 },
{ name: "ChebyshevDemo", Component: Interactive21 },
{ name: "CorrelationExplorer", Component: Interactive22 },
{ name: "ReliabilityExplorer", Component: Interactive23 },
{ name: "ConditionalExplorer", Component: Interactive24 },
{ name: "SampleSpaceBuilder", Component: Interactive25 },
{ name: "RSConfigPractice", Component: Interactive26 }])("$name retains an initial reading view and operable controls", ({ Component }) => {
    const { container } = render(<Component />);
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
    expect(container.querySelector("button,input,textarea")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/undefined|NaN/);
  });
  it("likelihood reacts to manual data and changes its distribution model", () => {
    const { container } = render(<Interactive2 />);
    fireEvent.change(container.querySelector("textarea")!, { target: { value: "1, 1, 1, 1" } });
    expect(screen.getAllByText("1.0000").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "伯努利分布 B(p)" }));
    expect(screen.getAllByText(/p（成功概率）/).length).toBeGreaterThan(0);
    expect(container.querySelector("svg path")).toBeInTheDocument();
  });
});
