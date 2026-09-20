import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Answers } from '../questionnaire/schema.js';
import type { Results } from '../engine/projection.js';
import type { RuleId, Severity } from '../rules/rules.js';
import type { Topic } from '../questionnaire/schema.js';

export interface BlindSpotContent {
  title: string;
  headline: string;
  why: string;
  learn: string[];
  ask: string;
  severity: Severity;
  topic: Topic;
}

const SEVERITIES = ['low', 'medium', 'high'] as const;
const TOPICS = [
  'protection',
  'succession',
  'education',
  'savings',
  'retirement',
  'investments',
  'cross_border',
  'property',
  'debt',
  'fees',
] as const;

const ContentSchema = z.object({
  title: z.string().min(1),
  headline: z.string().min(1),
  why: z.string().min(1),
  learn: z.array(z.string().min(1)).min(2).max(3),
  ask: z.string().min(1),
  severity: z.enum(SEVERITIES),
  topic: z.enum(TOPICS),
});

const LibrarySchema = z.record(z.string(), ContentSchema);

const CONTENT_PATH = fileURLToPath(new URL('../../content/blind_spots.json', import.meta.url));

let cache: Record<RuleId, BlindSpotContent> | null = null;

export function loadContent(): Record<RuleId, BlindSpotContent> {
  if (cache === null) {
    const raw: unknown = JSON.parse(readFileSync(CONTENT_PATH, 'utf8'));
    cache = LibrarySchema.parse(raw) as Record<RuleId, BlindSpotContent>;
  }
  return cache;
}

export function fillPlaceholders(text: string, a: Answers, r: Results): string {
  let out = text.replaceAll('{retire_age}', String(a.retire_age));
  if (out.includes('{pension_start_age}')) {
    const index = r.excluded_pensions[0];
    const startAge = index === undefined ? null : (a.pensions[index]?.pension_start_age ?? null);
    if (startAge !== null) out = out.replaceAll('{pension_start_age}', String(startAge));
  }
  return out;
}
