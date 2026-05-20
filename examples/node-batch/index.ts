import { ELSClient, ELSQueue } from '@inso_web/els-client';

const client = new ELSClient({
  apiKey: process.env.ELS_API_KEY || 'els_live_xxxxxxxx',
  appSlug: 'examples',
  deploymentEnv: 'DEV',
  serviceName: 'node-batch-example',
});

// Очередь с автофлашем каждые 2 сек или при достижении 25 записей в буфере.
const queue = new ELSQueue(client, {
  flushIntervalMs: 2_000,
  maxBatchSize: 25,
  useBeacon: false, // в Node.js не нужно
});

async function main() {
  console.log('Enqueuing 50 demo errors...');

  for (let i = 0; i < 50; i++) {
    queue.enqueue({
      message: `Demo batch error #${i + 1}`,
      stack: new Error(`Demo batch error #${i + 1}`).stack,
      url: 'file://' + import.meta.url,
      level: i % 5 === 0 ? 'warning' : 'error',
      source: 'server',
    });
  }

  // Альтернативный путь: прямой sendBatch без очереди.
  console.log('Direct sendBatch demo (5 entries)...');
  const directResult = await client.sendBatch([
    { message: 'Direct batch #1', level: 'info', source: 'server' },
    { message: 'Direct batch #2', level: 'info', source: 'server' },
    { message: 'Direct batch #3', level: 'warning', source: 'server' },
    { message: 'Direct batch #4', level: 'error', source: 'server' },
    { message: 'Direct batch #5', level: 'error', source: 'server' },
  ]);
  console.log('Direct batch result:', directResult);

  // Graceful shutdown: флашим всё, что осталось в очереди.
  console.log('Flushing queue before exit...');
  await queue.flush();
  queue.stop();
  console.log('Done.');
}

// Обработка SIGINT/SIGTERM для graceful shutdown.
const shutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}, flushing queue...`);
  await queue.flush();
  queue.stop();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
