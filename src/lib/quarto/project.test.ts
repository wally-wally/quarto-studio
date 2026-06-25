import { describe, expect, it } from "vitest";
import { buildQuartoProjectFiles, buildQuartoRenderCommand } from "./project";

describe("buildQuartoProjectFiles", () => {
  it("코드 실행이 꺼진 문서는 전역 execute.eval false 없이 렌더링한다", () => {
    const files = buildQuartoProjectFiles({
      content: "# Hello",
      executeCode: false,
    });

    expect(files.indexQmd).toBe("# Hello");
    expect(files.quartoYml).not.toContain("eval: false");
    expect(files.quartoYml).toContain("embed-resources: true");
    expect(files.quartoYml).toContain("format:");
  });

  it("코드 실행이 꺼져도 Mermaid 청크는 렌더링되도록 실행 차단 옵션을 주입하지 않는다", () => {
    const files = buildQuartoProjectFiles({
      content: [
        "```{python}",
        "print('run later')",
        "```",
        "",
        "```{mermaid}",
        "flowchart LR",
        "  A --> B",
        "```",
      ].join("\n"),
      executeCode: false,
    });

    expect(files.indexQmd).toContain(
      "```{python}\n#| eval: false\nprint('run later')",
    );
    expect(files.indexQmd).toContain(
      "```{mermaid}\nflowchart LR\n  A --> B",
    );
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
