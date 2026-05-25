import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

export const UPDATE_ENDPOINT =
  "https://github.com/charleshuang337/special-organizer/releases/latest/download/latest.json";

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
  const message = getErrorMessage(error);
  const lowerMessage = message.toLowerCase();

  if (isMissingTauriUpdater(message)) {
    return "更新检查只能在已安装的 Tauri 桌面应用中运行；浏览器预览或开发网页不能调用 updater。";
  }

  if (hasAny(lowerMessage, ["json", "deserialize", "parse", "expected value", "eof while parsing"])) {
    return withRawDetail(
      "更新元数据 latest.json 无法解析。请确认 GitHub Release 里的 latest.json 是合法 JSON，并且保存为 UTF-8 without BOM。",
      message,
    );
  }

  if (hasAny(lowerMessage, ["signature", "public key", "pubkey", "minisign", "verify"])) {
    return withRawDetail(
      "更新签名验证失败。请确认 tauri.conf.json 的 updater public key、安装包 .sig 和 latest.json 的 signature 来自同一个私钥。",
      message,
    );
  }

  if (hasAny(lowerMessage, ["404", "not found", "asset", "download"])) {
    return withRawDetail(
      "更新文件下载地址无效。请确认 latest.json 里的 url 与 GitHub Release 实际安装包资产名完全一致。",
      message,
    );
  }

  if (hasAny(lowerMessage, ["network", "request", "timeout", "timed out", "dns", "connection", "proxy", "certificate"])) {
    return withRawDetail(
      `无法连接更新源。请确认网络能访问 ${UPDATE_ENDPOINT}。`,
      message,
    );
  }

  if (error instanceof Error) {
    return withRawDetail("更新检查失败。", error.message);
  }

  if (typeof error === "string") {
    return withRawDetail("更新检查失败。", error);
  }

  return "更新检查失败。请确认 GitHub Releases latest.json、安装包 URL、公钥和签名已配置。";
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "";
  }
}

function hasAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function withRawDetail(summary: string, rawDetail: string): string {
  const detail = rawDetail.trim();

  if (!detail) {
    return summary;
  }

  return `${summary} 原始错误：${truncate(detail, 180)}`;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
