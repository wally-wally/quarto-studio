import { describe, it, expect } from "vitest";
import { formatRenderedAt } from "./preview-pane";

describe("formatRenderedAt", () => {
  it("UTC ISO를 'YYYY-MM-DD HH:mm:ss'로 포맷한다", () => {
    expect(formatRenderedAt("2026-06-27T12:51:28.276Z")).toBe("2026-06-27 12:51:28");
  });

  it("한 자리 월·일·시·분·초를 0으로 패딩한다", () => {
    expect(formatRenderedAt("2026-01-05T03:07:09.000Z")).toBe("2026-01-05 03:07:09");
  });

  it("파싱할 수 없는 값은 원본을 그대로 반환한다", () => {
    expect(formatRenderedAt("not-a-date")).toBe("not-a-date");
  });
});
