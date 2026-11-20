import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Development research only. The control service never imports this command.
const key = process.env.TAVILY_API_KEY;
if (!key?.startsWith('tvly-')) throw new Error('Set TAVILY_API_KEY in .local/tavily.env before fetching resources.');
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'resources', 'catalog.json');
const refresh = process.argv.includes('--refresh');
if (!refresh) {
  try {
    const saved = JSON.parse(await readFile(output, 'utf8'));
    if (Date.now() - Date.parse(saved.checkedAt) < 86400000) {
      console.log('Using the saved resource catalog. Pass --refresh to spend up to three more basic-search credits.');
      process.exit(0);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function request(path, body) {
  const response = await fetch('https://api.tavily.com/' + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('Tavily returned HTTP ' + response.status + '. No automatic retry was made.');
  return response.json();
}
const usage = await request('usage');
const account = usage.account;
// This command uses only the monthly allowance. It does not enable pay-as-you-go.
if (!account || !Number.isFinite(account.plan_limit) || account.plan_limit - account.plan_usage < 3) {
  throw new Error('At least three unused monthly plan credits are required.');
}
const searches = [
  { topic: 'Gateway integration', query: 'Bifrost HTTPTransportPreHook governance virtual keys disable key API', include_domains: ['docs.getbifrost.ai', 'github.com/maximhq/bifrost'] },
  { topic: 'Intro and UI motion', query: 'Three.js documentation WebGLRenderer dispose CSS view transitions pointer events', include_domains: ['threejs.org', 'developer.chrome.com', 'w3.org'] },
  { topic: 'Fonts and icons', query: 'Geist font SIL Open Font License Lucide icons license', include_domains: ['vercel.com', 'github.com/vercel/geist-font', 'lucide.dev'] },
];
const sections = [];
let creditsUsed = 0;
for (const search of searches) {
  const result = await request('search', {
    query: search.query, include_domains: search.include_domains,
    search_depth: 'basic', max_results: 4, include_usage: true,
    include_answer: false, include_raw_content: false, auto_parameters: false,
  });
  creditsUsed += result.usage?.credits ?? 1;
  const domains = search.include_domains.map((domain) => new URL('https://' + domain).hostname);
  const sources = (result.results ?? []).filter(({ url }) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && domains.includes(parsed.hostname);
    } catch { return false; }
  }).map(({ title, url }) => ({ title, url }));
  sections.push({ topic: search.topic, query: search.query, sources });
}
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ checkedAt: new Date().toISOString(), provider: 'Tavily', creditsUsed, sections }, null, 2) + '\n');
console.log(JSON.stringify({ sections: sections.length, sources: sections.reduce((n, section) => n + section.sources.length, 0), creditsUsed, file: 'resources/catalog.json' }));
