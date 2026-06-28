import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildChatSystemPrompt } from "./system-prompt";

describe("buildSystemPrompt", () => {
  it("핵심 계약을 포함한다", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("format: html");
    expect(prompt).toContain("```{python}");
    expect(prompt).toContain("```{r}");
    expect(prompt).toContain("```{julia}");
    expect(prompt).toContain("#|");
    expect(prompt).toContain("numpy");
    expect(prompt).toContain("YAML");
  });

  it("hasAttachments면 첨부 지침을 덧붙인다", () => {
    expect(buildSystemPrompt({ hasAttachments: true })).toContain("첨부 자료");
    expect(buildSystemPrompt({ hasAttachments: false })).not.toContain("첨부 자료");
  });
});

describe("buildChatSystemPrompt", () => {
  it("대화형 역할과 '잡담엔 도구 호출 금지' 규칙을 담는다", () => {
    const p = buildChatSystemPrompt({});
    expect(p).toContain("대화");
    expect(p).toContain("도구");
    // 인사/잡담에는 도구를 호출하지 말라는 취지의 지시가 있어야 한다
    expect(p).toMatch(/인사|잡담/);
  });

  it("두 도구 이름과 사용 시점을 안내한다", () => {
    const p = buildChatSystemPrompt({});
    expect(p).toContain("write_document");
    expect(p).toContain("edit_document");
  });

  it("지원 라이브러리 계약을 포함한다", () => {
    const p = buildChatSystemPrompt({});
    expect(p).toContain("Python");
    expect(p).toContain("matplotlib");
  });

  it("현재 문서를 라벨된 블록으로 주입한다", () => {
    const p = buildChatSystemPrompt({ document: "# 내 문서\n본문" });
    expect(p).toContain("현재 문서");
    expect(p).toContain("# 내 문서");
  });

  it("빈 문서면 '비어 있음'을 알린다", () => {
    const p = buildChatSystemPrompt({ document: "" });
    expect(p).toContain("비어 있");
  });

  it("첨부가 있으면 첨부 근거 지시를 덧붙인다", () => {
    const p = buildChatSystemPrompt({ hasAttachments: true });
    expect(p).toContain("첨부");
  });
});
