#!/usr/bin/env node
/**
 * Parse index.dic to JSON array of Ukrainian words (same order as embeddings).
 * Word = part before "/" or full line. Skip first line (count) and lines starting with "+".
 */
const fs = require('fs');
const path = require('path');

const dicPath = path.join(__dirname, '..', 'index.dic');
const outPath = path.join(__dirname, '..', 'public', 'words.json');

const content = fs.readFileSync(dicPath, 'utf8');
const lines = content.split(/\r?\n/);

const words = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  if (i === 0 && /^\d+$/.test(line)) continue; // skip count line
  if (line.startsWith('+')) continue; // skip +cs=...
  const word = line.includes('/') ? line.split('/')[0].trim() : line;
  if (!word) continue;
  words.push(word);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(words), 'utf8');
console.log('Parsed', words.length, 'words ->', outPath);
