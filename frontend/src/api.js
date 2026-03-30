const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function toSentence(text) {
  if (!text) return "Invalid input.";
  const normalized = String(text).replaceAll("_", " ").trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatValidationError(detail) {
  if (!Array.isArray(detail)) return null;

  const messages = detail.map((item) => {
    const path = Array.isArray(item?.loc) ? item.loc.slice(1).join(" ") : "";
    const message = item?.msg ? toSentence(item.msg) : "Invalid input.";
    return path ? `${toSentence(path)}: ${message}` : message;
  });

  return messages.filter(Boolean).join(" ");
}

function buildQuery(filters = {}) {
  const params = new URLSearchParams();

  if (filters.category?.trim()) params.set("category", filters.category.trim());
  if (filters.start_date) params.set("start_date", filters.start_date);
  if (filters.end_date) params.set("end_date", filters.end_date);

  const query = params.toString();
  return query ? `?${query}` : "";
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = formatValidationError(body.detail) || body.detail || detail;
    } catch {
      // Ignore JSON parse failure for non-JSON errors.
    }
    throw new Error(detail);
  }

  if (response.status === 204) return null;
  return response.json();
}

export const expenseApi = {
  health: () => request("/health"),
  listExpenses: (filters) => request(`/api/expenses${buildQuery(filters)}`),
  createExpense: (payload) =>
    request("/api/expenses", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateExpense: (id, payload) =>
    request(`/api/expenses/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteExpense: (id) =>
    request(`/api/expenses/${id}`, {
      method: "DELETE",
    }),
  categoryTotals: (filters) => request(`/api/analytics/category${buildQuery(filters)}`),
  monthlyTotals: (filters) => {
    const params = new URLSearchParams();
    params.set("months", "6");

    if (filters?.category?.trim()) params.set("category", filters.category.trim());
    if (filters?.start_date) params.set("start_date", filters.start_date);
    if (filters?.end_date) params.set("end_date", filters.end_date);

    return request(`/api/analytics/monthly?${params.toString()}`);
  },
};
