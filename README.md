# Special Organizer

Special Organizer is a local-first Windows desktop application shell for managing supermarket special-series lifecycles.

## Current Scope

This repository is initialized as a Tauri 2 + React + TypeScript + Vite project for a local-first supermarket special-series lifecycle manager.

The current workspace includes:

- Shared TypeScript contracts for `SpecialSeries`, suppliers, statuses, report queries, and command names.
- Domain-rule helpers for ideal end date calculation and status transitions.
- SQLite migration/storage scaffolding and Tauri commands for suppliers, series CRUD, reports, closure completion, reapply, and history.
- A first-screen workbench UI with search, supplier/type/status filters, calendar, task list, detail editing panel, report groups, and history entry.
- Windows NSIS bundle configuration, Tauri updater wiring, release metadata documentation, and a confirmed cleanup work package.

Still not implemented in this scope:

- Real GitHub Releases owner/repo, signing public key, and private signing key location from the 2026-04-26 project.
- QA gate validation on an installed Windows bundle.

## Commands

```powershell
npm install
npm run dev
npm run typecheck
npm run test
npm run build
npm run tauri:dev
npm run tauri:build
```

`npm run dev` starts the Vite workbench preview. The browser preview cannot invoke Tauri commands, so use `npm run tauri:dev` for real SQLite-backed workflows.

`npm run tauri:dev` and `npm run tauri:build` require Rust/Cargo and the normal Tauri Windows prerequisites. In the Codex sandbox, Vite/Vitest may need elevated execution because esbuild helper processes can fail with `spawn EPERM`.

Packaging notes live in `docs/RELEASE_PACKAGING.md`. The updater endpoint points to the public `charleshuang337/special-organizer` GitHub Releases feed; the updater public key is still a placeholder until the Tauri signing key is generated or supplied.

## Project Layout

```text
src/
  app/
  components/
  contracts/
  features/
  styles/
  test/
src-tauri/
  capabilities/
  migrations/
  src/
    commands/
    domain/
    storage/
```

Later agents should keep their edits inside the write scopes listed in `docs/AGENT_DELEGATION_PLAN.md`.
