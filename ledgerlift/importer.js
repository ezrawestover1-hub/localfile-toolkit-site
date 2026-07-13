(() => {
  "use strict";

  const ROLE_PATTERNS = {
    date: ["date", "transactiondate", "posteddate", "valuedate", "transdate"],
    description: ["description", "details", "merchant", "payee", "narrative", "transaction"],
    memo: ["memo", "note", "notes", "comment", "comments"],
    amount: ["amount", "value", "total", "net", "transactionamount"],
    debit: ["debit", "withdrawal", "withdrawals", "charge", "charges", "payment"],
    credit: ["credit", "deposit", "deposits", "income"],
    balance: ["balance", "runningbalance", "availablebalance"],
    account: ["account", "accountname", "acct"],
    category: ["category", "class", "type"],
    reference: ["reference", "ref", "checknumber", "checkno", "check"]
  };
  const ROLE_LABELS = { date: "date", description: "description", memo: "memo", amount: "amount", debit: "debit", credit: "credit", balance: "balance", account: "account", category: "category", reference: "reference or check number" };
  const TEXT_MIMES = new Set(["", "text/csv", "text/tab-separated-values", "text/plain", "application/csv", "application/octet-stream", "application/vnd.ms-excel"]);
  const XLSX_MIMES = new Set(["", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip", "application/octet-stream"]);
  const LIMITS = { free: 10 * 1024 * 1024, standard: 50 * 1024 * 1024, plus: 100 * 1024 * 1024 };

  function error(message, code = "import_error") {
    const problem = new Error(message);
    problem.code = code;
    return problem;
  }

  function readU16(bytes, offset) { return bytes[offset] | (bytes[offset + 1] << 8); }
  function readU32(bytes, offset) { return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0; }

  function extensionFor(name) {
    const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : "";
  }

  function tierLimit(tier) { return LIMITS[tier] || LIMITS.free; }

  function validateFile(file, tier = "free") {
    if (!file || typeof file.name !== "string") throw error("Choose a file to inspect.", "missing_file");
    const extension = extensionFor(file.name);
    if (!extension) throw error("This file has no extension. Choose a CSV, TSV, or XLSX file.", "unsupported_type");
    if (!["csv", "tsv", "xlsx"].includes(extension)) throw error("This file type is not supported yet. Choose a CSV, TSV, or XLSX file.", "unsupported_type");
    if (extension === "xlsx" && tier === "free") throw error("XLSX import is available in Standard and Plus. Choose a CSV or TSV file, or upgrade to import Excel workbooks.", "tier_format");
    if (!Number.isFinite(file.size) || file.size === 0) throw error("This file appears to be empty. Choose a file with transaction rows.", "empty_file");
    if (file.size > tierLimit(tier)) throw error(`This file is larger than the ${Math.round(tierLimit(tier) / 1024 / 1024)} MB limit for this workspace. Choose a smaller file.`, "file_too_large");
    const mime = String(file.type || "").toLowerCase();
    if (extension === "xlsx" && !XLSX_MIMES.has(mime)) throw error("The file extension does not match the file contents. Choose an XLSX workbook.", "mime_mismatch");
    if (extension !== "xlsx" && !TEXT_MIMES.has(mime)) throw error("The file extension does not match the file contents. Choose a text-based CSV or TSV file.", "mime_mismatch");
    return { extension, mime, limit: tierLimit(tier), tier };
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(error("LedgerLift could not read this file. Check that it is not locked or password-protected, then try again.", "read_error"));
      reader.readAsArrayBuffer(file);
    });
  }

  function decodeText(buffer) {
    try { return new TextDecoder("utf-8", { fatal: false }).decode(buffer).replace(/^\uFEFF/, ""); }
    catch { throw error("LedgerLift could not read this text file. Save it as UTF-8 CSV or TSV and try again.", "decode_error"); }
  }

  function isZip(bytes) { return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04; }

  function hasBinaryContent(bytes) {
    const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
    let controls = 0;
    sample.forEach((value) => { if (value === 0 || (value < 7 && value !== 0) || (value > 14 && value < 32)) controls += 1; });
    return controls > Math.max(3, sample.length * 0.02);
  }

  function validateContent(bytes, meta) {
    if (meta.extension === "xlsx" && !isZip(bytes)) throw error("The file extension does not match the file contents. This does not look like an XLSX workbook.", "content_mismatch");
    if (meta.extension !== "xlsx" && (isZip(bytes) || hasBinaryContent(bytes))) throw error("The file extension does not match the file contents. This looks like a binary file, not CSV or TSV text.", "content_mismatch");
  }

  function parseDelimited(text, requestedDelimiter = "") {
    text = String(text).replace(/^\uFEFF/, "");
    const candidates = [",", "\t", ";"];
    const sample = text.slice(0, 16000);
    const count = (delimiter) => {
      let total = 0, quoted = false;
      for (let index = 0; index < sample.length; index += 1) {
        const char = sample[index];
        if (char === '"') { if (quoted && sample[index + 1] === '"') index += 1; else quoted = !quoted; }
        else if (!quoted && char === delimiter) total += 1;
      }
      return total;
    };
    const delimiter = requestedDelimiter || candidates.sort((a, b) => count(b) - count(a))[0];
    const rows = [];
    let row = [], field = "", quoted = false;
    const pushRow = () => { row.push(field); field = ""; if (row.length || row.some((value) => String(value).trim())) rows.push(row); row = []; };
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index], next = text[index + 1];
      if (char === '"') {
        if (quoted && next === '"') { field += '"'; index += 1; }
        else quoted = !quoted;
      } else if (!quoted && char === delimiter) row.push(field), field = "";
      else if (!quoted && (char === "\n" || char === "\r")) {
        if (char === "\r" && next === "\n") index += 1;
        pushRow();
      } else field += char;
    }
    if (field || row.length) pushRow();
    if (quoted) throw error("LedgerLift could not read this text file because a quoted value never closed. Check the file and try again.", "malformed_text");
    return { matrix: rows, delimiter };
  }

  function normalizePath(base, target) {
    const parts = `${base.slice(0, base.lastIndexOf("/") + 1)}${target}`.split("/");
    const clean = [];
    parts.forEach((part) => { if (!part || part === ".") return; if (part === "..") clean.pop(); else clean.push(part); });
    return clean.join("/");
  }

  async function unzip(buffer) {
    const bytes = new Uint8Array(buffer);
    let end = -1;
    for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) if (readU32(bytes, index) === 0x06054b50) { end = index; break; }
    if (end < 0) throw error("LedgerLift could not read this spreadsheet. The XLSX archive is incomplete or password-protected.", "invalid_xlsx");
    const total = readU16(bytes, end + 10), centralOffset = readU32(bytes, end + 16);
    const entries = new Map();
    let offset = centralOffset;
    for (let index = 0; index < total; index += 1) {
      if (readU32(bytes, offset) !== 0x02014b50) throw error("LedgerLift could not read this spreadsheet. The workbook archive is malformed.", "invalid_xlsx");
      const flags = readU16(bytes, offset + 8), compression = readU16(bytes, offset + 10), compressedSize = readU32(bytes, offset + 20), nameLength = readU16(bytes, offset + 28), extraLength = readU16(bytes, offset + 30), commentLength = readU16(bytes, offset + 32), localOffset = readU32(bytes, offset + 42);
      const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
      if (!(flags & 1)) {
        const localNameLength = readU16(bytes, localOffset + 26), localExtraLength = readU16(bytes, localOffset + 28);
        const start = localOffset + 30 + localNameLength + localExtraLength;
        const compressed = bytes.slice(start, start + compressedSize);
        let content;
        if (compression === 0) content = compressed;
        else if (compression === 8 && typeof DecompressionStream !== "undefined") content = new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
        else throw error("LedgerLift could not read this spreadsheet because its compression method is not supported.", "invalid_xlsx");
        entries.set(name, content);
      }
      offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }

  function xmlDocument(bytes) {
    const xml = new TextDecoder().decode(bytes);
    const document = new DOMParser().parseFromString(xml, "application/xml");
    if (document.querySelector("parsererror")) throw error("LedgerLift could not read this spreadsheet because one of its worksheets is malformed.", "invalid_xlsx");
    return document;
  }

  function descendants(node, name) { return Array.from(node.getElementsByTagNameNS("*", name)); }
  function first(node, name) { return descendants(node, name)[0] || null; }
  function cellText(node) { return descendants(node, "t").map((item) => item.textContent || "").join(""); }

  function excelSerialDate(value) {
    const serial = Number(value);
    if (!Number.isFinite(serial) || serial < 1 || serial > 80000) return String(value);
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}/${date.getUTCFullYear()}`;
  }

  function readStyles(entries) {
    const styles = entries.get("xl/styles.xml");
    const formats = new Map([[14, "date"], [15, "date"], [16, "date"], [17, "date"], [18, "date"], [19, "date"], [20, "date"], [21, "date"], [22, "date"], [45, "date"], [46, "date"], [47, "date"]]);
    if (!styles) return [];
    const document = xmlDocument(styles);
    descendants(document, "numFmt").forEach((format) => { if (/[ymdhis]/i.test(format.getAttribute("formatCode") || "")) formats.set(Number(format.getAttribute("numFmtId")), "date"); });
    const xfs = first(document, "cellXfs");
    return xfs ? descendants(xfs, "xf").map((xf) => formats.get(Number(xf.getAttribute("numFmtId"))) || "") : [];
  }

  function columnIndex(reference) {
    const letters = String(reference || "").match(/[A-Z]+/i)?.[0] || "A";
    return letters.toUpperCase().split("").reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
  }

  function parseWorksheet(bytes, sharedStrings, styles) {
    const document = xmlDocument(bytes), rows = [];
    let formulaWithoutCache = 0;
    descendants(document, "row").forEach((rowNode, rowIndex) => {
      const values = [];
      descendants(rowNode, "c").forEach((cell) => {
        const index = columnIndex(cell.getAttribute("r"));
        const type = cell.getAttribute("t") || "";
        const valueNode = first(cell, "v");
        const formula = first(cell, "f");
        let value = valueNode?.textContent || "";
        if (formula && !valueNode) formulaWithoutCache += 1;
        if (type === "s") value = sharedStrings[Number(value)] || "";
        else if (type === "inlineStr") value = cellText(cell);
        else if (type === "b") value = value === "1" ? "TRUE" : "FALSE";
        else if (styles[Number(cell.getAttribute("s"))] === "date") value = excelSerialDate(value);
        values[index] = value;
      });
      rows[rowNode.getAttribute("r") ? Number(rowNode.getAttribute("r")) - 1 : rowIndex] = values;
    });
    return { matrix: rows.map((row) => row || []), formulaWithoutCache };
  }

  async function parseXlsxBuffer(buffer) {
    const entries = await unzip(buffer);
    const workbookBytes = entries.get("xl/workbook.xml");
    const relsBytes = entries.get("xl/_rels/workbook.xml.rels");
    if (!workbookBytes || !relsBytes) throw error("LedgerLift could not read this spreadsheet because it has no usable workbook structure.", "invalid_xlsx");
    const workbook = xmlDocument(workbookBytes), rels = xmlDocument(relsBytes), relationships = {};
    descendants(rels, "Relationship").forEach((relationship) => { relationships[relationship.getAttribute("Id")] = relationship.getAttribute("Target"); });
    const sharedStrings = entries.get("xl/sharedStrings.xml") ? descendants(xmlDocument(entries.get("xl/sharedStrings.xml")), "si").map(cellText) : [];
    const styles = readStyles(entries);
    const worksheets = descendants(workbook, "sheet").map((sheet) => {
      const target = relationships[sheet.getAttribute("r:id") || sheet.getAttribute("id")];
      const path = target ? normalizePath("xl/workbook.xml", target) : "";
      const parsed = path && entries.get(path) ? parseWorksheet(entries.get(path), sharedStrings, styles) : { matrix: [], formulaWithoutCache: 0 };
      return { name: sheet.getAttribute("name") || "Worksheet", matrix: parsed.matrix, formulaWithoutCache: parsed.formulaWithoutCache };
    }).filter((sheet) => sheet.matrix.some((row) => row.some((value) => String(value ?? "").trim())));
    if (!worksheets.length) throw error("No usable worksheet was found. Choose an XLSX file with transaction rows.", "no_worksheet");
    return worksheets;
  }

  function compact(value) { return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function isDate(value) { const text = String(value ?? "").trim(); return /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(text) || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(text) || /^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}$/.test(text); }
  function isNumeric(value) { return /^\(?\s*[-+]?[$£€¥]?\s*\d[\d,]*(?:\.\d+)?\s*\)?$/.test(String(value ?? "").trim()); }
  function rowHasValue(row) { return row?.some((value) => String(value ?? "").trim() !== ""); }

  function detectHeader(matrix) {
    let best = { index: 0, score: -1, labels: 0 };
    matrix.slice(0, 30).forEach((row, index) => {
      if (!rowHasValue(row)) return;
      const values = row.map((value) => compact(value)).filter(Boolean);
      const labels = values.reduce((total, value) => total + (Object.values(ROLE_PATTERNS).some((patterns) => patterns.includes(value)) ? 1 : 0), 0);
      const textCells = values.filter((value) => !/^[-+]?\d/.test(value)).length;
      const unique = new Set(values).size === values.length;
      const nextRows = matrix.slice(index + 1, index + 4).filter(rowHasValue);
      const dataSignals = nextRows.reduce((total, nextRow) => total + (nextRow.some(isDate) ? 2 : 0) + (nextRow.some(isNumeric) ? 2 : 0), 0);
      const score = labels * 5 + textCells + (unique ? 2 : 0) + Math.min(4, dataSignals);
      if (score > best.score) best = { index, score, labels };
    });
    const confidence = best.labels >= 2 || best.score >= 10 ? "high" : best.labels === 1 || best.score >= 5 ? "medium" : "low";
    return { index: best.index, confidence, score: best.score, labels: best.labels };
  }

  function makeHeaders(row, width) {
    const counts = {};
    return Array.from({ length: width }, (_, index) => {
      const base = String(row?.[index] ?? "").replace(/^\uFEFF/, "").trim() || `Column ${index + 1}`;
      counts[base] = (counts[base] || 0) + 1;
      return counts[base] > 1 ? `${base} (${counts[base]})` : base;
    });
  }

  function scoreRole(role, header, values) {
    const normalized = compact(header), patterns = ROLE_PATTERNS[role];
    let score = patterns.some((pattern) => normalized === pattern) ? 8 : patterns.some((pattern) => normalized.includes(pattern)) ? 5 : 0;
    const samples = values.filter((value) => String(value ?? "").trim()).slice(0, 30);
    if (role === "date") score += samples.length && samples.filter(isDate).length / samples.length >= 0.6 ? 5 : 0;
    if (["amount", "debit", "credit", "balance"].includes(role)) score += samples.length && samples.filter(isNumeric).length / samples.length >= 0.6 && (role === "amount" || score > 0) ? 5 : 0;
    if (["description", "memo", "account", "category", "reference"].includes(role)) score += samples.length && samples.filter((value) => !isNumeric(value) && !isDate(value)).length / samples.length >= 0.6 && (role === "description" || role === "memo" || score > 0) ? 2 : 0;
    return score;
  }

  function suggestRoles(headers, rows) {
    const columns = headers.map((header, index) => ({ header, index, values: rows.map((row) => row[header]) }));
    const roles = {};
    const candidates = {};
    Object.keys(ROLE_PATTERNS).forEach((role) => {
      candidates[role] = columns.map((column) => ({ ...column, score: scoreRole(role, column.header, column.values) })).filter((column) => column.score > 0).sort((a, b) => b.score - a.score);
      const best = candidates[role][0];
      roles[role] = best ? { column: best.header, confidence: best.score >= 10 ? "high" : best.score >= 6 ? "medium" : "low", score: best.score, label: ROLE_LABELS[role] } : null;
    });
    return { roles, candidates };
  }

  function buildPreview(base, options = {}) {
    const matrix = base.matrix || [], width = Math.max(0, ...matrix.map((row) => row.length));
    const detected = detectHeader(matrix);
    const headerRow = Number.isInteger(options.headerRow) && options.headerRow >= 0 && options.headerRow < matrix.length ? options.headerRow : detected.index;
    const headers = makeHeaders(matrix[headerRow], width);
    const rawRows = matrix.slice(headerRow + 1);
    const rows = rawRows.filter(rowHasValue).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
    const suggestions = suggestRoles(headers, rows);
    const warnings = [];
    const rowWarnings = [];
    const blankColumns = headers.filter((header, index) => !String(matrix[headerRow]?.[index] ?? "").trim()).length;
    const duplicateColumns = headers.filter((header) => / \(\d+\)$/.test(header)).length;
    const unevenRows = rawRows.filter((row) => rowHasValue(row) && row.length !== width).length;
    const blankRows = rawRows.filter((row) => !rowHasValue(row)).length + matrix.slice(0, headerRow).filter((row) => !rowHasValue(row)).length;
    const dateCandidates = suggestions.candidates.date.filter((candidate) => candidate.score >= 6);
    const amountCandidates = ["amount", "debit", "credit"].flatMap((role) => suggestions.candidates[role].filter((candidate) => candidate.score >= 6));
    if (blankColumns) warnings.push({ level: "warning", message: `${blankColumns} column name${blankColumns === 1 ? " is" : "s are"} blank. LedgerLift filled in a temporary name so you can review it.` });
    if (duplicateColumns) warnings.push({ level: "warning", message: "Some column names repeat. LedgerLift added numbered names so every column can be selected." });
    if (unevenRows) warnings.push({ level: "warning", message: `${unevenRows} row${unevenRows === 1 ? " has" : "s have"} an unexpected number of values. Missing cells were left blank.` });
    if (blankRows >= 3) warnings.push({ level: "info", message: `${blankRows} blank rows were found and will not be treated as transactions.` });
    if (dateCandidates.length > 1) warnings.push({ level: "warning", message: "Multiple columns look like dates. Confirm the date suggestion before continuing." });
    if (amountCandidates.length > 1) warnings.push({ level: "warning", message: "Multiple columns look like amounts. Confirm the amount or debit/credit suggestions before continuing." });
    if (!suggestions.roles.date) warnings.push({ level: "warning", message: "No obvious transaction date column was found. You can correct the header row or map it later." });
    if (!suggestions.roles.amount && !suggestions.roles.debit && !suggestions.roles.credit) warnings.push({ level: "warning", message: "No obvious amount, debit, or credit column was found. You can correct the header row or map it later." });
    const descriptionColumn = suggestions.roles.description?.column || suggestions.roles.memo?.column;
    let transactionIndex = 0;
    rawRows.forEach((row) => {
      if (!rowHasValue(row)) return;
      if (row.length !== width) rowWarnings.push({ rowIndex: transactionIndex, message: "This row had an unexpected number of values; missing cells were left blank." });
      if (descriptionColumn && /\b(opening|closing|statement)\s+(balance|total)\b/i.test(String(row[headers.indexOf(descriptionColumn)] || ""))) rowWarnings.push({ rowIndex: transactionIndex, message: "This row may be a statement summary rather than a transaction." });
      transactionIndex += 1;
    });
    if (descriptionColumn && rows.some((row) => /\b(opening|closing|statement)\s+(balance|total)\b/i.test(String(row[descriptionColumn] || "")))) warnings.push({ level: "warning", message: "Some statement summary rows may be mixed with the transactions. Review them before mapping." });
    if (base.formulaWithoutCache) warnings.push({ level: "warning", message: "Some formula cells had no saved display value, so LedgerLift left them blank without evaluating the formulas." });
    const blocking = [];
    if (!width || !matrix.some((row, index) => index > headerRow && rowHasValue(row))) blocking.push("No transaction rows were found. Choose a file with a header row followed by data.");
    return { ...base, matrix, headers, rows, rowWarnings, headerRow, detectedHeaderRow: detected.index, headerConfidence: detected.confidence, headerOptions: matrix.slice(0, Math.min(30, matrix.length)).map((row, index) => ({ index, label: `Row ${index + 1}`, preview: row.filter((value) => String(value ?? "").trim()).slice(0, 3).join(" · ") })), suggestions, warnings: [...(base.warnings || []), ...warnings], blocking, estimatedTransactionRows: rows.length, columns: width, blankRows, rawRows: matrix.length, formulaWithoutCache: base.formulaWithoutCache || 0 };
  }

  async function importFile(file, options = {}) {
    const meta = validateFile(file, options.tier || "free");
    const buffer = new Uint8Array(await readFile(file));
    validateContent(buffer, meta);
    const fileMeta = { name: file.name, size: file.size, type: file.type || "", extension: meta.extension, lastModified: file.lastModified || 0 };
    if (meta.extension !== "xlsx") {
      const parsed = parseDelimited(decodeText(buffer), meta.extension === "tsv" ? "\t" : "");
      const delimiterName = parsed.delimiter === "\t" ? "Tab" : parsed.delimiter === ";" ? "Semicolon" : "Comma";
      return buildPreview({ fileMeta, format: delimiterName === "Comma" ? "CSV" : delimiterName === "Tab" ? "TSV" : "Delimited text", delimiter: parsed.delimiter, worksheetName: "Text file", worksheets: [], matrix: parsed.matrix }, options);
    }
    const worksheets = await parseXlsxBuffer(buffer);
    const likely = worksheets.map((sheet, index) => ({ index, score: detectHeader(sheet.matrix).score + Math.min(sheet.matrix.length, 20) })).sort((a, b) => b.score - a.score)[0];
    const worksheetIndex = Number.isInteger(options.worksheetIndex) && worksheets[options.worksheetIndex] ? options.worksheetIndex : likely.index;
    const sheet = worksheets[worksheetIndex];
    return buildPreview({ fileMeta, format: "XLSX", delimiter: "", worksheets: worksheets.map((item) => ({ name: item.name, matrix: item.matrix, formulaWithoutCache: item.formulaWithoutCache })), worksheetIndex, worksheetName: sheet.name, matrix: sheet.matrix, formulaWithoutCache: sheet.formulaWithoutCache }, options);
  }

  window.LedgerLiftImporter = { LIMITS, validateFile, parseDelimited, detectHeader, suggestRoles, buildPreview, importFile, parseXlsxBuffer };
})();
