import { describe, expect, it } from "vitest";
import { buildQuartoProjectFiles, buildQuartoRenderCommand, CUSTOM_SCSS } from "./project";

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

  it("코드 실행 시 경고(stderr UserWarning 등)를 출력 문서에 포함하지 않는다(warning: false)", () => {
    const files = buildQuartoProjectFiles({
      content: "# Report",
      executeCode: true,
    });

    expect(files.quartoYml).toContain("warning: false");
  });

  it("넓은 코드는 블록 안에서 가로 스크롤되고 복사 버튼은 우측 상단에 고정되도록 CSS를 주입한다", () => {
    const files = buildQuartoProjectFiles({
      content: "# Hello",
      executeCode: false,
    });

    // pre를 내부 스크롤시키고(overflow-x:auto) 복사 버튼 기준을 비스크롤 div.sourceCode로 둔다
    expect(files.quartoYml).toContain("include-in-header:");
    expect(files.quartoYml).toContain("overflow-x: auto !important");
    expect(files.quartoYml).toContain(
      "div.sourceCode > pre.sourceCode { position: static",
    );
  });

  it("Pretendard CDN을 쓰지 않고 시스템 폰트로 폴백한다(네트워크 차단 sandbox에서 fetch 실패 방지)", () => {
    const files = buildQuartoProjectFiles({ content: "# Hello", executeCode: false });

    expect(files.quartoYml).not.toContain("cdn.jsdelivr.net");
    expect(files.quartoYml).not.toContain("Pretendard");
    expect(files.quartoYml).toContain(
      '--bs-body-font-family: -apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif;',
    );
  });

  it("cosmo 테마의 Google Fonts import를 막기 위해 custom.scss를 theme 리스트 맨 앞에 둔다", () => {
    const files = buildQuartoProjectFiles({ content: "# Hello", executeCode: false });

    expect(files.quartoYml).toContain("theme: [custom.scss, cosmo]");
  });

  it("CUSTOM_SCSS는 $web-font-path를 false로 오버라이드하는 scss:rules 블록이다", () => {
    expect(CUSTOM_SCSS).toContain("/*-- scss:rules --*/");
    expect(CUSTOM_SCSS).toContain("$web-font-path: false;");
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
