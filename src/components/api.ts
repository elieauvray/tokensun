export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  const hasBody = init?.body !== undefined && init?.body !== null;
  const bodyIsFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;

  if (hasBody && !bodyIsFormData && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const res = await fetch(path, {
    credentials: 'include',
    headers,
    ...init
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }

  return (await res.text()) as T;
}
