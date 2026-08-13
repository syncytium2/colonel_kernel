# The `k2` shortcut — one keystroke into Tab 2 with local recordings

A dev-machine convenience: press **⌘1** in Safari and land in Tab 2 with all the recordings
in `exports/` one dropdown away. Nothing here ships. See
[ADR-0048](adr/0048-dev-only-lab-mode.md) for why it is built this way.

## Safari setup (one time)

1. Make sure the server is up — `bash scripts/k2-agent.sh status` should say `HTTP 200`.
2. Open `http://localhost:5173/#tab2`.
3. Show the Favorites bar if it is hidden: **View → Show Favorites Bar**.
4. Drag the URL from the address bar onto the Favorites bar. Name it `k2`.
5. Drag it to the **leftmost** position.

**⌘1** now opens Tab 2 from anywhere in Safari. Typing `k2` in the address bar also works —
Safari surfaces the bookmark as the Top Hit — but it competes with your history, so ⌘1 is
the reliable one.

Safari has no keyword-shortcut feature, so a literal `k2` → URL mapping is not available the
way it is in Chrome. The bookmark is the substitute.

## The pieces

| Piece | Where | Does what |
|---|---|---|
| Lab picker | `src/lib/LabPicker.svelte` | The `LAB` dropdown in Tab 2's left rail |
| Endpoints | `vite.config.js` → `labRecordingsOnServe()` | Lists and serves `exports/`, dev server only |
| Always-on server | `scripts/k2-agent.sh` | macOS login agent keeping Vite up on 5173 |
| Port pin | `vite.config.js` → `server.strictPort` | Stops the port drifting out from under the bookmark |
| Ship gate | `scripts/lab-check.sh` | Fails the deploy if any of this reaches `dist/` |

## Managing the agent

```
bash scripts/k2-agent.sh status      # is it loaded, is the server answering
bash scripts/k2-agent.sh install     # (re)install — safe to re-run
bash scripts/k2-agent.sh uninstall   # remove completely
```

Label `com.tonydefazio.colonel-kernel-k2`, plist in `~/Library/LaunchAgents/`, log at
`.k2-agent.log` in the repo root (gitignored). The agent has `KeepAlive` set, so killing the
server just makes it come back — that is the point, and it is also why "I killed it and it
is still running" is not a bug.

## Troubleshooting

**⌘1 gives "cannot connect to the server."** The server is down. `bash scripts/k2-agent.sh
status`. If the agent is not loaded, `install` it.

**`status` says `HTTP 200`, but the page is still wrong or stale.** Check *which* server owns
the port:

```
lsof -nP -iTCP:5173 -sTCP:LISTEN
pgrep -fl vite
```

Expect **exactly one** Vite process, and for it to be the one on 5173. More than one means a
stray `npm run dev` from a terminal somewhere. Kill the strays; the agent reclaims 5173 on
its next respawn (a few seconds).

This is the failure that already happened once: two stray servers took 5173 and 5174, the
agent silently landed on 5175, and `status` reported "loaded / HTTP 200" the whole time —
because something *was* answering on 5173, just not the agent. The bookmark worked until the
stray process died. `strictPort` now makes a second server fail loudly instead, but check the
port first whenever the symptoms are strange rather than absent.

**No `LAB` dropdown in Tab 2.** In order of likelihood: you are looking at a production
build (`npm run preview`, or the deployed site) rather than the dev server — the picker does
not exist there by design; or `exports/` is missing, in which case the control says so
instead of listing.

**The dropdown says "no `exports/` folder here."** Expected in a fresh clone. The folder is
gitignored and local-only; regenerate it with `scripts/mat2csv.py` from `data/`.

**A recording will not load.** The picker feeds Tab 2's normal file path, so anything that
breaks here breaks an ordinary drag-and-drop of the same file too. Test that before
suspecting the picker.

**Port 5173 is needed for something else.** The port is written in three places and all
three must agree: `server.port` in `vite.config.js`, and the two `localhost:5173` strings in
`scripts/k2-agent.sh` (the install message and the `status` check). Then re-point the Safari
bookmark. Miss the one in `status` and it will report the server down while it is running
perfectly well on the new port.

## If you want it gone

```
bash scripts/k2-agent.sh uninstall
```

Then delete the Safari bookmark. The app code is inert without the dev server; removing it
entirely means deleting `LabPicker.svelte`, `labRecordingsOnServe()` in `vite.config.js`,
the `{#if LabPicker}` blocks in `Tab2.svelte`, and the `lab-check` gate in `scripts/deploy.sh`.
