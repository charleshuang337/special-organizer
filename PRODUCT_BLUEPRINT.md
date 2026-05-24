# Product Blueprint

本文件记录 Windows 独立可视化应用的产品蓝图、阶段路线和 Head 决策。它不是一次性规格书，而是后续 agent 协作时的共同地图。

## 1. 当前状态

- 工作区：`D:\CODEX\special organizer`
- 当前仓库状态：空目录，尚未初始化 git。
- 当前产品方向：超市特价系列生命周期管理 Windows 桌面应用。
- 默认技术路线：Tauri 2 + React + TypeScript + Vite + SQLite。
- 当前工作名：Special Organizer。
- 核心对象：供应商特价系列 `SpecialSeries`，包含供应商、系列名称、一般成本、特供成本、普通售价、特价、有效期、货品保质期、理想结束日期和收尾状态。
- 第一版固定特价类型：`EVERYDAY_SPECIAL`、`WEEKLY_SPECIAL`、`FAST_REMOVE_SPECIAL`。
- 第一版默认供应商：`LAYBROTHERS`、`ETTASON`、`ORIENTAL_MERCHANT`、`TAIWANESE_OVERSEAS`、`ROCKMAN`。
- 第一版明确不做：自动抓取超市价格、联网同步、用户账号、复杂库存系统、自动读取 GitHub 私密信息。

## 2. 待用户确认的产品问题

后续进入实现前，Head 应尽快确认这些细节，但不要因此阻塞 MVP：

1. 系列分类字段是否需要独立存在，还是先只使用特价类型、供应商和状态筛选？
2. `EVERYDAY_SPECIAL` 是否永远不需要有效期/结束日期，还是允许可选结束日期？
3. 货品保质期是日期字段、天数字段，还是两者都需要？
4. 理想结束日期的默认计算优先级是什么：固定周期、有效期、保质期，还是用户每条手动选择？
5. GitHub 更新所需的 repo、release 签名、公钥、私钥和账号信息是否从 2026-04-26 项目迁移，还是重新创建？

如果用户暂时不回答，默认先实现一个本地优先的“特价系列工作台”：左侧按特价类型/供应商/状态筛选，中间日历和列表任务栏联动，右侧系列详情编辑，报告页按理想结束日期和收尾状态筛选。

## 3. MVP 范围建议

Phase 0 - Project Foundation

- 初始化 Tauri + React + TypeScript 项目。
- 建立 lint/typecheck/build/test 命令。
- 建立基础窗口、主题令牌和应用布局。
- 建立 SQLite 连接、迁移目录和错误模型。

Phase 1 - Core Workspace

- 左侧导航：全部、正在生效、即将结束、已结束待清货、历史记录、特价类型、供应商。
- 中央主视图：可视化任务日历和相近的列表式任务栏，二者共享筛选条件和选定日期。
- 右侧详情：供应商、系列名称、成本/售价字段、有效期、保质期、理想结束日期、收尾状态。
- 顶部区域：全局搜索、日期选择、类型筛选、供应商筛选、快速新增按钮。
- 全局反馈：toast、确认弹窗、错误提示。

Phase 2 - Data Workflows

- 创建、编辑、删除、归档特价系列。
- 供应商管理和默认供应商 seed。
- 本地搜索供应商、系列名称、备注和状态。
- 状态流转：草稿、正在生效、即将结束、已结束待清货、收尾完成历史。
- 理想结束日期计算：固定一/二/三周，一/二/三月，按设置有效期，按保质期，或手动日期。
- CSV/JSON 导入导出和本地备份。

Phase 3 - Visual Polish

- 快捷操作、键盘导航、拖拽排序或拖拽导入。
- 日历周/月切换、列表任务栏和报告页联动。
- 响应式桌面窗口布局。
- 明暗主题或用户偏好。

Phase 4 - Packaging

- Windows 图标和应用元数据。
- 一次性 Windows `-setup.exe` 安装包，优先 NSIS。
- GitHub Releases 远程更新检查和安装流程。
- 一键删除工作包：清理应用数据、日志和本地数据库，必须明确用户确认。
- 首次启动体验。
- 基础崩溃/错误日志落盘，但不上传。

## 4. Architecture Decisions

### ADR-0001: 默认使用 Tauri 2

Date: 2026-05-24

Decision:

默认使用 Tauri 2 作为 Windows 桌面 shell，前端使用 React + TypeScript + Vite，持久化使用 SQLite。

Reason:

项目目标是可视化 Windows 独立应用。Tauri 适合本地优先、体积较小、安全边界更清晰的桌面应用；React + TypeScript 适合快速构建复杂交互界面；SQLite 适合离线数据和可备份交付。

Impact:

- 前端不得直接访问高权限系统能力。
- 文件、数据库、系统集成通过 Tauri command 收敛。
- 后续 agent 需要同时尊重 Web UI 和 Rust/native 边界。

Backout:

如果项目强依赖 Node native 模块、Chromium 扩展能力或团队不维护 Rust，可由 Head 决策切换到 Electron。

### ADR-0002: 本地优先，不默认联网

Date: 2026-05-24

Decision:

应用默认不添加云账户、遥测、远程同步或第三方 API。

Reason:

整理类桌面应用通常涉及本地文件和私人资料。本地优先能降低隐私风险，并简化 MVP。

Impact:

- 所有网络能力必须由用户需求明确触发。
- 日志默认只写本地。
- 数据导入导出必须对用户可见。

Backout:

如果用户明确要求多设备同步、账户体系或在线服务，再设计独立的同步/认证方案。

### ADR-0003: 产品定位为“特价系列生命周期工作台”

Date: 2026-05-24

Decision:

产品不做泛用 todo，也不做完整购物清单软件。第一版定位为“维护供应商特价系列，并按特价生命周期组织搜索、日历任务、列表任务和收尾报告”的桌面应用。

Reason:

用户明确提出三类特价、供应商信息、系列价格字段、有效期/保质期/理想结束日期、搜索修改、可视化任务日历、列表任务栏、结束报告、历史记录、本地数据库、Windows 安装包、GitHub 更新和 Git 化流程。该定位足够具体，能指导 UI、数据模型和 agent 分工。

Impact:

- 第一屏必须围绕系列搜索、任务日历、任务列表和详情编辑，而不是普通 todo 列表。
- `supplier`、`series_name`、`special_type`、成本/售价、结束日期规则和收尾状态是 MVP 必须支持的结构化字段。
- 报告页必须区分“即将结束”和“已结束待清货”，并允许标记“特价结束收尾完成”进入历史。
- 不引入自动价格抓取、在线账号或外部日历同步。

Backout:

如果用户后续希望扩展为完整库存、预算、家庭共享购物清单或自动比价工具，可在当前本地数据模型上扩展。

### ADR-0004: Windows 发布采用 NSIS 安装包和 GitHub Releases 更新

Date: 2026-05-24

Decision:

默认使用 Tauri Windows NSIS `-setup.exe` 安装包，并通过 Tauri updater 插件接入 GitHub Releases 静态 JSON 更新源。

Reason:

用户要求不同电脑可直接部署的一次性 EXE 安装包，以及通过 GitHub 远程安装更新的内置流程。Tauri 官方文档说明 Windows 可使用 NSIS 生成 setup executable，并且 updater 插件支持静态 JSON，包括 GitHub Releases 形式。

Impact:

- Packaging/Updater agent 独立负责更新签名、公钥、release 资产、latest.json 和安装模式。
- 任何 GitHub token、签名私钥、账户信息不得写入仓库。
- 应用内更新必须显式提示用户，下载和安装失败要可恢复。

Backout:

如果 NSIS 无法满足环境要求，再评估 MSI/WiX 或外部安装器。

## 5. Agent Work Queue

建议后续按以下顺序派发实现任务：

1. Git/Bootstrap agent: 初始化 git 和 Tauri + React + TypeScript + Vite 项目，并确保 dev/build 命令可运行。
2. Domain Rules agent: 固化 `SpecialSeries` 模型、特价类型、状态机、结束日期计算规则和默认供应商。
3. Data agent: 实现 SQLite schema、迁移、repository、seed 数据和 Tauri commands。
4. UI Shell agent: 实现应用主布局、搜索、日历、列表式任务栏、详情编辑面板和报告页骨架。
5. Feature Workflow agent: 接入新增/编辑/搜索/筛选/状态流转/报告收尾完成。
6. Reports agent: 实现即将结束、已结束待清货、历史记录和筛选逻辑。
7. QA agent: 做 Playwright/单元测试/构建验证，补齐失败路径。
8. Packaging/Updater agent: 补图标、应用元数据、NSIS setup、GitHub updater 和一键删除工作包。

## 6. Open Risks

- 未确认系列分类字段是否独立存在。
- 未确认 `EVERYDAY_SPECIAL` 是否需要可选有效期和可选理想结束日期。
- 未确认 GitHub 更新资产和 2026-04-26 项目信息的具体位置。
- 未确认目标 Windows 版本和发布渠道。
- 未确认本机是否已安装 Rust、Node、Visual Studio Build Tools 等 Tauri 前置依赖。
- 当前目录不是 git 仓库，缺少变更历史保护。
