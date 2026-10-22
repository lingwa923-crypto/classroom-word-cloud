import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const output = resolve(root, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of ['index.html', 'app.js', 'styles.css']) {
  const contents = await readFile(resolve(root, file));
  await writeFile(resolve(output, file), contents);
}

const config = {
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || ''
};
await writeFile(resolve(output, 'config.js'), `window.WORDCLOUD_CONFIG = ${JSON.stringify(config)};\n`);
console.log('已建立 dist/ 靜態網站。');
