import { streamText, parsePartialJson } from "ai";
import type { ModelMessage, UserContent } from "ai";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveModel, buildProviderOptions } from "@/lib/ai/provider";
import { buildChatSystemPrompt } from "@/lib/ai/system-prompt";
import { chatTools, WRITE_TOOL } from "@/lib/ai/tools";
import { prepareAttachments, type InputFile } from "@/lib/ai/extract";
import { validatePrompt, validateAttachments } from "@/lib/ai/validation";
import type { AiProvider } from "@/lib/ai/settings";

export const maxDuration = 60;

const MAX_OUTPUT_TOKENS = 16_000;

type ChatTurn = { role: "user" | "assistant"; text: string };

function parseMessages(raw: string): ChatTurn[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    for (const m of parsed) {
      if ((m?.role !== "user" && m?.role !== "assistant") || typeof m?.text !== "string") return null;
    }
    if (parsed[parsed.length - 1].role !== "user") return null;
    return parsed as ChatTurn[];
  } catch {
    return null;
  }
}

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
  if (!model) {
    return Response.json({ error: "모델이 지정되지 않았습니다." }, { status: 400 });
  }

  const turns = parseMessages(String(form.get("messages") ?? ""));
  if (!turns) {
    return Response.json({ error: "대화 메시지가 올바르지 않습니다." }, { status: 400 });
  }
  const lastUserText = turns[turns.length - 1].text;
  const promptCheck = validatePrompt(lastUserText);
  if (!promptCheck.ok) {
    return Response.json({ error: promptCheck.error }, { status: 400 });
  }

  const document = String(form.get("document") ?? "");

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
    console.error("[ai/chat] attachment extraction failed:", error);
    return Response.json(
      { error: "첨부파일 텍스트 추출에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 502 },
    );
  }

  // 마지막 user 메시지에만 첨부를 싣는다. 이전 턴은 채팅 텍스트만(과거 첨부는 보관하지 않음).
  const lastContent: UserContent = [{ type: "text", text: lastUserText }];
  for (const part of parts) {
    if (part.kind === "text") {
      lastContent.push({ type: "text", text: `\n\n[첨부: ${part.name}]\n${part.text}` });
    } else if (part.kind === "image") {
      lastContent.push({ type: "file", mediaType: part.mediaType, data: part.bytes, filename: part.name });
    } else {
      lastContent.push({ type: "file", mediaType: "application/pdf", data: part.bytes, filename: part.name });
    }
  }

  const messages: ModelMessage[] = turns.slice(0, -1).map((t) => ({ role: t.role, content: t.text }));
  messages.push({ role: "user", content: lastContent });

  const result = streamText({
    model: resolveModel(provider, apiKey, model),
    system: buildChatSystemPrompt({ hasAttachments: parts.length > 0, document }),
    messages,
    tools: chatTools,
    providerOptions: buildProviderOptions(provider, model),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    abortSignal: req.signal,
    onError: ({ error }) => {
      console.error("[ai/chat] stream error:", error);
    },
  });

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, frame: object) =>
    controller.enqueue(encoder.encode(JSON.stringify(frame) + "\n"));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let usage = { inputTokens: 0, outputTokens: 0 };
      // write_document(전체 작성)의 인자(content)를 생성되는 대로 partial-parse 해서
      // doc-stream 프레임으로 흘려 에디터에 라이브로 써 내려가게 한다.
      // edit_document(부분 치환)는 완성된 tool 프레임으로만 적용한다(부분 치환은 스트리밍 부적합).
      let writeCallId: string | null = null;
      let writeInputBuffer = "";
      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            send(controller, { type: "delta", text: part.text });
          } else if (part.type === "tool-input-start") {
            if (part.toolName === WRITE_TOOL) {
              writeCallId = part.id;
              writeInputBuffer = "";
            }
          } else if (part.type === "tool-input-delta") {
            if (part.id === writeCallId) {
              writeInputBuffer += part.delta;
              const parsed = await parsePartialJson(writeInputBuffer);
              const content = (parsed.value as { content?: unknown } | undefined)?.content;
              if (typeof content === "string") {
                send(controller, { type: "doc-stream", text: content });
              }
            }
          } else if (part.type === "tool-call") {
            writeCallId = null;
            send(controller, { type: "tool", name: part.toolName, input: part.input });
          } else if (part.type === "finish") {
            usage = {
              inputTokens: part.totalUsage?.inputTokens ?? 0,
              outputTokens: part.totalUsage?.outputTokens ?? 0,
            };
          } else if (part.type === "error") {
            controller.error(
              part.error instanceof Error ? part.error : new Error("AI 응답 중 오류가 발생했습니다."),
            );
            return;
          }
        }
        send(controller, { type: "done", usage, provider, model });
        controller.close();
      } catch (error) {
        controller.error(error instanceof Error ? error : new Error("AI 응답 중 오류가 발생했습니다."));
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
