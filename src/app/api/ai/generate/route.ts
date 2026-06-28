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
  let parts: Awaited<ReturnType<typeof prepareAttachments>>;
  try {
    parts = await prepareAttachments(files, provider);
  } catch (error) {
    console.error("[ai/generate] attachment extraction failed:", error);
    return Response.json(
      { error: "첨부파일 텍스트 추출에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 502 },
    );
  }

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
    providerOptions: buildProviderOptions(provider, model),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    abortSignal: req.signal,
    onError: ({ error }) => {
      console.error("[ai/generate] stream error:", error);
    },
  });

  // NDJSON 프레임으로 응답한다: 텍스트는 {type:"delta",text}, 종료 시 usage를 담은
  // {type:"done",...}. v7의 textStream은 error 청크를 삼키므로(200+부분텍스트로 끝남)
  // fullStream을 직접 소비하고, error 파트에서 controller.error()로 스트림을 종료해
  // 클라이언트 reader.read()가 reject → onError(자동 되돌리기)가 발동하도록 한다.
  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, frame: object) =>
    controller.enqueue(encoder.encode(JSON.stringify(frame) + "\n"));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let usage = { inputTokens: 0, outputTokens: 0 };
      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            send(controller, { type: "delta", text: part.text });
          } else if (part.type === "finish") {
            usage = {
              inputTokens: part.totalUsage.inputTokens ?? 0,
              outputTokens: part.totalUsage.outputTokens ?? 0,
            };
          } else if (part.type === "error") {
            controller.error(
              part.error instanceof Error ? part.error : new Error("AI 생성 중 오류가 발생했습니다."),
            );
            return;
          }
        }
        send(controller, { type: "done", usage, provider, model });
        controller.close();
      } catch (error) {
        controller.error(error instanceof Error ? error : new Error("AI 생성 중 오류가 발생했습니다."));
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
