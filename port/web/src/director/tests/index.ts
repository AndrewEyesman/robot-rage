// Runs the Director runtime's unit tests in the page (tests.html) and reports to
// window.__unitResults for port/tools/unit-tests.mjs. ?only=word runs the tests whose
// area or name contains the word; ?skip=word leaves those out.

import { loadSystemFonts } from '../fonts';
import { cases, cleanup, type TestCase } from './harness';
import './score.test';
import './frame.test';
import './dispatch.test';
import './input.test';
import './render.test';
import './text.test';
import './image.test';
import './net.test';
import './s3d.test';

interface Result {
  area: string;
  name: string;
  source: string;
  status: 'pass' | 'fail' | 'known' | 'fixed';
  message?: string;
  reason?: string;
  ms: number;
}

async function runOne(c: TestCase): Promise<Result> {
  const t0 = performance.now();
  let error: unknown = null;
  try {
    await c.fn();
  } catch (e) {
    error = e;
  } finally {
    cleanup();
  }
  const ms = Math.round(performance.now() - t0);
  const message = error ? (error instanceof Error ? (error.name === 'Error' || error.constructor.name === 'AssertionError' ? error.message : `${error.name}: ${error.message}`) : String(error)) : undefined;
  const base = { area: c.area, name: c.name, source: c.source, ms };
  if (c.knownFailure) return { ...base, status: error ? 'known' : 'fixed', reason: c.knownFailure, message };
  return { ...base, status: error ? 'fail' : 'pass', message };
}

async function main() {
  const query = new URLSearchParams(location.search);
  const only = query.get('only')?.toLowerCase();
  const skip = query.get('skip')?.toLowerCase();
  const t0 = performance.now();
  await loadSystemFonts('/assets');
  const results: Result[] = [];
  const out = document.getElementById('out')!;
  for (const c of cases) {
    const title = `${c.area} ${c.name}`.toLowerCase();
    if ((only && !title.includes(only)) || (skip && title.includes(skip))) continue;
    const r = await runOne(c);
    results.push(r);
    const line = document.createElement('div');
    line.textContent = `${r.status.toUpperCase().padEnd(5)} [${r.area}] ${r.name}${r.message ? ` -- ${r.message}` : ''}`;
    line.className = r.status;
    out.append(line);
  }
  (window as unknown as { __unitResults: unknown }).__unitResults = { results, ms: Math.round(performance.now() - t0) };
}

main().catch((e) => {
  (window as unknown as { __unitResults: unknown }).__unitResults = { error: String(e?.stack ?? e) };
});
