import React, { useEffect, useState } from "react";
import { TEMPLATE } from "./csv";

const STATUS_LABEL = { new: "New", exists: "Exists", error: "Problem" };

export const downloadTemplate = () => {
  const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "products-template.csv";
  a.click();
  URL.revokeObjectURL(url);
};

function ImportDialog({ api, fileName, parsed, describeError, onClose }) {
  const [mode, setMode] = useState("skip");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);

  const rows = parsed.rows || [];
  const counts = rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
  const queue = rows.filter((r) => r.status === "new" || (mode === "overwrite" && r.status === "exists"));
  const changed = result && result.added + result.updated > 0;

  const close = () => {
    if (!running) onClose(changed);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !running) onClose(changed);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, changed, onClose]);

  // One request per row: there's no bulk endpoint on the backend
  const runImport = async () => {
    setRunning(true);
    const summary = { added: 0, updated: 0, failed: [] };
    for (let i = 0; i < queue.length; i++) {
      const { data, status, line } = queue[i];
      setProgress(i + 1);
      try {
        if (status === "exists") {
          await api.put(`/products/${data.id}`, data);
          summary.updated++;
        } else {
          // The server assigns the ID; it matches the preview while rows go in order
          const { id, ...body } = data;
          await api.post("/products", body);
          summary.added++;
        }
      } catch (err) {
        summary.failed.push({ line, name: data.name, error: describeError(err, "Request failed") });
      }
    }
    setResult(summary);
    setRunning(false);
  };

  return (
    <div className="overlay overlay-center" onMouseDown={close}>
      <div
        className="dialog dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="dialog-head">
          <div>
            <span className="eyebrow">Import CSV</span>
            <h3 id="import-title" title={fileName}>{fileName}</h3>
          </div>
          <button className="icon-btn" onClick={close} disabled={running} aria-label="Close">×</button>
        </div>

        {parsed.error ? (
          <>
            <div className="notice notice-err">{parsed.error}</div>
            <p className="import-help">
              Expected columns: <code>name, description, price, quantity</code>. IDs are assigned by name.{" "}
              <button className="link" onClick={downloadTemplate}>Download a template</button>
            </p>
            <div className="dialog-actions">
              <button className="btn btn-ghost" onClick={close}>Close</button>
            </div>
          </>
        ) : result ? (
          <>
            <ul className="import-tally">
              <li><strong>{result.added}</strong> added</li>
              <li><strong>{result.updated}</strong> updated</li>
              <li className={result.failed.length ? "is-bad" : ""}><strong>{result.failed.length}</strong> failed</li>
            </ul>
            {result.failed.length > 0 && (
              <ul className="import-failures">
                {result.failed.map((f) => (
                  <li key={f.line}>
                    <span className="mono">Line {f.line}</span> {f.name}: {f.error}
                  </li>
                ))}
              </ul>
            )}
            <div className="dialog-actions">
              <button className="btn btn-primary" onClick={close} autoFocus>Done</button>
            </div>
          </>
        ) : (
          <>
            <ul className="import-tally">
              <li><strong>{counts.new || 0}</strong> new</li>
              <li><strong>{counts.exists || 0}</strong> already exist</li>
              <li className={counts.error ? "is-bad" : ""}><strong>{counts.error || 0}</strong> with problems</li>
            </ul>

            <div className="import-preview">
              <table>
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>ID</th>
                    <th>Name</th>
                    <th className="num">Price</th>
                    <th className="num">Qty</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line} className={`is-${r.status}`}>
                      <td className="mono muted">{r.line}</td>
                      <td className="mono">{Number.isFinite(r.data.id) ? r.data.id : "?"}</td>
                      <td className="import-name">{r.data.name || <span className="muted">(empty)</span>}</td>
                      <td className="num mono">{Number.isFinite(r.data.price) ? r.data.price.toFixed(2) : "?"}</td>
                      <td className="num mono">{Number.isFinite(r.data.quantity) ? r.data.quantity : "?"}</td>
                      <td>
                        <span className={`status status-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                        {r.error && <span className="status-note">{r.error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {counts.exists > 0 && (
              <fieldset className="import-mode" disabled={running}>
                <legend>Rows whose name already exists</legend>
                <label>
                  <input type="radio" name="mode" value="skip" checked={mode === "skip"} onChange={() => setMode("skip")} />
                  Skip them
                </label>
                <label>
                  <input type="radio" name="mode" value="overwrite" checked={mode === "overwrite"} onChange={() => setMode("overwrite")} />
                  Overwrite with the file's values
                </label>
              </fieldset>
            )}

            <div className="dialog-actions">
              {running && <span className="import-progress">Importing {progress} of {queue.length}…</span>}
              <button className="btn btn-ghost" onClick={close} disabled={running}>Cancel</button>
              <button className="btn btn-primary" onClick={runImport} disabled={running || queue.length === 0}>
                {queue.length === 0
                  ? "Nothing to import"
                  : `Import ${queue.length} product${queue.length > 1 ? "s" : ""}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ImportDialog;
