(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const state = { events: [], source: false, name: "calendar" };
  const input = $("fileInput");
  const drop = $("dropZone");
  const status = $("fileStatus");
  const work = $("work");

  function unescapeI(value) { return String(value || "").replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\"); }
  function unfold(value) { return value.replace(/\r?\n[ \t]/g, ""); }
  function parseIcs(text) {
    return unfold(text).split(/BEGIN:VEVENT/i).slice(1).map((block) => {
      const value = (key) => { const match = block.match(new RegExp("(?:^|\\n)" + key + "(?:;[^:]*)?:([^\\r\\n]*)", "i")); return match ? unescapeI(match[1].trim()) : ""; };
      return { title: value("SUMMARY"), start: value("DTSTART"), end: value("DTEND"), location: value("LOCATION"), description: value("DESCRIPTION"), categories: value("CATEGORIES"), rrule: value("RRULE"), uid: value("UID") };
    });
  }
  function parseLine(line) {
    const fields = []; let field = ""; let quoted = false;
    for (let index = 0; index < line.length; index += 1) { const char = line[index]; if (char === '"') { if (quoted && line[index + 1] === '"') { field += '"'; index += 1; } else quoted = !quoted; } else if (char === "," && !quoted) { fields.push(field); field = ""; } else field += char; }
    fields.push(field); return fields;
  }
  function parseCsv(text) {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean); const headers = parseLine(lines.shift()).map((value) => value.trim().toLowerCase());
    return lines.map((line) => { const fields = parseLine(line); const get = (...names) => { for (const name of names) { const index = headers.indexOf(name); if (index >= 0) return (fields[index] || "").trim(); } return ""; }; return { title: get("title", "summary", "event"), start: get("start", "start date", "dtstart"), end: get("end", "end date", "dtend"), location: get("location"), description: get("description", "notes"), categories: get("categories", "category"), rrule: get("rrule", "recurrence"), uid: get("uid") }; });
  }
  function parseText(text, name = "calendar.ics") { return /\.ics$|\.ical$/i.test(name) || /BEGIN:VCALENDAR/i.test(text) ? parseIcs(text) : parseCsv(text); }
  function csvEscape(value) { const text = String(value || ""); return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text; }
  function toCsv(events = state.events) { return ["Title,Start,End,Location,Description,Categories,Recurrence,UID", ...events.map((event) => [event.title, event.start, event.end, event.location, event.description, event.categories, event.rrule, event.uid].map(csvEscape).join(","))].join("\r\n"); }
  function escapeIcs(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
  function normalizeDate(value) { const raw = String(value || "").trim(); if (/^\d{8}(T\d{6}Z?)?$/.test(raw)) return raw; const date = new Date(raw); return Number.isNaN(date.valueOf()) ? raw : date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
  function toIcs(events = state.events) { const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CalendarFlow//EN", ...events.flatMap((event, index) => ["BEGIN:VEVENT", `UID:${escapeIcs(event.uid || crypto.randomUUID?.() || `event-${index}@calendarflow`)}`, `DTSTAMP:${now}`, `DTSTART:${normalizeDate(event.start)}`, ...(event.end ? [`DTEND:${normalizeDate(event.end)}`] : []), `SUMMARY:${escapeIcs(event.title || "Untitled event")}`, ...(event.location ? [`LOCATION:${escapeIcs(event.location)}`] : []), ...(event.description ? [`DESCRIPTION:${escapeIcs(event.description)}`] : []), ...(event.categories ? [`CATEGORIES:${escapeIcs(event.categories)}`] : []), ...(event.rrule ? [`RRULE:${event.rrule}`] : []), "END:VEVENT"]), "END:VCALENDAR", ""].join("\r\n"); }
  function render() { const rows = $("rows"); rows.replaceChildren(...state.events.slice(0, 200).map((event) => { const row = document.createElement("tr"); [event.title, event.start, event.end, event.location].forEach((value) => { const cell = document.createElement("td"); cell.textContent = value || "—"; row.append(cell); }); return row; })); const recurring = state.events.filter((event) => event.rrule).length; $("validation").textContent = `${state.events.length} events found${recurring ? ` · ${recurring} recurring event rules require review` : ""}.`; work.classList.remove("hidden"); window.dispatchEvent(new CustomEvent("calendarflow:data-loaded")); }
  function load(file, sample = false) { if (!sample && !SuiteGate.mayOpenRealDocument()) { SuiteGate.showUpgrade(); return; } if (!file || file.size > 10 * 1024 * 1024) { SuiteGate.message("Choose an ICS or CSV file smaller than 10 MB."); return; } const reader = new FileReader(); reader.onload = () => { try { state.events = parseText(String(reader.result), file.name); if (!state.events.length) throw Error("No events were found."); state.source = sample; state.name = file.name.replace(/\.[^.]+$/, ""); $("format").value = /\.ics$|\.ical$/i.test(file.name) ? "csv" : "ics"; status.textContent = `${file.name} · ${state.events.length} events`; render(); SuiteGate.update(sample); } catch (error) { SuiteGate.message(error.message); } }; reader.readAsText(file); }
  input.addEventListener("change", (event) => load(event.target.files[0]));
  drop.addEventListener("dragover", (event) => event.preventDefault());
  drop.addEventListener("drop", (event) => { event.preventDefault(); load(event.dataTransfer.files[0]); });
  $("sampleBtn").addEventListener("click", () => load(new File(["BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:sample-1\nDTSTART:20260715T160000Z\nDTEND:20260715T170000Z\nSUMMARY:Project review\nLOCATION:Conference room\nDESCRIPTION:Review launch checklist\nEND:VEVENT\nEND:VCALENDAR"], "sample.ics", { type: "text/calendar" }), true));
  $("clearBtn").addEventListener("click", () => { state.events = []; input.value = ""; status.textContent = "No file selected"; work.classList.add("hidden"); SuiteGate.setActive(false); });
  $("download").addEventListener("click", () => { const format = $("format").value; const content = format === "csv" ? toCsv() : toIcs(); const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(new Blob([content], { type: format === "csv" ? "text/csv" : "text/calendar" })); anchor.download = `${state.name}.${format}`; anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 1000); if (!state.source) SuiteGate.markUsed(); });
  window.CalendarFlowCore = { state, parseText, render, toCsv, toIcs };
  window.dispatchEvent(new Event("calendarflow:ready"));
})();
