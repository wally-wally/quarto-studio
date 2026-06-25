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
      ...executeConfig,
      "",
    ].join("\n"),
  };
}

export function buildQuartoRenderCommand(): [string, string[]] {
  return ["quarto", ["render", "index.qmd", "--to", "html"]];
}
