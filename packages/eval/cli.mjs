#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { summarize } from './index.mjs';

const file = process.argv[2];
if (!file) throw new Error('Usage: jev-eval observations.jsonl');
const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
console.log(JSON.stringify(summarize(rows), null, 2));
