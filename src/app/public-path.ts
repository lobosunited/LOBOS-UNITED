export function publicPath(path: string, base = import.meta.env?.BASE_URL ?? '/'): string {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}${path.replace(/^\/+/, '')}`;
}

export function projectPath(page: string): string {
  return publicPath(encodeURIComponent(page));
}
