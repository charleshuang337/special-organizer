import { invoke } from "@tauri-apps/api/core";
import {
  SERIES_COMMANDS,
  type AppError,
  type AppStatus,
  type CleanupPreview,
  type ListSeriesQuery,
  type SeriesCommandName,
  type SeriesMutationInput,
  type SpecialSeries,
  type SpecialType,
  type Supplier,
} from "../../contracts";
import { addIsoDays, type WorkspaceFilters } from "./workspaceModel";

export type InvokeCommand = <T>(
  command: SeriesCommandName,
  args?: Record<string, unknown>,
) => Promise<T>;

const defaultInvoker: InvokeCommand = (command, args) => invoke(command, args);

export function getAppStatus(invoker: InvokeCommand = defaultInvoker): Promise<AppStatus> {
  return invoker<AppStatus>(SERIES_COMMANDS.app_status);
}

export function getCleanupPreview(invoker: InvokeCommand = defaultInvoker): Promise<CleanupPreview> {
  return invoker<CleanupPreview>(SERIES_COMMANDS.cleanup_preview);
}

export function listSuppliers(invoker: InvokeCommand = defaultInvoker): Promise<Supplier[]> {
  return invoker<Supplier[]>(SERIES_COMMANDS.list_suppliers);
}

export function listSeries(
  query: ListSeriesQuery,
  invoker: InvokeCommand = defaultInvoker,
): Promise<SpecialSeries[]> {
  return invoker<SpecialSeries[]>(SERIES_COMMANDS.list_series, { query });
}

export function createSeries(
  input: SeriesMutationInput,
  invoker: InvokeCommand = defaultInvoker,
): Promise<SpecialSeries> {
  return invoker<SpecialSeries>(SERIES_COMMANDS.create_series, { input });
}

export function updateSeries(
  id: string,
  input: SeriesMutationInput,
  invoker: InvokeCommand = defaultInvoker,
): Promise<SpecialSeries> {
  return invoker<SpecialSeries>(SERIES_COMMANDS.update_series, { id, input });
}

export function markSeriesClosureCompleted(
  id: string,
  eventNote: string | null,
  invoker: InvokeCommand = defaultInvoker,
): Promise<SpecialSeries> {
  return invoker<SpecialSeries>(SERIES_COMMANDS.mark_series_closure_completed, {
    id,
    eventNote,
  });
}

export function reapplySeriesCommand(
  id: string,
  input: SeriesMutationInput,
  invoker: InvokeCommand = defaultInvoker,
): Promise<SpecialSeries> {
  return invoker<SpecialSeries>(SERIES_COMMANDS.reapply_series, { id, input });
}

export function buildListSeriesQuery(filters: WorkspaceFilters): ListSeriesQuery {
  return {
    search_text: filters.searchText.trim() || null,
    supplier_ids: filters.supplierId === "ALL" ? null : [filters.supplierId],
    special_types: filters.specialType === "ALL" ? null : [filters.specialType],
    statuses: null,
    include_archived: false,
  };
}

export function buildDefaultSeriesInput(
  supplierId: string,
  specialType: SpecialType,
  selectedDate: string,
): SeriesMutationInput {
  const base: SeriesMutationInput = {
    supplier_id: supplierId,
    series_name: "未命名特价系列",
    special_type: specialType,
    normal_cost: null,
    special_supply_cost: null,
    regular_price: null,
    special_price: null,
    effective_start_date: selectedDate,
    effective_end_date: null,
    shelf_life_date: null,
    ideal_end_date: null,
    ideal_end_strategy: null,
    fixed_period_unit: null,
    fixed_period_count: null,
    status: "DRAFT",
    notes: "通过工作台新建，请补齐价格和日期后保存。",
  };

  if (specialType === "WEEKLY_SPECIAL") {
    const effectiveEndDate = addIsoDays(selectedDate, 7);

    return {
      ...base,
      effective_end_date: effectiveEndDate,
      ideal_end_strategy: "EFFECTIVE_PERIOD",
    };
  }

  if (specialType === "FAST_REMOVE_SPECIAL") {
    const shelfLifeDate = addIsoDays(selectedDate, 7);

    return {
      ...base,
      effective_end_date: shelfLifeDate,
      shelf_life_date: shelfLifeDate,
      ideal_end_strategy: "SHELF_LIFE",
    };
  }

  return base;
}

export function toSeriesMutationInput(series: SpecialSeries): SeriesMutationInput {
  return {
    supplier_id: series.supplier_id,
    series_name: series.series_name,
    special_type: series.special_type,
    normal_cost: series.normal_cost ?? null,
    special_supply_cost: series.special_supply_cost ?? null,
    regular_price: series.regular_price ?? null,
    special_price: series.special_price ?? null,
    effective_start_date: series.effective_start_date ?? null,
    effective_end_date: series.effective_end_date ?? null,
    shelf_life_date: series.shelf_life_date ?? null,
    ideal_end_date: series.ideal_end_date ?? null,
    ideal_end_strategy: series.ideal_end_strategy ?? null,
    fixed_period_unit: series.fixed_period_unit ?? null,
    fixed_period_count: series.fixed_period_count ?? null,
    status: series.status,
    notes: series.notes ?? null,
  };
}

export function buildReapplySeriesInput(
  series: SpecialSeries,
  idealEndDate: string | null,
): SeriesMutationInput {
  if (series.special_type === "EVERYDAY_SPECIAL" && !idealEndDate) {
    return {
      ...toSeriesMutationInput(series),
      status: "ACTIVE",
      ideal_end_date: null,
      ideal_end_strategy: null,
    };
  }

  return {
    ...toSeriesMutationInput(series),
    status: "ACTIVE",
    ideal_end_date: idealEndDate,
    ideal_end_strategy: "MANUAL",
  };
}

export function formatCommandError(error: unknown): string {
  if (isAppError(error)) {
    return error.field ? `${error.message}（${error.field}）` : error.message;
  }

  if (error instanceof Error) {
    if (isMissingTauriInvoke(error.message)) {
      return "当前浏览器预览无法访问 Tauri command；请在 Tauri 桌面窗口运行以读取本地 SQLite。";
    }

    return error.message;
  }

  if (typeof error === "string") {
    if (isMissingTauriInvoke(error)) {
      return "当前浏览器预览无法访问 Tauri command；请在 Tauri 桌面窗口运行以读取本地 SQLite。";
    }

    return error;
  }

  return "Tauri command 调用失败，请稍后重试。";
}

function isAppError(error: unknown): error is AppError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof (error as AppError).message === "string"
  );
}

function isMissingTauriInvoke(message: string): boolean {
  return (
    message.includes("reading 'invoke'") ||
    message.includes("window.__TAURI_INTERNALS__") ||
    message.includes("__TAURI__")
  );
}
