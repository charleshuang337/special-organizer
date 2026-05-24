# Special Organizer

Special Organizer is a local-first Windows desktop application shell for managing supermarket special-series lifecycles.

## Bootstrap Scope

This repository is initialized as a Tauri 2 + React + TypeScript + Vite project. The current workspace is intentionally empty: it provides the application shell, design tokens, placeholder feature folders, and validation scripts for later agents.

No business schema, SQLite migration, updater, telemetry, cloud sync, or real data workflow is implemented in this bootstrap pass.

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

`npm run dev` starts the Vite workbench preview. `npm run tauri:dev` and `npm run tauri:build` require Rust/Cargo and the normal Tauri Windows prerequisites.

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
