
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
