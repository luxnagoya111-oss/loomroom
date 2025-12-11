// lib/storeApplications.ts
// 店舗審査フォーム用の暫定ストレージ（localStorage）

export type StoreApplicationStatus = "pending" | "approved" | "rejected";

export type StoreApplication = {
  id: string; // app_xxxx
  storeName: string;
  area: string;
  contactName: string;
  contactEmail: string;
  note?: string;
  status: StoreApplicationStatus;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

const STORAGE_KEY = "loomroom_storeApplications_v1";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function loadStoreApplications(): StoreApplication[] {
  if (!isBrowser()) return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as StoreApplication[];
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // ignore
  }
  return [];
}

function saveStoreApplications(apps: StoreApplication[]) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
}

/**
 * デモ用：手動で店舗申請を追加するためのヘルパー
 * （本番では /creator-signup などから呼ぶ想定）
 */
export function addStoreApplication(
  input: Omit<
    StoreApplication,
    "id" | "status" | "createdAt" | "updatedAt"
  >
): StoreApplication {
  const apps = loadStoreApplications();
  const now = new Date().toISOString();
  const id = `app_${Math.random().toString(36).slice(2, 8)}`;

  const app: StoreApplication = {
    id,
    storeName: input.storeName,
    area: input.area,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    note: input.note,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  apps.unshift(app);
  saveStoreApplications(apps);
  return app;
}

/**
 * 審査ステータスを更新
 */
export function updateStoreApplicationStatus(
  id: string,
  status: StoreApplicationStatus
): StoreApplication | null {
  const apps = loadStoreApplications();
  const idx = apps.findIndex((a) => a.id === id);
  if (idx === -1) return null;

  const now = new Date().toISOString();
  apps[idx] = {
    ...apps[idx],
    status,
    updatedAt: now,
  };

  saveStoreApplications(apps);
  return apps[idx];
}