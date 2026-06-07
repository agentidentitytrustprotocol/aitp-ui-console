/** Tiny typed fetch wrappers for the BFF endpoints. */

async function errorDetail(res: Response): Promise<string | undefined> {
  try {
    const text = await res.text();
    return text ? text.slice(0, 500) : undefined;
  } catch {
    return undefined;
  }
}

function failed(method: string, path: string, status: number, detail?: string): Error {
  return new Error(`${method} ${path} failed: ${status}${detail ? ` — ${detail}` : ''}`);
}

export async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: 'no-store', ...init });
  if (!res.ok) throw failed('GET', path, res.status, await errorDetail(res));
  return (await res.json()) as T;
}

export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw failed('POST', path, res.status, await errorDetail(res));
  return (await res.json()) as T;
}

export async function putJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw failed('PUT', path, res.status, await errorDetail(res));
  return (await res.json()) as T;
}

export async function delJSON(path: string): Promise<void> {
  const res = await fetch(path, { method: 'DELETE', cache: 'no-store' });
  if (!res.ok) throw failed('DELETE', path, res.status, await errorDetail(res));
}
