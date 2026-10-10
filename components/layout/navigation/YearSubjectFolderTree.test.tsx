import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import YearSubjectFolderTree from "./YearSubjectFolderTree";

afterEach(cleanup);

it("ordinary subject pickers keep year expansion independent of subject selection", () => {
  const select = vi.fn();
  render(<YearSubjectFolderTree selectedId={null} onSelect={select} />);
  fireEvent.click(screen.getByRole("button", { name: "大一下学期" }));
  expect(select).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "概率论与数理统计" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "概率论与数理统计" }));
  expect(select).toHaveBeenCalledWith("probability");
});
