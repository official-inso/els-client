import { ELSClient } from '@inso_web/els-client';

const els = new ELSClient({
  apiKey: process.env.ELS_API_KEY || 'els_live_xxxxxxxx',
  appSlug: 'examples',
  deploymentEnv: 'DEV',
  serviceName: 'node-basic-example',
});

async function main() {
  try {
    throw new Error('Demo error from node-basic example');
  } catch (err) {
    const e = err as Error;
    const result = await els.sendError({
      message: e.message,
      stack: e.stack,
      level: 'error',
    });
    console.log('Sent error:', result);
  }
}

main().catch(console.error);
