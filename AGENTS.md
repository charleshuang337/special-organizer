# Agent Working Charter

本文件是本仓库所有后续实现型 agent 的最高协作约束。任何 agent 在读代码、改代码、加依赖、调整架构、打包发布之前，都必须先读取并遵守本文件。

## 0. Head 角色

Head 负责统一产品方向、架构边界、技术栈、模块职责、交付标准和风险决策。实现型 agent 负责在明确边界内完成具体代码，不自行扩大任务范围。

当用户未另行指定时，Head 的默认目标是交付一个可视化、可安装、可离线运行的 Windows 独立桌面应用，而不是网页 landing page 或仅能在开发环境里打开的 demo。

## 1. 产品原则

- 当前产品身份：Special Organizer，一个面向超市特价系列生命周期管理的 Windows 桌面应用。
- 核心工作流：用户维护供应商特价系列，设置特价类型、成本、售价、有效期、保质期和理想结束日期，在搜索、日历、任务列表和报告页中跟踪生效、即将结束、已结束和收尾完成状态。
- 第一版不是泛用 todo、不是购物电商、不是自动比价工具、不是超市网站抓取器。
- 第一版的特价类型固定为 `EVERYDAY_SPECIAL`、`WEEKLY_SPECIAL`、`FAST_REMOVE_SPECIAL`。
- 第一版默认供应商固定包含 `LAYBROTHERS`、`ETTASON`、`ORIENTAL_MERCHANT`、`TAIWANESE_OVERSEAS`、`ROCKMAN`，同时为后续自定义供应商保留数据模型空间。
- 第一屏必须是可用的应用工作台，不做营销页。
- 应用体验优先服务真实工作流：清晰、稳定、可扫描、可反复使用。
- 所有主要操作必须有空状态、加载状态、错误状态和成功反馈。
- 用户数据默认本地优先。除非产品规格明确要求，不添加云同步、远程遥测或第三方上传。
- UI 文案默认中文，代码标识符默认英文。
- 支持 Windows 桌面环境是最高优先级；跨平台能力是加分项，不得牺牲 Windows 可用性。

## 2. 默认技术路线

在没有新的 Head 决策前，默认采用：

- Desktop shell: Tauri 2
- Frontend: React + TypeScript + Vite
- Styling: CSS Modules 或单一全局设计令牌层，避免散落的任意样式
- Local data: SQLite，迁移文件纳入版本管理
- Native/system access: 通过 Tauri command 暴露最小权限接口
- Packaging: Tauri Windows installer/bundle

可调整技术路线的条件：

- 选择 Electron：只有当项目强依赖 Chromium/Node 生态、复杂 DevTools 集成或大量 Node native 模块时。
- 选择 WinUI 3 / Windows App SDK：只有当项目需要深度 Windows 原生控件、企业级 Windows API、MSIX/Store 优先发布，或 C#/.NET 团队维护时。
- 选择纯 Web/PWA：除非用户明确放弃独立 Windows App，否则不作为默认方案。

官方背景依据：

- Tauri 2 支持任意前端框架、跨平台打包，并以安全和小体积为核心方向：https://v2.tauri.app/
- Electron 使用 JavaScript/HTML/CSS 构建桌面应用，并内置 Chromium 与 Node.js：https://www.electronjs.org/docs/latest/
- Windows App SDK/WinUI 是 Microsoft 推荐的现代 Windows 原生应用基础：https://learn.microsoft.com/en-us/windows/apps/windows-app-sdk/

## 3. 目标仓库结构

新建项目时优先保持以下结构，除非已有脚手架生成了等价结构：

```text
/
  AGENTS.md
  PRODUCT_BLUEPRINT.md
  package.json
  src/
    app/
    components/
    features/
    contracts/
    styles/
    test/
  src-tauri/
    src/
      commands/
      domain/
      storage/
      errors.rs
    migrations/
    tauri.conf.json
  tests/
  docs/
```

边界说明：

- `src/components/`: 通用 UI，不直接读写本地文件、数据库或远程接口。
- `src/features/`: 业务功能切片，每个切片拥有自己的 UI、状态、hooks 和测试。建议 MVP 切片为 `series`、`suppliers`、`calendar`、`task-list`、`search`、`reports`、`settings`、`updates`。
- `src/contracts/`: 前后端共享的数据结构、command 名称、错误码和事件名。
- `src-tauri/src/commands/`: Tauri IPC 入口，只做参数校验、权限收敛和调用 domain/storage。
- `src-tauri/src/domain/`: 业务规则，不依赖 UI。
- `src-tauri/src/storage/`: 数据库、文件系统、导入导出。

## 4. Agent 启动流程

每个实现型 agent 开始工作前必须完成：

1. 读取 `AGENTS.md` 和 `PRODUCT_BLUEPRINT.md`。
2. 查看当前工作区状态：`git status --short`。如果不是 git 仓库，说明情况但继续按文件边界工作。
3. 只读取与任务相关的文件，不做全仓库无目标重构。
4. 明确自己的写入范围。涉及多个模块时，先说明边界再编辑。
5. 修改前确认是否会引入依赖、迁移数据、改变打包配置或影响用户数据。

## 5. 编辑边界

实现型 agent 可以做：

- 在分配的 feature/component/module 内新增或修改代码。
- 添加必要测试、类型、样式和文档。
- 修复与当前任务直接相关的 bug。
- 在不改变公共行为的前提下做小范围整理。

实现型 agent 不得擅自做：

- 更换技术栈、状态管理、数据库、构建工具或打包方案。
- 大范围格式化、文件搬迁、命名重构或删除旧实现。
- 添加网络请求、遥测、自动更新、登录、云同步、AI 服务或第三方 SDK。
- 写入仓库外路径，或在应用运行时扫描用户大范围磁盘。
- 改动数据库 schema 但不提供迁移、回滚说明和数据兼容策略。
- 将密钥、token、机器路径、用户隐私数据写入源码。
- 使用破坏性 git 或文件命令，除非用户明确要求。

## 6. UI 与交互标准

- 第一屏呈现实际应用核心工作区。
- 工具栏、导航、列表、详情面板、弹窗和空状态必须形成完整闭环。
- 图标按钮优先使用成熟图标库；按钮文字只用于明确命令。
- 控件必须有稳定尺寸，避免 hover、加载、长文本导致布局跳动。
- 文本不得溢出容器；长内容使用换行、省略、滚动或动态布局处理。
- 避免单一色相支配全应用。视觉风格应克制、专业、耐看。
- 不使用装饰性渐变球、漂浮卡片堆叠、无意义大 hero。
- 可访问性默认纳入：键盘焦点、语义按钮、对比度、表单标签。

## 7. 数据与安全标准

- 所有用户数据写入必须可解释、可定位、可备份。
- 删除、覆盖、批量修改必须有确认或可撤销路径。
- 数据库 schema 变更必须配套迁移。
- Tauri command 暴露最小参数面，后端再次校验，不信任前端输入。
- 文件系统访问限定到用户选择的路径或应用数据目录。
- 错误返回使用结构化错误码，不把内部堆栈直接展示给用户。

## 8. 测试与验收

任务完成前，根据变更范围选择验证：

- TypeScript: `npm run typecheck` 或等价命令。
- Frontend build: `npm run build`。
- Rust/Tauri: `cargo test`、`cargo check` 或 Tauri build 检查。
- UI 改动：至少做桌面尺寸截图检查；关键工作流用 Playwright 或等价浏览器自动化验证。
- 数据改动：覆盖迁移、读写、错误输入和空数据场景。
- 打包改动：验证 Windows bundle 能生成，安装后能启动基础窗口。

无法运行的验证必须在交付说明中明确写出原因。

## 9. Definition of Done

一个实现任务只有同时满足以下条件才算完成：

- 功能按用户意图工作，不只是代码能编译。
- 没有死按钮、假数据伪装成真实数据、未接线的关键入口。
- 主要失败路径有用户可理解的反馈。
- 类型检查和相关测试通过，或清楚说明无法验证的原因。
- 新增行为在代码或产品文档中留下必要说明。
- 没有越界改动、隐藏依赖、未说明的数据风险。

## 10. Handoff 模板

每个实现型 agent 最终交付时必须包含：

```text
Scope:
Files changed:
Behavior:
Verification:
Known risks:
Next suggested step:
```

如果任务修改了公共接口、schema、打包流程或用户数据路径，必须额外写：

```text
Compatibility impact:
Migration/backout notes:
```

## 11. Head 决策记录

所有会影响多个 agent 的决策都应写入 `PRODUCT_BLUEPRINT.md` 的 Decision Log，至少包括：

- 日期
- 决策
- 原因
- 影响范围
- 可回退条件
