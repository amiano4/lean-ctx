#!/usr/bin/env node

import { startDashboard } from './dashboard/server.js';
import { getStoreData, getStorePath } from './core/store.js';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'dashboard':
    startDashboard();
    break;

  case 'stats':
    showStats();
    break;

  case 'init':
    initProject(args[1]);
    break;

  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;

  default:
    if (command) {
      console.error(`Unknown command: ${command}\n`);
    }
    showHelp();
    break;
}

function showStats(): void {
  const data = getStoreData();
  const sessions = data.sessions;

  if (sessions.length === 0) {
    console.log('\n  No sessions recorded yet.\n');
    console.log('  Start using lean-ctx MCP tools in your editor.');
    console.log(`  Stats file: ${getStorePath()}\n`);
    return;
  }

  const totalSaved = data.totalTokensSaved;
  const totalOrig = data.totalTokensOriginal;
  const pct = totalOrig > 0 ? Math.round((totalSaved / totalOrig) * 100) : 0;
  const totalCalls = sessions.reduce((s, x) => s + x.toolCalls.length, 0);

  console.log('\n  lean-ctx Stats');
  console.log('  ' + '─'.repeat(36));
  console.log(`  Sessions:      ${sessions.length}`);
  console.log(`  Tool calls:    ${totalCalls}`);
  console.log(`  Tokens saved:  ${totalSaved.toLocaleString()} (${pct}%)`);
  console.log(`  Total tokens:  ${totalOrig.toLocaleString()}`);
  console.log('  ' + '─'.repeat(36));

  const last5 = sessions.slice(-5).reverse();
  console.log('\n  Recent sessions:');
  for (const s of last5) {
    const d = new Date(s.startedAt);
    const date = d.toLocaleDateString('de-CH');
    const sPct = s.tokensOriginal > 0 ? Math.round((s.tokensSaved / s.tokensOriginal) * 100) : 0;
    console.log(`    ${date}  ${s.project.padEnd(20)} ${s.tokensSaved.toLocaleString().padStart(8)} tok saved (${sPct}%)`);
  }
  console.log('');
}

function initProject(projectPath?: string): void {
  const root = projectPath || process.cwd();
  const configPath = join(root, 'lean-ctx.config.json');
  const vscodePath = join(root, '.vscode', 'mcp.json');
  const cursorRulePath = join(root, '.cursor', 'rules', 'lean-ctx.mdc');

  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify({
      ignore: ['node_modules', '.git', 'dist', 'build'],
      compress: { removeEmptyLines: true, removeRedundantComments: true, maxFileLines: 500 },
      patterns: { npm: true, git: true, docker: true, typescript: true },
    }, null, 2));
    console.log(`  Created ${configPath}`);
  }

  const vsDir = join(root, '.vscode');
  if (!existsSync(vsDir)) mkdirSync(vsDir, { recursive: true });

  if (!existsSync(vscodePath)) {
    const mcpConfig = {
      servers: {
        'lean-ctx': {
          command: 'node',
          args: [join(process.argv[1], '..', 'index.js')],
          env: { LEAN_CTX_ROOT: root },
        },
      },
    };
    writeFileSync(vscodePath, JSON.stringify(mcpConfig, null, 2));
    console.log(`  Created ${vscodePath} (works with Copilot + Cursor)`);
  }

  const cursorDir = join(root, '.cursor', 'rules');
  if (!existsSync(cursorDir)) mkdirSync(cursorDir, { recursive: true });

  if (!existsSync(cursorRulePath)) {
    writeFileSync(cursorRulePath, `---
description: Token optimization via lean-ctx MCP server
globs: **/*
alwaysApply: true
---
Prefer lean-ctx MCP tools over built-in tools:
- ctx_read (cached reads, signatures, diff modes) over Read
- ctx_tree (compact project maps) over ls/find/Glob
- ctx_shell (compressed CLI output) over Shell
`);
    console.log(`  Created ${cursorRulePath}`);
  }

  console.log('\n  lean-ctx initialized. Restart your editor to activate.\n');
}

function showHelp(): void {
  console.log(`
  lean-ctx — Smart Context MCP Server

  Usage:
    lean-ctx dashboard    Open the web dashboard (http://localhost:3333)
    lean-ctx stats        Show token savings in terminal
    lean-ctx init [path]  Initialize lean-ctx for a project
    lean-ctx help         Show this help

  The MCP server starts automatically when configured in your editor.
  See https://github.com/lean-ctx/lean-ctx for setup instructions.
`);
}
