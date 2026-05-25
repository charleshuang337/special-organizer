import { useCallback, useEffect, useMemo, useState } from "react";
import { StateNotice } from "../components/StateNotice";
import {
  FIXED_PERIOD_COUNTS,
  FIXED_PERIOD_UNITS,
  IDEAL_END_STRATEGIES,
  SPECIAL_TYPES,
  type AppStatus,
  type FixedPeriodCount,
  type FixedPeriodUnit,
  type IdealEndStrategy,
  type ReportSeriesResult,
  type SeriesHistoryEvent,
  type SpecialSeries,
  type SpecialType,
  type Supplier,
} from "../contracts";
import {
  buildDefaultSeriesInput,
  buildListSeriesQuery,
  buildReapplySeriesInput,
  createSeries,
  formatCommandError,
  getAppStatus,
  listSeries,
  listSuppliers,
  markSeriesClosureCompleted,
  reapplySeriesCommand,
  toSeriesMutationInput,
  updateSeries,
} from "../features/series/seriesCommands";
import {
  buildCalendarDays,
  createEmptyWorkspaceFilters,
  filterWorkspaceSeries,
  getDateDrivenStatus,
  getDateTaskReason,
  getLifecycleCounts,
  getMonthLabel,
  getSupplierName,
  getTodayIsoDate,
  IDEAL_END_STRATEGY_LABELS,
  isSeriesVisibleOnDate,
  moveMonth,
  SPECIAL_TYPE_LABELS,
  STATUS_LABELS,
  type LifecycleFilter,
} from "../features/series/workspaceModel";
import { listSeriesHistory } from "../features/history/historyCommands";
import { buildReportSeriesQuery, listReportSeries } from "../features/reports/reportCommands";
import {
  buildReapplyAsEverydayInput,
  buildReportScopeText,
  dedupeReportResult,
  formatReportDateTime,
  getHistorySeries,
  isValidIsoDateOnly,
  normalizeReportWindowDays,
  REPORT_WINDOW_MAX_DAYS,
  REPORT_WINDOW_MIN_DAYS,
  type ReportFilters,
} from "../features/reports/reportModel";
import {
  checkForAppUpdate,
  downloadAppUpdate,
  formatUpdateError,
  formatUpdateProgress,
  installDownloadedAppUpdate,
  UPDATE_ENDPOINT,
  type AppUpdate,
  type UpdateProgress,
} from "../features/updates/updateCommands";
import styles from "./App.module.css";

const lifecycleNavigation: Array<{ id: LifecycleFilter; label: string }> = [
  { id: "ALL", label: "全部工作项" },
  { id: "ACTIVE", label: STATUS_LABELS.ACTIVE },
  { id: "UPCOMING_END", label: STATUS_LABELS.UPCOMING_END },
  { id: "ENDED_PENDING_CLEARANCE", label: STATUS_LABELS.ENDED_PENDING_CLEARANCE },
  { id: "CLOSURE_COMPLETED", label: STATUS_LABELS.CLOSURE_COMPLETED },
];

const emptyReportResult: ReportSeriesResult = {
  upcoming_end: [],
  ended_pending_clearance: [],
};

const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];

type Feedback = {
  tone: "success" | "error" | "loading";
  message: string;
};

type UpdatePhase = "idle" | "checking" | "available" | "none" | "downloading" | "downloaded" | "installing" | "error";

type UpdateStatus = {
  phase: UpdatePhase;
  message: string;
  progress: UpdateProgress | null;
};

export function App() {
  const todayIsoDate = useMemo(() => getTodayIsoDate(), []);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [seriesRecords, setSeriesRecords] = useState<SpecialSeries[]>([]);
  const [filters, setFilters] = useState(() => createEmptyWorkspaceFilters());
  const [selectedDate, setSelectedDate] = useState(todayIsoDate);
  const [visibleMonth, setVisibleMonth] = useState(todayIsoDate.slice(0, 7));
  const [selectedSeriesId, setSelectedSeriesId] = useState("");
  const [draftSeries, setDraftSeries] = useState<SpecialSeries | null>(null);
  const [appStatus, setAppStatus] = useState<AppStatus | null>(null);
  const [feedback, setFeedback] = useState<Feedback>({
    tone: "loading",
    message: "正在连接本地 Tauri commands 和 SQLite 数据库。",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [reportFilters, setReportFilters] = useState<ReportFilters>({
    withinDays: 7,
    includeUpcoming: true,
    includeEnded: true,
  });
  const [reportResult, setReportResult] = useState<ReportSeriesResult>(emptyReportResult);
  const [historyEvents, setHistoryEvents] = useState<SeriesHistoryEvent[]>([]);
  const [pendingUpdate, setPendingUpdate] = useState<AppUpdate | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    phase: "idle",
    message: "等待检查",
    progress: null,
  });

  const loadSeriesRecords = useCallback(
    async (showLoading = true) => {
      if (showLoading) {
        setIsLoading(true);
      }

      try {
        const records = await listSeries(buildListSeriesQuery(filters));
        setSeriesRecords(records);
      } catch (error) {
        setFeedback({ tone: "error", message: formatCommandError(error) });
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
      }
    },
    [filters],
  );

  const loadReportRecords = useCallback(async () => {
    setIsReportLoading(true);

    try {
      const result = await listReportSeries(buildReportSeriesQuery(selectedDate, filters, reportFilters));
      setReportResult(dedupeReportResult(result));
    } catch (error) {
      setReportResult(emptyReportResult);
      setFeedback({ tone: "error", message: formatCommandError(error) });
    } finally {
      setIsReportLoading(false);
    }
  }, [filters, reportFilters, selectedDate]);

  const loadHistoryEvents = useCallback(async () => {
    try {
      const events = await listSeriesHistory();
      setHistoryEvents(events);
    } catch {
      setHistoryEvents([]);
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadInitialData() {
      setIsLoading(true);

      try {
        const [status, loadedSuppliers] = await Promise.all([getAppStatus(), listSuppliers()]);

        if (!isActive) {
          return;
        }

        setAppStatus(status);
        setSuppliers(loadedSuppliers.filter((supplier) => supplier.is_active));
        setFeedback({
          tone: "success",
          message: "已连接本地 SQLite，工作台数据来自真实 Tauri commands。",
        });
      } catch (error) {
        if (isActive) {
          setFeedback({ tone: "error", message: formatCommandError(error) });
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialData();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    void loadSeriesRecords();
  }, [loadSeriesRecords]);

  useEffect(() => {
    void loadReportRecords();
  }, [loadReportRecords]);

  useEffect(() => {
    void loadHistoryEvents();
  }, [loadHistoryEvents]);

  useEffect(() => {
    if (seriesRecords.length === 0) {
      setSelectedSeriesId("");
      return;
    }

    if (!seriesRecords.some((series) => series.id === selectedSeriesId)) {
      setSelectedSeriesId(seriesRecords[0]?.id ?? "");
    }
  }, [selectedSeriesId, seriesRecords]);

  const selectedSeries = seriesRecords.find((series) => series.id === selectedSeriesId) ?? null;

  useEffect(() => {
    setDraftSeries(selectedSeries ? { ...selectedSeries } : null);
  }, [selectedSeries]);

  const filteredSeries = useMemo(
    () => filterWorkspaceSeries(seriesRecords, suppliers, filters, selectedDate),
    [filters, selectedDate, seriesRecords, suppliers],
  );
  const lifecycleCounts = useMemo(
    () => getLifecycleCounts(seriesRecords, selectedDate),
    [selectedDate, seriesRecords],
  );
  const selectedDateTasks = useMemo(
    () => filteredSeries.filter((series) => isSeriesVisibleOnDate(series, selectedDate)),
    [filteredSeries, selectedDate],
  );
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const visibleReportResult = useMemo(
    () => ({
      upcoming_end: filterWorkspaceSeries(
        reportResult.upcoming_end,
        suppliers,
        { ...filters, lifecycle: "ALL" },
        selectedDate,
      ),
      ended_pending_clearance: filterWorkspaceSeries(
        reportResult.ended_pending_clearance,
        suppliers,
        { ...filters, lifecycle: "ALL" },
        selectedDate,
      ),
    }),
    [filters, reportResult, selectedDate, suppliers],
  );
  const historySeries = useMemo(() => getHistorySeries(seriesRecords, filters), [filters, seriesRecords]);
  const reportScopeText = useMemo(
    () => buildReportScopeText(selectedDate, filters, reportFilters, suppliers),
    [filters, reportFilters, selectedDate, suppliers],
  );
  const isHistoryMode = filters.lifecycle === "CLOSURE_COMPLETED";
  const statusInfo = appStatus
    ? `Schema ${appStatus.database.schema_version}`
    : "Tauri command 等待连接";
  const isUpdateBusy =
    updateStatus.phase === "checking" ||
    updateStatus.phase === "downloading" ||
    updateStatus.phase === "installing";
  const updateProgressValue =
    updateStatus.progress?.totalBytes && updateStatus.progress.totalBytes > 0
      ? Math.min(100, Math.round((updateStatus.progress.downloadedBytes / updateStatus.progress.totalBytes) * 100))
      : null;

  function updateFilter<Value extends keyof typeof filters>(field: Value, value: (typeof filters)[Value]) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function selectDate(isoDate: string) {
    setSelectedDate(isoDate);
    setVisibleMonth(isoDate.slice(0, 7));
  }

  function updateDraftSeries(patch: Partial<SpecialSeries>) {
    setDraftSeries((current) =>
      current
        ? {
            ...current,
            ...patch,
          }
        : current,
    );
  }

  function upsertSeriesRecord(series: SpecialSeries) {
    setSeriesRecords((current) =>
      current.some((item) => item.id === series.id)
        ? current.map((item) => (item.id === series.id ? series : item))
        : [series, ...current],
    );
    setSelectedSeriesId(series.id);
  }

  async function createSeriesDraft() {
    if (suppliers.length === 0) {
      setFeedback({ tone: "error", message: "供应商尚未加载，无法新建系列。" });
      return;
    }

    const supplierId = filters.supplierId === "ALL" ? suppliers[0].id : filters.supplierId;
    const specialType = filters.specialType === "ALL" ? "WEEKLY_SPECIAL" : filters.specialType;
    const input = buildDefaultSeriesInput(supplierId, specialType, selectedDate);

    setIsSaving(true);

    try {
      const created = await createSeries(input);

      upsertSeriesRecord(created);
      setFilters((current) => ({ ...current, lifecycle: "ALL" }));
      setFeedback({ tone: "success", message: "已写入本地 SQLite，并打开新建系列详情。" });
      await loadReportRecords();
      await loadHistoryEvents();
    } catch (error) {
      setFeedback({ tone: "error", message: formatCommandError(error) });
    } finally {
      setIsSaving(false);
    }
  }

  async function saveDetailDraft() {
    if (!draftSeries) {
      setFeedback({ tone: "error", message: "请先从日历、任务列表或报告中选择一个系列。" });
      return;
    }

    setIsSaving(true);

    try {
      const updated = await updateSeries(draftSeries.id, toSeriesMutationInput(draftSeries));

      upsertSeriesRecord(updated);
      setDraftSeries(updated);
      setFeedback({ tone: "success", message: "修改已保存到本地 SQLite。" });
      await loadReportRecords();
      await loadHistoryEvents();
    } catch (error) {
      setFeedback({ tone: "error", message: formatCommandError(error) });
    } finally {
      setIsSaving(false);
    }
  }

  async function markClosureCompleted(series: SpecialSeries) {
    const confirmed = window.confirm("确认该特价已经完成清货收尾，并移入历史记录？");

    if (!confirmed) {
      return;
    }

    setIsSaving(true);

    try {
      const updated = await markSeriesClosureCompleted(series.id, "工作台确认特价结束收尾完成");

      upsertSeriesRecord(updated);
      setFeedback({
        tone: "success",
        message: "已标记收尾完成：状态进入历史记录，写入完成时间和 CLOSURE_COMPLETED 事件，报告提示已移除。",
      });
      await loadReportRecords();
      await loadHistoryEvents();
    } catch (error) {
      setFeedback({ tone: "error", message: formatCommandError(error) });
    } finally {
      setIsSaving(false);
    }
  }

  async function reapplySeriesWithDate(series: SpecialSeries) {
    const nextIdealEndDate = window.prompt(
      "重新应用需要新的理想结束日期，请输入 YYYY-MM-DD；若要长期生效，请使用“改为日常”。",
      series.ideal_end_date ?? selectedDate,
    );

    if (nextIdealEndDate === null) {
      return;
    }

    const normalizedDate = nextIdealEndDate.trim() || null;

    if (!normalizedDate) {
      setFeedback({ tone: "error", message: "重新应用必须设置新的理想结束日期，或改为日常特价。" });
      return;
    }

    if (normalizedDate && !isValidIsoDateOnly(normalizedDate)) {
      setFeedback({ tone: "error", message: "理想结束日期必须是有效的 YYYY-MM-DD。" });
      return;
    }

    setIsSaving(true);

    try {
      const input = buildReapplySeriesInput(series, normalizedDate);
      const updated = await reapplySeriesCommand(series.id, input);

      upsertSeriesRecord(updated);
      setFeedback({
        tone: "success",
        message: "已通过重新应用流程写入新的理想结束日期，并恢复为正在生效。",
      });
      await loadReportRecords();
      await loadHistoryEvents();
    } catch (error) {
      setFeedback({ tone: "error", message: formatCommandError(error) });
    } finally {
      setIsSaving(false);
    }
  }

  async function reapplySeriesAsEveryday(series: SpecialSeries) {
    const confirmed = window.confirm("确认将该系列改为日常特价并重新应用？这会清空理想结束日期和固定周期设置。");

    if (!confirmed) {
      return;
    }

    setIsSaving(true);

    try {
      const input = buildReapplyAsEverydayInput(series);
      const updated = await reapplySeriesCommand(series.id, input);

      upsertSeriesRecord(updated);
      setFeedback({ tone: "success", message: "已改为日常特价并恢复为正在生效，报告页不会按结束日提示。" });
      await loadReportRecords();
      await loadHistoryEvents();
    } catch (error) {
      setFeedback({ tone: "error", message: formatCommandError(error) });
    } finally {
      setIsSaving(false);
    }
  }

  async function checkForUpdates() {
    setUpdateStatus({ phase: "checking", message: "正在检查更新", progress: null });

    try {
      const update = await checkForAppUpdate();

      setPendingUpdate(update);
      setUpdateStatus(
        update
          ? {
              phase: "available",
              message: `发现版本 ${update.version}，可下载更新。`,
              progress: null,
            }
          : {
              phase: "none",
              message: `当前已是最新版本。已检查 ${UPDATE_ENDPOINT}`,
              progress: null,
            },
      );
    } catch (error) {
      setPendingUpdate(null);
      setUpdateStatus({ phase: "error", message: formatUpdateError(error), progress: null });
    }
  }

  async function downloadPendingUpdate() {
    if (!pendingUpdate) {
      setUpdateStatus({ phase: "error", message: "请先检查并选择可用更新。", progress: null });
      return;
    }

    setUpdateStatus({ phase: "downloading", message: "正在下载更新", progress: null });

    try {
      await downloadAppUpdate(pendingUpdate, (progress) => {
        setUpdateStatus({
          phase: "downloading",
          message: formatUpdateProgress(progress),
          progress,
        });
      });
      setUpdateStatus({ phase: "downloaded", message: `版本 ${pendingUpdate.version} 已下载`, progress: null });
    } catch (error) {
      setUpdateStatus({ phase: "error", message: formatUpdateError(error), progress: null });
    }
  }

  async function installPendingUpdate() {
    if (!pendingUpdate || updateStatus.phase !== "downloaded") {
      setUpdateStatus({ phase: "error", message: "请先下载更新后再安装。", progress: null });
      return;
    }

    const confirmed = window.confirm("安装更新会关闭 Special Organizer，并启动安装程序。确认现在安装？");

    if (!confirmed) {
      return;
    }

    setUpdateStatus({ phase: "installing", message: "正在安装更新", progress: null });

    try {
      await installDownloadedAppUpdate(pendingUpdate);
    } catch (error) {
      setUpdateStatus({ phase: "error", message: formatUpdateError(error), progress: null });
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            SO
          </span>
          <div>
            <p className={styles.eyebrow}>Special Organizer</p>
            <h1>特价系列工作台</h1>
          </div>
        </div>

        <div className={styles.searchRow} aria-label="全局搜索和筛选">
          <label className={styles.searchBox}>
            <span>搜索</span>
            <input
              type="search"
              value={filters.searchText}
              placeholder="供应商或系列名称"
              onChange={(event) => updateFilter("searchText", event.target.value)}
            />
          </label>
          <select
            aria-label="特价类型筛选"
            value={filters.specialType}
            onChange={(event) => updateFilter("specialType", event.target.value as "ALL" | SpecialType)}
          >
            <option value="ALL">全部类型</option>
            {SPECIAL_TYPES.map((type) => (
              <option key={type} value={type}>
                {SPECIAL_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <select
            aria-label="供应商筛选"
            value={filters.supplierId}
            onChange={(event) => updateFilter("supplierId", event.target.value)}
          >
            <option value="ALL">全部供应商</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
          <select
            aria-label="生命周期筛选"
            value={filters.lifecycle}
            onChange={(event) => updateFilter("lifecycle", event.target.value as LifecycleFilter)}
          >
            {lifecycleNavigation.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={isLoading || isSaving}
            onClick={createSeriesDraft}
          >
            新建系列
          </button>
        </div>
      </header>

      <section className={styles.statusStrip} aria-live="polite">
        <span className={styles.statusDot} data-tone={feedback.tone} aria-hidden="true" />
        <span>{feedback.message}</span>
        <span className={styles.commandList}>{statusInfo}</span>
      </section>

      <section className={styles.workspace} aria-label="应用工作台">
        <aside className={styles.sidebar} aria-label="生命周期、供应商和特价类型导航">
          <section className={styles.sidebarSection}>
            <h2>生命周期</h2>
            <nav className={styles.navList}>
              {lifecycleNavigation.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={filters.lifecycle === item.id ? styles.activeNavButton : undefined}
                  onClick={() => updateFilter("lifecycle", item.id)}
                >
                  <span>{item.label}</span>
                  <span className={styles.count}>{lifecycleCounts[item.id]}</span>
                </button>
              ))}
            </nav>
          </section>

          <section className={styles.sidebarSection}>
            <h2>供应商</h2>
            <div className={styles.filterButtonList}>
              <button
                type="button"
                className={filters.supplierId === "ALL" ? styles.activeFilterButton : undefined}
                onClick={() => updateFilter("supplierId", "ALL")}
              >
                全部供应商
              </button>
              {suppliers.map((supplier) => (
                <button
                  key={supplier.id}
                  type="button"
                  className={filters.supplierId === supplier.id ? styles.activeFilterButton : undefined}
                  onClick={() => updateFilter("supplierId", supplier.id)}
                >
                  {supplier.name}
                </button>
              ))}
            </div>
          </section>

          <section className={styles.sidebarSection}>
            <h2>特价类型</h2>
            <div className={styles.filterButtonList}>
              <button
                type="button"
                className={filters.specialType === "ALL" ? styles.activeFilterButton : undefined}
                onClick={() => updateFilter("specialType", "ALL")}
              >
                全部类型
              </button>
              {SPECIAL_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={filters.specialType === type ? styles.activeFilterButton : undefined}
                  onClick={() => updateFilter("specialType", type)}
                >
                  {SPECIAL_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </section>

          <section className={styles.sidebarSection} aria-label="应用更新">
            <h2>应用更新</h2>
            <div className={styles.updatePanel}>
              <span className={styles.updateStatus} data-phase={updateStatus.phase}>
                {updateStatus.message}
              </span>
              {updateProgressValue !== null ? (
                <progress className={styles.updateProgress} value={updateProgressValue} max={100} />
              ) : null}
              <div className={styles.updateActions}>
                <button type="button" disabled={isUpdateBusy} onClick={checkForUpdates}>
                  检查更新
                </button>
                <button
                  type="button"
                  disabled={!pendingUpdate || isUpdateBusy || updateStatus.phase === "downloaded"}
                  onClick={downloadPendingUpdate}
                >
                  下载更新
                </button>
                <button
                  type="button"
                  disabled={!pendingUpdate || updateStatus.phase !== "downloaded" || isUpdateBusy}
                  onClick={installPendingUpdate}
                >
                  安装更新
                </button>
              </div>
            </div>
          </section>
        </aside>

        <section className={styles.centerPane} aria-label="日历和任务列表">
          <section className={styles.panel} aria-label="任务日历">
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Calendar</p>
                <h2>任务日历</h2>
              </div>
              <div className={styles.monthControls}>
                <button type="button" aria-label="上个月" onClick={() => setVisibleMonth(moveMonth(visibleMonth, -1))}>
                  {"<"}
                </button>
                <span>{getMonthLabel(visibleMonth)}</span>
                <button type="button" aria-label="下个月" onClick={() => setVisibleMonth(moveMonth(visibleMonth, 1))}>
                  {">"}
                </button>
              </div>
            </div>

            <div className={styles.weekdayRow} aria-hidden="true">
              {weekdayLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className={styles.calendarGrid}>
              {calendarDays.map((day) => {
                const count = filteredSeries.filter((series) => isSeriesVisibleOnDate(series, day.isoDate)).length;
                const isSelected = selectedDate === day.isoDate;

                return (
                  <button
                    key={day.isoDate}
                    type="button"
                    className={styles.calendarDay}
                    data-selected={isSelected}
                    data-outside-month={!day.isCurrentMonth}
                    onClick={() => selectDate(day.isoDate)}
                  >
                    <span>{day.dayNumber}</span>
                    {count > 0 ? <strong>{count}</strong> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className={styles.panel} aria-label="列表式任务栏">
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Task List</p>
                <h2>{selectedDate} 任务</h2>
              </div>
              <span className={styles.statusPill}>{selectedDateTasks.length} 项</span>
            </div>

            {isLoading ? (
              <StateNotice title="正在加载任务" description="正在通过 Tauri command 读取本地 SQLite 数据。" />
            ) : isHistoryMode ? (
              <StateNotice
                title="历史记录不进入任务提醒"
                description="收尾完成的系列只在右侧报告页的历史记录区域查看或重新应用，不再出现在普通日历和任务列表。"
              />
            ) : filteredSeries.length === 0 ? (
              <StateNotice title="没有匹配结果" description="调整搜索、供应商、特价类型或生命周期筛选后再查看。" />
            ) : selectedDateTasks.length === 0 ? (
              <StateNotice title="当天暂无任务" description="选定日期没有有效期、理想结束日或待清货项目。" />
            ) : (
              <div className={styles.taskList}>
                {selectedDateTasks.map((series) => {
                  const displayStatus = getDateDrivenStatus(series, selectedDate);

                  return (
                    <button
                      key={series.id}
                      type="button"
                      className={styles.taskItem}
                      data-selected={selectedSeriesId === series.id}
                      onClick={() => setSelectedSeriesId(series.id)}
                    >
                      <span className={styles.taskTitle}>{series.series_name}</span>
                      <span className={styles.taskMeta}>
                        {getSupplierName(suppliers, series.supplier_id)} · {SPECIAL_TYPE_LABELS[series.special_type]}
                      </span>
                      <span className={styles.taskFooter}>
                        <span>{STATUS_LABELS[displayStatus]}</span>
                        <span>{getDateTaskReason(series, selectedDate)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </section>

        <aside className={styles.detailPane} aria-label="系列详情编辑和报告入口">
          <section className={styles.panel} aria-label="系列详情编辑面板">
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Series</p>
                <h2>系列详情</h2>
              </div>
              {draftSeries ? (
                <span className={styles.statusPill}>{STATUS_LABELS[getDateDrivenStatus(draftSeries, selectedDate)]}</span>
              ) : null}
            </div>

            {draftSeries ? (
              <form className={styles.detailForm} onSubmit={(event) => event.preventDefault()}>
                <label>
                  <span>系列名称</span>
                  <input
                    value={draftSeries.series_name}
                    onChange={(event) => updateDraftSeries({ series_name: event.target.value })}
                  />
                </label>
                <label>
                  <span>供应商</span>
                  <select
                    value={draftSeries.supplier_id}
                    onChange={(event) => updateDraftSeries({ supplier_id: event.target.value })}
                  >
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className={styles.formGrid}>
                  <label>
                    <span>特价类型</span>
                    <select
                      value={draftSeries.special_type}
                      onChange={(event) => updateDraftSeries({ special_type: event.target.value as SpecialType })}
                    >
                      {SPECIAL_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {SPECIAL_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className={styles.readonlyField}>
                    <span>状态</span>
                    <strong>{STATUS_LABELS[draftSeries.status]}</strong>
                    <small>
                      状态由日期规则、收尾完成和重新应用流程变更，避免在详情编辑中直接绕过业务流转。
                    </small>
                  </div>
                </div>
                <div className={styles.formGrid}>
                  <NumberField
                    label="一般成本"
                    value={draftSeries.normal_cost}
                    onChange={(value) => updateDraftSeries({ normal_cost: value })}
                  />
                  <NumberField
                    label="特供成本"
                    value={draftSeries.special_supply_cost}
                    onChange={(value) => updateDraftSeries({ special_supply_cost: value })}
                  />
                  <NumberField
                    label="普通售价"
                    value={draftSeries.regular_price}
                    onChange={(value) => updateDraftSeries({ regular_price: value })}
                  />
                  <NumberField
                    label="特价"
                    value={draftSeries.special_price}
                    onChange={(value) => updateDraftSeries({ special_price: value })}
                  />
                </div>
                <div className={styles.formGrid}>
                  <DateField
                    label="有效开始"
                    value={draftSeries.effective_start_date}
                    onChange={(value) => updateDraftSeries({ effective_start_date: value })}
                  />
                  <DateField
                    label="有效结束"
                    value={draftSeries.effective_end_date}
                    onChange={(value) => updateDraftSeries({ effective_end_date: value })}
                  />
                  <DateField
                    label="保质期"
                    value={draftSeries.shelf_life_date}
                    onChange={(value) => updateDraftSeries({ shelf_life_date: value })}
                  />
                  <DateField
                    label="理想结束"
                    value={draftSeries.ideal_end_date}
                    onChange={(value) => updateDraftSeries({ ideal_end_date: value })}
                  />
                </div>
                <div className={styles.formGrid}>
                  <label>
                    <span>结束策略</span>
                    <select
                      value={draftSeries.ideal_end_strategy ?? ""}
                      onChange={(event) =>
                        updateDraftSeries({
                          ideal_end_strategy: event.target.value === "" ? null : (event.target.value as IdealEndStrategy),
                        })
                      }
                    >
                      <option value="">不设置</option>
                      {IDEAL_END_STRATEGIES.map((strategy) => (
                        <option key={strategy} value={strategy}>
                          {IDEAL_END_STRATEGY_LABELS[strategy]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>周期单位</span>
                    <select
                      value={draftSeries.fixed_period_unit ?? ""}
                      onChange={(event) =>
                        updateDraftSeries({
                          fixed_period_unit: event.target.value === "" ? null : (event.target.value as FixedPeriodUnit),
                        })
                      }
                    >
                      <option value="">不使用</option>
                      {FIXED_PERIOD_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit === "WEEK" ? "周" : "月"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>周期数量</span>
                    <select
                      value={draftSeries.fixed_period_count ?? ""}
                      onChange={(event) =>
                        updateDraftSeries({
                          fixed_period_count:
                            event.target.value === "" ? null : (Number(event.target.value) as FixedPeriodCount),
                        })
                      }
                    >
                      <option value="">不使用</option>
                      {FIXED_PERIOD_COUNTS.map((count) => (
                        <option key={count} value={count}>
                          {count}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  <span>备注</span>
                  <textarea
                    value={draftSeries.notes ?? ""}
                    onChange={(event) => updateDraftSeries({ notes: event.target.value })}
                  />
                </label>
                <div className={styles.actionRow}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={isSaving}
                    onClick={saveDetailDraft}
                  >
                    {isSaving ? "保存中" : "保存到本地"}
                  </button>
                </div>
              </form>
            ) : (
              <StateNotice title="未选择系列" description="从搜索结果、日历或任务栏选择一条记录后编辑。" />
            )}
          </section>

          <section className={styles.panel} aria-label="报告页">
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Reports</p>
                <h2>报告页</h2>
              </div>
              <span className={styles.statusPill}>
                {visibleReportResult.upcoming_end.length +
                  visibleReportResult.ended_pending_clearance.length +
                  historySeries.length}{" "}
                项
              </span>
            </div>

            <div className={styles.reportControls}>
              <label>
                <span>结束日期前</span>
                <input
                  type="number"
                  min={REPORT_WINDOW_MIN_DAYS}
                  max={REPORT_WINDOW_MAX_DAYS}
                  value={reportFilters.withinDays}
                  onChange={(event) =>
                    setReportFilters((current) => ({
                      ...current,
                      withinDays: normalizeReportWindowDays(Number(event.target.value)),
                    }))
                  }
                />
              </label>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={reportFilters.includeUpcoming}
                  onChange={(event) =>
                    setReportFilters((current) => ({ ...current, includeUpcoming: event.target.checked }))
                  }
                />
                <span>包括即将结束</span>
              </label>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={reportFilters.includeEnded}
                  onChange={(event) =>
                    setReportFilters((current) => ({ ...current, includeEnded: event.target.checked }))
                  }
                />
                <span>包括已结束</span>
              </label>
            </div>
            <p className={styles.reportScope}>{reportScopeText}</p>

            {isReportLoading ? (
              <p className={styles.emptyText}>正在通过报告 command 刷新...</p>
            ) : null}
            <ReportGroup
              title="即将结束"
              items={visibleReportResult.upcoming_end}
              suppliers={suppliers}
              emptyText="当前筛选下没有即将结束系列。"
              onSelect={setSelectedSeriesId}
              getMeta={(series) => `理想结束：${series.ideal_end_date ?? "未设置"}`}
              actions={[
                { label: "重新设日", onAction: reapplySeriesWithDate },
                { label: "改为日常", onAction: reapplySeriesAsEveryday },
              ]}
            />
            <ReportGroup
              title="已结束待清货"
              items={visibleReportResult.ended_pending_clearance}
              suppliers={suppliers}
              emptyText="当前筛选下没有待清货系列。"
              onSelect={setSelectedSeriesId}
              getMeta={(series) => `理想结束：${series.ideal_end_date ?? "未设置"} · ${STATUS_LABELS[series.status]}`}
              actions={[
                { label: "收尾完成", onAction: markClosureCompleted, variant: "primary" },
                { label: "重新设日", onAction: reapplySeriesWithDate },
                { label: "改为日常", onAction: reapplySeriesAsEveryday },
              ]}
            />
            <ReportGroup
              title="历史记录"
              items={historySeries}
              suppliers={suppliers}
              emptyText="当前筛选下没有收尾完成的历史记录。"
              onSelect={setSelectedSeriesId}
              getMeta={(series) =>
                `收尾完成：${formatReportDateTime(series.clearance_completed_at)} · ${
                  getLatestHistoryEventNote(historyEvents, series.id) ?? "已移入历史"
                }`
              }
              actions={[
                { label: "重新设日", onAction: reapplySeriesWithDate },
                { label: "改为日常", onAction: reapplySeriesAsEveryday },
              ]}
            />
          </section>
        </aside>
      </section>
    </main>
  );
}

type NumberFieldProps = {
  label: string;
  value?: number | null;
  onChange: (value: number | null) => void;
};

function NumberField({ label, value, onChange }: NumberFieldProps) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
      />
    </label>
  );
}

type DateFieldProps = {
  label: string;
  value?: string | null;
  onChange: (value: string | null) => void;
};

function DateField({ label, value, onChange }: DateFieldProps) {
  return (
    <label>
      <span>{label}</span>
      <input type="date" value={value ?? ""} onChange={(event) => onChange(event.target.value || null)} />
    </label>
  );
}

type ReportGroupProps = {
  title: string;
  items: SpecialSeries[];
  suppliers: Supplier[];
  emptyText: string;
  onSelect: (id: string) => void;
  getMeta: (series: SpecialSeries) => string;
  actions: ReportAction[];
};

type ReportAction = {
  label: string;
  onAction: (series: SpecialSeries) => void;
  variant?: "primary" | "secondary";
};

function ReportGroup({ title, items, suppliers, emptyText, onSelect, getMeta, actions }: ReportGroupProps) {
  return (
    <section className={styles.reportGroup}>
      <div className={styles.reportGroupHeader}>
        <h3>{title}</h3>
        <span>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className={styles.emptyText}>{emptyText}</p>
      ) : (
        <div className={styles.reportList}>
          {items.map((series) => (
            <article key={series.id} className={styles.reportItem}>
              <button type="button" className={styles.reportItemMain} onClick={() => onSelect(series.id)}>
                <strong>{series.series_name}</strong>
                <span>
                  {getSupplierName(suppliers, series.supplier_id)} · {SPECIAL_TYPE_LABELS[series.special_type]}
                </span>
                <span>{getMeta(series)}</span>
              </button>
              <div className={styles.reportActions}>
                {actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    data-variant={action.variant ?? "secondary"}
                    onClick={() => action.onAction(series)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function getLatestHistoryEventNote(events: readonly SeriesHistoryEvent[], seriesId: string): string | null {
  return (
    events.find(
      (event) =>
        event.series_id === seriesId &&
        (event.event_type === "CLOSURE_COMPLETED" || event.event_type === "REAPPLIED"),
    )?.event_note ?? null
  );
}
