// Parity: the browser renderers produce byte-identical HTML to the Archify CLI
// for every checked-in example, rendered back to back in one process so leaked
// module state between renders would show up as a difference.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ARCHIFY_COMMIT } from '../../scripts/sync-archify.mjs';
import { setBrowserInput } from '../../src/vendor/archify/renderers/shared/cli.mjs';
import { FULL_TEMPLATE } from '../../src/vendor/archify/full-template.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const checkout = path.join(root, '.archify-cache', ARCHIFY_COMMIT);
const examples = path.join(checkout, 'archify', 'examples');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-parity-'));

const cases = fs.readdirSync(examples)
  .filter((file) => file.endsWith('.json'))
  .map((file) => {
    const diagram = JSON.parse(fs.readFileSync(path.join(examples, file), 'utf8'));
    return { file, diagram, type: diagram.diagram_type };
  })
  .filter((entry) => entry.type);

test('every diagram type has an example', () => {
  const types = new Set(cases.map((entry) => entry.type));
  assert.deepEqual([...types].sort(), ['architecture', 'class', 'dataflow', 'erd', 'lifecycle', 'sequence', 'timeline', 'tree', 'waterfall', 'workflow']);
});

for (const entry of cases) {
  test(`${entry.file} renders identically to the CLI`, async (t) => {
    const output = path.join(work, `${entry.file}.html`);
    let expected;
    try {
      execFileSync(process.execPath, [path.join(checkout, 'archify', 'renderers', entry.type, `render-${entry.type}.mjs`), path.join(examples, entry.file), output], {
        cwd: work, stdio: 'pipe', env: { ...process.env, ARCHIFY_DIAGNOSTIC_FORMAT: '' },
      });
      expected = fs.readFileSync(output, 'utf8');
    } catch (error) {
      expected = null;
    }
    setBrowserInput({ diagram: entry.diagram, template: FULL_TEMPLATE });
    const renderer = await import(`../../src/vendor/archify/renderers/${entry.type}/render-${entry.type}.mjs`);
    let actual = null;
    let failure = null;
    try {
      actual = (await renderer.render()).html;
    } catch (error) {
      failure = error;
    }
    if (expected === null) {
      t.diagnostic('CLI rejects this example; browser renderer must reject it too');
      assert.ok(failure, 'browser renderer accepted an example the CLI rejects');
      return;
    }
    if (failure) throw failure;
    assert.ok(actual === expected, `${entry.file}: HTML differs from CLI output`);
  });
}
