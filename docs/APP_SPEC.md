# Special Organizer App Spec

Special Organizer 是一个本地优先的 Windows 桌面应用，用来管理超市特价系列的生命周期。用户维护供应商、系列、价格、有效期、保质期和理想结束日期，然后通过搜索、可视化任务日历、列表式任务栏和报告页面决定哪些特价正在生效、即将结束、已经结束并需要清货收尾。

## 1. 一句话产品定义

Special Organizer 是一个供应商特价系列工作台：录入系列，计算结束节奏，按日期和状态跟进，收尾完成后进入历史记录。

## 2. 目标用户

- 需要管理多个供应商特价系列的人。
- 需要知道哪些特价正在生效、哪些快结束、哪些已经结束但还没完成清货收尾的人。
- 希望使用本地数据库和 Windows 安装包，而不是网页系统或云端账户的人。

## 3. 固定业务分类

### SpecialType

- `EVERYDAY_SPECIAL`: 常规长期特价，默认不强制有效期和理想结束日期。
- `WEEKLY_SPECIAL`: 周期特价，通常需要有效期和理想结束日期。
- `FAST_REMOVE_SPECIAL`: 快速清货特价，通常需要更强的结束提醒和报告可见性。

### Default Suppliers

- `LAYBROTHERS`
- `ETTASON`
- `ORIENTAL_MERCHANT`
- `TAIWANESE_OVERSEAS`
- `ROCKMAN`

第一版应 seed 这些供应商。数据模型保留后续新增、编辑、停用供应商的能力。

## 4. 核心实体

### SpecialSeries

- `id`: string
- `supplier_id`: string, 必填
- `series_name`: string, 必填
- `special_type`: `EVERYDAY_SPECIAL | WEEKLY_SPECIAL | FAST_REMOVE_SPECIAL`
- `normal_cost`: decimal, 可选，系列一般成本
- `special_supply_cost`: decimal, 可选，系列特供成本
- `regular_price`: decimal, 可选，系列普通售价
- `special_price`: decimal, 可选，系列特价
- `effective_start_date`: date, 可选
- `effective_end_date`: date, 可选，`EVERYDAY_SPECIAL` 默认不强制
- `shelf_life_date`: date, 可选，货品保质期
- `ideal_end_date`: date, 可选，可手动或由规则计算
- `ideal_end_strategy`: `FIXED_PERIOD | EFFECTIVE_PERIOD | SHELF_LIFE | MANUAL | null`，`EVERYDAY_SPECIAL` 默认可为空
- `fixed_period_unit`: `WEEK | MONTH`, 当策略为固定周期时必填
- `fixed_period_count`: `1 | 2 | 3`, 当策略为固定周期时必填
- `status`: `DRAFT | ACTIVE | UPCOMING_END | ENDED_PENDING_CLEARANCE | CLOSURE_COMPLETED | ARCHIVED`
- `clearance_completed_at`: datetime, 可选
- `notes`: string, 可选
- `created_at`: datetime
- `updated_at`: datetime

### Supplier

- `id`: string
- `name`: string
- `is_default`: boolean
- `is_active`: boolean
- `sort_order`: number

### SeriesHistoryEvent

- `id`: string
- `series_id`: string
- `event_type`: `CREATED | UPDATED | STATUS_CHANGED | CLOSURE_COMPLETED | REAPPLIED`
- `event_note`: string
- `created_at`: datetime

## 5. 结束日期规则

理想结束日期可以通过以下方式产生：

- 固定周期：一周、二周、三周、一月、二月、三月。
- 按设置有效期：使用 `effective_end_date`。
- 按保质期：使用 `shelf_life_date`。
- 手动日期：用户直接选择 `ideal_end_date`。

默认建议：

- `EVERYDAY_SPECIAL`: 默认无理想结束日期，可选手动或按有效期/保质期。
- `WEEKLY_SPECIAL`: 默认按设置有效期。
- `FAST_REMOVE_SPECIAL`: 默认按保质期；如果没有保质期，则按设置有效期；如果两者都没有，则要求用户手动选择。

领域落地规则：

- 固定周期以 `effective_start_date` 为起点，不读取系统当前日期；缺少起点时视为配置错误。
- 固定周按日历天计算：一/二/三周分别为起点后 7/14/21 天。
- 固定月按日历月计算；目标月份没有同一天时夹到该月最后一天，例如 `2026-01-31` 加一月为 `2026-02-28`。
- 按有效期、按保质期和手动日期直接使用对应日期；如果已填写 `effective_start_date`，结束日期不能早于开始日期。
- `DRAFT`、`CLOSURE_COMPLETED`、`ARCHIVED` 不由日期自动派生改变；`ACTIVE`、`UPCOMING_END`、`ENDED_PENDING_CLEARANCE` 可按 `ideal_end_date` 和提醒窗口派生。
- 默认提醒窗口为结束日前 7 天；同一天仍视为 `UPCOMING_END`，晚于理想结束日期进入 `ENDED_PENDING_CLEARANCE`。

状态流转表：

- `DRAFT` -> `ACTIVE`、`ARCHIVED`
- `ACTIVE` -> `UPCOMING_END`、`ENDED_PENDING_CLEARANCE`、`ARCHIVED`
- `UPCOMING_END` -> `ACTIVE`、`ENDED_PENDING_CLEARANCE`、`ARCHIVED`
- `ENDED_PENDING_CLEARANCE` -> `ACTIVE`、`CLOSURE_COMPLETED`、`ARCHIVED`
- `CLOSURE_COMPLETED` -> `ACTIVE`、`ARCHIVED`
- `ARCHIVED` 默认无直接流出；如需恢复，应由后续 Head 决策明确。

## 6. 核心界面

### Search/Edit

搜索界面用于主动查找已有系列并修改内容。

必须支持：

- 按供应商搜索。
- 按系列名称搜索。
- 按特价类型筛选。
- 按状态筛选。
- 从结果直接打开详情编辑。

### Calendar

可视化任务日历显示系列的有效期、理想结束日期和收尾状态。

必须支持：

- 选定日期。
- 按供应商、特价类型、状态筛选。
- 日期上显示当天相关任务数量。
- 点击日期后联动列表式任务栏。

### Task List

列表式任务栏与日历非常接近，主内容是某个日期或日期范围内正在生效、即将结束或已经结束的特价系列。

必须支持：

- 正在生效中。
- 即将结束。
- 已结束待清货。
- 选定日期筛选。
- 类型和供应商筛选。

### Reports

报告页面分为两块：

- 即将结束日期的系列列表。
- 已结束应该清货完成的系列列表。

筛选控件：

- `结束日期前多久日范围内`: 数字输入，例如 3、7、14、30 天。
- `包括即将结束`: checkbox。
- `包括已结束`: checkbox。
- 供应商筛选。
- 特价类型筛选。

每个任务提供操作：

- `特价结束收尾完成`: 用户确认已经倾销完成、0 库存后，系列进入历史记录，不再被报告页筛出和提示。
- `重新应用`: 用户必须重新设置结束日期，或改成 `EVERYDAY_SPECIAL`。

### History

历史记录显示已收尾完成的系列，默认不参与日历和报告提醒。用户可以从历史记录查看详情，但恢复工作需要显式 `重新应用`。

## 7. 部署与更新

- 应用必须使用持久化本地 SQLite 数据库。
- 应用必须能生成可在不同 Windows 电脑安装的一次性 EXE 安装包。
- 默认发布包使用 Tauri NSIS `-setup.exe`。
- 应用内更新默认使用 GitHub Releases 静态 JSON 更新源。
- GitHub token、签名私钥、账号信息不得写入仓库。
- 2026-04-26 项目中的 GitHub 公网信息和账户资料只能由 Packaging/Updater agent 在用户明确提供路径或内容后接入。
- 安装包需要配套一键删除工作包，用于清理应用数据、日志和本地数据库；该操作必须有清楚警告和确认。

## 8. Git 工作流程

- 初始化 git 后，主分支建议使用 `main`。
- 每个 agent 使用明确范围提交，提交信息包含 agent 名称和任务范围。
- 任何 schema、安装、更新、删除数据相关改动必须单独提交。
- 不允许把密钥、token、私有 release 签名文件提交到仓库。

## 9. 非目标

MVP 不做：

- 自动抓取供应商或超市网站价格。
- 云账户或远程数据库。
- 多用户权限管理。
- 完整库存系统。
- 自动判断 0 库存。
- OCR 截图识别。

## 10. 验收标准

- 用户能创建一个 `SpecialSeries`，选择三种特价类型之一。
- 用户能选择默认供应商并填写系列名称、成本、售价和特价。
- 用户能设置有效期、保质期和理想结束日期策略。
- 搜索界面能查找并修改已有系列。
- 日历和列表任务栏能按选定日期、供应商、类型和状态筛选。
- 报告页面能显示即将结束和已结束待清货系列。
- 用户能将已完成清货的系列标记为 `特价结束收尾完成` 并移入历史。
- 用户能通过重新设置结束日期或改成 `EVERYDAY_SPECIAL` 重新应用系列。
- 关闭重开应用后数据仍存在。
- Windows 安装包、GitHub 更新流程和一键删除工作包由独立验收确认。
