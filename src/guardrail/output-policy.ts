import { z } from 'zod';
import { normalise } from './input-policy';

export const verdictSchema = z.strictObject({ decision: z.enum(['ALLOW', 'BLOCK']), reasonCode: z.enum(['educational', 'advice', 'product', 'unsupported_claim', 'sensitive', 'uncertain']) });
export type Verdict = z.infer<typeof verdictSchema>;
declare const approved: unique symbol;
export type ApprovedResponse = { text: string; readonly [approved]: true };
export function parseVerdict(raw: string): Verdict | null {
  try { return verdictSchema.parse(JSON.parse(raw)); } catch { return null; }
}
export function prefilter(text: string): boolean {
  const clean = normalise(text);
  return /\b(?:you (?:should|must|need to) (?:buy|sell|invest|allocate|move|transfer)|i recommend (?:buying|selling|investing)|buy this (?:etf|fund)|move your (?:cash|money)|invest in|VWCE|VWRP|Vanguard|iShares)\b/i.test(clean);
}
export function approveCandidate(text: string, verdict: Verdict | null): ApprovedResponse | null {
  if (!text.trim() || text.length > 3800 || prefilter(text) || verdict?.decision !== 'ALLOW' || verdict.reasonCode !== 'educational') return null;
  return { text } as ApprovedResponse;
}
export const safeFallback = 'I can explain financial concepts and your reported indicators, but I cannot recommend financial products, allocations or actions with your money. Use /resume to continue, /report for the information collected so far, or /help.';
