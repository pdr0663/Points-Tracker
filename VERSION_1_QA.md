# Points Tracker Version 1 QA

This is the reproducible release checklist for milestone M20. It records checks performed against the Version 1 source tree and separates automated evidence from platform-specific manual checks.

Recorded on 2026-08-11 in the Windows development environment with Node.js 26.7.0 and the Codex in-app Chromium browser.

## Automated release gate

Run from the repository root:

```powershell
npm ci
npm test
npm run build:afcd
npm run build:icons
git diff --check
```

The tests cover deterministic Points and allowances, IndexedDB creation and upgrades, historical snapshots, multi-user isolation, foods, diary and weekly accounting, recipes, progress, backup/restore, bare and fenced JSON, invalid-input handling, AFCD authority and attribution data, atomic recipe rollback, GitHub Pages subpath safety, manifest metadata, complete precaching, update cleanup, and offline responses.

The catalogue build must reproduce `public/data/afcd-reference.json` from the checked-in AFCD extract. The icon build must reproduce valid 192 px and 512 px PNG assets.

## M20 acceptance results

| Area | Result | Evidence |
| --- | --- | --- |
| Complete automated suite | Passed | 95/95 Node tests, including release metadata and documentation checks |
| IndexedDB upgrade compatibility | Passed | Existing records survive the Version 2 source-index migration and legacy database import |
| Bare and fenced JSON | Passed | Both accepted by the shared parser and published examples validate |
| Invalid-input recovery | Passed | Parse and validation errors write nothing and retain editable source in the UI |
| Atomic recipe imports | Passed | Forced failure after food insertion rolls back foods and recipe |
| Backup and restore | Passed | Export, clear, restore reproduces all stores; invalid restore leaves data unchanged |
| AFCD attribution | Passed | UI attribution, release, source, licence, limitation text, and reproducible source hash verified |
| GitHub Pages deployment | Passed for the current M19 baseline; M20 push pending | [Remote workflow run 31459992625](https://github.com/pdr0663/Points-Tracker/actions/runs/31459992625) succeeded; the live repository-subpath origin returned HTTP 200 and served its manifest and service worker. The Version 1.0.0 cache will deploy when this M20 change set is committed and pushed |
| Offline operation | Passed | With the local server stopped, the installed app reloaded and completed AFCD search/import, diary tracking, recipe import, Progress, and backup-control checks |

## Responsive and browser matrix

For every available viewport, check the Today, Diary, Foods, Recipes, Progress, and Settings screens; confirm navigation and forms remain usable and that the document has no unintended horizontal overflow.

| Platform or viewport | Result |
| --- | --- |
| Chromium desktop, 1280 px wide | Passed; all six screens visible with zero body overflow |
| Chromium, 320 px wide | Passed; all six screens visible with zero body overflow |
| Chromium, 375 px wide | Passed; all six screens visible with zero body overflow; AFCD attribution and import recovery checked here |
| Chromium, 430 px wide | Passed; all six screens visible with zero body overflow |
| Chromium, 768 px wide | Passed; all six screens visible with zero body overflow |
| Chrome Android physical device | Not available in the Windows development environment; repeat before a device-specific distribution decision |
| Safari desktop | Not available on Windows; repeat on macOS when available |
| Safari on iPhone/iPad | Not available in the Windows development environment; repeat on physical Apple devices when available |

## Manual workflow checklist

- Create at least two profiles and confirm diary isolation with shared foods and recipes.
- Record a later weigh-in and confirm historical allowance and diary snapshots do not change.
- Confirm AFCD search displays saved foods before reference foods and shows attribution and licence links.
- Preview, cancel, correct, and confirm bare and fenced food JSON.
- Preview a recipe bundle, resolve a possible match, cancel once, then confirm; verify no partial records after cancellation or failure.
- Export a backup, inspect its summary, restore it, and verify all stores and the selected profile.
- Load once online, stop the server or disconnect, reload, and exercise tracking, imports, progress, and backup controls.
- Push through the Pages workflow, open the repository-subpath deployment, and repeat the shell and offline smoke tests against the deployed origin.

Platform rows marked unavailable are explicit follow-up checks, not claims of test coverage.
