// Browser-side: always same-origin so Better-Auth cookies flow naturally.
// Per checklist §三 (red lines): never reference the backend internal URL in browser code.

export interface ApiError {
  error: string;
  message?: string;
  [k: string]: unknown;
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: ApiError }> {
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let error: ApiError = { error: 'request_failed' };
    try {
      error = (await res.json()) as ApiError;
    } catch {
      // ignore
    }
    return { ok: false, status: res.status, error };
  }
  if (res.status === 204) return { ok: true, data: undefined as unknown as T };
  return { ok: true, data: (await res.json()) as T };
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postForm: async <T>(path: string, form: FormData) => {
    const res = await fetch(path, { method: 'POST', body: form, credentials: 'include' });
    if (!res.ok) {
      let error: ApiError = { error: 'upload_failed' };
      try {
        error = (await res.json()) as ApiError;
      } catch {
        // ignore
      }
      return { ok: false as const, status: res.status, error };
    }
    return { ok: true as const, data: (await res.json()) as T };
  },
};
