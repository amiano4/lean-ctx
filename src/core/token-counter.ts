import { encodingForModel } from 'js-tiktoken';
import { recordToolCall } from './store.js';

let encoder: ReturnType<typeof encodingForModel> | null = null;

function getEncoder() {
  if (!encoder) {
    encoder = encodingForModel('gpt-4o');
  }
  return encoder;
}

export function countTokens(text: string): number {
  try {
    return getEncoder().encode(text).length;
  } catch {
    return Math.ceil(text.length / 3.5);
  }
}

export function tokenStats(original: string, compressed: string): TokenSavings {
  const originalTokens = countTokens(original);
  const compressedTokens = countTokens(compressed);
  const saved = originalTokens - compressedTokens;
  const percent = originalTokens > 0 ? Math.round((saved / originalTokens) * 100) : 0;

  return { originalTokens, compressedTokens, savedTokens: saved, savedPercent: percent };
}

export interface TokenSavings {
  originalTokens: number;
  compressedTokens: number;
  savedTokens: number;
  savedPercent: number;
}

export function formatSavings(savings: TokenSavings): string {
  if (savings.savedTokens <= 0) return '';
  return `[${savings.savedTokens} tok saved (${savings.savedPercent}%)]`;
}

let sessionSaved = 0;
let sessionTotal = 0;

export function trackSavings(
  original: string,
  compressed: string,
  tool = 'unknown',
  file?: string,
  mode?: string
): string {
  const s = tokenStats(original, compressed);
  sessionSaved += s.savedTokens;
  sessionTotal += s.originalTokens;
  recordToolCall(tool, s.originalTokens, s.savedTokens, file, mode);
  return formatSavings(s);
}

export function getSessionStats(): { totalOriginal: number; totalSaved: number; percent: number } {
  return {
    totalOriginal: sessionTotal,
    totalSaved: sessionSaved,
    percent: sessionTotal > 0 ? Math.round((sessionSaved / sessionTotal) * 100) : 0,
  };
}

export function resetSessionStats(): void {
  sessionSaved = 0;
  sessionTotal = 0;
}
