const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

export async function fetchAreaByClass(geometry, year) {
  const response = await fetch(`${API}/analysis/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      geometry,
      year: Number(year),
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data;
}

// Bump the version (v1 -> v2) after changing the boundary simplification
// or updating the land cover data, so old saved results are ignored.
const CACHE_PREFIX = "rlcms.area.v1.";

// Same as fetchAreaByClass, but remembers the answer for a region key + year
export async function fetchAreaCached(key, geometry, year) {
  const cacheKey = `${CACHE_PREFIX}${key}.${year}`;

  try {
    const hit = localStorage.getItem(cacheKey);
    if (hit) return JSON.parse(hit);
  } catch {
    /* storage unavailable: just fetch */
  }

  const data = await fetchAreaByClass(geometry, year);

  try {
    localStorage.setItem(cacheKey, JSON.stringify(data));
  } catch {
    /* storage full: ignore */
  }

  return data;
}