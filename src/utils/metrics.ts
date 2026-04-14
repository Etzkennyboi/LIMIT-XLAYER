// src/utils/metrics.ts
import { Counter, Histogram, Gauge, Registry } from 'prom-client';

export const registry = new Registry();

export const metrics = {
  intentsCreated: new Counter({
    name: 'limit_order_intents_created_total',
    help: 'Total intents created',
    labelNames: ['type', 'chain'],
    registers: [registry],
  }),
  intentsTriggered: new Counter({
    name: 'limit_order_intents_triggered_total',
    help: 'Total intents triggered',
    labelNames: ['type'],
    registers: [registry],
  }),
  intentsExecuted: new Counter({
    name: 'limit_order_intents_executed_total',
    help: 'Total intents executed',
    labelNames: ['status', 'chain'],
    registers: [registry],
  }),
  executionLatency: new Histogram({
    name: 'limit_order_execution_latency_seconds',
    help: 'Latency from TRIGGERED to SETTLED',
    buckets: [1, 5, 10, 15, 30, 60, 120],
    registers: [registry],
  }),
  queueLength: new Gauge({
    name: 'limit_order_queue_length',
    help: 'Current queue length',
    labelNames: ['queue'],
    registers: [registry],
  }),
  priceVariance: new Gauge({
    name: 'limit_order_price_variance',
    help: 'Price variance ratio between sources',
    labelNames: ['chain', 'token'],
    registers: [registry],
  }),
};
