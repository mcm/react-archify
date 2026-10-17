import type { ArchifyDocument } from '../../src';

const modules = import.meta.glob<{ default: ArchifyDocument }>('../examples/*.json', { eager: true });

export const EXAMPLES: Record<string, ArchifyDocument> = Object.fromEntries(
  Object.entries(modules)
    .map(([file, module]) => [file.split('/').pop()!, module.default] as const)
    .filter(([, document]) => Boolean(document.diagram_type))
    .sort(([a], [b]) => a.localeCompare(b)),
);
