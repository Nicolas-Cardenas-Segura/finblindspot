import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { describe, expect, it } from 'vitest';
import { createTelemetry } from '../../src/observability/galtea.js';

const endpoint = 'https://otel.example.test/otel/traces';

describe('Galtea telemetry', () => {
  it('is disabled without both Galtea credentials and still runs turns', async () => {
    const telemetry = createTelemetry({
      GALTEA_API_KEY: undefined,
      GALTEA_VERSION_ID: undefined,
      GALTEA_OTEL_ENDPOINT: endpoint,
    });

    expect(telemetry.enabled).toBe(false);
    await expect(telemetry.turn('u1', 'hello', async () => ({ text: 'reply' }))).resolves.toEqual({
      text: 'reply',
    });
  });

  it('exports nested turn and generation spans', async () => {
    const exporter = new InMemorySpanExporter();
    const telemetry = createTelemetry(
      {
        GALTEA_API_KEY: 'test-key',
        GALTEA_VERSION_ID: 'version-1',
        GALTEA_OTEL_ENDPOINT: endpoint,
      },
      { exporter },
    );

    await telemetry.turn('u1', 'hello', async () => {
      const value = await telemetry.generation(
        'interview response',
        'test-model',
        [{ role: 'user', content: 'hello' }],
        async () => ({ text: 'generated', value: 'value' }),
      );
      return { text: value };
    });
    const spans = exporter.getFinishedSpans();
    const turn = spans.find((span) => span.attributes['galtea.span.type'] === 'AGENT');
    const generation = spans.find((span) => span.attributes['galtea.span.type'] === 'GENERATION');
    expect(turn?.attributes['galtea.session.custom_id']).toBe('interview:u1');
    expect(turn?.attributes['galtea.span.input']).toBe(JSON.stringify('hello'));
    expect(turn?.attributes['galtea.span.output']).toBe(JSON.stringify('value'));
    expect(generation?.parentSpanContext?.spanId).toBe(turn?.spanContext().spanId);
    expect(generation?.attributes['gen_ai.operation.name']).toBe('chat');
    expect(generation?.attributes['gen_ai.request.model']).toBe('test-model');
    expect(generation?.attributes['galtea.span.output']).toBe(JSON.stringify('generated'));
    await telemetry.shutdown();
  });

  it('records turn errors and rethrows them', async () => {
    const exporter = new InMemorySpanExporter();
    const telemetry = createTelemetry(
      {
        GALTEA_API_KEY: 'test-key',
        GALTEA_VERSION_ID: 'version-1',
        GALTEA_OTEL_ENDPOINT: endpoint,
      },
      { exporter },
    );
    const error = new Error('turn failed');

    await expect(telemetry.turn('u1', 'hello', async () => Promise.reject(error))).rejects.toBe(error);
    const turn = exporter.getFinishedSpans().find((span) => span.attributes['galtea.span.type'] === 'AGENT');
    expect(turn?.attributes['galtea.span.error']).toBe('turn failed');
    await telemetry.shutdown();
  });
});
