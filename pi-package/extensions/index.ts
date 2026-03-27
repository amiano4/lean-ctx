import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  createBashToolDefinition,
  createReadToolDefinition,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  getLanguageFromPath,
  highlightCode,
  truncateHead,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(PACKAGE_ROOT, "..");
const FORK_BUILD_BIN = resolve(REPO_ROOT, "rust/target/release/lean-ctx");
const USER_INSTALL_BIN = resolve(homedir(), ".local/bin/lean-ctx");

const readSchema = Type.Object({
  path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
  offset: Type.Optional(Type.Number({ description: "Line number to start reading from (1-indexed)" })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
});

const lsSchema = Type.Object({
  path: Type.Optional(Type.String({ description: "Directory to list (default: current directory)" })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of entries to return (default: 500)" })),
});

const findSchema = Type.Object({
  pattern: Type.String({ description: "Glob pattern to match files, e.g. '*.ts', '**/*.json', or 'src/**/*.spec.ts'" }),
  path: Type.Optional(Type.String({ description: "Directory to search in (default: current directory)" })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of results (default: 1000)" })),
});

const grepSchema = Type.Object({
  pattern: Type.String({ description: "Search pattern (regex or literal string)" }),
  path: Type.Optional(Type.String({ description: "Directory or file to search (default: current directory)" })),
  glob: Type.Optional(Type.String({ description: "Filter files by glob pattern, e.g. '*.ts' or '**/*.spec.ts'" })),
  ignoreCase: Type.Optional(Type.Boolean({ description: "Case-insensitive search (default: false)" })),
  literal: Type.Optional(Type.Boolean({ description: "Treat pattern as literal string instead of regex (default: false)" })),
  context: Type.Optional(Type.Number({ description: "Number of lines to show before and after each match (default: 0)" })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of matches to return (default: 100)" })),
});

function shellQuote(value: string): string {
  if (!value) return "''";
  if (/^[A-Za-z0-9_./=:@,+%^-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function resolveLeanCtxBin(): string {
  const envBin = process.env.LEAN_CTX_BIN;
  if (envBin && existsSync(envBin)) return envBin;
  if (existsSync(FORK_BUILD_BIN)) return FORK_BUILD_BIN;
  if (existsSync(USER_INSTALL_BIN)) return USER_INSTALL_BIN;
  return "lean-ctx";
}

function normalizePathArg(path: string): string {
  return path.startsWith("@") ? path.slice(1) : path;
}

function isNativeImageReadPath(path: string) {
  return NATIVE_IMAGE_EXTENSIONS.has(extname(path).toLowerCase());
}

const CODE_EXTENSIONS = new Set([
  ".rs",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".php",
  ".py",
  ".go",
  ".java",
  ".c",
  ".cc",
  ".cpp",
  ".cxx",
  ".cs",
  ".kt",
  ".swift",
  ".rb",
]);

const ALWAYS_FULL_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".json5",
  ".yaml",
  ".yml",
  ".toml",
  ".env",
  ".ini",
  ".xml",
  ".lock",
]);

const NATIVE_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
]);

async function chooseReadMode(path: string): Promise<"full" | "map" | "signatures"> {
  const extension = extname(path).toLowerCase();

  if (ALWAYS_FULL_EXTENSIONS.has(extension)) {
    return "full";
  }

  const fileStat = await stat(path);
  const size = fileStat.size;

  if (!CODE_EXTENSIONS.has(extension)) {
    return size > 48 * 1024 ? "map" : "full";
  }

  if (size >= 160 * 1024) return "signatures";
  if (size >= 24 * 1024) return "map";
  return "full";
}

async function readSlice(path: string, offset?: number, limit?: number) {
  const content = await readFile(path, "utf8");
  const lines = content.split("\n");
  const startLine = offset ? Math.max(0, offset - 1) : 0;
  const endLine = limit ? startLine + limit : lines.length;
  const selected = lines.slice(startLine, endLine).join("\n");
  const truncation = truncateHead(selected, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  return {
    text: truncation.content,
    lines: lines.length,
    truncated: truncation.truncated,
  };
}

function limitTextLines(text: string, limit?: number) {
  if (!limit || limit <= 0) return { text, truncated: false };
  const lines = text.split("\n");
  if (lines.length <= limit) return { text, truncated: false };
  return {
    text: lines.slice(0, limit).join("\n") + `\n\n[Output truncated to ${limit} lines]`,
    truncated: true,
  };
}

function replaceTabs(text: string) {
  return text.replace(/\t/g, "    ");
}

function trimTrailingEmptyLines(lines: string[]) {
  let end = lines.length;
  while (end > 0 && lines[end - 1] === "") end--;
  return lines.slice(0, end);
}

function splitCompressionFooter(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").trimEnd();
  const match = normalized.match(/\n\n(Compressed \d+ → \d+ tokens \((?:-?\d+|0)%\))$/);
  if (!match) {
    return { body: normalized, footer: undefined as string | undefined };
  }
  return {
    body: normalized.slice(0, -match[0].length),
    footer: match[1],
  };
}

type CompressionStats = {
  originalTokens: number;
  compressedTokens: number;
  percentSaved: number;
};

function estimateTextTokens(text: string) {
  return Math.ceil(text.length / 4);
}

function clampCompressionStats(originalTokens: number, compressedTokens: number): CompressionStats {
  const original = Math.max(0, originalTokens);
  const compressed = Math.max(0, Math.min(original, compressedTokens));
  const saved = Math.max(0, original - compressed);
  const percentSaved = original > 0 ? Math.round((saved / original) * 100) : 0;
  return {
    originalTokens: original,
    compressedTokens: compressed,
    percentSaved,
  };
}

function parseLeanCtxCompression(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let stats: CompressionStats | undefined;
  const kept: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    const shellMatch = trimmed.match(/^\[lean-ctx:\s*(\d+)\s*→\s*(\d+)\s*tok,\s*-?(\d+)%\]$/);
    if (shellMatch) {
      stats = clampCompressionStats(Number(shellMatch[1]), Number(shellMatch[2]));
      continue;
    }

    const savedMatch = trimmed.match(/^\[(\d+)\s+tok saved(?:\s+\((\d+)%\))?\]$/);
    if (savedMatch) {
      const saved = Number(savedMatch[1]);
      const pct = savedMatch[2] ? Number(savedMatch[2]) : 0;
      if (pct > 0) {
        const original = Math.round((saved * 100) / pct);
        stats = clampCompressionStats(original, Math.max(0, original - saved));
      } else {
        stats = clampCompressionStats(saved, saved);
      }
      continue;
    }

    kept.push(line);
  }

  return {
    text: kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd(),
    stats,
  };
}

function formatCompressionFooter(stats: CompressionStats) {
  const pct = stats.percentSaved > 0 ? `-${stats.percentSaved}%` : "0%";
  return `Compressed ${stats.originalTokens} → ${stats.compressedTokens} tokens (${pct})`;
}

function withCompressionFooter(text: string, options?: { originalText?: string; limit?: number; always?: boolean; preferEstimate?: boolean }) {
  const parsed = parseLeanCtxCompression(text);
  const limited = limitTextLines(parsed.text, options?.limit);

  let stats = parsed.stats;
  if (options?.originalText !== undefined && (options.preferEstimate || !stats)) {
    stats = clampCompressionStats(
      estimateTextTokens(options.originalText),
      estimateTextTokens(limited.text),
    );
  }

  if (!stats && options?.always) {
    const tokens = estimateTextTokens(limited.text);
    stats = clampCompressionStats(tokens, tokens);
  }

  if (!stats) {
    return {
      text: limited.text,
      stats: undefined,
      truncated: limited.truncated,
    };
  }

  const footer = formatCompressionFooter(stats);
  const baseText = limited.text.trimEnd();
  return {
    text: baseText ? `${baseText}\n\n${footer}` : footer,
    stats,
    truncated: limited.truncated,
  };
}

async function execLeanCtx(pi: ExtensionAPI, args: string[]) {
  const bin = resolveLeanCtxBin();
  const result = await pi.exec(bin, args, {});
  if (result.code !== 0) {
    const msg = (result.stderr || result.stdout || `lean-ctx command failed: ${args.join(" ")}`).trim();
    throw new Error(msg);
  }
  return result.stdout;
}

export default function (pi: ExtensionAPI) {
  const baseBashTool = createBashToolDefinition(process.cwd(), {
    spawnHook: ({ command, cwd, env }) => {
      const bin = resolveLeanCtxBin();
      return {
        command: `${shellQuote(bin)} -c sh -lc ${shellQuote(command)}`,
        cwd,
        env: {
          ...env,
        },
      };
    },
  });

  pi.registerTool({
    ...baseBashTool,
    description:
      "Execute a bash command through lean-ctx compression. Prefers the fork build in this repo, then LEAN_CTX_BIN, then ~/.local/bin/lean-ctx, then PATH.",
    promptSnippet: "Run shell commands through lean-ctx compression for smaller, cleaner output.",
    promptGuidelines: [
      "Use bash normally; this override already routes commands through lean-ctx.",
      "Prefer concise shell commands. lean-ctx will compress verbose output automatically.",
    ],
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      try {
        const result = await baseBashTool.execute(toolCallId, params, signal, onUpdate, ctx);
        const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
        const decorated = withCompressionFooter(text, { always: true });
        return {
          ...result,
          content: [{ type: "text", text: decorated.text }],
          details: {
            ...(result.details ?? {}),
            compression: decorated.stats,
          },
        };
      } catch (error) {
        if (error instanceof Error) {
          const decorated = withCompressionFooter(error.message, { always: true });
          throw new Error(decorated.text);
        }
        throw error;
      }
    },
  });

  const nativeReadTool = createReadToolDefinition(process.cwd());

  pi.registerTool({
    name: "read",
    label: "Read",
    description:
      "Read file contents. Uses lean-ctx full reads by default for cached re-reads and structured output. Uses exact local line slicing when offset/limit is requested.",
    promptSnippet: "Read file contents through lean-ctx-aware behavior with cache-friendly full reads.",
    promptGuidelines: [
      "Use read normally; this override uses lean-ctx full reads by default.",
      "When you need exact offset/limit behavior, this override preserves it.",
    ],
    parameters: readSchema,
    renderCall(args, theme, context) {
      return nativeReadTool.renderCall ? nativeReadTool.renderCall(args, theme, context) : (context.lastComponent ?? new Text("", 0, 0));
    },
    renderResult(result, options, theme, context) {
      if (result.content.some((block) => block.type === "image")) {
        return nativeReadTool.renderResult
          ? nativeReadTool.renderResult(result, options, theme, context)
          : (context.lastComponent ?? new Text("", 0, 0));
      }

      const textBlock = result.content.find((block) => block.type === "text");
      const rawText = textBlock?.type === "text" ? textBlock.text : "";
      const { body, footer } = splitCompressionFooter(rawText);
      const rawPath = typeof context.args?.path === "string" ? context.args.path : undefined;
      const lang = rawPath ? getLanguageFromPath(rawPath) : undefined;
      const renderedLines = lang ? highlightCode(replaceTabs(body), lang) : body.split("\n");
      const lines = trimTrailingEmptyLines(renderedLines);
      const maxLines = options.expanded ? lines.length : 10;
      const displayLines = lines.slice(0, maxLines);
      const remaining = lines.length - maxLines;

      let text = `\n${displayLines
        .map((line) => (lang ? replaceTabs(line) : theme.fg("toolOutput", replaceTabs(line))))
        .join("\n")}`;

      if (remaining > 0) {
        text += `${theme.fg("muted", `\n... (${remaining} more lines, ctrl+o to expand)`)}`;
      }

      const truncation = (result.details as { truncation?: { truncated?: boolean; firstLineExceedsLimit?: boolean; truncatedBy?: string; outputLines?: number; totalLines?: number; maxLines?: number; maxBytes?: number } } | undefined)?.truncation;
      if (truncation?.truncated) {
        if (truncation.firstLineExceedsLimit) {
          text += `\n${theme.fg("warning", `[First line exceeds ${Math.round((truncation.maxBytes ?? DEFAULT_MAX_BYTES) / 1024)}KB limit]`)}`;
        } else if (truncation.truncatedBy === "lines") {
          text += `\n${theme.fg("warning", `[Truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${truncation.maxLines ?? DEFAULT_MAX_LINES} line limit)]`)}`;
        } else {
          text += `\n${theme.fg("warning", `[Truncated: ${truncation.outputLines} lines shown (${Math.round((truncation.maxBytes ?? DEFAULT_MAX_BYTES) / 1024)}KB limit)]`)}`;
        }
      }

      if (footer) {
        text += `\n\n${theme.fg("muted", footer)}`;
      }

      const component = context.lastComponent ?? new Text("", 0, 0);
      component.setText(text);
      return component;
    },
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const requestedPath = normalizePathArg(params.path);
      const absolutePath = resolve(ctx.cwd, requestedPath);

      if (params.offset !== undefined || params.limit !== undefined) {
        const sliced = await readSlice(absolutePath, params.offset, params.limit);
        return {
          content: [{ type: "text", text: sliced.text }],
          details: {
            path: absolutePath,
            lines: sliced.lines,
            source: "local-slice",
            truncated: sliced.truncated,
          },
        };
      }

      if (isNativeImageReadPath(absolutePath)) {
        return nativeReadTool.execute(
          _toolCallId,
          { ...params, path: absolutePath },
          signal,
          onUpdate,
          ctx,
        );
      }

      const mode = await chooseReadMode(absolutePath);
      const args = mode === "full"
        ? ["read", absolutePath]
        : ["read", absolutePath, "-m", mode];
      const output = await execLeanCtx(pi, args);
      const originalText = await readFile(absolutePath, "utf8");
      const decorated = withCompressionFooter(output, {
        originalText,
        always: true,
        preferEstimate: true,
      });

      return {
        content: [{ type: "text", text: decorated.text }],
        details: {
          path: absolutePath,
          source: "lean-ctx",
          mode,
          compression: decorated.stats,
        },
      };
    },
  });

  pi.registerTool({
    name: "ls",
    label: "ls",
    description: "List directory contents through lean-ctx compression.",
    promptSnippet: "List directory contents through lean-ctx compression.",
    promptGuidelines: [
      "Use ls normally; this override routes through lean-ctx.",
    ],
    parameters: lsSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const requestedPath = normalizePathArg(params.path || ".");
      const absolutePath = resolve(ctx.cwd, requestedPath);
      const output = await execLeanCtx(pi, ["ls", absolutePath]);
      const decorated = withCompressionFooter(output, {
        limit: params.limit,
        always: true,
      });
      return {
        content: [{ type: "text", text: decorated.text }],
        details: {
          path: absolutePath,
          source: "lean-ctx",
          truncated: decorated.truncated,
          compression: decorated.stats,
        },
      };
    },
  });

  pi.registerTool({
    name: "find",
    label: "find",
    description: "Find files by glob pattern through lean-ctx compression.",
    promptSnippet: "Find files by glob pattern through lean-ctx compression.",
    promptGuidelines: [
      "Use find normally; this override routes through lean-ctx.",
    ],
    parameters: findSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const requestedPath = normalizePathArg(params.path || ".");
      const absolutePath = resolve(ctx.cwd, requestedPath);
      const output = await execLeanCtx(pi, ["find", params.pattern, absolutePath]);
      const decorated = withCompressionFooter(output, {
        limit: params.limit,
        always: true,
      });
      return {
        content: [{ type: "text", text: decorated.text }],
        details: {
          path: absolutePath,
          pattern: params.pattern,
          source: "lean-ctx",
          truncated: decorated.truncated,
          compression: decorated.stats,
        },
      };
    },
  });

  pi.registerTool({
    name: "grep",
    label: "grep",
    description: "Search file contents through ripgrep + lean-ctx compression.",
    promptSnippet: "Search file contents through lean-ctx-aware grep output.",
    promptGuidelines: [
      "Use grep normally; this override routes through lean-ctx compression.",
    ],
    parameters: grepSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const requestedPath = normalizePathArg(params.path || ".");
      const absolutePath = resolve(ctx.cwd, requestedPath);
      const searchArgs = ["rg", "--line-number", "--color=never"];
      if (params.ignoreCase) searchArgs.push("-i");
      if (params.literal) searchArgs.push("-F");
      if (params.context && params.context > 0) searchArgs.push(`-C${params.context}`);
      if (params.glob) searchArgs.push("--glob", params.glob);
      if (params.limit && params.limit > 0) searchArgs.push("-m", String(params.limit));
      searchArgs.push(params.pattern, absolutePath);

      const output = await execLeanCtx(pi, ["-c", ...searchArgs]);
      const decorated = withCompressionFooter(output, { always: true });
      return {
        content: [{ type: "text", text: decorated.text }],
        details: {
          path: absolutePath,
          pattern: params.pattern,
          source: "lean-ctx",
          compression: decorated.stats,
        },
      };
    },
  });

  pi.registerCommand("lean-ctx", {
    description: "Show the lean-ctx binary currently used by the Pi integration",
    handler: async (_args, ctx) => {
      const bin = resolveLeanCtxBin();
      ctx.ui.notify(`pi-lean-ctx using: ${bin}`, "info");
    },
  });
}
