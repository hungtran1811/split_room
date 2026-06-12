export function getRoutePath(hash = window.location.hash) {
  const value = hash || "#/dashboard";
  const queryIndex = value.indexOf("?");
  return queryIndex === -1 ? value : value.slice(0, queryIndex);
}

export function getRouteQuery(hash = window.location.hash) {
  const value = hash || "";
  const queryIndex = value.indexOf("?");
  if (queryIndex === -1) return new URLSearchParams();
  return new URLSearchParams(value.slice(queryIndex + 1));
}

export function buildHash(path, params = {}) {
  const normalizedPath = path.startsWith("#") ? path : `#${path}`;
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `${normalizedPath}?${query}` : normalizedPath;
}
