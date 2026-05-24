# Agent Delegation Plan

本文件是给后续 agent 启动用的委派纲领。当前任务不要求一次性生成完整应用代码，而是把工程拆成可并行、可验收、互不越界的工作包。

所有 agent 启动前必须先读：

- `AGENTS.md`
- `PRODUCT_BLUEPRINT.md`
- `docs/APP_SPEC.md`
- 本文件

## 0. 总调度顺序

建议不要所有 agent 一起开工。先完成仓库和领域模型，再并行 UI、数据、报告和打包。

1. Git/Bootstrap Agent
2. Domain Rules Agent
3. Data/Persistence Agent
4. UI Shell Agent
5. Feature Workflow Agent
6. Reports Agent
7. Packaging/Updater Agent
8. QA/Release Gate Agent

任何不在此列表中的组合 agent 都不是常规计划角色。若确实需要跨边界修复，例如 `Reports/Data Fix Agent`，必须先由 Head 明确批准、限定 defect、限定文件范围，并在完成后交还给原 owner。

## 1. Git/Bootstrap Agent

### Mission

初始化工程骨架和 Git 工作流，让所有后续 agent 有稳定的运行、构建和提交基础。

### Write Scope

- `.gitignore`
- `package.json`
- `vite.config.*`
- `tsconfig*.json`
- `src/`
- `src-tauri/`
- 基础 README 或开发脚本说明

### Required Work

- 初始化 git 仓库，主分支使用 `main`。
- 初始化 Tauri 2 + React + TypeScript + Vite。
- 建立 `npm run dev`、`npm run build`、`npm run typecheck`、`npm run test` 的脚本占位或实际命令。
- 建立基础应用窗口和空工作台。
- 建立 `.gitignore`，排除 node_modules、Rust target、构建产物、本地数据库、日志、密钥、签名私钥。

### Boundaries

- 不实现业务字段。
- 不设计数据库 schema。
- 不接 GitHub updater。
- 不写真实产品 UI 细节，只保证骨架可运行。

### Handoff

必须说明：

- 初始化命令和版本。
- dev/build/typecheck/test 哪些已经可运行。
- git 状态。
- 后续 agent 应使用的启动命令。

## 2. Domain Rules Agent

### Mission

固化业务语言、类型、状态机和结束日期计算规则。这个 agent 是业务模型的地基。

### Write Scope

- `src/contracts/`
- `src/features/series/domain/`
- `docs/APP_SPEC.md`
- 必要的纯函数测试

### Required Work

- 定义 `SpecialType`、`SpecialSeriesStatus`、`IdealEndStrategy`、`Supplier`、`SpecialSeries` 的 TypeScript 类型。
- 定义默认供应商：`LAYBROTHERS`、`ETTASON`、`ORIENTAL_MERCHANT`、`TAIWANESE_OVERSEAS`、`ROCKMAN`。
- 定义状态机：
  - `DRAFT`
  - `ACTIVE`
  - `UPCOMING_END`
  - `ENDED_PENDING_CLEARANCE`
  - `CLOSURE_COMPLETED`
  - `ARCHIVED`
- 实现理想结束日期计算规则：
  - 固定一/二/三周
  - 固定一/二/三月
  - 按有效期
  - 按保质期
  - 手动日期
- 明确 `EVERYDAY_SPECIAL` 的默认行为：不强制结束日期，但允许可选结束规则。

### Boundaries

- 不写 SQLite。
- 不写 Tauri command。
- 不做页面。
- 不接安装更新。

### Handoff

必须给出：

- 字段表。
- 状态流转表。
- 日期计算边界案例。
- 测试覆盖说明。

## 3. Data/Persistence Agent

### Mission

实现持久化本地数据库、迁移、repository 和 Tauri 后端接口。

### Write Scope

- `src-tauri/src/storage/`
- `src-tauri/src/commands/`
- `src-tauri/migrations/`
- `src/contracts/`
- 数据层测试

### Required Work

- 使用 SQLite 存储 `suppliers`、`special_series`、`series_history_events`。
- seed 默认供应商。
- 实现 CRUD：
  - create/update/delete/archive series
  - list/search series
  - mark closure completed
  - reapply series
- 实现报告查询：
  - upcoming end within N days
  - ended pending clearance
  - exclude closure completed history
- 所有 Tauri command 做参数校验和结构化错误返回。

### Boundaries

- 不做复杂 UI。
- 不决定视觉交互。
- 不接 GitHub updater。
- 不把数据库写到仓库目录，运行时数据应在应用数据目录。

### Handoff

必须说明：

- schema 版本。
- 迁移策略。
- 数据目录。
- command 列表。
- 验证命令。

## 4. UI Shell Agent

### Mission

构建可视化应用工作台骨架，让用户第一屏看见真实业务界面。

### Write Scope

- `src/app/`
- `src/components/`
- `src/features/search/`
- `src/features/calendar/`
- `src/features/task-list/`
- `src/features/series/`
- `src/features/reports/`
- `src/styles/`

### Required Work

- 第一屏工作台：
  - 顶部搜索和筛选。
  - 左侧特价类型、供应商、状态导航。
  - 中间可视化任务日历。
  - 旁边或下方列表式任务栏。
  - 右侧系列详情编辑面板。
- 报告页骨架：
  - 即将结束列表。
  - 已结束待清货列表。
  - 日期范围和 include 筛选控件。
- 历史记录入口。
- 空状态、加载状态、错误状态。

### Boundaries

- 可以使用 mock 数据，但必须清楚标记并方便替换。
- 不写 SQLite。
- 不自行改变业务字段。
- 不做 landing page。

### Handoff

必须提供：

- 页面结构说明。
- mock 数据替换点。
- 截图或浏览器验证说明。
- 已知未接线入口。

## 5. Feature Workflow Agent

### Mission

把 UI 和数据接口接起来，实现用户核心工作流。

### Write Scope

- `src/features/series/`
- `src/features/search/`
- `src/features/calendar/`
- `src/features/task-list/`
- `src/contracts/`
- 必要的端到端或组件测试

### Required Work

- 新增系列。
- 修改系列。
- 搜索已有系列并打开编辑。
- 按日期、供应商、特价类型、状态筛选。
- 日历选定日期联动列表式任务栏。
- 状态根据日期和收尾操作正确显示。
- `重新应用` 工作流：要求用户重新设置结束日期，或改成 `EVERYDAY_SPECIAL`。

### Boundaries

- 不改 schema，除非 Data Agent 已完成并由 Head 同意。
- 不做安装更新。
- 不做报告页深度逻辑，报告页由 Reports Agent 负责。

### Handoff

必须说明：

- 哪些 workflow 已真实接数据库。
- 哪些保存/错误反馈已实现。
- 手工测试路径。

## 6. Reports Agent

### Mission

实现报告页面的业务筛选、收尾完成和历史记录逻辑。

### Write Scope

- `src/features/reports/`
- `src/features/history/`
- 相关 command 调用层
- 报告查询测试

### Required Work

- 即将结束日期系列列表。
- 已结束应该清货完成系列列表。
- `结束日期前多久日范围内` 数字筛选。
- `包括即将结束` 和 `包括已结束` 筛选。
- 供应商和特价类型筛选。
- `特价结束收尾完成` 操作，确认后进入历史。
- 历史记录查看，不再参与报告提示。

### Boundaries

- 不决定状态机定义，只消费 Domain Rules Agent 的定义。
- 不改安装更新。
- 不引入远程同步。

### Handoff

必须说明：

- 查询口径。
- 空状态。
- 收尾完成后的数据变化。
- 历史记录恢复/重新应用路径。

## 7. Packaging/Updater Agent

### Mission

负责 Windows 安装、GitHub 更新和一键删除工作包。这是高风险边界，必须独立完成和验收。

### Write Scope

- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/`
- `src-tauri/windows/`
- `scripts/`
- `.github/workflows/`，如果用户同意使用 GitHub Actions
- 发布文档

### Required Work

- 配置 Windows NSIS `-setup.exe`。
- 配置应用图标、名称、版本。
- 接入 Tauri updater 插件。
- 使用 GitHub Releases 静态 JSON 更新源。
- 配置 updater 公钥和 release 签名流程。
- 在应用内提供检查更新、下载更新、安装更新的用户流程。
- 制作一键删除工作包，清理应用数据、日志和本地数据库。
- 明确说明 2026-04-26 项目已有 GitHub 信息需要用户提供哪些路径或内容。

### Boundaries

- 不把 token、私钥、账户信息提交到仓库。
- 不静默删除用户数据。
- 不使用未确认的 GitHub repo。
- 不改变业务 schema。

### Handoff

必须说明：

- 生成安装包的命令。
- updater endpoint。
- 签名文件处理方式。
- 一键删除清理范围。
- 安装、升级、卸载、清理的验证结果。

## 8. QA/Release Gate Agent

### Mission

作为发布门禁，验证功能、数据、UI、安装和更新路径。

### Write Scope

- `tests/`
- `docs/QA_REPORT.md`
- 自动化测试配置

### Required Work

- 验证新建、编辑、搜索、日历联动、列表筛选、报告筛选、收尾完成、历史记录。
- 验证关闭重开数据持久化。
- 验证 TypeScript、Rust、构建和打包。
- 使用浏览器自动化检查 UI 主要视口。
- 验证安装包启动。
- 验证更新失败时用户可理解，不破坏数据。
- 验证一键删除必须有确认且清理范围正确。

### Boundaries

- 不大改功能代码。
- 发现问题优先提交报告，再由对应 owner 修复。

### Handoff

必须提供：

- 通过项。
- 失败项。
- 阻塞发布项。
- 残余风险。

## 9. Suggested Launch Prompts

### Git/Bootstrap Agent Prompt

请读取 `AGENTS.md`、`PRODUCT_BLUEPRINT.md`、`docs/APP_SPEC.md`、`docs/AGENT_DELEGATION_PLAN.md`。你是 Git/Bootstrap Agent，只负责初始化 git 和 Tauri 2 + React + TypeScript + Vite 工程骨架，建立基础脚本和空工作台。不要实现业务字段、数据库、更新器或报告页。完成后按 Handoff 模板报告。

### Domain Rules Agent Prompt

请读取所有纲领文档。你是 Domain Rules Agent，只负责 `SpecialSeries` 类型、默认供应商、特价类型、状态机和理想结束日期计算规则。不要写数据库和 UI。必须提供纯函数测试和状态流转说明。

### Data/Persistence Agent Prompt

请读取所有纲领文档和 Domain Rules Agent 的交付。你是 Data/Persistence Agent，只负责 SQLite schema、迁移、seed、repository 和 Tauri commands。不要实现 UI 和 updater。必须说明数据目录、schema 版本和 command 列表。

### UI Shell Agent Prompt

请读取所有纲领文档。你是 UI Shell Agent，只负责第一屏工作台、搜索、日历、列表式任务栏、详情编辑面板、报告页骨架和基础视觉系统。可以使用 mock 数据，但必须标记替换点。不要写数据库和安装更新。

### Feature Workflow Agent Prompt

请读取所有纲领文档、UI Shell 和 Data Agent 的交付。你是 Feature Workflow Agent，负责把新增、编辑、搜索、筛选、日历联动、列表任务栏和重新应用流程接到真实数据接口。不要改 schema，除非 Head 明确同意。

### Reports Agent Prompt

请读取所有纲领文档和 Data Agent 的交付。你是 Reports Agent，负责即将结束、已结束待清货、筛选、收尾完成、历史记录和重新应用入口。不要改变状态机定义。

### Packaging/Updater Agent Prompt

请读取所有纲领文档。你是 Packaging/Updater Agent，只负责 Windows NSIS 安装包、GitHub Releases 更新、一键删除工作包和发布文档。不要提交 token、私钥或账号信息。需要 2026-04-26 项目的 GitHub 信息时，必须明确列出需要用户提供的路径或内容。

### QA/Release Gate Agent Prompt

请读取所有纲领文档和所有 agent handoff。你是 QA/Release Gate Agent，负责验证功能、UI、数据持久化、构建、安装、更新和一键删除。不要重构功能代码，发现问题按 owner 分类报告。
