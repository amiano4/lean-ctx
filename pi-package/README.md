# pi-lean-ctx-local

Local Pi package for routing Pi shell commands through the forked `lean-ctx` repo.

## What it does

- Overrides Pi's built-in `bash` tool
- Prefers the fork build at `rust/target/release/lean-ctx`
- Falls back to `LEAN_CTX_BIN`, then `~/.local/bin/lean-ctx`, then `lean-ctx` on `PATH`
- Removes the need for global shell aliases or Pi MCP usage for lean-ctx

## Install locally in Pi

```bash
pi install /path/to/lean-ctx/pi-package
```

## Build the forked binary

```bash
cd /path/to/lean-ctx/rust
cargo build --release
```

## Notes

Current scope is intentionally small: only the `bash` tool is overridden. `read`, `grep`, `find`, and `ls` can be moved over next.
