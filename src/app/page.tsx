import { QuartoWorkspace } from "@/components/workspace/quarto-workspace";
import { createAppDocumentService } from "@/lib/db/app-service";
import {
  createDocumentAction,
  deleteDocumentAction,
  renderDocumentAction,
  renameDocumentAction,
  saveDocumentAction,
  selectDocumentAction
} from "./actions";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const initialWorkspace = createAppDocumentService().getInitialWorkspace();

  return (
    <QuartoWorkspace
      initialWorkspace={initialWorkspace}
      saveDocument={saveDocumentAction}
      renderDocument={renderDocumentAction}
      selectDocument={selectDocumentAction}
      createDocument={createDocumentAction}
      renameDocument={renameDocumentAction}
      deleteDocument={deleteDocumentAction}
    />
  );
}
