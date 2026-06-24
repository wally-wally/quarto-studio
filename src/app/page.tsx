import { QuartoWorkspace } from "@/components/workspace/quarto-workspace";
import { createAppDocumentService } from "@/lib/db/app-service";
import {
  renderDocumentAction,
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
    />
  );
}
