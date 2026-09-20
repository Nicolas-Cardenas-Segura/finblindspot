import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../explain/content.js';
import { FIELDS, PENSION_FIELDS } from '../questionnaire/fields.js';
import type { Assessment } from '../assess/assess.js';
import { money } from '../explain/render.js';

export interface Snippet {
  source: string;
  text: string;
}

const DOCS_DIR = fileURLToPath(new URL('../../docs', import.meta.url));
const MAX_SNIPPET_CHARS = 320;

const STOPWORDS = new Set([
  'the', 'and', 'you', 'your', 'for', 'that', 'this', 'with', 'are', 'not', 'have', 'what',
  'how', 'why', 'when', 'where', 'much', 'many', 'about', 'roughly', 'each', 'any', 'does',
  'from', 'into', 'than', 'then', 'there', 'they', 'them', 'will', 'would', 'should', 'can',
  'know', 'dont', 'don', 'like', 'want', 'need', 'one', 'out', 'all', 'its', 'our', 'who',
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= MAX_SNIPPET_CHARS ? flat : `${flat.slice(0, MAX_SNIPPET_CHARS - 1)}…`;
}

function docSnippets(): Snippet[] {
  if (!existsSync(DOCS_DIR)) return [];
  const out: Snippet[] = [];
  for (const name of readdirSync(DOCS_DIR).filter((n) => n.endsWith('.md'))) {
    const body = readFileSync(`${DOCS_DIR}/${name}`, 'utf8');
    for (const para of body.split(/\n\s*\n/)) {
      const flat = para.replace(/^#+\s*/gm, '').trim();
      if (flat.length > 40 && !flat.startsWith('```')) out.push({ source: `docs/${name}`, text: clip(flat) });
    }
  }
  return out;
}

interface Indexed {
  snippet: Snippet;
  terms: Set<string>;
  length: number;
}

let corpus: Snippet[] | null = null;
let index: { docs: Indexed[]; df: Map<string, number> } | null = null;

export function buildCorpus(): Snippet[] {
  if (corpus !== null) return corpus;
  const out: Snippet[] = [];
  for (const f of [...FIELDS, ...PENSION_FIELDS]) {
    const text = [f.prompt, f.helper, f.rationale].filter((t) => t !== undefined).join(' ');
    out.push({ source: `field:${f.id}`, text: clip(text) });
  }
  for (const [ruleId, c] of Object.entries(loadContent())) {
    out.push({ source: `blind_spot:${ruleId}`, text: clip(`${c.title}. ${c.headline} ${c.why}`) });
    for (const learn of c.learn) out.push({ source: `blind_spot:${ruleId}:learn`, text: clip(learn) });
    out.push({ source: `blind_spot:${ruleId}:ask`, text: clip(`Question to ask a professional: ${c.ask}`) });
  }
  out.push(...docSnippets());
  corpus = out;
  return out;
}

function buildIndex(): { docs: Indexed[]; df: Map<string, number> } {
  if (index !== null) return index;
  const docs = buildCorpus().map((snippet) => {
    const words = tokens(snippet.text);
    return { snippet, terms: new Set(words), length: words.length };
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.terms) df.set(t, (df.get(t) ?? 0) + 1);
  index = { docs, df };
  return index;
}

export function retrieve(query: string, limit = 3, exclude: string[] = []): Snippet[] {
  const q = new Set(tokens(query));
  if (q.size === 0) return [];
  const { docs, df } = buildIndex();
  const n = docs.length;
  const scored = docs
    .filter((d) => !exclude.includes(d.snippet.source))
    .map((d) => {
      let hits = 0;
      let score = 0;
      for (const t of q) {
        if (!d.terms.has(t)) continue;
        hits += 1;
        score += Math.log(1 + n / (df.get(t) ?? 1));
      }
      return { d, hits, score: score / Math.log(2 + d.length) };
    })
    .filter((x) => x.hits >= 2)
    .sort((a, b) => b.score - a.score || a.d.snippet.source.localeCompare(b.d.snippet.source));
  return scored.slice(0, limit).map((x) => x.d.snippet);
}

export function summarizeAssessment(a: Assessment): string {
  const content = loadContent();
  const lines = [`- Date: ${a.created_at.slice(0, 10)}, currency ${a.base_currency}`];
  const r = a.results;
  if (r.mode === 'projection' && r.required_pot !== null && r.projected_assets !== null && r.position !== null) {
    lines.push(
      `- Retirement projection at age ${a.answers.retire_age}: needed ${money(r.required_pot, a.base_currency)}, projected ${money(r.projected_assets, a.base_currency)}, position ${money(r.position, a.base_currency)}${r.is_minimum_estimate ? ' (minimum estimate, some values unknown)' : ''}`,
    );
  } else {
    lines.push(`- Retirement projection: ${r.mode.replace('_', ' ')}`);
  }
  const spots = a.blind_spots.map((b) => `${content[b.rule_id]?.title ?? b.rule_id} (${b.severity})`);
  lines.push(spots.length > 0 ? `- Blind spots then: ${spots.join('; ')}` : '- Blind spots then: none');
  return lines.join('\n');
}
