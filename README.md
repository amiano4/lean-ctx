# lean-ctx

**Smart Context MCP Server** that reduces LLM token consumption by **89-99%** through caching, compression, and compact protocols.

Works with **Cursor**, **GitHub Copilot**, **Claude Code**, **Windsurf**, and any MCP-compatible AI coding tool.

## Why lean-ctx?

AI coding tools waste tokens. A lot of them.

| Problem | Without lean-ctx | With lean-ctx |
|---------|----------------:|-------------:|
| Reading a file twice | 3,517 tokens | 13 tokens |
| Checking a dependency API | 2,536 tokens | 252 tokens |
| `git status` output | 100 chars | 31 chars |
| Project structure (`ls -R`) | 980 tokens | 588 tokens |

**Benchmarked on real projects with tiktoken token counting.**

### vs. Competitors

| Feature | RTK | OrbitalMCP | lean-ctx |
|---------|-----|-----------|----------|
| Savings | 60-90% CLI only | 20-25% | **89-99%** |
| Scope | Shell output | Chat panel | Files + CLI + Search |
| Caching | None | None | Session-aware |
| Dashboard | None | Basic | Charts + History |
| MCP native | No (shell hook) | Yes | Yes |
| Open Source | Yes | No | Yes |

## Quick Start

```bash
# Clone and build
git clone https://github.com/lean-ctx/lean-ctx
cd lean-ctx && npm install && npm run build

# Initialize for your project
node dist/cli.js init /path/to/your/project

# Open the dashboard
node dist/cli.js dashboard
```

## Setup

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "lean-ctx": {
      "command": "node",
      "args": ["/path/to/lean-ctx/dist/index.js"],
      "env": { "LEAN_CTX_ROOT": "/path/to/your/project" }
    }
  }
}
```

### GitHub Copilot

Add to `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "lean-ctx": {
      "command": "node",
      "args": ["/path/to/lean-ctx/dist/index.js"],
      "env": { "LEAN_CTX_ROOT": "${workspaceFolder}" }
    }
  }
}
```

### Claude Code

```bash
claude mcp add lean-ctx node /path/to/lean-ctx/dist/index.js
```

## MCP Tools

### ctx_read — Smart File Read (89-99% savings)

| Mode | Description | Savings |
|------|-------------|---------|
| `full` | Cached reads — returns "already in context" on re-read | ~98% on re-reads |
| `signatures` | Function signatures, interfaces, types only | 89-96% |
| `diff` | Only changes from cached version | 70-95% |
| `aggressive` | Full content with syntax stripping | 7-40% |

### ctx_tree — Project Map (40% savings)

Token-efficient directory listing using indentation instead of Unicode box-drawing.

### ctx_shell — CLI Compression (60-90% savings)

Pattern-based compression for npm, git, docker, tsc, and other dev tools.

### ctx_benchmark — Measure Savings

Run `ctx_benchmark` on any file to see exact token counts for each strategy.

### ctx_metrics — Session Statistics

Real-time token savings with tiktoken-measured counts.

## Dashboard

Start with `lean-ctx dashboard` — opens at http://localhost:3333.

- Token savings over time (Chart.js)
- Per-tool breakdown (doughnut chart)
- Session history with project names
- Auto-refreshes every 15 seconds

## CLI

```bash
lean-ctx dashboard    # Open web dashboard
lean-ctx stats        # Show stats in terminal
lean-ctx init [path]  # Initialize lean-ctx for a project
lean-ctx help         # Show help
```

## Architecture

```
lean-ctx/
├── src/
│   ├── index.ts              # MCP Server (stdio transport)
│   ├── cli.ts                # CLI entry point
│   ├── tools/                # 5 MCP tools
│   ├── core/                 # Cache, compressor, protocol, store
│   ├── patterns/             # npm, git, docker, tsc compression
│   └── dashboard/            # Web dashboard (server + UI)
├── ~/.lean-ctx/stats.json    # Persistent stats (auto-created)
└── package.json
```

## How It Works

```
Editor (Cursor/Copilot/Claude Code)
  │
  ├── ctx_read ──► Session Cache ──► "already in context" (13 tok)
  │                     or
  │                Compressor ──► signatures/diff/stripped (50-252 tok)
  │
  ├── ctx_tree ──► Indent-based tree (40% fewer tokens)
  │
  ├── ctx_shell ──► Pattern matcher ──► compressed output
  │
  └── All tools ──► Token Counter (tiktoken) ──► Stats Store ──► Dashboard
```

## License

MIT
