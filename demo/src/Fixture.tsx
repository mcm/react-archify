import { useEffect, useState } from 'react';
import { ArchifyDiagram, type ArchifyApi, type ArchifyDiagramProps, type NotesPlacement, type ThemeMode, type Variant } from '../../src';
import { EXAMPLES } from './examples';

declare global {
  interface Window {
    archify?: ArchifyApi;
    archifyApis?: Record<string, ArchifyApi>;
    archifyEvents?: Array<{ type: string; value: unknown; instance: string }>;
    setFixtureProps?: (props: Partial<ArchifyDiagramProps> & { mounted?: boolean }, instance?: string) => void;
  }
}

// Test fixture: the component fills the window (or sits at an offset inside
// a scrolling page with ?offset=1, or appears twice with ?twice=1) so it can
// be compared with standalone Archify at the same viewport size. Tests change
// props live through window.setFixtureProps.
export function Fixture({ params }: { params: URLSearchParams }) {
  const example = params.get('fixture') || 'web-app.architecture.json';
  const offset = params.has('offset');
  const twice = params.has('twice');
  const flag = (name: string, fallback: boolean) => (params.has(name) ? params.get(name) !== '0' : fallback);
  const [overrides, setOverrides] = useState<Record<string, Partial<ArchifyDiagramProps> & { mounted?: boolean }>>({});

  useEffect(() => {
    window.archifyEvents = window.archifyEvents || [];
    window.archifyApis = window.archifyApis || {};
    window.setFixtureProps = (props, instance = 'a') => setOverrides((current) => ({ ...current, [instance]: { ...current[instance], ...props } }));
  }, []);

  const base: ArchifyDiagramProps = {
    diagram: params.get('json') ?? EXAMPLES[example],
    variant: (params.get('variant') as Variant) || undefined,
    theme: (params.get('theme') as ThemeMode) || 'dark',
    showMaximize: flag('maximize', true),
    showExport: flag('export', true),
    notesPlacement: (params.get('notes') as NotesPlacement) || 'bottom',
    urlState: flag('url', false),
    defaultView: params.get('view') || undefined,
  };

  const render = (instance: string, style: React.CSSProperties) => {
    const { mounted = true, ...props } = overrides[instance] ?? {};
    if (!mounted) return null;
    const record = (type: string) => (value: unknown) => window.archifyEvents?.push({ type, value, instance });
    return (
      <ArchifyDiagram
        key={instance}
        {...base}
        {...props}
        style={style}
        className={`fixture-${instance}`}
        onReady={(api) => {
          window.archifyApis![instance] = api;
          if (instance === 'a') window.archify = api;
          record('ready')(true);
        }}
        onViewChange={record('view')}
        onMaximizeChange={record('maximize')}
        onRender={(result) => record('render')(result.diagramType)}
        onError={(error) => record('error')(error.message)}
      />
    );
  };

  if (twice) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {render('a', { height: '100vh' })}
        {render('b', { height: '100vh' })}
      </div>
    );
  }
  if (!offset) return render('a', { width: '100vw', height: '100vh' });
  return (
    <div style={{ minHeight: '200vh', background: '#fafafa', fontFamily: 'Georgia, serif' }}>
      <p style={{ margin: 0, padding: 16 }}>Host page content above the diagram.</p>
      {render('a', { width: 1100, height: 700, margin: '120px 0 0 90px' })}
      <p style={{ padding: 16 }}>Host page content below the diagram.</p>
    </div>
  );
}
