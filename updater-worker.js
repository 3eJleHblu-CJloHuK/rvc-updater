import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import AdmZip from 'adm-zip';

// Only those are trusted
const ALLOWED_HOST = 'github.com';
const ALLOWED_PATH_PREFIX = '/3eJleHblu-CJloHuK/pipapopa/releases/download/';
const EXPECTED_SHA256 = 'c9736070d80ff7e7ec74e80166fb7d9037a5280b9df8ae54a9270ffdf9572a0f'; // 'abc123...'

// -----------------------------------------------------------------------------

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit'
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Err: "${command} ${args.join(' ')}" code ${code}`));
    });
  });
}

function assertAllowedUrl(zipUrl) {
  let u;
  try {
    u = new URL(zipUrl);
  } catch {
    throw new Error(`Invalid URL: ${zipUrl}`);
  }
  if (u.protocol !== 'https:') {
    throw new Error(`Only https allowed, got: ${u.protocol}`);
  }
  if (u.host !== ALLOWED_HOST) {
    throw new Error(`Host not allowed: ${u.host}`);
  }
  if (!u.pathname.startsWith(ALLOWED_PATH_PREFIX)) {
    throw new Error(`Path not allowed: ${u.pathname}`);
  }
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

function safeExtract(zip, targetDir) {
  const resolvedTarget = path.resolve(targetDir);
  for (const entry of zip.getEntries()) {
    const outPath = path.resolve(resolvedTarget, entry.entryName);
    if (outPath !== resolvedTarget && !outPath.startsWith(resolvedTarget + path.sep)) {
      throw new Error(`Zip-slip detected: ${entry.entryName}`);
    }
  }
  zip.extractAllTo(resolvedTarget, true);
}

export async function downloadAndRunNodeApp(zipUrl, entryFile = 'index.js') {
  assertAllowedUrl(zipUrl);

  const tempDir = path.resolve('./temp_node_app');
  const zipPath = path.join(tempDir, 'source.zip');

  try {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
    await fs.promises.mkdir(tempDir, { recursive: true });

    log(`Downloading update archive: ${zipUrl}`);
    const fileRes = await fetch(zipUrl, {
      headers: { 'User-Agent': 'NodeJS-Updater' }
    });

    if (!fileRes.ok) {
      throw new Error(`Loading error (${fileRes.status}): ${fileRes.statusText}`);
    }

    await pipeline(Readable.fromWeb(fileRes.body), fs.createWriteStream(zipPath));

    if (EXPECTED_SHA256) {
      log('Verifying archive checksum...');
      const actual = await sha256File(zipPath);
      if (actual !== EXPECTED_SHA256) {
        throw new Error(`Checksum mismatch: expected ${EXPECTED_SHA256}, got ${actual}`);
      }
      log('Checksum OK');
    } else {
      log('WARNING: EXPECTED_SHA256 is not set — archive integrity is not verified');
    }

    log('Unpacking...');
    const zip = new AdmZip(zipPath);
    safeExtract(zip, tempDir);
    await fs.promises.rm(zipPath, { force: true });

    const extractedItems = await fs.promises.readdir(tempDir, { withFileTypes: true });
    const subDirs = extractedItems.filter(item => item.isDirectory());
    const hasRootFiles = extractedItems.some(item => item.isFile());

    const projectDir = (!hasRootFiles && subDirs.length === 1)
      ? path.join(tempDir, subDirs[0].name)
      : tempDir;

    const pkgPath = path.join(projectDir, 'package.json');

    if (fs.existsSync(pkgPath)) {
      log('Installing deps...');
      await runCommand('npm', ['install', '--omit=dev'], projectDir);
    } else {
      log('No package.json — writing minimal one');
      await fs.promises.writeFile(pkgPath, JSON.stringify({ type: 'commonjs' }, null, 2));
    }

    log(`Running entry: ${entryFile}`);
    await runCommand('node', [entryFile], projectDir);

    log('Done');
  } catch (error) {
    // cleanup on failure, но не удаляем tempDir — полезно для диагностики
    throw new Error(error.message);
  }
}