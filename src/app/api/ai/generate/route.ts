import { streamText } from "ai";
import type { UserContent } from "ai";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveModel, buildProviderOptions } from "@/lib/ai/provider";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { prepareAttachments, type InputFile } from "@/lib/ai/extract";
import { validatePrompt, validateAttachments } from "@/lib/ai/validation";
import type { AiProvider } from "@/lib/ai/settings";

export const maxDuration = 60;

const MAX_OUTPUT_TOKENS = 16_000;

export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const apiKey = req.headers.get("x-provider-key");
  if (!apiKey) {
    return Response.json({ error: "API 키가 필요합니다." }, { status: 400 });
  }

  const form = await req.formData();
  const providerRaw = String(form.get("provider") ?? "");
  if (providerRaw !== "anthropic" && providerRaw !== "openai") {
    return Response.json({ error: "지원하지 않는 프로바이더입니다." }, { status: 400 });
  }
  const provider: AiProvider = providerRaw as AiProvider;
  const model = String(form.get("model") ?? "");
  const prompt = String(form.get("prompt") ?? "");

  if (!model) {
    return Response.json({ error: "모델이 지정되지 않았습니다." }, { status: 400 });
  }

  const promptCheck = validatePrompt(prompt);
  if (!promptCheck.ok) {
    return Response.json({ error: promptCheck.error }, { status: 400 });
  }

  const fileEntries = form.getAll("files").filter((f): f is File => f instanceof File);
  const attachmentCheck = validateAttachments(fileEntries.map((f) => ({ name: f.name, size: f.size })));
  if (!attachmentCheck.ok) {
    return Response.json({ error: attachmentCheck.error }, { status: 400 });
  }

  const files: InputFile[] = await Promise.all(
    fileEntries.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
  );
  const parts = await prepareAttachments(files, provider);

  const content: UserContent = [{ type: "text", text: prompt }];
  for (const part of parts) {
    if (part.kind === "text") {
      content.push({ type: "text", text: `\n\n[첨부: ${part.name}]\n${part.text}` });
    } else if (part.kind === "image") {
      content.push({ type: "file", mediaType: part.mediaType, data: part.bytes, filename: part.name });
    } else {
      // pdf
      content.push({ type: "file", mediaType: "application/pdf", data: part.bytes, filename: part.name });
    }
  }

  const result = streamText({
    model: resolveModel(provider, apiKey, model),
    system: buildSystemPrompt({ hasAttachments: parts.length > 0 }),
    messages: [{ role: "user", content }],
    providerOptions: buildProviderOptions(provider),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    abortSignal: req.signal,
    onError: ({ error }) => {
      console.error("[ai/generate] stream error:", error);
    },
  });

  return new Response(result.textStream.pipeThrough(new TextEncoderStream()), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
