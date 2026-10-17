// Builds the reference artifacts: every example rendered by the Archify CLI
// itself (from the pinned checkout), once per visual preset.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REFERENCE_DIR, VARIANTS, checkoutDir, examples } from './support';

export default function globalSetup() {
  const checkout = checkoutDir();
  if (!fs.existsSync(checkout)) execFileSync(process.execPath, ['scripts/sync-archify.mjs'], { stdio: 'inherit' });
  fs.mkdirSync(REFERENCE_DIR, { recursive: true });
  const work = path.join(REFERENCE_DIR, 'json');
  fs.mkdirSync(work, { recursive: true });
  for (const example of examples()) {
    const document = JSON.parse(fs.readFileSync(path.join('demo', 'examples', example), 'utf8'));
    for (const variant of VARIANTS) {
      const output = path.join(REFERENCE_DIR, `${example}.${variant}.html`);
      if (fs.existsSync(output)) continue;
      const input = path.join(work, `${example}.${variant}.json`);
      fs.writeFileSync(input, JSON.stringify({ ...document, meta: { ...document.meta, visual_preset: variant } }));
      execFileSync(process.execPath, [path.join(checkout, 'archify', 'renderers', document.diagram_type, `render-${document.diagram_type}.mjs`), input, output], { stdio: 'pipe' });
    }
  }
}
