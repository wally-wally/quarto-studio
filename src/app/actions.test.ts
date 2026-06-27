import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDocumentAction,
  deleteDocumentAction,
  getRenderJobAction,
  renderDocumentAction,
  renameDocumentAction,
  saveDocumentAction,
  selectDocumentAction,
} from "./actions";
import { createAppDocumentService } from "@/lib/db/app-service";
import { revalidatePath } from "next/cache";
import type {
  CreateDocumentInput,
  DeleteDocumentInput,
  RenderJobRecord,
  RenameDocumentInput,
  SaveDocumentInput,
} from "@/lib/documents/types";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db/app-service", () => ({
  createAppDocumentService: vi.fn(),
}));

const documentInput: SaveDocumentInput = {
  id: "doc-1",
  title: "Draft",
  slug: "draft",
  content: "# Draft",
  executeCode: false,
};
const createInput: CreateDocumentInput = {
  title: "새 문서",
};
const renameInput: RenameDocumentInput = {
  id: "doc-1",
  title: "수정된 제목",
  activeDocumentId: "doc-1",
};
const deleteInput: DeleteDocumentInput = {
  id: "doc-1",
  activeDocumentId: "doc-1",
};

const workspace = {
  documents: [
    {
      id: "doc-1",
      title: "Draft",
      slug: "draft",
      executeCode: false,
      renderStatus: "idle",
      updatedAt: "2026-06-24T00:00:00.000Z",
      renderedAt: null,
    },
  ],
  activeDocument: {
    ...documentInput,
    renderStatus: "idle",
    latestArtifactId: null,
    renderError: null,
    createdAt: "2026-06-24T00:00:00.000Z",
    updatedAt: "2026-06-24T00:00:00.000Z",
    renderedAt: null,
  },
} as const;

const service = {
  getInitialWorkspace: vi.fn(),
  getWorkspace: vi.fn(),
  createDocument: vi.fn(),
  renameDocument: vi.fn(),
  deleteDocument: vi.fn(),
  saveDocument: vi.fn(),
  renderDocument: vi.fn(),
  getRenderJob: vi.fn(),
};

const mockedCreateAppDocumentService = vi.mocked(createAppDocumentService);
const mockedRevalidatePath = vi.mocked(revalidatePath);

describe("document server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCreateAppDocumentService.mockReturnValue(service);
  });

  it("저장 action은 workspace를 반환하고 루트 경로를 revalidate한다", async () => {
    service.saveDocument.mockResolvedValue(workspace);

    await expect(saveDocumentAction(documentInput)).resolves.toBe(workspace);

    expect(service.saveDocument).toHaveBeenCalledWith(documentInput);
    expect(mockedRevalidatePath).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("문서 생성 action은 workspace를 반환하고 루트 경로를 revalidate한다", async () => {
    service.createDocument.mockResolvedValue(workspace);

    await expect(createDocumentAction(createInput)).resolves.toBe(workspace);

    expect(service.createDocument).toHaveBeenCalledWith(createInput);
    expect(mockedRevalidatePath).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("문서 제목 수정 action은 workspace를 반환하고 루트 경로를 revalidate한다", async () => {
    service.renameDocument.mockResolvedValue(workspace);

    await expect(renameDocumentAction(renameInput)).resolves.toBe(workspace);

    expect(service.renameDocument).toHaveBeenCalledWith(renameInput);
    expect(mockedRevalidatePath).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("문서 삭제 action은 workspace를 반환하고 루트 경로를 revalidate한다", async () => {
    service.deleteDocument.mockResolvedValue(workspace);

    await expect(deleteDocumentAction(deleteInput)).resolves.toBe(workspace);

    expect(service.deleteDocument).toHaveBeenCalledWith(deleteInput);
    expect(mockedRevalidatePath).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("렌더 action은 workspace를 반환하고 루트 경로를 revalidate한다", async () => {
    service.renderDocument.mockResolvedValue(workspace);

    await expect(renderDocumentAction(documentInput)).resolves.toBe(workspace);

    expect(service.renderDocument).toHaveBeenCalledWith(documentInput);
    expect(mockedRevalidatePath).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("선택 action은 workspace를 반환하지만 revalidate하지 않는다", async () => {
    service.getWorkspace.mockResolvedValue(workspace);

    await expect(selectDocumentAction("doc-1")).resolves.toBe(workspace);

    expect(service.getWorkspace).toHaveBeenCalledWith("doc-1");
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it("getRenderJob action은 jobId로 RenderJobRecord를 반환한다", async () => {
    const mockJob: RenderJobRecord = {
      id: "job-1",
      documentId: "doc-1",
      status: "queued",
      log: null,
      artifactId: null,
      createdAt: "2026-06-24T00:00:00.000Z",
      finishedAt: null,
    };
    service.getRenderJob.mockResolvedValue(mockJob);

    await expect(getRenderJobAction("job-1")).resolves.toBe(mockJob);

    expect(service.getRenderJob).toHaveBeenCalledWith("job-1");
  });
});
