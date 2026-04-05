"use client";

import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

type MessageContentProps = {
  content: string;
  rich?: boolean;
};

const sanitizeSchema: Parameters<typeof rehypeSanitize>[0] = {
  ...defaultSchema,
  tagNames: [
    "a",
    "article",
    "blockquote",
    "br",
    "code",
    "del",
    "details",
    "div",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "kbd",
    "li",
    "mark",
    "ol",
    "p",
    "pre",
    "section",
    "span",
    "strong",
    "sub",
    "summary",
    "sup",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
  ],
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), "target", "rel"],
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^language-[\w-]+$/],
    ],
  },
};

function ExternalLink({
  node: _node,
  href,
  children,
  ...props
}: ComponentProps<"a"> & { node?: unknown }) {
  return (
    <a
      {...props}
      href={href}
      rel="noreferrer nofollow"
      target="_blank"
    >
      {children}
    </a>
  );
}

function MarkdownTable({
  node: _node,
  children,
  ...props
}: ComponentProps<"table"> & { node?: unknown }) {
  return (
    <div className="message-table">
      <table {...props}>{children}</table>
    </div>
  );
}

export function MessageContent({
  content,
  rich = false,
}: MessageContentProps) {
  if (!rich) {
    return <p className="message-text">{content}</p>;
  }

  return (
    <div className="message-body">
      <ReactMarkdown
        components={{
          a: ExternalLink,
          table: MarkdownTable,
        }}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        remarkPlugins={[remarkGfm, remarkBreaks]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
