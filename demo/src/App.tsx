import { useState } from 'react';
import { ArchifyDiagram, type NotesPlacement, type ThemeMode, type Variant } from '../../src';
import { EXAMPLES } from './examples';

const VARIANTS: Variant[] = ['classic', 'signal-flow', 'blueprint', 'editorial'];

export function App() {
  const names = Object.keys(EXAMPLES);
  const [example, setExample] = useState(names.includes('web-app.architecture.json') ? 'web-app.architecture.json' : names[0]);
  const [variant, setVariant] = useState<Variant | ''>('');
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [notes, setNotes] = useState<NotesPlacement>('bottom');
  const [showMaximize, setShowMaximize] = useState(true);
  const [showExport, setShowExport] = useState(true);
  const [view, setView] = useState('');

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <form style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 12 }} onSubmit={(event) => event.preventDefault()}>
        <label>Diagram{' '}
          <select value={example} onChange={(event) => setExample(event.target.value)}>
            {names.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        <label>variant{' '}
          <select value={variant} onChange={(event) => setVariant(event.target.value as Variant | '')}>
            <option value="">(authored)</option>
            {VARIANTS.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>theme{' '}
          <select value={theme} onChange={(event) => setTheme(event.target.value as ThemeMode)}>
            <option>system</option><option>light</option><option>dark</option>
          </select>
        </label>
        <label>notesPlacement{' '}
          <select value={notes} onChange={(event) => setNotes(event.target.value as NotesPlacement)}>
            <option>bottom</option><option>right</option>
          </select>
        </label>
        <label><input type="checkbox" checked={showMaximize} onChange={(event) => setShowMaximize(event.target.checked)} /> showMaximize</label>
        <label><input type="checkbox" checked={showExport} onChange={(event) => setShowExport(event.target.checked)} /> showExport</label>
        <output style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>view: {view || '(none)'}</output>
      </form>
      <ArchifyDiagram
        key={example}
        diagram={EXAMPLES[example]}
        variant={variant || undefined}
        theme={theme}
        notesPlacement={notes}
        showMaximize={showMaximize}
        showExport={showExport}
        onViewChange={setView}
        style={{ height: 'calc(100vh - 80px)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 0 0 1px rgba(0,0,0,.12)' }}
      />
    </div>
  );
}
