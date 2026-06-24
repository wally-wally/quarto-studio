type QuartoProjectInput = {
  content: string;
  executeCode: boolean;
};

export function buildQuartoProjectFiles(input: QuartoProjectInput) {
  return {
    indexQmd: input.content,
    quartoYml: [
      "project:",
      "  type: default",
      "format:",
      "  html:",
      "    toc: true",
      "    theme: cosmo",
      "    embed-resources: true",
      "execute:",
      `  eval: ${input.executeCode ? "true" : "false"}`,
      "",
    ].join("\n"),
  };
}

export function buildQuartoRenderCommand(): [string, string[]] {
  return ["quarto", ["render", "index.qmd", "--to", "html"]];
}
