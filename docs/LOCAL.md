# LOCAL: machine-local facts

Where things are on the machines this project runs on, and how to re-check each fact
([ADR-0054](adr/0054-session-knowledge-lives-in-the-repo.md)). No data and no credentials.
A fact without a check does not belong here. If a check disagrees, fix the entry.

## 065 (Windows 11, lab workstation)

| Fact (as of 2026-11-16) | Re-check |
|---|---|
| Tony's terminal is **Windows PowerShell 5.1**. Commands for him to paste must use PowerShell syntax: `C:\...` paths and `$env:NAME = "..."` on its own line, not `NAME=... cmd`. | — |
| **Dev-server ports are shared** with other apps (5173 is usually cerebro's) and other sessions. Never pick a port by assumption: test it. `npm run lab-dev` (lab branch) probes from 5181, binds the first free port with `--strictPort`, and prints the URL. | `Get-NetTCPConnection -State Listen \| Where-Object LocalPort -ge 5173 \| Where-Object LocalPort -le 5200` |
| Other sessions run **colonel_kernel dev servers from their own worktrees**, sometimes on detached old commits. Before trusting a page, check which checkout serves it. | `Get-CimInstance Win32_Process -Filter "Name='node.exe'" \| Where-Object CommandLine -match vite \| Select ProcessId, CommandLine` |
| Lab recordings (`.klab.json`, ADR-0053) are in `C:\Users\defazio\University of Michigan Dropbox\Richard DeFazio\data\rawF_kernel_test`. | `Test-Path` on that path |
| Playwright's expected headless shell is sometimes missing. A full Chromium is installed under `%LOCALAPPDATA%\ms-playwright\chromium-*\chrome-win64\chrome.exe`; pass it as `PW_CHROMIUM` to `scripts/lab-shot.mjs`. | `ls $env:LOCALAPPDATA\ms-playwright` |

Starting the lab page on 065, in PowerShell:

```powershell
cd C:\Users\defazio\colonel_kernel-worktrees\<your-worktree>
$env:CK_LAB_RAW_DIR = "C:\Users\defazio\University of Michigan Dropbox\Richard DeFazio\data\rawF_kernel_test"
npm run lab-dev
```

Open the URL it prints. It also prints the checkout and commit it is serving.
