import { ArchifyDiagram, type ArchifyApi, type NotesPlacement, type ThemeMode, type Variant } from '../../src';
import { EXAMPLES } from './examples';

declare global {
  interface Window {
    archify?: ArchifyApi;
    archifyEvents?: Array<{ type: string; value: unknown }>;
  }
}

// Test fixture: the component fills the window (or sits at an offset inside
// a scrolling page with ?offset=1) so it can be compared with standalone
// Archify at the same viewport size.
export function Fixture({ params }: { params: URLSearchParams }) {
  const example = params.get('fixture') || 'web-app.architecture.json';
  const offset = params.has('offset');
  const flag = (name: string, fallback: boolean) => (params.has(name) ? params.get(name) !== '0' : fallback);
  window.archifyEvents = window.archifyEvents || [];
  const record = (type: string) => (value: unknown) => window.archifyEvents!.push({ type, value });
  const diagram = (
    <ArchifyDiagram
      diagram={EXAMPLES[example]}
      variant={(params.get('variant') as Variant) || undefined}
      theme={(params.get('theme') as ThemeMode) || 'dark'}
      showMaximize={flag('maximize', true)}
      showExport={flag('export', true)}
      notesPlacement={(params.get('notes') as NotesPlacement) || 'bottom'}
      urlState={flag('url', false)}
      defaultView={params.get('view') || undefined}
      style={offset ? { width: 1100, height: 700, margin: '120px 0 0 90px' } : { width: '100vw', height: '100vh' }}
      onReady={(api) => { window.archify = api; record('ready')(true); }}
      onViewChange={record('view')}
      onMaximizeChange={record('maximize')}
      onError={(error) => record('error')(error.message)}
    />
  );
  if (!offset) return diagram;
  return (
    <div style={{ minHeight: '200vh', background: '#fafafa', fontFamily: 'Georgia, serif' }}>
      <p style={{ margin: 0, padding: 16 }}>Host page content above the diagram.</p>
      {diagram}
      <p style={{ padding: 16 }}>Host page content below the diagram.</p>
    </div>
  );
}
