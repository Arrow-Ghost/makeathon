// Deletes media files from a static export that nothing in the export references
// (unused photos and PDFs, create-next-app leftovers in public/).
// Usage: node prune.mjs <export dir> <base path>
import { readdir, readFile, rm } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const [dir, base] = process.argv.slice(2);
const MEDIA = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.mp4', '.pdf', '.ttf', '.otf', '.woff', '.woff2']);
const TEXT = new Set(['.html', '.js', '.css', '.txt', '.json']);

const files = (await readdir(dir, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name));

let text = '';
for (const file of files) if (TEXT.has(extname(file))) text += await readFile(file, 'utf8');

// React writes ' and & as entities inside HTML attributes
const htmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;');

for (const file of files) {
  const rel = relative(dir, file).split('\\').join('/');
  if (rel.startsWith('_next/') || !MEDIA.has(extname(file).toLowerCase())) continue;
  const url = `${base}/${rel}`;
  if ([url, encodeURI(url), htmlEscape(url)].some((u) => text.includes(u))) continue;
  await rm(file);
  console.log('pruned', rel);
}
