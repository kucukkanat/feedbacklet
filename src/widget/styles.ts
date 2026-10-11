export const css = (accent: string) => `
:host { all: initial; }
* { box-sizing: border-box; }
.backdrop { position: fixed; inset: 0; z-index: 2147483640; background: rgba(17,24,39,.35); display: flex; align-items: center; justify-content: center; padding: 16px;
  font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111827; animation: fade .15s ease-out; }
.backdrop.hidden { display: none; }
@keyframes fade { from { opacity: 0 } }
@keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98) } }
.modal { background: #fff; width: 100%; max-width: 480px; max-height: calc(100vh - 32px); overflow: auto; border-radius: 14px;
  box-shadow: 0 20px 50px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.05); animation: pop .18s ease-out; }
header { display: flex; align-items: center; gap: 10px; padding: 16px 18px 12px; border-bottom: 1px solid #f1f2f4; position: sticky; top: 0; background: #fff; z-index: 1; }
header h2 { font-size: 15px; font-weight: 600; margin: 0; flex: 1; }
.icon-btn { border: 0; background: transparent; cursor: pointer; width: 28px; height: 28px; border-radius: 6px; color: #6b7280; font-size: 18px; line-height: 1; display: grid; place-items: center; }
.icon-btn:hover { background: #f3f4f6; color: #111827; }
.body { padding: 16px 18px 18px; }
.choices { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.choice { text-align: left; border: 1px solid #e5e7eb; background: #fff; border-radius: 12px; padding: 16px; cursor: pointer; font: inherit; color: inherit; transition: border-color .1s, box-shadow .1s; }
.choice:hover { border-color: ${accent}; box-shadow: 0 0 0 3px ${accent}22; }
.choice .emoji { font-size: 24px; display: block; margin-bottom: 8px; }
.choice b { display: block; font-weight: 600; }
.choice span { color: #6b7280; font-size: 13px; }
label.field { display: block; margin-bottom: 12px; }
label.field > span { display: block; font-size: 12.5px; font-weight: 500; color: #374151; margin-bottom: 4px; }
label.field > span em { font-style: normal; color: #9ca3af; font-weight: 400; }
input[type=text], textarea { width: 100%; font: inherit; color: inherit; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; background: #fff; outline: none; }
input[type=text]:focus, textarea:focus { border-color: ${accent}; box-shadow: 0 0 0 3px ${accent}22; }
textarea { resize: vertical; min-height: 84px; }
.moods { display: flex; gap: 6px; margin-bottom: 12px; }
.mood { flex: 1; border: 1px solid #e5e7eb; background: #fff; border-radius: 8px; font-size: 20px; padding: 6px 0; cursor: pointer; filter: grayscale(1); opacity: .7; }
.mood[aria-pressed=true] { filter: none; opacity: 1; border-color: ${accent}; box-shadow: 0 0 0 3px ${accent}22; }
fieldset { border: 1px solid #eef0f3; border-radius: 10px; padding: 4px 12px; margin: 4px 0 14px; }
legend { font-size: 12px; font-weight: 600; color: #6b7280; padding: 0 4px; text-transform: uppercase; letter-spacing: .04em; }
.opt { padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
.opt:last-child { border-bottom: 0; }
.opt-row { display: flex; align-items: flex-start; gap: 8px; }
.opt-row input[type=checkbox] { margin: 3px 0 0; accent-color: ${accent}; }
.opt-row label { flex: 1; cursor: pointer; }
.opt-row label small { display: block; color: #6b7280; font-size: 12px; }
.sub { margin: 6px 0 0 22px; font-size: 12.5px; display: flex; gap: 6px; align-items: center; color: #b45309; }
.sub input { accent-color: #b45309; }
.link { border: 0; background: none; color: ${accent}; cursor: pointer; font: inherit; font-size: 12px; padding: 0; text-decoration: underline; text-underline-offset: 2px; }
pre { margin: 8px 0 0; max-height: 180px; overflow: auto; background: #f9fafb; border: 1px solid #f1f2f4; border-radius: 6px; padding: 8px; font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-all; color: #374151; }
.shot { margin-top: 8px; position: relative; }
.shot img { width: 100%; border-radius: 6px; border: 1px solid #e5e7eb; display: block; }
.muted { color: #6b7280; font-size: 12.5px; }
.footer { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
.footer .muted { flex: 1; display: flex; align-items: center; gap: 6px; }
.btn { font: inherit; font-weight: 500; border-radius: 8px; padding: 8px 16px; cursor: pointer; border: 1px solid transparent; }
.btn.primary { background: ${accent}; color: #fff; }
.btn.primary:hover { filter: brightness(1.08); }
.btn.primary:disabled { opacity: .5; cursor: default; filter: none; }
.btn.ghost { background: #fff; border-color: #d1d5db; color: #374151; }
.btn.ghost:hover { background: #f9fafb; }
.chip { display: inline-flex; align-items: center; gap: 6px; background: #f3f4f6; border-radius: 6px; padding: 3px 8px; font: 11.5px ui-monospace, monospace; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 6px; }
.center { text-align: center; padding: 18px 0 8px; }
.center .big { font-size: 40px; }
.center h3 { margin: 8px 0 4px; font-size: 16px; }
.progress { height: 6px; background: #f3f4f6; border-radius: 99px; overflow: hidden; margin: 14px 0 8px; }
.progress > div { height: 100%; background: ${accent}; width: 0; transition: width .2s; }
.error { color: #b91c1c; background: #fef2f2; border: 1px solid #fee2e2; border-radius: 8px; padding: 8px 10px; font-size: 13px; margin-bottom: 12px; }
.lock { width: 14px; height: 14px; flex: none; }
`
