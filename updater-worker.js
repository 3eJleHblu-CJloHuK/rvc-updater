import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import AdmZip from 'adm-zip';

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Err: "${command} ${args.join(' ')}" code ${code}`));
    });
  });
}

async function downloadAndRunNodeApp(zipUrl, entryFile = 'index.js') {
  const tempDir = path.resolve('./temp_node_app');
  const zipPath = path.join(tempDir, 'source.zip');

  try {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
    await fs.promises.mkdir(tempDir, { recursive: true });

    console.log(`[${new Date().toISOString()}] Downloading update archive...`);
    const fileRes = await fetch(zipUrl, {
      headers: { 'User-Agent': 'NodeJS-Updater' }
    });

    if (!fileRes.ok) {
      throw new Error(`Loading error (${fileRes.status}): ${fileRes.statusText}`);
    }

    await pipeline(Readable.fromWeb(fileRes.body), fs.createWriteStream(zipPath));

    // console.log('Unpacking...');
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tempDir, true);
    await fs.promises.rm(zipPath, { force: true });

    const extractedItems = await fs.promises.readdir(tempDir, { withFileTypes: true });
    const subDirs = extractedItems.filter(item => item.isDirectory());
    const hasRootFiles = extractedItems.some(item => item.isFile());

    const projectDir = (!hasRootFiles && subDirs.length === 1)
      ? path.join(tempDir, subDirs[0].name)
      : tempDir;

    const pkgPath = path.join(projectDir, 'package.json');

    if (fs.existsSync(pkgPath)) {
      console.log('Installing deps...');
      await runCommand('npm', ['install', '--omit=dev'], projectDir);
    } else {
      await fs.promises.writeFile(pkgPath, JSON.stringify({ type: 'commonjs' }, null, 2));
    }

    await runCommand('node', [entryFile], projectDir);

  } catch (error) {
    console.error('Error:', error.message);
  }
}


const [,, zipUrl, entryFile] = process.argv;
if (zipUrl) {
  downloadAndRunNodeApp(zipUrl, entryFile || 'index.js');
}
