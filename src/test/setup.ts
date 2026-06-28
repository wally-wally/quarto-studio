import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// 통합 테스트는 TRUNCATE로 모든 테이블을 비우므로, dev/prod와 분리된 '테스트 전용' DB를
// 기본값으로 제공한다(절대 quarto_studio(dev)를 가리키지 않는다). global-setup이 이 DB를
// 생성·마이그레이션하고, src/test/db.ts의 가드가 비-테스트 DB면 TRUNCATE를 막는다.
// 프로덕션 코드(connection.ts)는 DATABASE_URL을 명시적으로 요구한다.
process.env.DATABASE_URL ??=
  "postgres://quarto:quarto@localhost:5432/quarto_studio_test";

// jsdom은 Storage(localStorage) API를 구현하지 않으므로 테스트용 폴리필을 제공한다.
// BYOK 설정·드로어 등 localStorage를 쓰는 클라이언트 코드 테스트에 필요하다.
// globalThis.localStorage 게터를 직접 읽으면 Node 실험적 경고가 나므로, 읽지 않고
// defineProperty로 덮어써 출력을 깨끗하게 유지한다.
{
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
    } as Storage,
  });
}

// 폴리필 store는 워커 단위로 공유되므로, 테스트 간 상태 누수를 막기 위해 매 테스트 후
// 비운다(개별 테스트 파일이 clear()를 잊어도 격리 보장).
afterEach(() => {
  globalThis.localStorage.clear();
});

// jsdom은 scrollIntoView를 구현하지 않으므로 no-op으로 채워 AI 메시지 목록 테스트에서
// "is not a function" 오류를 막는다. Node(비-jsdom) 환경에선 Element 자체가 없으므로 가드.
if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom은 Range.getClientRects/getBoundingClientRect를 구현하지 않아, CodeMirror가
// 스트리밍 중 scrollIntoView로 텍스트 좌표를 측정(measure)할 때 비동기로 던진다.
// 레이아웃을 단언하지 않으므로 빈 결과 스텁으로 헤드리스 측정을 무해화한다.
if (typeof Range !== "undefined") {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = (() => []) as unknown as () => DOMRectList;
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = (() => ({
      x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}),
    })) as unknown as () => DOMRect;
  }
}
