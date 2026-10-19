import { useState, useEffect } from 'react';
import { DailyRequestsInfo } from '../types';

const STORAGE_KEY_PREFIX = 'cbz_gemini_daily_requests_';
const DEFAULT_LIMIT = 1500;

function getTodayKey(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${STORAGE_KEY_PREFIX}${year}-${month}-${day}`;
}

export function getClientDailyRequests(): DailyRequestsInfo {
  if (typeof window === 'undefined') {
    return { used: 0, limit: DEFAULT_LIMIT, remaining: DEFAULT_LIMIT };
  }
  try {
    const key = getTodayKey();
    const stored = localStorage.getItem(key);
    const used = stored ? parseInt(stored, 10) || 0 : 0;
    return {
      used,
      limit: DEFAULT_LIMIT,
      remaining: Math.max(0, DEFAULT_LIMIT - used),
    };
  } catch {
    return { used: 0, limit: DEFAULT_LIMIT, remaining: DEFAULT_LIMIT };
  }
}

export function recordClientDailyRequest(amount = 1): DailyRequestsInfo {
  if (typeof window === 'undefined') {
    return { used: 0, limit: DEFAULT_LIMIT, remaining: DEFAULT_LIMIT };
  }
  try {
    const key = getTodayKey();
    const current = getClientDailyRequests();
    const updatedUsed = current.used + amount;
    localStorage.setItem(key, String(updatedUsed));
    const updated: DailyRequestsInfo = {
      used: updatedUsed,
      limit: DEFAULT_LIMIT,
      remaining: Math.max(0, DEFAULT_LIMIT - updatedUsed),
    };
    window.dispatchEvent(new CustomEvent('cbz-daily-requests-updated', { detail: updated }));
    return updated;
  } catch {
    return getClientDailyRequests();
  }
}

export function syncClientDailyRequests(serverInfo?: DailyRequestsInfo | null): DailyRequestsInfo {
  if (typeof window === 'undefined') {
    return serverInfo || { used: 0, limit: DEFAULT_LIMIT, remaining: DEFAULT_LIMIT };
  }
  try {
    const local = getClientDailyRequests();
    if (serverInfo && typeof serverInfo.used === 'number') {
      const maxUsed = Math.max(local.used, serverInfo.used);
      const key = getTodayKey();
      localStorage.setItem(key, String(maxUsed));
      const updated: DailyRequestsInfo = {
        used: maxUsed,
        limit: serverInfo.limit || DEFAULT_LIMIT,
        remaining: Math.max(0, (serverInfo.limit || DEFAULT_LIMIT) - maxUsed),
      };
      window.dispatchEvent(new CustomEvent('cbz-daily-requests-updated', { detail: updated }));
      return updated;
    }
    return local;
  } catch {
    return getClientDailyRequests();
  }
}

export function useDailyRequests(initialServerInfo?: DailyRequestsInfo | null) {
  const [dailyRequests, setDailyRequests] = useState<DailyRequestsInfo>(() => {
    return syncClientDailyRequests(initialServerInfo);
  });

  useEffect(() => {
    if (initialServerInfo) {
      setDailyRequests(syncClientDailyRequests(initialServerInfo));
    }
  }, [initialServerInfo?.used, initialServerInfo?.limit]);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<DailyRequestsInfo>;
      if (customEvent.detail) {
        setDailyRequests(customEvent.detail);
      } else {
        setDailyRequests(getClientDailyRequests());
      }
    };

    window.addEventListener('cbz-daily-requests-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('cbz-daily-requests-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  return dailyRequests;
}
