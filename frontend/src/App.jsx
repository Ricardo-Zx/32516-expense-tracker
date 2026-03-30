import { useEffect, useMemo, useState } from "react";

import { expenseApi } from "./api";

const today = new Date().toISOString().slice(0, 10);
const monthPrefix = today.slice(0, 7);

const categorySuggestions = [
  "Food",
  "Transport",
  "Rent",
  "Groceries",
  "Utilities",
  "Entertainment",
  "Study",
  "Health",
  "Travel",
  "Shopping",
];

const emptyForm = {
  title: "",
  category: "",
  amount: "",
  expense_date: today,
  description: "",
};

const emptyFilters = {
  category: "",
  start_date: "",
  end_date: "",
};

const demoExpense = {
  title: "Weekly groceries",
  category: "Groceries",
  amount: "42.60",
  expense_date: today,
  description: "Milk, fruit, and pantry refill",
};

function formatCurrency(value) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}

function toPayload(form) {
  return {
    title: form.title.trim(),
    category: form.category.trim(),
    amount: Number(form.amount),
    expense_date: form.expense_date,
    description: form.description.trim() || null,
  };
}

function describeFilters(filters) {
  const parts = [];
  if (filters.category.trim()) parts.push(filters.category.trim());
  if (filters.start_date || filters.end_date) {
    parts.push(`${filters.start_date || "Any start"} to ${filters.end_date || "Any end"}`);
  }
  return parts.length === 0 ? "Showing all expenses" : `Filtered by ${parts.join(" | ")}`;
}

export default function App() {
  const [expenses, setExpenses] = useState([]);
  const [categoryTotals, setCategoryTotals] = useState([]);
  const [monthlyTotals, setMonthlyTotals] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [filters, setFilters] = useState(emptyFilters);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: "Loading...", error: false });
  const [toastVisible, setToastVisible] = useState(true);

  const totalSpent = useMemo(
    () => expenses.reduce((sum, item) => sum + item.amount, 0),
    [expenses]
  );

  const averageSpend = useMemo(
    () => (expenses.length ? totalSpent / expenses.length : 0),
    [expenses, totalSpent]
  );

  const currentMonthSpent = useMemo(
    () =>
      expenses
        .filter((item) => item.expense_date.startsWith(monthPrefix))
        .reduce((sum, item) => sum + item.amount, 0),
    [expenses]
  );

  const topCategory = categoryTotals[0]?.category ?? "No data";
  const filterSummary = describeFilters(filters);
  const maxMonthly = Math.max(1, ...monthlyTotals.map((row) => row.total));

  function showMessage(text, error = false) {
    setMessage({ text, error });
  }

  useEffect(() => {
    setToastVisible(true);

    if (busy) return;
    if (message.error) return;
    if (!message.text || message.text === "Loading...") return;

    const timer = window.setTimeout(() => setToastVisible(false), 4500);
    return () => window.clearTimeout(timer);
  }, [message.text, message.error, busy]);

  function resetForm() {
    setForm({ ...emptyForm, expense_date: today });
    setEditingId(null);
  }

  function fillDemoExpense() {
    setForm(demoExpense);
    setEditingId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    showMessage("Demo expense loaded into the form.");
  }

  async function refreshExpenses(activeFilters) {
    const data = await expenseApi.listExpenses(activeFilters);
    setExpenses(data);
  }

  async function refreshAnalytics(activeFilters) {
    const [categoryData, monthlyData] = await Promise.all([
      expenseApi.categoryTotals(activeFilters),
      expenseApi.monthlyTotals(activeFilters),
    ]);
    setCategoryTotals(categoryData);
    setMonthlyTotals(monthlyData);
  }

  async function refreshAll(activeFilters) {
    await Promise.all([refreshExpenses(activeFilters), refreshAnalytics(activeFilters)]);
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        await expenseApi.health();
        await refreshAll(emptyFilters);
        showMessage("Connected. You can add, edit, delete, and filter expenses.");
      } catch (error) {
        showMessage(`Startup failed: ${error.message}`, true);
      }
    }

    bootstrap();
  }, []);

  function handleFormChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleFilterChange(event) {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  }

  function isInvalidDateRange(activeFilters) {
    return (
      activeFilters.start_date &&
      activeFilters.end_date &&
      activeFilters.start_date > activeFilters.end_date
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const payload = toPayload(form);

    if (!payload.title || !payload.category || !payload.expense_date || payload.amount <= 0) {
      showMessage("Please complete title, category, date, and valid amount.", true);
      return;
    }

    setBusy(true);
    try {
      if (editingId) {
        await expenseApi.updateExpense(editingId, payload);
        showMessage("Expense updated.");
      } else {
        await expenseApi.createExpense(payload);
        showMessage("Expense created.");
      }
      resetForm();
      await refreshAll(filters);
    } catch (error) {
      showMessage(`Save failed: ${error.message}`, true);
    } finally {
      setBusy(false);
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      category: item.category,
      amount: String(item.amount),
      expense_date: item.expense_date,
      description: item.description ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function applyCategorySuggestion(category) {
    setForm((prev) => ({ ...prev, category }));
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this expense?")) return;

    setBusy(true);
    try {
      await expenseApi.deleteExpense(id);
      if (editingId === id) {
        resetForm();
      }
      showMessage("Expense deleted.");
      await refreshAll(filters);
    } catch (error) {
      showMessage(`Delete failed: ${error.message}`, true);
    } finally {
      setBusy(false);
    }
  }

  async function applyFilters() {
    if (isInvalidDateRange(filters)) {
      showMessage("Start date must be earlier than end date.", true);
      return;
    }

    setBusy(true);
    try {
      await refreshAll(filters);
      showMessage("Filters applied to list and analytics.");
    } catch (error) {
      showMessage(`Filter failed: ${error.message}`, true);
    } finally {
      setBusy(false);
    }
  }

  async function clearFilters() {
    const nextFilters = { ...emptyFilters };
    setFilters(nextFilters);

    setBusy(true);
    try {
      await refreshAll(nextFilters);
      showMessage("Filters cleared.");
    } catch (error) {
      showMessage(`Clear failed: ${error.message}`, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <header className="hero panel">
        <div className="hero-copy">
          <p className="eyebrow">Assignment 1</p>
          <h1>Expense Tracker</h1>
          <div className="stack-badges" aria-label="Tech stack">
            <span className="badge">React</span>
            <span className="badge">FastAPI</span>
            <span className="badge">MySQL</span>
          </div>
          <p className="subtitle">
            Single-page logbook for recording, filtering, and reviewing spending without page
            reloads.
          </p>
          <p className="filter-summary">{filterSummary}</p>
        </div>

        <div className="hero-side">
          <div className="hero-highlight" aria-label="Project focus">
            <span>Current focus</span>
            <strong>{topCategory}</strong>
            <small>Top category in the current result set</small>
          </div>
        </div>
      </header>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{editingId ? "Edit Expense" : "Add Expense"}</h2>
            <p className="section-note">Create or update a record in one form without leaving the page.</p>
          </div>
          {editingId && (
            <button className="ghost" type="button" onClick={resetForm}>
              Cancel Edit
            </button>
          )}
        </div>

        <form className="grid-form" onSubmit={handleSubmit}>
          <label>
            Title
            <input
              name="title"
              value={form.title}
              onChange={handleFormChange}
              maxLength={120}
              placeholder="Weekly groceries"
              disabled={busy}
              required
            />
          </label>
          <label>
            Category
            <input
              name="category"
              list="category-suggestions"
              value={form.category}
              onChange={handleFormChange}
              maxLength={60}
              placeholder="Food"
              disabled={busy}
              required
            />
            <datalist id="category-suggestions">
              {categorySuggestions.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </label>
          <label>
            Amount (AUD)
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              value={form.amount}
              onChange={handleFormChange}
              placeholder="24.50"
              disabled={busy}
              required
            />
          </label>
          <label>
            Date
            <input
              name="expense_date"
              type="date"
              value={form.expense_date}
              onChange={handleFormChange}
              disabled={busy}
              required
            />
          </label>
          <label className="full">
            Description
            <textarea
              name="description"
              rows="2"
              maxLength={500}
              value={form.description}
              onChange={handleFormChange}
              placeholder="Optional note about why this expense happened"
              disabled={busy}
            />
          </label>

          <div className="full suggestion-row" aria-label="Suggested categories">
            {categorySuggestions.map((category) => (
              <button
                key={category}
                className={`chip ${form.category === category ? "chip-active" : ""}`}
                type="button"
                disabled={busy}
                onClick={() => applyCategorySuggestion(category)}
              >
                {category}
              </button>
            ))}
          </div>

          <button className="primary full" disabled={busy} type="submit">
            {editingId ? "Update Expense" : "Save Expense"}
          </button>
        </form>
      </section>

      <section className="stats-grid">
        <article className="panel stat-card">
          <span>Total Spent</span>
          <strong>{formatCurrency(totalSpent)}</strong>
          <small>Within the current result set</small>
        </article>
        <article className="panel stat-card">
          <span>Items</span>
          <strong>{expenses.length}</strong>
          <small>Expense records currently shown</small>
        </article>
        <article className="panel stat-card">
          <span>Average Spend</span>
          <strong>{formatCurrency(averageSpend)}</strong>
          <small>Average amount per expense</small>
        </article>
        <article className="panel stat-card">
          <span>This Month</span>
          <strong>{formatCurrency(currentMonthSpent)}</strong>
          <small>Entries dated in {monthPrefix}</small>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head panel-stack">
          <div>
            <h2>Expenses</h2>
            <p className="section-note">Filter the list, then review matching analytics below.</p>
          </div>
          <div className="filters">
            <label>
              Category
              <input
                name="category"
                value={filters.category}
                onChange={handleFilterChange}
                placeholder="All categories"
                disabled={busy}
              />
            </label>
            <label>
              Start
              <input
                name="start_date"
                type="date"
                value={filters.start_date}
                onChange={handleFilterChange}
                disabled={busy}
              />
            </label>
            <label>
              End
              <input
                name="end_date"
                type="date"
                value={filters.end_date}
                onChange={handleFilterChange}
                disabled={busy}
              />
            </label>
            <button className="ghost" type="button" disabled={busy} onClick={applyFilters}>
              Apply
            </button>
            <button className="ghost" type="button" disabled={busy} onClick={clearFilters}>
              Clear
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-row">
                    <div className="empty-state">
                      <strong>No expenses found for the current filters.</strong>
                      <p>Try clearing the filters or load a demo expense into the form to create the first record.</p>
                      <div className="empty-actions">
                        <button className="ghost" type="button" disabled={busy} onClick={clearFilters}>
                          Clear Filters
                        </button>
                        <button className="primary" type="button" disabled={busy} onClick={fillDemoExpense}>
                          Use Demo Expense
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                expenses.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>
                      <span className="table-tag">{item.category}</span>
                    </td>
                    <td>{formatCurrency(item.amount)}</td>
                    <td>{item.expense_date}</td>
                    <td>{item.description || "-"}</td>
                    <td className="actions">
                      <button className="ghost" type="button" disabled={busy} onClick={() => startEdit(item)}>
                        Edit
                      </button>
                      <button className="danger" type="button" disabled={busy} onClick={() => handleDelete(item.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="analytics">
        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>By Category</h2>
              <p className="section-note">Totals update with the same filters as the table.</p>
            </div>
          </div>
          <ul className="summary-list">
            {categoryTotals.length === 0 ? (
              <li>No data yet.</li>
            ) : (
              categoryTotals.map((row) => (
                <li key={row.category}>
                  <span>{row.category}</span>
                  <strong>{formatCurrency(row.total)}</strong>
                </li>
              ))
            )}
          </ul>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>Monthly Trend</h2>
              <p className="section-note">Visual comparison of the most recent six months.</p>
            </div>
          </div>
          <ul className="summary-list bars">
            {monthlyTotals.length === 0 ? (
              <li>No data yet.</li>
            ) : (
              monthlyTotals.map((row) => {
                const width = Math.max(8, Math.round((row.total / maxMonthly) * 100));
                return (
                  <li key={row.month}>
                    <span className="month-label">{row.month}</span>
                    <div className="bar-track">
                      <div className="bar" style={{ width: `${width}%` }}></div>
                    </div>
                    <span className="bar-value">{formatCurrency(row.total)}</span>
                  </li>
                );
              })
            )}
          </ul>
        </article>
      </section>

      <p
        className={`toast ${message.error ? "error" : "ok"} ${
          toastVisible || busy ? "toast-visible" : "toast-hidden"
        }`}
        aria-live="polite"
        aria-hidden={toastVisible || busy ? "false" : "true"}
      >
        {busy ? "Working..." : message.text}
        {!message.error && !busy && toastVisible && (
          <button className="toast-close" type="button" onClick={() => setToastVisible(false)}>
            Dismiss
          </button>
        )}
      </p>
    </main>
  );
}
