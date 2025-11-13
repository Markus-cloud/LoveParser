import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd());
const SRC = path.join(ROOT, 'src');

function readAllFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readAllFiles(full));
    } else if (/\.(js|ts|jsx|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function normalizeImportPath(p) {
  // remove extensions
  return p.replace(/\.(js|ts|jsx|tsx)$/, '')
    .replace(/\\/g, '/');
}

function fileToImportKeys(filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  const withoutExt = normalizeImportPath(rel);
  const parts = [];
  parts.push(withoutExt);
  // also push basename without dirs
  parts.push(path.basename(withoutExt));
  // and path prefixed with ./src
  parts.push('src/' + withoutExt);
  return Array.from(new Set(parts));
}

function findUnused() {
  const allFiles = readAllFiles(SRC);
  const contentMap = {};
  for (const f of allFiles) {
    contentMap[f] = fs.readFileSync(f, 'utf8');
  }

  const results = [];

  for (const f of allFiles) {
    const keys = fileToImportKeys(f);
    // skip index files which are often entrypoints
    const base = path.basename(f);
    if (base.toLowerCase().startsWith('index.')) continue;
    // skip pages probably referenced by router via string? we still check

    // check in all other files
    let found = false;
    for (const other of allFiles) {
      if (other === f) continue;
      const txt = contentMap[other];
      for (const k of keys) {
        if (txt.includes(k)) {
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      results.push(path.relative(ROOT, f));
    }
  }

  return results;
}

const unused = findUnused();
console.log(JSON.stringify({ unused, timestamp: new Date().toISOString() }, null, 2));
process.exit(0);
