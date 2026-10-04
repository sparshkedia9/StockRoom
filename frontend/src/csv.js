// Small CSV reader for product imports. Handles quoted fields, "" escapes,
// CRLF line endings and a UTF-8 BOM (Excel adds one).

export const COLUMNS = ["id", "name", "description", "price", "quantity"];

export const TEMPLATE =
  "id,name,description,price,quantity\n" +
  '101,Desk lamp,"LED lamp, warm white",34.50,12\n' +
  "102,Notebook,A5 dotted notebook,4.99,80\n";

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Drop blank lines
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const toNumber = (raw) => Number(String(raw).replace(/[$,\s]/g, ""));

// Turns CSV text into rows marked "new", "exists" or "error"
export function readProducts(text, existingIds) {
  const table = parseCsv(text);
  if (table.length === 0) return { error: "The file is empty." };

  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = COLUMNS.filter((col) => !header.includes(col));
  if (missing.length) {
    return { error: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. The first row must be the header.` };
  }
  const at = Object.fromEntries(COLUMNS.map((col) => [col, header.indexOf(col)]));

  const seen = new Set();
  const rows = table.slice(1).map((cells, i) => {
    const get = (col) => (cells[at[col]] ?? "").trim();
    const line = i + 2;
    const data = {
      id: toNumber(get("id")),
      name: get("name"),
      description: get("description"),
      price: toNumber(get("price")),
      quantity: toNumber(get("quantity")),
    };

    let error = "";
    if (!Number.isInteger(data.id) || data.id < 1) error = "ID must be a whole number above 0";
    else if (seen.has(data.id)) error = "ID appears twice in the file";
    else if (!data.name) error = "Name is empty";
    else if (get("price") === "" || !Number.isFinite(data.price) || data.price < 0) error = "Price must be a number, 0 or more";
    else if (get("quantity") === "" || !Number.isInteger(data.quantity) || data.quantity < 0) error = "Quantity must be a whole number, 0 or more";

    if (Number.isInteger(data.id)) seen.add(data.id);
    const status = error ? "error" : existingIds.has(data.id) ? "exists" : "new";
    return { line, data, status, error };
  });

  if (rows.length === 0) return { error: "The file only has a header row, no products." };
  return { rows };
}
