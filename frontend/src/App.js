import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import axios from "axios";
import "./App.css";
import TaglineSection from "./TaglineSection";
import ImportDialog, { downloadTemplate } from "./ImportDialog";
import { readProducts } from "./csv";

const api = axios.create({
  baseURL: "http://localhost:8000",
});

// View settings (sort, search, low-stock filter and limit) are remembered in this browser
const SETTINGS_KEY = "telusko-trac.view";
const DEFAULT_VIEW = { sortField: "id", sortDirection: "asc", filter: "", lowOnly: false, lowStock: 25 };
const SORT_FIELDS = ["id", "name", "price", "quantity", "value"];

const loadView = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    return {
      sortField: SORT_FIELDS.includes(saved.sortField) ? saved.sortField : DEFAULT_VIEW.sortField,
      sortDirection: saved.sortDirection === "desc" ? "desc" : "asc",
      filter: typeof saved.filter === "string" ? saved.filter : DEFAULT_VIEW.filter,
      lowOnly: saved.lowOnly === true,
      lowStock: Number.isInteger(saved.lowStock) && saved.lowStock >= 0 ? saved.lowStock : DEFAULT_VIEW.lowStock,
    };
  } catch {
    return DEFAULT_VIEW;
  }
};
// How many products get their own segment in the value split bar
const SPLIT_SEGMENTS = 5;

const emptyForm = { id: "", name: "", description: "", price: "", quantity: "" };

const money = (n) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pct = (part, whole) => {
  const n = (part / whole) * 100;
  return n > 0 && n < 1 ? "<1%" : `${Math.round(n)}%`;
};

const sku = (id) => `#${String(id).padStart(4, "0")}`;

const errorText = (err, fallback) => {
  const detail = err.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join(", ");
  if (!err.response) return "Can't reach the server. Is the backend running on port 8000?";
  return fallback;
};

const isTyping = (el) =>
  el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

function App() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialView] = useState(loadView);
  const [filter, setFilter] = useState(initialView.filter);
  const [lowOnly, setLowOnly] = useState(initialView.lowOnly);
  const [lowStock, setLowStock] = useState(initialView.lowStock);
  const [sortField, setSortField] = useState(initialView.sortField);
  const [sortDirection, setSortDirection] = useState(initialView.sortDirection);
  const [importData, setImportData] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const searchRef = useRef(null);
  const fileRef = useRef(null);

  const viewKey = JSON.stringify({ sortField, sortDirection, filter, lowOnly, lowStock });
  const isDefaultView = viewKey === JSON.stringify(DEFAULT_VIEW);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, viewKey);
    } catch {
      // Storage blocked (private window etc.): settings just won't persist
    }
  }, [viewKey]);

  const resetView = () => {
    setSortField(DEFAULT_VIEW.sortField);
    setSortDirection(DEFAULT_VIEW.sortDirection);
    setFilter(DEFAULT_VIEW.filter);
    setLowOnly(DEFAULT_VIEW.lowOnly);
    setLowStock(DEFAULT_VIEW.lowStock);
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const existing = new Set(products.map((p) => Number(p.id)));
      setImportData({ fileName: file.name, parsed: readProducts(text, existing) });
    } catch {
      setToast({ kind: "err", text: `Couldn't read ${file.name}` });
    }
  };

  // Auto-dismiss toast and row highlight
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (flashId === null) return;
    const timer = setTimeout(() => setFlashId(null), 1600);
    return () => clearTimeout(timer);
  }, [flashId]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/products");
      setProducts(res.data);
      setUpdatedAt(new Date());
    } catch (err) {
      setToast({ kind: "err", text: errorText(err, "Failed to fetch products") });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const nextId = useMemo(
    () => products.reduce((max, p) => Math.max(max, Number(p.id)), 0) + 1,
    [products]
  );

  const openNew = useCallback(() => {
    setForm({ ...emptyForm, id: String(nextId) });
    setEditId(null);
    setFormError("");
    setDrawerOpen(true);
  }, [nextId]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditId(null);
    setForm(emptyForm);
    setFormError("");
  };

  // Keyboard: Esc closes, N opens a new product, / focuses search
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (pendingDelete) setPendingDelete(null);
        else if (drawerOpen) closeDrawer();
        return;
      }
      if (importData) return;
      if (isTyping(document.activeElement) || pendingDelete || drawerOpen) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        openNew();
      } else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDelete, drawerOpen, importData, openNew]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "id" || field === "name" ? "asc" : "desc");
    }
  };

  const summary = useMemo(() => {
    const units = products.reduce((sum, p) => sum + Number(p.quantity || 0), 0);
    const value = products.reduce((sum, p) => sum + Number(p.price || 0) * Number(p.quantity || 0), 0);
    const low = products.filter((p) => Number(p.quantity) <= lowStock).length;
    const maxQty = products.reduce((max, p) => Math.max(max, Number(p.quantity || 0)), 0);

    // Value split: biggest products get a segment each, the rest are grouped
    const byValue = products
      .map((p) => ({ id: p.id, name: p.name, value: Number(p.price) * Number(p.quantity) }))
      .filter((p) => p.value > 0)
      .sort((a, b) => b.value - a.value);
    const split = byValue.slice(0, SPLIT_SEGMENTS);
    const rest = byValue.slice(SPLIT_SEGMENTS).reduce((sum, p) => sum + p.value, 0);
    if (rest > 0) split.push({ id: "rest", name: `${byValue.length - SPLIT_SEGMENTS} others`, value: rest });

    return { units, value, low, maxQty, split };
  }, [products, lowStock]);

  // Derived list with filter and sorting
  const filteredProducts = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const filtered = products.filter((p) => {
      if (lowOnly && Number(p.quantity) > lowStock) return false;
      if (!q) return true;
      return (
        String(p.id).includes(q) ||
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
      );
    });

    const numeric = ["id", "price", "quantity", "value"].includes(sortField);
    const read = (p) => {
      if (sortField === "value") return Number(p.price) * Number(p.quantity);
      return numeric ? Number(p[sortField]) : String(p[sortField]).toLowerCase();
    };

    return [...filtered].sort((a, b) => {
      const aVal = read(a);
      const bVal = read(b);
      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [products, filter, lowOnly, lowStock, sortField, sortDirection]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Create or update product
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setFormError("");
    const body = {
      ...form,
      id: Number(form.id),
      name: form.name.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      quantity: Number(form.quantity),
    };
    try {
      if (editId !== null) {
        await api.put(`/products/${editId}`, body);
        setToast({ kind: "ok", text: `Saved ${body.name}` });
      } else {
        await api.post("/products", body);
        setToast({ kind: "ok", text: `Added ${body.name}` });
      }
      setFlashId(body.id);
      closeDrawer();
      fetchProducts();
    } catch (err) {
      setFormError(errorText(err, "Couldn't save the product"));
    }
    setLoading(false);
  };

  const handleEdit = (product) => {
    setForm({
      id: String(product.id),
      name: product.name,
      description: product.description,
      price: String(product.price),
      quantity: String(product.quantity),
    });
    setEditId(product.id);
    setFormError("");
    setDrawerOpen(true);
  };

  const confirmDelete = async () => {
    const product = pendingDelete;
    setPendingDelete(null);
    setLoading(true);
    try {
      await api.delete(`/products/${product.id}`);
      setToast({ kind: "ok", text: `Deleted ${product.name}` });
      if (editId === product.id) closeDrawer();
      fetchProducts();
    } catch (err) {
      setToast({ kind: "err", text: errorText(err, "Delete failed") });
    }
    setLoading(false);
  };

  const sortHeader = (field, label, className = "") => (
    <th
      className={`sortable ${className}`}
      onClick={() => handleSort(field)}
      aria-sort={sortField === field ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}
      <span className="sort-mark">
        {sortField === field ? (sortDirection === "asc" ? "↑" : "↓") : ""}
      </span>
    </th>
  );

  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const formValue = Number(form.price || 0) * Number(form.quantity || 0);

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <h1>Telusko Trac</h1>
          <span className="brand-sub">Stockroom · {today}</span>
        </div>
        <div className="top-actions">
          {updatedAt && (
            <span className="updated">
              Synced {updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button className="btn btn-dark" onClick={fetchProducts} disabled={loading}>
            {loading ? "Syncing…" : "Refresh"}
          </button>
          <button className="btn btn-dark" onClick={() => fileRef.current?.click()}>
            Import CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} hidden />
          <button className="btn btn-primary" onClick={openNew}>
            New product <kbd>N</kbd>
          </button>
        </div>
      </header>

      <main className="container">
        <section className="summary" aria-label="Inventory summary">
          <div className="figure figure-main">
            <span className="figure-label">Stock value</span>
            <span className="figure-value">
              <span className="currency">$</span>
              {money(summary.value)}
            </span>
          </div>
          <div className="figure">
            <span className="figure-label">Products</span>
            <span className="figure-value">{products.length}</span>
          </div>
          <div className="figure">
            <span className="figure-label">Units</span>
            <span className="figure-value">{summary.units.toLocaleString("en-US")}</span>
          </div>
          <div className={`figure figure-low ${summary.low ? "has-low" : ""} ${lowOnly ? "is-active" : ""}`}>
            <label className="figure-label low-limit">
              Low stock ≤
              <input
                type="number"
                min="0"
                step="1"
                value={lowStock}
                onChange={(e) => setLowStock(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                aria-label="Low stock limit"
              />
            </label>
            <span className="figure-value">{summary.low}</span>
            <button className="figure-hint" onClick={() => setLowOnly(!lowOnly)}>
              {lowOnly ? "Clear filter" : "Show these"}
            </button>
          </div>
        </section>

        {summary.split.length > 0 && (
          <section className="split" aria-label="Where the stock value sits">
            <div className="split-bar">
              {summary.split.map((s, i) => (
                <span
                  key={s.id}
                  className={`seg seg-${s.id === "rest" ? "rest" : i + 1}`}
                  style={{ flexGrow: s.value }}
                  title={`${s.name}: $${money(s.value)}`}
                />
              ))}
            </div>
            <ul className="split-legend">
              {summary.split.map((s, i) => (
                <li key={s.id}>
                  <span className={`swatch seg-${s.id === "rest" ? "rest" : i + 1}`} />
                  {s.name}
                  <span className="pct">{pct(s.value, summary.value)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="sheet">
          <div className="toolbar">
            <h2>
              Products
              {filteredProducts.length !== products.length && (
                <span className="count"> {filteredProducts.length} of {products.length}</span>
              )}
            </h2>
            {!isDefaultView && (
              <button
                className="link reset-view"
                onClick={resetView}
                title="Clear search, filter and sort, and set the low-stock limit back to 25"
              >
                Reset view
              </button>
            )}
            {lowOnly && (
              <button className="chip" onClick={() => setLowOnly(false)}>
                Low stock only <span aria-hidden="true">×</span>
              </button>
            )}
            <div className="search">
              <input
                ref={searchRef}
                type="search"
                placeholder="Search products"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="Search by id, name or description"
              />
              <kbd>/</kbd>
            </div>
          </div>

          <div className="table-wrap">
            <table className="product-table">
              <thead>
                <tr>
                  {sortHeader("id", "SKU", "col-id")}
                  {sortHeader("name", "Product")}
                  {sortHeader("price", "Price", "num")}
                  {sortHeader("quantity", "In stock", "col-stock")}
                  {sortHeader("value", "Value", "num")}
                  <th className="col-actions"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p) => {
                  const qty = Number(p.quantity);
                  const low = qty <= lowStock;
                  const fill = summary.maxQty ? Math.max(2, (qty / summary.maxQty) * 100) : 0;
                  const rowClass = [
                    editId === p.id && drawerOpen ? "is-editing" : "",
                    flashId === p.id ? "is-flash" : "",
                  ].join(" ");
                  return (
                    <tr key={p.id} className={rowClass}>
                      <td><span className="label">{sku(p.id)}</span></td>
                      <td className="product-cell">
                        <span className="name">{p.name}</span>
                        <span className="desc" title={p.description}>{p.description}</span>
                      </td>
                      <td className="num">{money(p.price)}</td>
                      <td className="col-stock">
                        <div className={`stock ${low ? "is-low" : ""}`}>
                          <span className="stock-num">{qty}</span>
                          <span className="meter" aria-hidden="true">
                            <span style={{ width: `${fill}%` }} />
                          </span>
                          {low && <span className="low-tag">Low</span>}
                        </div>
                      </td>
                      <td className="num value-cell">{money(Number(p.price) * qty)}</td>
                      <td>
                        <div className="row-actions">
                          <button className="link" onClick={() => handleEdit(p)}>Edit</button>
                          <button className="link link-danger" onClick={() => setPendingDelete(p)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty">
                      {loading && products.length === 0 ? (
                        "Loading…"
                      ) : products.length === 0 ? (
                        <>
                          The shelves are empty.{" "}
                          <button className="link" onClick={openNew}>Add the first product</button> or{" "}
                          <button className="link" onClick={() => fileRef.current?.click()}>import a CSV</button>{" "}
                          (<button className="link" onClick={downloadTemplate}>template</button>)
                        </>
                      ) : (
                        "Nothing matches the current filter."
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <TaglineSection />

      {drawerOpen && (
        <div className="overlay overlay-drawer" onMouseDown={closeDrawer}>
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="drawer-head">
              <div>
                <span className="eyebrow">{editId !== null ? "Edit" : "New product"}</span>
                <h2 id="drawer-title">{editId !== null ? form.name || sku(editId) : "Add to stock"}</h2>
              </div>
              <button className="icon-btn" onClick={closeDrawer} aria-label="Close">×</button>
            </div>

            <form onSubmit={handleSubmit} className="product-form">
              <label className="field">
                <span>SKU / ID</span>
                <input
                  type="number"
                  name="id"
                  value={form.id}
                  onChange={handleChange}
                  required
                  min="1"
                  step="1"
                  disabled={editId !== null}
                />
                {editId === null && <small>Next free ID is filled in. You can change it.</small>}
              </label>
              <label className="field">
                <span>Name</span>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  autoFocus
                  autoComplete="off"
                />
              </label>
              <label className="field">
                <span>Description</span>
                <input
                  type="text"
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  required
                  autoComplete="off"
                />
              </label>
              <div className="field-row">
                <label className="field">
                  <span>Price ($)</span>
                  <input
                    type="number"
                    name="price"
                    value={form.price}
                    onChange={handleChange}
                    required
                    min="0"
                    step="0.01"
                  />
                </label>
                <label className="field">
                  <span>Quantity</span>
                  <input
                    type="number"
                    name="quantity"
                    value={form.quantity}
                    onChange={handleChange}
                    required
                    min="0"
                    step="1"
                  />
                </label>
              </div>

              <div className="form-total">
                <span>Stock value</span>
                <strong>${money(formValue)}</strong>
              </div>

              {formError && <div className="notice notice-err" role="alert">{formError}</div>}

              <div className="form-actions">
                <button className="btn btn-ghost" type="button" onClick={closeDrawer}>
                  Cancel
                </button>
                <button className="btn btn-primary" type="submit" disabled={loading}>
                  {editId !== null ? "Save changes" : "Add product"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}

      {pendingDelete && (
        <div className="overlay overlay-center" onMouseDown={() => setPendingDelete(null)}>
          <div
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="del-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="label">{sku(pendingDelete.id)}</span>
            <h3 id="del-title">Delete {pendingDelete.name}?</h3>
            <p>
              {pendingDelete.quantity} units worth ${money(pendingDelete.price * pendingDelete.quantity)} will be
              removed from the list. This can't be undone.
            </p>
            <div className="dialog-actions">
              <button className="btn btn-ghost" onClick={() => setPendingDelete(null)} autoFocus>
                Keep it
              </button>
              <button className="btn btn-danger" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {importData && (
        <ImportDialog
          api={api}
          fileName={importData.fileName}
          parsed={importData.parsed}
          describeError={errorText}
          onClose={(changed) => {
            setImportData(null);
            if (changed) fetchProducts();
          }}
        />
      )}

      {toast && (
        <div className={`toast toast-${toast.kind}`} role={toast.kind === "err" ? "alert" : "status"}>
          {toast.text}
          <button className="icon-btn" onClick={() => setToast(null)} aria-label="Dismiss">×</button>
        </div>
      )}
    </div>
  );
}

export default App;
