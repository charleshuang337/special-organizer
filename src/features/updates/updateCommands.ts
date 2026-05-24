import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

export type AppUpdate = Update;

export type UpdateProgress = {
  downloadedBytes: number;
  totalBytes: number | null;
};

export async function checkForAppUpdate(): Promise<AppUpdate | null> {
  return check({ timeout: 30000 });
}

export async function downloadAppUpdate(
  update: AppUpdate,
  onProgress: (progress: UpdateProgress) => void,
): Promise<void> {
  let downloadedBytes = 0;
  let totalBytes: number | null = null;

  await update.download((event: DownloadEvent) => {
    if (event.event === "Started") {
      downloadedBytes = 0;
      totalBytes = event.data.contentLength ?? null;
    }

    if (event.event === "Progress") {
      downloadedBytes += event.data.chunkLength;
    }

    onProgress({ downloadedBytes, totalBytes });
  });
}

export function installDownloadedAppUpdate(update: AppUpdate): Promise<void> {
  return update.install();
}

export function formatUpdateProgress(progress: UpdateProgress | null): string {
  if (!progress) {
    return "";
  }

  const downloaded = formatBytes(progress.downloadedBytes);

  if (!progress.totalBytes) {
    return `${downloaded} 已下载`;
  }

  const percent = Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100));

  return `${downloaded} / ${formatBytes(progress.totalBytes)} (${percent}%)`;
}

export function formatUpdateError(error: unknown): string {
  if (error instanceof Error) {
    if (isMissingTauriUpdater(error.message)) {
      return "当前浏览器预览无法访问 Tauri updater；请在 Tauri 桌面窗口运行。";
    }

    return error.message;
  }

  if (typeof error === "string") {
    if (isMissingTauriUpdater(error)) {
      return "当前浏览器预览无法访问 Tauri updater；请在 Tauri 桌面窗口运行。";
    }

    return error;
  }

  return "检查更新失败，请确认 GitHub Releases latest.json、公钥和签名已配置。";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isMissingTauriUpdater(message: string): boolean {
  return (
    message.includes("window.__TAURI_INTERNALS__") ||
    message.includes("__TAURI__") ||
    message.includes("plugin:updater")
  );
}
