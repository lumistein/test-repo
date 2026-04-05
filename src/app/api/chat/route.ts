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
    return content.trim();
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
      .join("")
      .trim();
  }

  return "";
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
        stream: false,
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

    const payload = (await upstreamResponse.json()) as {
      choices?: Array<{
        message?: {
          content?: unknown;
        };
      }>;
    };
    const reply = extractAssistantText(payload.choices?.[0]?.message?.content);

    if (!reply) {
      return NextResponse.json(
        { error: "모델 응답을 해석하지 못했습니다." },
        { status: 502 },
      );
    }

    return NextResponse.json({ reply });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "알 수 없는 서버 오류가 발생했습니다.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
