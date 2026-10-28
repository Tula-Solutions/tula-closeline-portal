/** The widget's stylesheet, set inside its shadow root so the host page's CSS never reaches it. */
export const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.root {
  --ink: #1a1a18; --paper: #f1efe8;
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;
  font: 15px/1.45 ui-sans-serif, system-ui, sans-serif; color: var(--ink);
}
button, textarea { font: inherit; color: inherit; }
.launch {
  min-height: 44px; padding: 0 18px; border: 1px solid var(--ink); border-radius: 4px;
  background: var(--ink); color: var(--paper); cursor: pointer;
}
.panel {
  display: none; flex-direction: column; width: min(380px, calc(100vw - 32px));
  height: min(520px, calc(100vh - 32px)); background: var(--paper);
  border: 1px solid var(--ink); border-radius: 4px;
}
.root[data-open] .panel { display: flex; }
.root[data-open] .launch { display: none; }
header {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  padding: 12px 14px; border-bottom: 2px solid var(--ink);
}
h1 { margin: 0; font: 420 1.25rem/1.15 Georgia, 'Times New Roman', serif; }
.tag { font: 11px ui-monospace, monospace; letter-spacing: .06em; text-transform: uppercase; opacity: .7; }
.close { border: 0; background: none; cursor: pointer; min-height: 44px; padding: 0 14px; margin: -12px -14px -12px 0; font-size: 13px; }
.log { flex: 1; overflow-y: auto; margin: 0; padding: 0; list-style: none; }
.log li {
  padding: 10px 14px; border-bottom: 1px solid color-mix(in srgb, var(--ink) 20%, transparent);
  white-space: pre-wrap; overflow-wrap: anywhere;
}
.log li[data-role='prospect'] { background: color-mix(in srgb, var(--ink) 8%, transparent); }
.log li[data-role='agent']:first-child { font-style: italic; }
.note { margin: 0; padding: 8px 14px; font: 12px ui-monospace, monospace; min-height: 2.2em; }
form { display: flex; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--ink); }
textarea {
  flex: 1; resize: none; height: 44px; padding: 10px; border: 1px solid var(--ink);
  border-radius: 4px; background: transparent; font-size: 16px;
}
.send {
  min-height: 44px; padding: 0 14px; border: 1px solid var(--ink); border-radius: 4px;
  background: var(--ink); color: var(--paper); cursor: pointer;
}
:disabled { opacity: .5; cursor: not-allowed; }
:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
`
