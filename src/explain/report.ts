import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import type { Assessment } from '../assess/assess.js';
import type { Delta } from '../assess/compare.js';
import { ASSISTANT_NAME } from '../llm/prompts.js';
import type { Section } from '../questionnaire/fields.js';
import { FIELDS, SECTIONS } from '../questionnaire/fields.js';
import type { Currency } from '../questionnaire/schema.js';
import type { RuleId } from '../rules/rules.js';
import { RULES } from '../rules/rules.js';
import { selectActionPlan } from '../rules/evaluate.js';
import type { Severity } from '../rules/rules.js';
import { fillPlaceholders, loadContent } from './content.js';
import {
  amount,
  assumptionsLine,
  emergencyMonths,
  exactMoney,
  money,
  monthlySaving,
  percent,
} from './render.js';

// myfinGap palette: navy background, teal bars, purple glow, off-white type.
const NAVY = '#0e121d';
const INK = '#1a2233';
const MUTED = '#6b7385';
const TEAL = '#66e1cf';
const TEAL_DEEP = '#159e91';
const PURPLE = '#8c51ad';
const PURPLE_SOFT = '#b58fd0';
const OFF_WHITE = '#eef1f5';
const RULE_LINE = '#d6dbe3';
const ACCENT = TEAL_DEEP;
const SEVERITY_COLOUR: Record<Severity, string> = { high: PURPLE, medium: TEAL_DEEP, low: MUTED };
const LOGO_PATH = fileURLToPath(new URL('../../assets/myfingap-logo.jpg', import.meta.url));
const BRAND = 'myfinGap';
const TAGLINE = 'See what you\u2019re missing';

const DISCLAIMER =
  'This report is educational only. It is not financial, tax, legal or investment advice, does not recommend any product, provider or transaction, and is based solely on the approximate figures you gave. Figures are rounded and depend on the assumptions listed. Speak to a regulated professional before acting.';

export interface ReportInput {
  assessment: Assessment;
  whys: Record<RuleId, string>;
  previous?: Assessment;
  delta?: Delta;
}

export function reportFilename(a: Assessment): string {
  return `myfingap-report-${a.created_at.slice(0, 10)}.pdf`;
}

type Doc = InstanceType<typeof PDFDocument>;

function coverBand(doc: Doc, date: string, kind: string, currency: string): void {
  const { left, right, top } = doc.page.margins;
  const bandHeight = 150;
  doc.save();
  doc.rect(0, 0, doc.page.width, bandHeight).clip();
  doc.rect(0, 0, doc.page.width, bandHeight).fill(NAVY);
  doc.circle(doc.page.width - 40, bandHeight + 10, 120).fillOpacity(0.18).fill(TEAL);
  doc.circle(-30, -20, 110).fillOpacity(0.22).fill(PURPLE);
  doc.fillOpacity(1);
  const logoWidth = 150;
  doc.image(LOGO_PATH, doc.page.width - right - logoWidth, 22, { width: logoWidth });
  doc.font('Helvetica').fontSize(9).fillColor(TEAL).text(TAGLINE.toUpperCase(), left, 40, { characterSpacing: 2 });
  doc.font('Helvetica-Bold').fontSize(24).fillColor(OFF_WHITE).text('Your financial', left, 58);
  doc.text('blind spot report', left, 86);
  doc.font('Helvetica').fontSize(9.5).fillColor(PURPLE_SOFT).text(`${date}  \u00b7  ${kind}  \u00b7  amounts in ${currency}`, left, 122);
  doc.restore();
  doc.fillColor(INK);
  doc.x = left;
  doc.y = bandHeight + Math.round(top * 0.5);
}

function footers(doc: Doc): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const y = doc.page.height - 34;
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.save();
    doc.rect(doc.page.margins.left, y + 3, 18, 2).fill(TEAL);
    doc.font('Helvetica').fontSize(8).fillColor(MUTED);
    doc.text(`${BRAND}  \u00b7  educational only, not advice`, doc.page.margins.left + 24, y, { lineBreak: false });
    doc.text(`${i + 1} / ${range.count}`, doc.page.width - doc.page.margins.right - 40, y, { width: 40, align: 'right', lineBreak: false });
    doc.restore();
    doc.page.margins.bottom = savedBottom;
  }
}

function h1(doc: Doc, text: string): void {
  doc.moveDown(0.6).font('Helvetica-Bold').fontSize(15).fillColor(ACCENT).text(text);
  const y = doc.y + 2;
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.margins.left + 28, y).strokeColor(TEAL).lineWidth(2).stroke();
  doc.moveTo(doc.page.margins.left + 28, y).lineTo(doc.page.width - doc.page.margins.right, y).strokeColor(RULE_LINE).lineWidth(0.5).stroke();
  doc.moveDown(0.4).fillColor(INK);
}

function h2(doc: Doc, text: string, colour = INK): void {
  doc.moveDown(0.4).font('Helvetica-Bold').fontSize(11.5).fillColor(colour).text(text).fillColor(INK);
}

function body(doc: Doc, text: string): void {
  doc.font('Helvetica').fontSize(10).fillColor(INK).text(text, { lineGap: 1.5 });
}

function muted(doc: Doc, text: string): void {
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(text, { lineGap: 1 }).fillColor(INK);
}

function bullets(doc: Doc, items: string[]): void {
  doc.font('Helvetica').fontSize(10).fillColor(INK).list(items, { bulletRadius: 1.5, textIndent: 12, bulletIndent: 4, lineGap: 1.5 });
}

function keyValue(doc: Doc, rows: Array<[string, string]>): void {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const labelWidth = Math.round(width * 0.58);
  for (const [label, value] of rows) {
    const needed = Math.max(
      doc.font('Helvetica').fontSize(10).heightOfString(label, { width: labelWidth }),
      doc.font('Helvetica-Bold').fontSize(10).heightOfString(value, { width: width - labelWidth }),
    );
    if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const y = doc.y;
    doc.font('Helvetica').fontSize(10).fillColor(INK).text(label, left, y, { width: labelWidth });
    const after = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).text(value, left + labelWidth, y, { width: width - labelWidth, align: 'right' });
    doc.y = Math.max(after, doc.y);
    doc.moveDown(0.15);
  }
  doc.x = left;
}

function label(id: string): string {
  return id.replace(/_/g, ' ');
}

function severityLabel(s: Severity): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function answerText(value: unknown, type: string, currency: Currency | undefined): string {
  if (value === null || value === undefined) return 'not known';
  if (value === 'n/a') return 'not applicable';
  if (Array.isArray(value)) return value.length === 0 ? 'none' : value.map((v) => label(String(v))).join(', ');
  if (typeof value === 'number') {
    if (type === 'money' && currency !== undefined) return exactMoney(value, currency);
    if (type === 'percent') return `${value}%`;
    return String(value);
  }
  return label(String(value));
}

function projectionSection(doc: Doc, a: Assessment): void {
  const r = a.results;
  const c = a.base_currency;
  h1(doc, 'Retirement projection');

  if (r.mode === 'projection' || r.mode === 'no_gap') {
    const position = r.position_today ?? 0;
    h2(
      doc,
      position < 0
        ? `At ${a.answers.retire_age}, you are about ${money(Math.abs(position), c)} short`
        : `At ${a.answers.retire_age}, you are on track with about ${money(position, c)} to spare`,
      position < 0 ? SEVERITY_COLOUR.high : ACCENT,
    );
    if (a.answers.retire_income_monthly !== null) {
      body(doc, `Target: ${exactMoney(a.answers.retire_income_monthly, c)} a month from age ${a.answers.retire_age}, in today's spending power.`);
    }
    doc.moveDown(0.3);
    keyValue(doc, [
      [`Estimated capital needed at ${a.answers.retire_age}`, amount(r.required_pot, c)],
      ['Projected from what you have and save', amount(r.projected_assets, c)],
      [position < 0 ? 'Shortfall, in today\'s spending power' : 'Spare, in today\'s spending power', money(Math.abs(position), c)],
      ['Extra saving per month that would close it', r.extra_monthly === null ? 'nothing more needed' : exactMoney(r.extra_monthly, c)],
    ]);
    if (r.sensitivity.length > 0) {
      doc.moveDown(0.3);
      muted(doc, 'How sensitive this is to the income you draw from the pot each year:');
      keyValue(
        doc,
        r.sensitivity.map((s) => [
          `${percent(s.withdrawal_rate)} withdrawal rate`,
          `${s.position < 0 ? 'gap' : 'surplus'} ${money(Math.abs(s.position), c)}`,
        ]),
      );
    }
    if (r.is_minimum_estimate) {
      doc.moveDown(0.3);
      muted(doc, `Minimum estimate: it leaves out what you do not know yet (${r.missing_fields.map(label).join(', ')}). The real picture can only be better than this.`);
    }
  } else if (r.mode === 'not_assessed') {
    body(doc, 'No projection: your age, currency or target retirement age was not given. Answer those three and the projection appears in your next report.');
  } else if (r.mode === 'no_target') {
    body(doc, 'No projection: you did not name the monthly income you want in retirement. That single number turns the rest of your answers into a plan.');
  } else {
    body(doc, 'You are at or past your retirement age, so there is no projection to show.');
  }

  doc.moveDown(0.4);
  muted(doc, assumptionsLine(a));
}

function gapsSection(doc: Doc, a: Assessment): void {
  if (a.unanswered.length === 0 && a.not_assessed.length === 0) return;
  const content = loadContent();
  h1(doc, 'What this report could not cover');
  body(
    doc,
    `${a.unanswered.length} question${a.unanswered.length === 1 ? ' was' : 's were'} left unanswered, so this is a partial picture. Everything below is what can be said from your answers so far; the gaps are listed first so you know what would change it.`,
  );
  const bySection = new Map<Section, string[]>();
  for (const id of a.unanswered) {
    const f = id === 'pensions' ? { section: 'D' as Section, prompt: 'Your pensions' } : FIELDS.find((x) => x.id === id);
    if (f === undefined) continue;
    bySection.set(f.section, [...(bySection.get(f.section) ?? []), f.prompt]);
  }
  for (const [section, prompts] of bySection) {
    h2(doc, SECTIONS[section].title);
    bullets(doc, prompts);
  }
  if (a.not_assessed.length > 0) {
    h2(doc, `Blind spots not checked (${a.not_assessed.length} of ${RULES.length})`);
    bullets(doc, a.not_assessed.map((id) => content[id].title));
  }
}

function blindSpotsSection(doc: Doc, a: Assessment, whys: Record<RuleId, string>): void {
  const content = loadContent();
  h1(doc, 'Your blind spots');
  const checked = RULES.length - a.not_assessed.length;
  body(
    doc,
    a.blind_spots.length === 0
      ? `None of the ${checked} blind spots checked applies to you on the figures given.`
      : `${a.blind_spots.length} of the ${checked} blind spots checked apply to you. The three that matter most are explained in the action plan below; the full list is here.`,
  );
  if (a.blind_spots.length > 0) {
    doc.moveDown(0.3);
    keyValue(
      doc,
      a.blind_spots.map((b) => [content[b.rule_id].title, severityLabel(b.severity)]),
    );
  }

  const top = selectActionPlan(a.blind_spots);
  if (top.length === 0) return;
  h1(doc, 'Your action plan');
  for (const [i, fired] of top.entries()) {
    const entry = content[fired.rule_id];
    h2(doc, `${i + 1}. ${entry.title}`, SEVERITY_COLOUR[fired.severity]);
    muted(doc, `${severityLabel(fired.severity)} priority`);
    body(doc, fillPlaceholders(entry.headline, a.answers, a.results));
    doc.moveDown(0.2);
    body(doc, fillPlaceholders(whys[fired.rule_id] ?? entry.why, a.answers, a.results));
    doc.moveDown(0.2);
    muted(doc, 'Worth learning about:');
    bullets(doc, entry.learn);
    doc.moveDown(0.2);
    muted(doc, 'A question to take to a professional:');
    body(doc, fillPlaceholders(entry.ask, a.answers, a.results));
  }
}

function progressSection(doc: Doc, previous: Assessment, current: Assessment, delta: Delta): void {
  const c = current.base_currency;
  const content = loadContent();
  const since = new Date(previous.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  h1(doc, `Since your last assessment (${since})`);
  const prevSaving = monthlySaving(previous.answers);
  const curSaving = monthlySaving(current.answers);
  const fmtMonths = (m: number | null): string => (m === null ? 'unknown' : `${m.toFixed(1)} months`);
  keyValue(doc, [
    ['Retirement position then / now', `${amount(previous.results.position_today, c)} / ${amount(current.results.position_today, c)}`],
    ['Saved each month then / now', `${prevSaving === null ? 'unknown' : exactMoney(prevSaving, c)} / ${curSaving === null ? 'unknown' : exactMoney(curSaving, c)}`],
    ['Emergency fund then / now', `${fmtMonths(emergencyMonths(previous))} / ${fmtMonths(emergencyMonths(current))}`],
    ['Net worth then / now', `${amount(previous.derived.net_worth, c)} / ${amount(current.derived.net_worth, c)}`],
    ['Blind spots open then / now', `${previous.blind_spots.length} / ${current.blind_spots.length}`],
  ]);
  const titles = (ids: RuleId[]): string => ids.map((id) => content[id].title).join(', ');
  if (delta.blind_spots_closed.length > 0) body(doc, `Closed since last time: ${titles(delta.blind_spots_closed)}.`);
  if (delta.blind_spots_new.length > 0) body(doc, `New since last time: ${titles(delta.blind_spots_new)}.`);
  if (delta.unknowns_resolved.length > 0) body(doc, `Now known: ${delta.unknowns_resolved.map(label).join(', ')}.`);
}

function answersSection(doc: Doc, a: Assessment): void {
  h1(doc, 'What you told us');
  muted(doc, 'Approximate figures as you gave them. Nothing here identifies an account or a provider.');
  const currency = a.base_currency;
  const answers = a.answers as unknown as Record<string, unknown>;
  const skipped = new Set<string>(a.unanswered);
  for (const section of Object.keys(SECTIONS) as Section[]) {
    const rows: Array<[string, string]> = [];
    for (const f of FIELDS) {
      if (f.section !== section || f.id === 'consent' || f.repeat !== undefined) continue;
      if (f.showIf !== undefined && !f.showIf(a.answers)) continue;
      const value = answers[f.id];
      if (value === 'n/a') continue;
      rows.push([f.prompt, skipped.has(f.id) ? 'not answered' : answerText(value, f.type, currency)]);
    }
    if (section === 'D') {
      const pensions = skipped.has('pensions')
        ? ['not answered']
        : a.answers.pensions.length === 0
          ? ['none']
          : a.answers.pensions.map(
              (p, i) =>
                `Pension ${i + 1}: ${label(p.pension_type)}, ${p.pension_country}, ${typeof p.pension_value === 'number' ? exactMoney(p.pension_value, currency) : answerText(p.pension_value, 'money', undefined)}`,
            );
      rows.unshift(...pensions.map((text): [string, string] => [text, '']));
    }
    if (section === 'G') {
      rows.length = 0;
      rows.push(
        ['Inflation', percent(a.assumptions.inflation_rate)],
        ['Growth on investments and pensions', percent(a.assumptions.investment_growth_rate)],
        ['Growth on cash', percent(a.assumptions.cash_growth_rate)],
        ['Growth on property', percent(a.assumptions.property_growth_rate)],
        ['Income your pot is assumed to provide each year', percent(a.assumptions.withdrawal_rate)],
      );
    }
    if (rows.length === 0) continue;
    h2(doc, SECTIONS[section].title);
    keyValue(doc, rows);
  }
}

export function buildReport(input: ReportInput): Promise<Buffer> {
  const { assessment: a, whys, previous, delta } = input;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 56, bottom: 56, left: 56, right: 56 },
      bufferPages: true,
      info: { Title: `${BRAND} financial blind spot report`, Author: `${ASSISTANT_NAME} at ${BRAND}`, Creator: BRAND },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const date = new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    coverBand(doc, date, a.status === 'partial' ? 'Partial assessment' : 'Full assessment', a.base_currency);
    doc.moveDown(0.5);
    body(
      doc,
      a.status === 'partial'
        ? `A snapshot of where you stand on the questions you answered, with the gaps made explicit. Fill in the rest with /start to complete the picture.`
        : `A snapshot of where you stand today: the retirement you are heading for, the blind spots that matter most, and what to learn about next.`,
    );

    gapsSection(doc, a);
    projectionSection(doc, a);
    blindSpotsSection(doc, a, whys);
    if (previous !== undefined && delta !== undefined) progressSection(doc, previous, a, delta);
    answersSection(doc, a);

    doc.moveDown(1);
    muted(doc, DISCLAIMER);
    footers(doc);
    doc.end();
  });
}
