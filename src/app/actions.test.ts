import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  renderDocumentAction,
  saveDocumentAction,
  selectDocumentAction,
} from "./actions";
import { createAppDocumentService } from "@/lib/db/app-service";
import { revalidatePath } from "next/cache";
import type { SaveDocumentInput } from "@/lib/documents/types";

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
    renderedHtml: null,
    renderError: null,
    createdAt: "2026-06-24T00:00:00.000Z",
    updatedAt: "2026-06-24T00:00:00.000Z",
    renderedAt: null,
  },
} as const;

const service = {
  getInitialWorkspace: vi.fn(),
  getWorkspace: vi.fn(),
  saveDocument: vi.fn(),
  renderDocument: vi.fn(),
};

const mockedCreateAppDocumentService = vi.mocked(createAppDocumentService);
const mockedRevalidatePath = vi.mocked(revalidatePath);

describe("document server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCreateAppDocumentService.mockReturnValue(service);
  });

  it("저장 action은 workspace를 반환하고 루트 경로를 revalidate한다", async () => {
    service.saveDocument.mockReturnValue(workspace);

    await expect(saveDocumentAction(documentInput)).resolves.toBe(workspace);

    expect(service.saveDocument).toHaveBeenCalledWith(documentInput);
    expect(mockedRevalidatePath).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("렌더 action은 workspace를 반환하고 루트 경로를 revalidate한다", async () => {
    service.renderDocument.mockResolvedValue(workspace);

    await expect(renderDocumentAction(documentInput)).resolves.toBe(workspace);

    expect(service.renderDocument).toHaveBeenCalledWith(documentInput);
    expect(mockedRevalidatePath).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("선택 action은 workspace를 반환하지만 revalidate하지 않는다", async () => {
    service.getWorkspace.mockReturnValue(workspace);

    await expect(selectDocumentAction("doc-1")).resolves.toBe(workspace);

    expect(service.getWorkspace).toHaveBeenCalledWith("doc-1");
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });
});
