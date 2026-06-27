type QuartoProjectInput = {
  content: string;
  executeCode: boolean;
};

const codeExecutionEngines = new Set(["python", "r"]);

function disableExecutableCodeChunks(content: string): string {
  return content
    .split("\n")
    .flatMap((line) => {
      const chunkHeader = line.match(
        /^(\s*)(`{3,}|~{3,})\{([A-Za-z][\w-]*)(?=[\s,}])[^}]*\}\s*$/,
      );

      if (!chunkHeader || !codeExecutionEngines.has(chunkHeader[3].toLowerCase())) {
        return [line];
      }

      return [line, `${chunkHeader[1]}#| eval: false`];
    })
    .join("\n");
}

export function buildQuartoProjectFiles(input: QuartoProjectInput) {
  const executeConfig = input.executeCode ? ["execute:", "  eval: true"] : [];

  return {
    indexQmd: input.executeCode
      ? input.content
      : disableExecutableCodeChunks(input.content),
    quartoYml: [
      "project:",
      "  type: default",
      "format:",
      "  html:",
      "    toc: true",
      "    theme: cosmo",
      "    embed-resources: true",
      // 넓은 코드 블록 + 복사 버튼 고정:
      //  1) Quarto 기본은 pre.sourceCode가 overflow:visible이라 넓은 코드가 페이지를 넓힌다.
      //     overflow-x:auto로 덮어 코드가 블록 '안에서' 가로 스크롤되게 한다.
      //  2) 복사 버튼을 스크롤되는 pre가 아니라 비스크롤 컨테이너(div.sourceCode) 기준으로
      //     고정해, 가로 스크롤 중에도 블록 우측 상단에 계속 머무르게 한다.
      "    include-in-header:",
      "      text: |",
      "        <style>",
      "        div.sourceCode { position: relative; }",
      "        div.sourceCode > pre.sourceCode { position: static; overflow-x: auto !important; }",
      "        </style>",
      ...executeConfig,
      "",
    ].join("\n"),
  };
}

export function buildQuartoRenderCommand(): [string, string[]] {
  return ["quarto", ["render", "index.qmd", "--to", "html"]];
}
