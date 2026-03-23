# lean-ctx

**Hybrid Context Optimizer** — Shell Hook + MCP Server in a single Rust binary.

Reduces LLM token consumption by 89-99%. Zero runtime dependencies.

## Architecture

lean-ctx runs as **both**:

- **Shell Hook** — Transparently compresses CLI output (git, npm, cargo, docker, tsc, grep, find, ls, curl) before it reaches the LLM. Works without LLM cooperation.
- **MCP Server** — Provides 8 advanced tools for cached file reads, dependency maps, entropy analysis, and more. Works with any MCP-compatible editor.

## Install

```bash
cargo install lean-ctx
```

Or build from source:

```bash
git clone https://github.com/yvgude/lean-ctx.git
cd lean-ctx/rust
cargo build --release
cp target/release/lean-ctx ~/.local/bin/
```

## Configure

### MCP Server (Cursor, Claude Code, Copilot, Windsurf)

**Cursor** — `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "lean-ctx": {
      "command": "lean-ctx"
    }
  }
}
```

**Claude Code**:

```bash
claude mcp add lean-ctx lean-ctx
```

**GitHub Copilot** — `.github/copilot/mcp.json`:

```json
{
  "servers": {
    "lean-ctx": {
      "command": "lean-ctx"
    }
  }
}
```

**Windsurf** — `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "lean-ctx": {
      "command": "lean-ctx"
    }
  }
}
```

### Shell Hook (Transparent CLI Compression)

Automatic setup:

```bash
lean-ctx init --global
```

This adds aliases for `git`, `npm`, `cargo`, `docker`, `ls`, `find`, `grep`, `curl` to your `.zshrc` / `.bashrc` / `config.fish`.

Or add manually to your shell profile:

```bash
alias git='lean-ctx -c git'
alias npm='lean-ctx -c npm'
alias cargo='lean-ctx -c cargo'
alias docker='lean-ctx -c docker'
alias ls='lean-ctx -c ls'
alias find='lean-ctx -c find'
alias grep='lean-ctx -c grep'
alias curl='lean-ctx -c curl'
```

Or use the interactive shell:

```bash
lean-ctx shell
```

**Cursor terminal profile** — add to VS Code settings:

```json
{
  "terminal.integrated.profiles.osx": {
    "lean-ctx": {
      "path": "lean-ctx",
      "args": ["shell"],
      "icon": "terminal"
    }
  }
}
```

### Cursor Rule

Add `.cursor/rules/lean-ctx.mdc` to your project for maximum token savings. Example included in [`examples/lean-ctx.mdc`](examples/lean-ctx.mdc).

## CLI Commands

| Command | Description |
|---|---|
| `lean-ctx` | Start MCP server (stdio) |
| `lean-ctx -c "command"` | Execute command with compressed output |
| `lean-ctx shell` | Interactive shell with compression |
| `lean-ctx gain` | Show persistent token savings statistics |
| `lean-ctx init [--global]` | Install shell aliases |
| `lean-ctx read <file> [-m mode]` | Read file with compression |
| `lean-ctx diff <file1> <file2>` | Compressed file diff |
| `lean-ctx grep <pattern> [path]` | Search with compressed output |
| `lean-ctx find <pattern> [path]` | Find files with compressed output |
| `lean-ctx ls [path]` | Directory listing with compression |
| `lean-ctx deps [path]` | Show project dependencies |

## 8 MCP Tools

| Tool | Description | Savings |
|---|---|---|
| `ctx_read` | Smart file read with 6 modes (full, map, signatures, diff, aggressive, entropy) | 74-99% |
| `ctx_tree` | Compact directory listing with file counts | 34-60% |
| `ctx_shell` | CLI output compression (git, npm, cargo, docker, tsc) | 70-89% |
| `ctx_search` | Regex search with compact results | 80-95% |
| `ctx_compress` | Context checkpoint from session cache | 90-99% |
| `ctx_benchmark` | Compare all strategies with tiktoken counts | — |
| `ctx_metrics` | Session statistics with USD cost estimates | — |
| `ctx_analyze` | Shannon entropy analysis + mode recommendation | — |

## ctx_read Modes

| Mode | Use Case | Tokens |
|---|---|---|
| `full` | Files you will edit (cached re-reads = ~13 tokens) | 100% first, ~0% cached |
| `map` | Context files — dependency graph + exports + API signatures | ~5-15% |
| `signatures` | API surface with more detail than map | ~10-20% |
| `diff` | Re-reading changed files | only changed lines |
| `aggressive` | Large files with boilerplate | ~30-50% |
| `entropy` | Files with repetitive patterns (Shannon + Jaccard) | ~20-40% |

## How it works

### MCP Server Mode

1. **Session Cache**: File reads are hashed (MD5) and cached. Re-reads return `F1=auth.ts [cached 2t 151L ∅]` (~13 tokens) instead of the full file.
2. **Dependency Maps**: `ctx_read --mode map` extracts imports, exports, and API signatures — understand a file at ~10% token cost.
3. **Structured Headers**: Every response includes `F1=path [NL +] deps:[...] exports:[...]` for instant context.
4. **Signature Extraction**: Function/class/type signatures for TS/JS, Rust, Python, Go.
5. **Entropy Filtering**: Shannon entropy removes low-information lines; Jaccard similarity deduplicates patterns.
6. **CLI Compression**: Pattern-based compression for git, npm, cargo, docker, tsc, grep, find, ls, curl, test runners.
7. **Persistent Stats**: All shell hook compressions are tracked in `~/.lean-ctx/stats.json`. View with `lean-ctx gain`.

### Shell Hook Mode

Transparently wraps shell commands and compresses output:

```
$ lean-ctx -c "ls -la src/"
core/
tools/
cli.rs  9.0K
main.rs  4.0K
server.rs  11.9K
shell.rs  5.2K
4 files, 2 dirs
[lean-ctx: 239→46 tok, -81%]
```

### Token Savings Dashboard

```
$ lean-ctx gain
lean-ctx Token Savings
══════════════════════════════════════════════════
Total commands:  3
Input tokens:    452
Output tokens:   190
Tokens saved:    262 (58.0%)
Tracking since:  2026-03-23

By Command:
──────────────────────────────────────────────────
Command               Count      Saved   Avg%
ls                        1        177  74.1%
git status                1         85  39.9%
══════════════════════════════════════════════════
```

### CRP v2 (Compact Response Protocol)

lean-ctx includes optimized system prompts (via Cursor Rules) that reduce LLM thinking tokens by 30-60% through structured task parsing and one-hypothesis reasoning.

## vs RTK

| Feature | RTK | lean-ctx |
|---|---|---|
| Architecture | Shell hook only | **Hybrid: Shell hook + MCP server** |
| Language | Rust | Rust |
| File caching | ✗ | ✓ MD5 session cache |
| File compression | ✗ | ✓ 6 modes incl. dependency maps |
| CLI compression | ✓ ~30 cmds | ✓ git, npm, cargo, docker, tsc, grep, find, ls, curl, test |
| Persistent stats | ✓ `rtk gain` | ✓ `lean-ctx gain` |
| Auto-setup | ✓ `rtk init` | ✓ `lean-ctx init` |
| Dependency analysis | ✗ | ✓ import/export extraction |
| Context checkpoint | ✗ | ✓ ctx_compress |
| Token counting | Estimated | tiktoken-exact (o200k_base) |
| Entropy analysis | ✗ | ✓ Shannon + Jaccard |
| Cost tracking | ✗ | ✓ USD estimates per session |
| Thinking reduction | ✗ | ✓ CRP v2 |
| Editors | Claude Code (shell) | **All MCP editors + shell** |

## License

MIT
