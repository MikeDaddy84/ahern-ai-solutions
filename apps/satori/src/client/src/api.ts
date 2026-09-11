import { previewRequest } from './preview.js';
export interface TaskItem {
  id: string;
  text: string;
  type: 'have_to' | 'need_to' | 'want_to';
  status: 'backlog' | 'today' | 'done' | 'archived';
  dateAdded: number;
  dateDone?: number | null;
  dayKey?: string | null;
  sortOrder: number;
  source: 'manual' | 'calendar' | 'carryover' | 'backlog_pull';
}

export interface TodayResponse {
  dayKey: string;
  categories: {
    have_to: TaskItem[];
    need_to: TaskItem[];
    want_to: TaskItem[];
  };
  counts: {
    have_to: { total: number; remaining: number };
    need_to: { total: number; remaining: number };
    want_to: { total: number; remaining: number };
  };
}

export interface HistoryItem {
  dayKey: string;
  createdAt: number;
  summary: {
    dayKey: string;
    createdAt: number;
    tasks: TaskItem[];
  };
}

let onUnauthorizedCallback: (() => void) | null = null;

export function setOnUnauthorized(cb: () => void) {
  onUnauthorizedCallback = cb;
}

export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const portalHost = typeof document === 'undefined' ? null : document.querySelector('.satori-host');
  if (portalHost?.getAttribute('data-preview') === 'true') return previewRequest(url, options) as T;
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> || {}) };
  if (portalHost) headers['X-CSRF-Token'] = document.getElementById('main')?.dataset.csrf || '';
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const endpoint = !portalHost ? url : ['/api/me','/api/logout'].includes(url) ? url.replace('/api/', '/api/portal/') : url.replace('/api/', '/api/portal/satori/');
  const res = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    if (portalHost) window.location.assign('/login');
    else if (onUnauthorizedCallback) onUnauthorizedCallback();
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(errorBody.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  checkAuth: () => request<{ authenticated: boolean }>('/api/me'),
  login: (password: string) =>
    request<{ success: boolean }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  logout: () =>
    request<{ success: boolean }>('/api/logout', {
      method: 'POST',
    }),
  getToday: () => request<TodayResponse>('/api/today'),
  getBacklog: () => request<TaskItem[]>('/api/backlog'),
  getHistory: (days: number = 3, offset: number = 0) => request<HistoryItem[]>(`/api/history?limit=${days}&offset=${offset}`),
  addTask: (text: string, type: 'have_to' | 'need_to' | 'want_to', target: 'today' | 'backlog' = 'today', source?: 'manual' | 'calendar') =>
    request<TaskItem>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ text, type, target, source }),
    }),
  updateTask: (id: string, updates: Partial<{ text: string; type: string; status: string }>) =>
    request<TaskItem>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  deleteTask: (id: string) =>
    request<{ success: boolean }>(`/api/tasks/${id}`, {
      method: 'DELETE',
    }),
  triggerRollover: () =>
    request<{ executed: boolean; todayKey: string }>('/api/rollover', {
      method: 'POST',
    }),
};
