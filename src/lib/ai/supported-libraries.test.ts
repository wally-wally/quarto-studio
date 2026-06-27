import { describe, it, expect } from "vitest";
import {
  PYTHON_LIBRARIES,
  R_LIBRARIES,
  JULIA_LIBRARIES,
  formatSupportedLibraries,
} from "./supported-libraries";

describe("supported-libraries", () => {
  it("핵심 라이브러리를 포함한다", () => {
    expect(PYTHON_LIBRARIES).toContain("pandas");
    expect(PYTHON_LIBRARIES).toContain("matplotlib");
    expect(R_LIBRARIES).toContain("ggplot2");
    expect(JULIA_LIBRARIES).toContain("Plots");
  });

  it("formatSupportedLibraries는 세 언어 줄과 라이브러리 이름을 담는다", () => {
    const text = formatSupportedLibraries();
    expect(text).toContain("Python:");
    expect(text).toContain("R:");
    expect(text).toContain("Julia:");
    expect(text).toContain("numpy");
    expect(text).toContain("DataFrames");
  });
});
