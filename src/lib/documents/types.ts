export type RenderStatus = "idle" | "rendering" | "success" | "error";

export type DocumentRecord = {
  id: string;
  title: string;
  slug: string;
  content: string;
  executeCode: boolean;
  renderStatus: RenderStatus;
  latestArtifactId: string | null;
  renderError: string | null;
  createdAt: string;
  updatedAt: string;
  renderedAt: string | null;
};

export type DocumentSummary = Pick<
  DocumentRecord,
  | "id"
  | "title"
  | "slug"
  | "executeCode"
  | "renderStatus"
  | "updatedAt"
  | "renderedAt"
>;

export type SaveDocumentInput = {
  id: string;
  title: string;
  slug: string;
  content: string;
  executeCode: boolean;
};

export type CreateDocumentInput = {
  title: string;
};

export type RenameDocumentInput = {
  id: string;
  title: string;
  activeDocumentId: string;
};

export type DeleteDocumentInput = {
  id: string;
  activeDocumentId: string;
};

export type RenderJobRecord = {
  id: string;
  documentId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "timed_out";
  log: string | null;
  artifactId: string | null;
  createdAt: string;
  finishedAt: string | null;
  phase: "preparing" | "executing" | null;
};
