/** Tiny typed fetch wrapper for the BFF endpoints. */
export async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: 'no-store', ...init });
  if (!res.ok) {
    let detail: string | undefined;
    try {
      detail = await res.text();
    } catch {}
    throw new Error(`GET ${path} failed: ${res.status}${detail ? ` — ${detail}` : ''}`);
  }
  return (await res.json()) as T;
}

export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    let detail: string | undefined;
    try {
      detail = await res.text();
    } catch {}
    throw new Error(`POST ${path} failed: ${res.status}${detail ? ` — ${detail}` : ''}`);
  }
  return (await res.json()) as T;
}

export async function putJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`PUT ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function delJSON(path: string): Promise<void> {
  const res = await fetch(path, { method: 'DELETE', cache: 'no-store' });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
}
