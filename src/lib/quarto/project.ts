type QuartoProjectInput = {
  content: string;
  executeCode: boolean;
};

const codeExecutionEngines = new Set(["python", "r"]);

// cosmo(Bootswatch) 테마는 기본으로 Google Fonts(fonts.googleapis.com)를 @import한다.
// 렌더 sandbox는 networkBlockAll이라 embed-resources가 이 리소스를 fetch하려다 DNS
// 실패로 매 렌더마다 지연을 유발한다. $web-font-path를 false로 오버라이드해 이 import
// 자체를 SCSS 컴파일 단계에서 없앤다. theme 리스트에서 이 파일이 테마 이름보다 앞에
// 와야 오버라이드가 적용된다(scss:rules는 테마의 defaults보다 뒤에 평가되어야 함).
export const CUSTOM_SCSS = "/*-- scss:rules --*/\n$web-font-path: false;\n";

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
  // 코드 실행 시: 실행은 켜되(eval), 경고(matplotlib 글리프 경고 등 stderr UserWarning)는
  // 렌더된 문서 출력에 섞이지 않게 한다(warning: false). #| echo: false는 코드만 숨길 뿐
  // 경고는 별도 옵션이라, 보고서 산출물이 깔끔하도록 전역 기본으로 끈다.
  const executeConfig = input.executeCode
    ? ["execute:", "  eval: true", "  warning: false"]
    : [];

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
      "    theme: [custom.scss, cosmo]",
      "    embed-resources: true",
      // 넓은 코드 블록 + 복사 버튼 고정:
      //  1) Quarto 기본은 pre.sourceCode가 overflow:visible이라 넓은 코드가 페이지를 넓힌다.
      //     overflow-x:auto로 덮어 코드가 블록 '안에서' 가로 스크롤되게 한다.
      //  2) 복사 버튼을 스크롤되는 pre가 아니라 비스크롤 컨테이너(div.sourceCode) 기준으로
      //     고정해, 가로 스크롤 중에도 블록 우측 상단에 계속 머무르게 한다.
      "    include-in-header:",
      "      text: |",
      "        <script>",
      "        // 미리보기는 보안상 sandbox(allow-same-origin 없음)라 localStorage 접근이 막힌다.",
      "        // Quarto 번들 JS가 localStorage를 읽다 SecurityError를 던지므로, 무해한 no-op으로 가린다.",
      "        (function(){try{var s={getItem:function(){return null},setItem:function(){},removeItem:function(){},clear:function(){},key:function(){return null},length:0};Object.defineProperty(window,'localStorage',{value:s,configurable:true});Object.defineProperty(window,'sessionStorage',{value:s,configurable:true});}catch(e){}})();",
      "        </script>",
      "        <style>",
      "        div.sourceCode { position: relative; }",
      "        div.sourceCode > pre.sourceCode { position: static; overflow-x: auto !important; }",
      "        </style>",
      // 본문 폰트는 시스템 한글 폰트로 폴백한다. 렌더 sandbox는 네트워크가 차단되어
      // 있어(networkBlockAll) 커스텀 웹폰트 CDN을 embed-resources가 fetch하면 DNS
      // 실패로 렌더가 지연된다(예전엔 Pretendard CDN을 썼음).
      "        <style>",
      '        :root { --bs-body-font-family: -apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif; }',
      "        body, h1, h2, h3, h4, h5, h6 { font-family: var(--bs-body-font-family); }",
      "        </style>",
      ...executeConfig,
      "",
    ].join("\n"),
  };
}

export function buildQuartoRenderCommand(): [string, string[]] {
  return ["quarto", ["render", "index.qmd", "--to", "html"]];
}
