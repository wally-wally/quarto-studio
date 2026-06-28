export type DocEdit = { find: string; replace: string };
export type EditResult = { find: string; ok: boolean };

/**
 * content에 edits를 순차로 적용한다. 각 edit는 현재 작업 문자열에서 find의 첫 일치를
 * replace로 치환한다. find가 비었거나 일치가 없으면 그 edit는 스킵하고 ok:false로 기록한다.
 * 순차 적용이므로 앞선 치환 결과가 뒤 edit의 탐색 대상이 된다.
 */
export function applyEdits(
  content: string,
  edits: DocEdit[],
): { content: string; results: EditResult[] } {
  let working = content;
  const results: EditResult[] = [];
  for (const edit of edits) {
    if (!edit.find) {
      results.push({ find: edit.find, ok: false });
      continue;
    }
    const at = working.indexOf(edit.find);
    if (at === -1) {
      results.push({ find: edit.find, ok: false });
      continue;
    }
    working = working.slice(0, at) + edit.replace + working.slice(at + edit.find.length);
    results.push({ find: edit.find, ok: true });
  }
  return { content: working, results };
}
