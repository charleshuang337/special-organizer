import { invoke } from "@tauri-apps/api/core";
import {
  SERIES_COMMANDS,
  type SeriesCommandName,
  type SeriesHistoryEvent,
} from "../../contracts";

type HistoryInvokeCommand = <T>(
  command: SeriesCommandName,
  args?: Record<string, unknown>,
) => Promise<T>;

const defaultInvoker: HistoryInvokeCommand = (command, args) => invoke(command, args);

export function listSeriesHistory(
  seriesId: string | null = null,
  invoker: HistoryInvokeCommand = defaultInvoker,
): Promise<SeriesHistoryEvent[]> {
  return invoker<SeriesHistoryEvent[]>(SERIES_COMMANDS.list_series_history, {
    seriesId,
  });
}
