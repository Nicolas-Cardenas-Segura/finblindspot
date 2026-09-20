import type OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { FIELDS } from '../../src/questionnaire/fields.js';
import type { FieldDef } from '../../src/questionnaire/fields.js';
import { classifyIntent } from '../../src/questionnaire/intent.js';

function fieldById(id: string): FieldDef {
  const field = FIELDS.find((f) => f.id === id);
  if (!field) throw new Error(`unknown field ${id}`);
  return field;
}

function stubClient(content: string) {
  const create = vi.fn().mockResolvedValue({ choices: [{ message: { content } }] });
  const client = { chat: { completions: { create } } } as unknown as OpenAI;
  return { client, create };
}

const income = fieldById('income_monthly');
const age = fieldById('age');
const lifeCover = fieldById('life_cover');

describe('classifyIntent', () => {
  it('treats a slash reply as a command without calling the model', async () => {
    const { client, create } = stubClient('{}');
    expect(await classifyIntent(income, '/forget', { answered: {} }, { client })).toEqual({
      kind: 'command',
      command: '/forget',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('treats a don\'t know synonym as dont_know without calling the model', async () => {
    const { client, create } = stubClient('{}');
    expect(await classifyIntent(income, 'not sure', { answered: {} }, { client })).toEqual({
      kind: 'dont_know',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('accepts an exact option on a yes/no field without calling the model', async () => {
    const { client, create } = stubClient('{}');
    expect(await classifyIntent(lifeCover, 'yes', { answered: {} }, { client })).toEqual({
      kind: 'answer',
      value: 'yes',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('accepts a bare number on a money field without calling the model', async () => {
    const { client, create } = stubClient('{}');
    expect(await classifyIntent(income, '4200', { answered: {} }, { client })).toEqual({
      kind: 'answer',
      value: 4200,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('uses a validated model answer', async () => {
    const { client } = stubClient(JSON.stringify({ intent: 'answer', value: 4200 }));
    expect(await classifyIntent(income, 'about 4.2k after tax', { answered: {} }, { client })).toEqual({
      kind: 'answer',
      value: 4200,
    });
  });

  it('rejects a model answer that fails the field parser', async () => {
    const { client } = stubClient(JSON.stringify({ intent: 'answer', value: 12 }));
    expect(await classifyIntent(age, 'a dozen years', { answered: {} }, { client })).toEqual({
      kind: 'off_topic',
    });
  });

  it('returns a question intent', async () => {
    const { client } = stubClient(JSON.stringify({ intent: 'question' }));
    expect(await classifyIntent(income, 'why do you need this?', { answered: {} }, { client })).toEqual({
      kind: 'question',
      text: 'why do you need this?',
    });
  });

  it('accepts a correction on an answered field', async () => {
    const { client } = stubClient(
      JSON.stringify({ intent: 'correction', field_id: 'spend_housing', value: 1500 }),
    );
    expect(
      await classifyIntent(
        income,
        'actually my rent is 1500',
        { answered: { spend_housing: 1400 } },
        { client },
      ),
    ).toEqual({ kind: 'correction', fieldId: 'spend_housing', value: 1500 });
  });

  it('rejects a correction on a field that is not answered yet', async () => {
    const { client } = stubClient(
      JSON.stringify({ intent: 'correction', field_id: 'spend_housing', value: 1500 }),
    );
    expect(
      await classifyIntent(income, 'actually my rent is 1500', { answered: {} }, { client }),
    ).toEqual({ kind: 'off_topic' });
  });

  it('treats unparsable model output as off_topic', async () => {
    const { client } = stubClient('garbage');
    expect(await classifyIntent(income, 'tell me a joke', { answered: {} }, { client })).toEqual({
      kind: 'off_topic',
    });
  });

  it('extracts validated values for other open fields in the same message', async () => {
    const housing = fieldById('spend_housing');
    const living = fieldById('spend_living');
    const { client, create } = stubClient(
      JSON.stringify({ intent: 'answer', value: 5000, values: { spend_housing: 1800, spend_living: 'lots', retire_age: 60 } }),
    );
    expect(
      await classifyIntent(
        income,
        'I take home 5k, rent is 1800 and living is lots',
        { answered: {}, open: [housing, living] },
        { client },
      ),
    ).toEqual({ kind: 'answer', value: 5000, extra: { spend_housing: 1800 } });
    const params = create.mock.calls[0]?.[0] as { messages: { content: string }[] };
    expect(params.messages[0]?.content).toContain('- spend_housing:');
    expect(params.messages[0]?.content).toContain('- spend_living:');
  });

  it('returns answer_others when only other open fields were answered', async () => {
    const housing = fieldById('spend_housing');
    const { client } = stubClient(JSON.stringify({ intent: 'answer', values: { spend_housing: 1800 } }));
    expect(
      await classifyIntent(income, 'rent is 1800', { answered: {}, open: [housing] }, { client }),
    ).toEqual({ kind: 'answer_others', extra: { spend_housing: 1800 } });
  });

  it('keeps null in extra values only where unknown is allowed', async () => {
    const housing = fieldById('spend_housing');
    const dependants = fieldById('dependants');
    const { client } = stubClient(
      JSON.stringify({ intent: 'answer', value: 5000, values: { spend_housing: null, dependants: null } }),
    );
    expect(
      await classifyIntent(income, '5k, no idea on rent', { answered: {}, open: [housing, dependants] }, { client }),
    ).toEqual({ kind: 'answer', value: 5000, extra: { spend_housing: null } });
  });
});
