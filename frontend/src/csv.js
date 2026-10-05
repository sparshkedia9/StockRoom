// Small CSV reader for product imports. Handles quoted fields, "" escapes,
// CRLF line endings and a UTF-8 BOM (Excel adds one).

// "id" may be present in a file but is ignored: the name decides the ID
export const COLUMNS = ["name", "description", "price", "quantity"];

export const TEMPLATE =
  "name,description,price,quantity\n" +
  'Desk lamp,"LED lamp, warm white",34.50,12\n' +
  "Notebook,A5 dotted notebook,4.99,80\n";

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

export const nameKey = (name) => String(name ?? "").trim().toLowerCase();

// Turns CSV text into rows marked "new", "exists" or "error".
// A name already in the list keeps its ID; new names get the next IDs in file order.
export function readProducts(text, existingProducts) {
  const table = parseCsv(text);
  if (table.length === 0) return { error: "The file is empty." };

  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = COLUMNS.filter((col) => !header.includes(col));
  if (missing.length) {
    return { error: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. The first row must be the header.` };
  }
  const at = Object.fromEntries(COLUMNS.map((col) => [col, header.indexOf(col)]));

  const idByName = new Map(existingProducts.map((p) => [nameKey(p.name), Number(p.id)]));
  let nextId = existingProducts.reduce((max, p) => Math.max(max, Number(p.id)), 0) + 1;

  const seen = new Set();
  const rows = table.slice(1).map((cells, i) => {
    const get = (col) => (cells[at[col]] ?? "").trim();
    const line = i + 2;
    const data = {
      id: NaN,
      name: get("name"),
      description: get("description"),
      price: toNumber(get("price")),
      quantity: toNumber(get("quantity")),
    };
    const key = nameKey(data.name);

    let error = "";
    if (!data.name) error = "Name is empty";
    else if (seen.has(key)) error = "Name appears twice in the file";
    else if (get("price") === "" || !Number.isFinite(data.price) || data.price < 0) error = "Price must be a number, 0 or more";
    else if (get("quantity") === "" || !Number.isInteger(data.quantity) || data.quantity < 0) error = "Quantity must be a whole number, 0 or more";

    if (key) seen.add(key);
    let status = "error";
    if (!error) {
      status = idByName.has(key) ? "exists" : "new";
      data.id = status === "exists" ? idByName.get(key) : nextId++;
    }
    return { line, data, status, error };
  });

  if (rows.length === 0) return { error: "The file only has a header row, no products." };
  return { rows };
}
