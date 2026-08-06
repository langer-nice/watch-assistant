import { readFile } from 'node:fs/promises';

export async function load(url, context, nextLoad) {
  if (url.endsWith('.json')) {
    const contents = await readFile(new URL(url), 'utf8');
    return {
      format: 'module',
      shortCircuit: true,
      source: `export default ${contents};`,
    };
  }
  if (url.endsWith('/analytics.js')) {
    const contents = await readFile(new URL(url), 'utf8');
    return {
      format: 'module',
      shortCircuit: true,
      source: contents.replaceAll('import.meta.env', '({ PROD: false })'),
    };
  }
  return nextLoad(url, context);
}
