# Agent Audit - 2026-05-25

本审计用于核实当前各 agent 工作状态，并给出纠偏指令。

## 1. Current Evidence

- 当前 git 只有 1 个提交：`55ce3f1 Git/Bootstrap Agent: initialize Tauri React scaffold`。
- 当前工作区存在大量未提交改动，主要集中在领域规则、SQLite 数据层、Tauri commands、报告模型、历史记录入口和主界面接线。
- `npm run test` 通过：5 个测试文件，25 个测试通过。
- `npm run build` 通过。
- `cargo test` 未能运行：当前环境找不到 `cargo` 命令。

注意：`npm run test` 和 `npm run build` 在默认沙箱中因 `esbuild spawn EPERM` 失败，提权运行后通过。

## 2. Agent Status Matrix

| Agent | Status | Evidence | Action |
| --- | --- | --- | --- |
| Git/Bootstrap Agent | Done and committed | `55ce3f1` initial commit | No immediate action |
| Domain Rules Agent | Done or mostly done, uncommitted | `src/contracts/series.ts`, `src/features/series/domain/*`, `src/test/seriesDomain.test.ts` | Review and commit separately |
| Data/Persistence Agent | Done or mostly done, uncommitted | `src-tauri/migrations/0001_initial_schema.sql`, `src-tauri/src/storage/*`, `src-tauri/src/commands/mod.rs` | Review Rust build once Cargo is available, then commit separately |
| UI Shell Agent | Done or partially done, uncommitted | large changes in `src/app/App.tsx`, `src/app/App.module.css` | Review UI state and commit separately |
| Feature Workflow Agent | Partially done, uncommitted | `src/features/series/seriesCommands.ts`, real command calls in `App.tsx` | Review integration boundaries |
| Reports Agent | Done or partially done, uncommitted | `src/features/reports/*`, `src/features/history/*`, report UI in `App.tsx` | Review report behavior |
| Packaging/Updater Agent | Not done | no updater dependency, no updater command, `bundle.active` remains `false`, no root `.github`, no cleanup script | Must be dispatched next, after current uncommitted work is stabilized |
| QA/Release Gate Agent | Not ready | no QA report; no installer/update validation possible | Wait until Packaging/Updater completes |

## 3. Packaging/Updater Was Skipped

This is confirmed.

Missing evidence:

- `@tauri-apps/plugin-updater` is not present in `package.json`.
- `tauri-plugin-updater` or equivalent Rust-side updater dependency is not present in `src-tauri/Cargo.toml`.
- `src-tauri/tauri.conf.json` still has `bundle.active: false`.
- No NSIS target is configured.
- No GitHub Releases endpoint or `latest.json` update endpoint is configured.
- No updater public key or signing workflow is configured.
- No root `.github/workflows/` release workflow exists.
- No one-click cleanup script/work package exists.
- No release documentation exists.

## 4. Why `Reports/Data Fix Agent` Appeared

`Reports/Data Fix Agent` was not in the original delegation plan.

Most likely cause:

- Reports work depended on Data/Persistence query behavior.
- The report UI needed `list_report_series`, `mark_series_closure_completed`, `reapply_series`, and history behavior to work together.
- Instead of returning to the original owners, the handoff collapsed into an ad-hoc combined repair role.

This is understandable as a repair maneuver, but it is not acceptable as a standing role because it crosses ownership boundaries:

- Reports Agent owns report UI and report behavior.
- Data/Persistence Agent owns SQLite schema, repository, migrations, and Tauri commands.
- A combined fix agent may patch both sides, but only under an explicit Head-approved fix scope.

## 5. Corrective Rule

Do not dispatch `Reports/Data Fix Agent` again as a normal planned agent.

If a cross-boundary bug requires a combined repair role, use this name and boundary:

`Cross-Boundary Reports/Data Fix Agent`

Allowed only after Head approval, and only for a named defect. It must:

- list the exact failing behavior first;
- identify whether the root cause is report UI, command contract, repository query, or schema;
- make the smallest fix across the smallest set of files;
- not add new product scope;
- not change schema without a migration and Data/Persistence owner review;
- hand off back to Reports Agent and Data/Persistence Agent after the fix.

## 6. Immediate Instructions

### Step 1 - Stabilize Current Uncommitted Work

Assign a short Review/Stabilization pass before Packaging/Updater:

Prompt:

```text
请读取 `AGENTS.md`、`PRODUCT_BLUEPRINT.md`、`docs/APP_SPEC.md`、`docs/AGENT_DELEGATION_PLAN.md`、`docs/AGENT_AUDIT_2026-05-25.md`。
你是 Stabilization Reviewer，只做审计，不扩大功能。请把当前未提交改动按 Domain Rules、Data/Persistence、UI Shell、Feature Workflow、Reports 分组，检查是否越界、是否能单独提交、是否存在重复实现或死入口。不要实现 Packaging/Updater。输出每组是否可提交、需要谁修、以及建议提交顺序。
```

### Step 2 - Dispatch Packaging/Updater Agent

Only after Step 1 either commits or clearly parks the current work.

Prompt:

```text
请读取 `AGENTS.md`、`PRODUCT_BLUEPRINT.md`、`docs/APP_SPEC.md`、`docs/AGENT_DELEGATION_PLAN.md`、`docs/AGENT_AUDIT_2026-05-25.md`。
你是 Packaging/Updater Agent。你的任务是补齐 Windows 安装、GitHub Releases 更新和一键删除工作包。

必须完成：
1. 配置 Tauri Windows NSIS `-setup.exe` bundle。
2. 接入 Tauri updater 插件，但不得提交 token、私钥或账户信息。
3. 明确 GitHub Releases updater endpoint、`latest.json` 或等价更新元数据方案。
4. 配置或文档化 updater public key/signing 流程。
5. 新增应用内“检查更新/下载更新/安装更新”的最小 UI 或 command 接口。
6. 新增一键删除工作包，清理应用数据、日志和本地 SQLite；必须有明确警告和确认，不允许静默删除。
7. 写发布文档，列出需要用户从 2026-04-26 项目提供的 GitHub repo、账号、release、签名密钥或路径信息。

禁止：
- 不改 `SpecialSeries` schema。
- 不改报告查询逻辑。
- 不提交 GitHub token、签名私钥、账户信息。
- 不静默删除用户数据。

交付时必须报告：
Scope:
Files changed:
Behavior:
Verification:
Known risks:
Next suggested step:
Compatibility impact:
Migration/backout notes:
```

### Step 3 - QA/Release Gate

Packaging/Updater 完成后再派发 QA。

Prompt:

```text
请读取所有纲领文档和所有 agent handoff。你是 QA/Release Gate Agent，负责验证业务功能、SQLite 持久化、报告页、Windows bundle、GitHub updater 配置和一键删除工作包。不要重构功能代码；发现问题按 owner 分类报告。
```

## 7. Current Verification Notes

- Frontend tests passed after running outside sandbox.
- Frontend build passed after running outside sandbox.
- Rust/Tauri tests were not verified because `cargo` is not installed or not on PATH.
- Packaging/update/delete workflow has not been verified because it has not been implemented.

