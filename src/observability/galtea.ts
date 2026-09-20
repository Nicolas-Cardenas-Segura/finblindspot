import { SpanStatusCode } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  NodeTracerProvider,
  SimpleSpanProcessor,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-node';
import type { Env } from '../config/env.js';
import { createLogger, errorData } from '../log/logger.js';

export interface Telemetry {
  enabled: boolean;
  turn<T extends { text: string }>(
    userId: string,
    input: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown> | ((output: T) => Record<string, unknown>),
  ): Promise<T>;
  generation<T>(
    purpose: string,
    model: string,
    messages: unknown,
    fn: () => Promise<{ text: string; value: T }>,
  ): Promise<T>;
  guardrail(fn: () => Promise<'ALLOW' | 'BLOCK'>, text: string): Promise<'ALLOW' | 'BLOCK'>;
  shutdown(): Promise<void>;
}

const log = createLogger('galtea');

function json(value: unknown): string {
  return JSON.stringify(value) ?? 'null';
}

export const noopTelemetry: Telemetry = {
  enabled: false,
  turn: async (_userId, _input, fn) => fn(),
  generation: async (_purpose, _model, _messages, fn) => (await fn()).value,
  guardrail: async (fn) => fn(),
  shutdown: async () => undefined,
};

export function createTelemetry(
  env: Pick<Env, 'GALTEA_API_KEY' | 'GALTEA_VERSION_ID' | 'GALTEA_OTEL_ENDPOINT'>,
  options: { exporter?: SpanExporter } = {},
): Telemetry {
  if (env.GALTEA_API_KEY === undefined || env.GALTEA_VERSION_ID === undefined) {
    log.info('Galtea monitoring disabled');
    return noopTelemetry;
  }

  const exporter =
    options.exporter ??
    new OTLPTraceExporter({
      url: env.GALTEA_OTEL_ENDPOINT,
      headers: { Authorization: `Bearer ${env.GALTEA_API_KEY}` },
    });
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      'galtea.version.id': env.GALTEA_VERSION_ID,
      'service.name': 'finblindspot',
    }),
    spanProcessors: [
      options.exporter === undefined ? new BatchSpanProcessor(exporter) : new SimpleSpanProcessor(exporter),
    ],
  });
  provider.register();
  const tracer = provider.getTracer('finblindspot');
  let stopped = false;
  log.info('Galtea monitoring enabled');

  const telemetry: Telemetry = {
    enabled: true,
    turn: (userId, input, fn, metadata) =>
      tracer.startActiveSpan(`interview ${userId}`, async (span) => {
        span.setAttributes({
          'galtea.session.custom_id': `interview:${userId}`,
          'galtea.span.type': 'AGENT',
          'galtea.span.input': json(input),
        });
        try {
          const output = await fn();
          span.setAttribute('galtea.span.output', json(output.text));
          const resolvedMetadata = typeof metadata === 'function' ? metadata(output) : metadata;
          if (resolvedMetadata !== undefined) span.setAttribute('galtea.span.metadata', json(resolvedMetadata));
          span.setStatus({ code: SpanStatusCode.OK });
          return output;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          span.setAttribute('galtea.span.error', message);
          span.recordException(error instanceof Error ? error : new Error(message));
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          throw error;
        } finally {
          span.end();
        }
      }),
    generation: (purpose, model, messages, fn) =>
      tracer.startActiveSpan(purpose, async (span) => {
        span.setAttributes({
          'galtea.span.type': 'GENERATION',
          'gen_ai.operation.name': 'chat',
          'gen_ai.request.model': model,
          'galtea.span.input': json(messages),
        });
        try {
          const result = await fn();
          span.setAttribute('galtea.span.output', json(result.text));
          span.setStatus({ code: SpanStatusCode.OK });
          return result.value;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          span.setAttribute('galtea.span.error', message);
          span.recordException(error instanceof Error ? error : new Error(message));
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          throw error;
        } finally {
          span.end();
        }
      }),
    guardrail: (fn, text) =>
      tracer.startActiveSpan('guardrail', async (span) => {
        span.setAttributes({
          'galtea.span.type': 'GUARDRAIL',
          'galtea.span.input': text,
        });
        try {
          const verdict = await fn();
          span.setAttribute('galtea.span.output', verdict);
          span.setStatus({ code: SpanStatusCode.OK });
          return verdict;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          span.setAttribute('galtea.span.error', message);
          span.recordException(error instanceof Error ? error : new Error(message));
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          throw error;
        } finally {
          span.end();
        }
      }),
    shutdown: async () => {
      if (stopped) return;
      stopped = true;
      try {
        await provider.shutdown();
      } catch (error) {
        log.warn('Galtea monitoring shutdown failed', errorData(error));
      }
    },
  };
  return telemetry;
}
