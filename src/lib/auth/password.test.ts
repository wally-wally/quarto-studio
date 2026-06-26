import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("비밀번호를 해시한다", async () => {
    const hash = await hashPassword("test-password-123");
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(hash).not.toBe("test-password-123");
  });

  it("올바른 비밀번호를 검증한다", async () => {
    const hash = await hashPassword("correct-horse");
    expect(await verifyPassword("correct-horse", hash)).toBe(true);
  });

  it("잘못된 비밀번호를 거부한다", async () => {
    const hash = await hashPassword("correct-horse");
    expect(await verifyPassword("wrong-horse", hash)).toBe(false);
  });
});
