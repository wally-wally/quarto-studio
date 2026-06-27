"use client";

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { indentUnit, LanguageDescription } from "@codemirror/language";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";

type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
};

// ```{python} 같은 Quarto 실행 청크도 표준 펜스(```python)처럼 언어 하이라이팅되도록,
// 중괄호를 벗기고 언어 이름을 매칭한다(언어 파서는 필요할 때 lazy-load).
function resolveCodeLanguage(info: string): LanguageDescription | null {
  const name = info.replace(/[{}]/g, "").trim();
  return name ? LanguageDescription.matchLanguageName(languages, name, true) : null;
}

export default function CodeEditor({
  value,
  onChange,
  readOnly = false,
}: CodeEditorProps) {
  const extensions = useMemo(
    () => [
      markdown({ base: markdownLanguage, codeLanguages: resolveCodeLanguage }),
      indentUnit.of("  "), // Tab 한 단계 = 2칸
      keymap.of([indentWithTab]), // Tab 들여쓰기 / Shift+Tab 내어쓰기
      EditorView.lineWrapping,
    ],
    [],
  );

  return (
    <CodeMirror
      className="qmd-codemirror"
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      height="100%"
      extensions={extensions}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        autocompletion: false,
        highlightActiveLine: !readOnly,
      }}
    />
  );
}
