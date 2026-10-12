import { postEvent, status, shutdownBridge } from './client.mjs';
import { base } from './runtime.mjs';
try {
  const c = process.argv[2] || 'status';
  let result;
  if (c === 'status') result = await status();
  else if (c === 'wake' || c === 'hide') result = await postEvent({ action: c, source: 'chatgpt' });
  else if (c === 'state')
    result = await postEvent({
      action: 'update',
      source: 'chatgpt',
      state: process.argv[3],
      message: process.argv[4] || '',
    });
  else if (c === 'stop') {
    result = await shutdownBridge();
  } else
    throw new Error(
      'Usage: node bridge/cli.mjs wake|hide|status|stop|state <idle|thinking|working|success|error|sleeping> [message]',
    );
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
