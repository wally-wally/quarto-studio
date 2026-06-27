import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./system-prompt";

describe("buildSystemPrompt", () => {
  it("핵심 계약을 포함한다", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("format: html");
    expect(prompt).toContain("```{python}");
    expect(prompt).toContain("#|");
    expect(prompt).toContain("numpy");
    expect(prompt).toContain("YAML");
  });

  it("hasAttachments면 첨부 지침을 덧붙인다", () => {
    expect(buildSystemPrompt({ hasAttachments: true })).toContain("첨부");
    expect(buildSystemPrompt({ hasAttachments: false })).not.toContain("첨부 자료");
  });
});
