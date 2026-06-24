import { describe, expect, it } from "vitest";
import { buildQuartoProjectFiles, buildQuartoRenderCommand } from "./project";

describe("buildQuartoProjectFiles", () => {
  it("코드 실행이 꺼진 문서는 execute.eval false로 렌더링한다", () => {
    const files = buildQuartoProjectFiles({
      content: "# Hello",
      executeCode: false,
    });

    expect(files.indexQmd).toBe("# Hello");
    expect(files.quartoYml).toContain("eval: false");
    expect(files.quartoYml).toContain("embed-resources: true");
    expect(files.quartoYml).toContain("format:");
  });

  it("코드 실행이 켜진 문서는 execute.eval true로 렌더링한다", () => {
    const files = buildQuartoProjectFiles({
      content: "# Report",
      executeCode: true,
    });

    expect(files.quartoYml).toContain("eval: true");
  });
});

describe("buildQuartoRenderCommand", () => {
  it("단일 index.qmd HTML 렌더링 명령을 만든다", () => {
    expect(buildQuartoRenderCommand()).toEqual([
      "quarto",
      ["render", "index.qmd", "--to", "html"],
    ]);
  });
});
