import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Fixture } from './Fixture';

// ?fixture renders one diagram filling the window for the browser tests;
// otherwise the interactive playground.
const params = new URLSearchParams(window.location.search);
createRoot(document.getElementById('root')!).render(
  <StrictMode>{params.has('fixture') ? <Fixture params={params} /> : <App />}</StrictMode>,
);
