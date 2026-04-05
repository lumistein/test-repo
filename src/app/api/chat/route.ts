import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type UpstreamTextPart = {
  text?: string;
  type?: string;
};

type UpstreamStreamPayload = {
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
    message?: {
      content?: unknown;
    };
  }>;
};

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function sanitizeMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((message) => {
      if (
        !message ||
        typeof message !== "object" ||
        !("role" in message) ||
        !("content" in message)
      ) {
        return null;
      }

      const role =
        message.role === "assistant" || message.role === "system"
          ? message.role
          : "user";

      return {
        role,
        content: String(message.content ?? "").trim(),
      } satisfies ChatMessage;
    })
    .filter((message): message is ChatMessage => Boolean(message?.content))
    .slice(-16);
}

function extractAssistantText(content: unknown) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part && typeof part === "object" && "text" in part) {
          return String((part as UpstreamTextPart).text ?? "");
        }

        return "";
      })
      .join("");
  }

  return "";
}

function parseSseEvent(rawEvent: string) {
  const data = rawEvent
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");

  if (!data) {
    return { done: false, text: "" };
  }

  if (data === "[DONE]") {
    return { done: true, text: "" };
  }

  try {
    const payload = JSON.parse(data) as UpstreamStreamPayload;

    return {
      done: false,
      text:
        extractAssistantText(payload.choices?.[0]?.delta?.content) ||
        extractAssistantText(payload.choices?.[0]?.message?.content),
    };
  } catch {
    return { done: false, text: "" };
  }
}

export async function POST(request: Request) {
  try {
    const { messages } = (await request.json()) as { messages?: unknown };
    const chatMessages = sanitizeMessages(messages);

    if (chatMessages.length === 0) {
      return NextResponse.json(
        { error: "보낼 메시지를 먼저 입력해주세요." },
        { status: 400 },
      );
    }

    const endpoint = getRequiredEnv("UPSTREAM_CHAT_COMPLETIONS_URL");
    const model = getRequiredEnv("UPSTREAM_MODEL");
    const apiKey = process.env.UPSTREAM_API_KEY ?? "none";

    const upstreamResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: chatMessages,
        temperature: 0.85,
        stream: true,
      }),
      cache: "no-store",
    });

    if (!upstreamResponse.ok) {
      const details = await upstreamResponse.text();

      return NextResponse.json(
        {
          error: "모델 서버에서 응답을 가져오지 못했습니다.",
          details: details.slice(0, 400),
        },
        { status: upstreamResponse.status },
      );
    }

    const contentType = upstreamResponse.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const payload = (await upstreamResponse.json()) as UpstreamStreamPayload;
      const reply = extractAssistantText(payload.choices?.[0]?.message?.content);

      if (!reply.trim()) {
        return NextResponse.json(
          { error: "모델 응답을 해석하지 못했습니다." },
          { status: 502 },
        );
      }

      return new Response(reply, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store, no-transform",
        },
      });
    }

    if (!upstreamResponse.body) {
      return NextResponse.json(
        { error: "스트리밍 응답 본문이 비어 있습니다." },
        { status: 502 },
      );
    }

    const upstreamReader = upstreamResponse.body.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = "";

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await upstreamReader.read();

            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            buffer = buffer.replace(/\r\n/g, "\n");

            let separatorIndex = buffer.indexOf("\n\n");

            while (separatorIndex !== -1) {
              const rawEvent = buffer.slice(0, separatorIndex).trim();
              buffer = buffer.slice(separatorIndex + 2);

              const event = parseSseEvent(rawEvent);

              if (event.text) {
                controller.enqueue(encoder.encode(event.text));
              }

              if (event.done) {
                controller.close();
                return;
              }

              separatorIndex = buffer.indexOf("\n\n");
            }
          }

          buffer += decoder.decode();

          const trailingEvent = parseSseEvent(buffer.trim());

          if (trailingEvent.text) {
            controller.enqueue(encoder.encode(trailingEvent.text));
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          upstreamReader.releaseLock();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "알 수 없는 서버 오류가 발생했습니다.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
