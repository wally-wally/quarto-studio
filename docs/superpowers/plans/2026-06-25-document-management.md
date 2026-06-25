# Document Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add document creation, sidebar title editing, and document deletion to Quarto Studio.

**Architecture:** Extend the existing repository-service-server action-client component chain. Keep SQLite schema unchanged, add document management methods around existing `documents` rows, and keep all UI state flowing through `WorkspaceState`.

**Tech Stack:** Next.js App Router server actions, React client components, better-sqlite3, Vitest, React Testing Library, lucide-react.

---

## File Structure

- Modify `src/lib/documents/types.ts` to add `CreateDocumentInput`, `RenameDocumentInput`, and `DeleteDocumentInput`.
- Modify `src/lib/documents/repository.ts` to create, rename, and delete documents.
- Modify `src/lib/documents/repository.test.ts` to cover persistence behavior.
- Modify `src/lib/documents/service.ts` to return updated `WorkspaceState` for create, rename, and delete flows.
- Modify `src/lib/documents/service.test.ts` to cover workspace selection rules.
- Modify `src/app/actions.ts` and `src/app/actions.test.ts` to expose server actions.
- Modify `src/components/workspace/types.ts` to type new client actions.
- Modify `src/components/workspace/quarto-workspace.tsx` to wire create, rename, and delete actions.
- Modify `src/components/workspace/document-sidebar.tsx` to add create dialog, inline rename, and delete buttons.
- Modify `src/components/workspace/quarto-workspace.test.tsx` to cover the UI flows.
- Modify `src/app/page.tsx` to pass new server actions.
- Modify `src/app/globals.css` for dialog and sidebar controls.

## Task 1: Repository Document Management

**Files:**
- Modify: `src/lib/documents/types.ts`
- Modify: `src/lib/documents/repository.ts`
- Test: `src/lib/documents/repository.test.ts`

- [ ] **Step 1: Write failing repository tests**

Add tests that assert:

```ts
const created = repository.createDocument({ title: "새 분석 문서" });
expect(created.title).toBe("새 분석 문서");
expect(created.slug).toMatch(/^document-/);
expect(created.content).toContain('title: "새 분석 문서"');
expect(created.renderStatus).toBe("idle");

const second = repository.createDocument({ title: "Quarterly Report" });
const third = repository.createDocument({ title: "Quarterly Report" });
expect(second.slug).toBe("quarterly-report");
expect(third.slug).toBe("quarterly-report-2");

const renamed = repository.renameDocument({
  id: created.id,
  title: "수정된 제목",
});
expect(renamed.title).toBe("수정된 제목");
expect(renamed.slug).toBe(created.slug);

repository.deleteDocument(created.id);
expect(repository.getDocument(created.id)).toBeNull();
```

- [ ] **Step 2: Run repository tests and verify RED**

Run: `pnpm test src/lib/documents/repository.test.ts`

Expected: FAIL because `createDocument`, `renameDocument`, and `deleteDocument` do not exist.

- [ ] **Step 3: Implement repository methods**

Add input types:

```ts
export type CreateDocumentInput = { title: string };
export type RenameDocumentInput = { id: string; title: string; activeDocumentId: string };
export type DeleteDocumentInput = { id: string };
```

Repository behavior:

```ts
createDocument(input: CreateDocumentInput): DocumentRecord
renameDocument(input: Pick<RenameDocumentInput, "id" | "title">): DocumentRecord
deleteDocument(id: string): void
```

`createDocument` trims the title, rejects empty titles, generates a unique slug by checking existing rows, writes default QMD content, and returns the inserted row.

- [ ] **Step 4: Run repository tests and verify GREEN**

Run: `pnpm test src/lib/documents/repository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit repository task**

```bash
git add src/lib/documents/types.ts src/lib/documents/repository.ts src/lib/documents/repository.test.ts
git commit -m "feat: 문서 생성과 삭제 repository 추가"
```

## Task 2: Service and Server Actions

**Files:**
- Modify: `src/lib/documents/service.ts`
- Test: `src/lib/documents/service.test.ts`
- Modify: `src/app/actions.ts`
- Test: `src/app/actions.test.ts`

- [ ] **Step 1: Write failing service and action tests**

Service tests should assert:

```ts
expect(service.createDocument({ title: "새 문서" }).activeDocument.title).toBe("새 문서");
expect(service.renameDocument({ id: "doc-1", title: "새 제목", activeDocumentId: "doc-1" }).activeDocument.title).toBe("새 제목");
expect(service.deleteDocument({ id: "doc-1", activeDocumentId: "doc-1" }).activeDocument.id).toBe("doc-2");
```

Action tests should assert:

```ts
await expect(createDocumentAction({ title: "새 문서" })).resolves.toBe(workspace);
await expect(renameDocumentAction({ id: "doc-1", title: "새 제목", activeDocumentId: "doc-1" })).resolves.toBe(workspace);
await expect(deleteDocumentAction({ id: "doc-1", activeDocumentId: "doc-1" })).resolves.toBe(workspace);
expect(revalidatePath).toHaveBeenCalledWith("/");
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm test src/lib/documents/service.test.ts src/app/actions.test.ts`

Expected: FAIL because service methods and actions do not exist.

- [ ] **Step 3: Implement service and actions**

Add service methods:

```ts
createDocument(input: CreateDocumentInput): WorkspaceState
renameDocument(input: RenameDocumentInput): WorkspaceState
deleteDocument(input: { id: string; activeDocumentId: string }): WorkspaceState
```

Rename selection rule:

```ts
if renamed id !== activeDocumentId, keep activeDocumentId;
else keep renamed document active;
```

Delete selection rules:

```ts
if deleted id !== activeDocumentId, keep activeDocumentId;
else select first document from repository.listDocuments();
if no documents remain, repository.createDocument({ title: "새 문서" });
```

Add matching server actions and call `revalidatePath("/")` for each mutation.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `pnpm test src/lib/documents/service.test.ts src/app/actions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit service/action task**

```bash
git add src/lib/documents/service.ts src/lib/documents/service.test.ts src/app/actions.ts src/app/actions.test.ts
git commit -m "feat: 문서 관리 server action 추가"
```

## Task 3: Sidebar UI Flows

**Files:**
- Modify: `src/components/workspace/types.ts`
- Modify: `src/components/workspace/quarto-workspace.tsx`
- Modify: `src/components/workspace/document-sidebar.tsx`
- Modify: `src/components/workspace/quarto-workspace.test.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write failing UI tests**

Add tests that assert:

```ts
await user.click(screen.getByRole("button", { name: "새 문서 만들기" }));
await user.type(screen.getByLabelText("새 문서 제목"), "새 분석 문서");
await user.click(screen.getByRole("button", { name: "생성" }));
expect(createDocument).toHaveBeenCalledWith({ title: "새 분석 문서" });

await user.click(screen.getByRole("button", { name: "Getting Started 제목 편집" }));
await user.clear(screen.getByLabelText("Getting Started 제목 수정"));
await user.type(screen.getByLabelText("Getting Started 제목 수정"), "수정된 제목");
await user.keyboard("{Enter}");
expect(renameDocument).toHaveBeenCalledWith({ id: "doc-1", title: "수정된 제목", activeDocumentId: "doc-1" });

vi.spyOn(window, "confirm").mockReturnValue(true);
await user.click(screen.getByRole("button", { name: "Getting Started 삭제" }));
expect(deleteDocument).toHaveBeenCalledWith({ id: "doc-1", activeDocumentId: "doc-1" });
```

- [ ] **Step 2: Run UI tests and verify RED**

Run: `pnpm test src/components/workspace/quarto-workspace.test.tsx`

Expected: FAIL because buttons and action props do not exist.

- [ ] **Step 3: Implement UI**

Update `QuartoWorkspace` props with:

```ts
createDocument: CreateDocumentAction;
renameDocument: RenameDocumentAction;
deleteDocument: DeleteDocumentAction;
```

Update `DocumentSidebar` with:

- active `+` icon button.
- modal dialog with title input.
- per-document `Pencil` and `Trash2` icon buttons.
- inline title input that saves on Enter/blur and cancels on Escape.

Update `page.tsx` to pass the new actions.

- [ ] **Step 4: Run UI tests and verify GREEN**

Run: `pnpm test src/components/workspace/quarto-workspace.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit UI task**

```bash
git add src/components/workspace/types.ts src/components/workspace/quarto-workspace.tsx src/components/workspace/document-sidebar.tsx src/components/workspace/quarto-workspace.test.tsx src/app/page.tsx src/app/globals.css
git commit -m "feat: 사이드바 문서 관리 UI 추가"
```

## Task 4: Full Verification and Push

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run full verification**

Run:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
pnpm verify
```

Expected: lint, typecheck, tests, and build all pass.

- [ ] **Step 2: Inspect status and commits**

Run:

```bash
git status --short --branch
git log --oneline origin/main..HEAD
```

Expected: only intentional commits ahead of `origin/main`; no unintended untracked files.

- [ ] **Step 3: Push**

Run:

```bash
git push
```

Expected: `main -> main` push succeeds.
