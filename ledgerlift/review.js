(() => {
  "use strict";

  const HISTORY_LIMITS = { free: 50, standard: 100, plus: 200 };

  const cloneObject = (value) => Object.fromEntries(Object.entries(value || {}).map(([key, item]) => [key, String(item ?? "")]));
  const cloneEntry = (entry) => ({ id: entry.id, original: cloneObject(entry.original), values: cloneObject(entry.values), created: Boolean(entry.created), removedBy: entry.removedBy || null, warningMessages: [...(entry.warningMessages || [])] });
  const sameObject = (left, right) => Object.keys(left).some((key) => String(left[key] ?? "") !== String(right[key] ?? "")) || Object.keys(right).some((key) => String(left[key] ?? "") !== String(right[key] ?? ""));
  const valueChanged = (entry, column) => String(entry.values[column] ?? "") !== String(entry.original[column] ?? "");
  const isBlank = (value) => String(value ?? "").trim() === "";
  const numericValue = (value) => {
    const raw = String(value ?? "").trim().replace(/[,$£€¥\s()]/g, "");
    if (!raw) return NaN;
    const number = Number(raw);
    return Number.isFinite(number) ? number : NaN;
  };
  const dateValue = (value) => {
    const raw = String(value ?? "").trim();
    const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    const common = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    const year = iso ? Number(iso[1]) : common ? Number(common[3]) < 100 ? Number(common[3]) + 2000 : Number(common[3]) : NaN;
    const month = iso ? Number(iso[2]) : common ? Number(common[1]) : NaN;
    const day = iso ? Number(iso[3]) : common ? Number(common[2]) : NaN;
    if (!year || !month || !day) return NaN;
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date.getTime() : NaN;
  };

  function createReviewModel({ headers = [], rows = [], rowWarnings = [], tier = "free", historyLimit, savedState = null } = {}) {
    const columns = headers.map((header) => String(header));
    const limit = Math.max(10, Number(historyLimit) || HISTORY_LIMITS[tier] || HISTORY_LIMITS.free);
    let nextId = 1;
    let activeOrder = [];
    let deletedOrder = [];
    let entries = new Map();
    let selectedIds = new Set();
    let deletedSelectedIds = new Set();
    let history = [];
    let future = [];
    const originalOrder = [];
    const listeners = new Set();
    const view = { query: "", filter: "all", filterColumn: "", filterValue: "", sortColumn: "", sortDirection: "", page: 1, pageSize: 25 };

    const warningMap = new Map();
    (rowWarnings || []).forEach((warning) => {
      const index = Number(warning.rowIndex);
      if (!Number.isInteger(index) || index < 0) return;
      const list = warningMap.get(index) || [];
      if (warning.message) list.push(String(warning.message));
      warningMap.set(index, list);
    });

    rows.forEach((row, index) => {
      const id = `row-${nextId++}`;
      const values = cloneObject(row);
      const entry = { id, original: cloneObject(values), values, created: false, removedBy: null, warningMessages: warningMap.get(index) || [] };
      entries.set(id, entry);
      activeOrder.push(id);
      originalOrder.push(id);
    });

    function hydrate(snapshot) {
      if (!snapshot?.activeEntries?.length && !snapshot?.deletedEntries?.length) return;
      entries.clear(); activeOrder = []; deletedOrder = []; originalOrder.length = 0; selectedIds.clear(); deletedSelectedIds.clear();
      const all = [...(snapshot.activeEntries || []), ...(snapshot.deletedEntries || [])];
      const seen = new Set();
      all.forEach((entry) => { if (!entry?.id || seen.has(entry.id)) return; seen.add(entry.id); entries.set(entry.id, cloneEntry(entry)); });
      const activeIds = new Set((snapshot.activeEntries || []).map((entry) => entry.id));
      const deletedIds = new Set((snapshot.deletedEntries || []).map((entry) => entry.id));
      activeOrder = (snapshot.currentOrder || [...activeIds]).filter((id) => activeIds.has(id) && entries.has(id));
      deletedOrder = (snapshot.deletedOrder || [...deletedIds]).filter((id) => deletedIds.has(id) && entries.has(id));
      originalOrder.push(...(snapshot.originalOrder || [...entries.keys()]).filter((id) => entries.has(id)));
      nextId = Math.max(0, ...[...entries.keys()].map((id) => Number(String(id).replace(/^row-/, "")) || 0)) + 1;
    }
    hydrate(savedState);

    function capture() {
      return {
        entries: [...entries.values()].map(cloneEntry),
        activeOrder: [...activeOrder],
        deletedOrder: [...deletedOrder],
        selectedIds: [...selectedIds],
        deletedSelectedIds: [...deletedSelectedIds],
        nextId
      };
    }

    function restore(snapshot) {
      entries = new Map(snapshot.entries.map((entry) => [entry.id, cloneEntry(entry)]));
      activeOrder = [...snapshot.activeOrder];
      deletedOrder = [...snapshot.deletedOrder];
      selectedIds = new Set(snapshot.selectedIds);
      deletedSelectedIds = new Set(snapshot.deletedSelectedIds);
      nextId = snapshot.nextId;
      view.page = Math.min(view.page, pageCount());
    }

    function notify(type, label) {
      const detail = { type, label, historyLimit: limit, canUndo: history.length > 0, canRedo: future.length > 0 };
      listeners.forEach((listener) => listener(detail));
      if (typeof window !== "undefined" && window.dispatchEvent && typeof CustomEvent === "function") window.dispatchEvent(new CustomEvent("ledgerlift:review-changed", { detail }));
    }

    function transaction(label, type, action) {
      const before = capture();
      const changed = action();
      if (!changed) return false;
      const after = capture();
      history.push({ label, before, after });
      if (history.length > limit) history.shift();
      future = [];
      view.page = Math.min(view.page, pageCount());
      notify(type, label);
      return true;
    }

    function activeEntries() { return activeOrder.map((id) => entries.get(id)).filter(Boolean); }
    function deletedEntries() { return deletedOrder.map((id) => entries.get(id)).filter(Boolean); }
    function changedCellCount(entry) { return columns.filter((column) => valueChanged(entry, column)).length; }
    function changedRow(entry) { return entry.created || changedCellCount(entry) > 0; }
    function matchingFilter(entry) {
      if (view.filter === "changed") return changedRow(entry);
      if (view.filter === "new") return entry.created;
      if (view.filter === "warnings") return entry.warningMessages.length > 0;
      if (view.filter === "blank") return columns.some((column) => isBlank(entry.values[column]));
      return true;
    }
    function matchingQuery(entry) {
      const query = view.query.trim().toLocaleLowerCase();
      if (!query) return true;
      return columns.some((column) => String(entry.values[column] ?? "").toLocaleLowerCase().includes(query));
    }
    function matchingColumnFilter(entry) {
      if (!view.filterColumn || !view.filterValue) return true;
      return String(entry.values[view.filterColumn] ?? "").toLocaleLowerCase().includes(view.filterValue.toLocaleLowerCase());
    }
    function compareEntries(left, right) {
      const column = view.sortColumn;
      if (!column) return 0;
      const leftValue = String(left.values[column] ?? "");
      const rightValue = String(right.values[column] ?? "");
      const leftNumber = numericValue(leftValue), rightNumber = numericValue(rightValue);
      let comparison;
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) comparison = leftNumber - rightNumber;
      else {
        const leftDate = dateValue(leftValue), rightDate = dateValue(rightValue);
        comparison = Number.isFinite(leftDate) && Number.isFinite(rightDate) ? leftDate - rightDate : leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });
      }
      if (!leftValue && rightValue) comparison = 1;
      if (leftValue && !rightValue) comparison = -1;
      return view.sortDirection === "desc" ? -comparison : comparison;
    }
    function filteredEntries() {
      const result = activeEntries().filter((entry) => matchingFilter(entry) && matchingQuery(entry) && matchingColumnFilter(entry));
      if (view.sortColumn) return result.map((entry, index) => ({ entry, index })).sort((left, right) => compareEntries(left.entry, right.entry) || left.index - right.index).map(({ entry }) => entry);
      return result;
    }
    function pageCount() { return Math.max(1, Math.ceil(filteredEntries().length / view.pageSize)); }

    function setView(change) {
      Object.assign(view, change);
      if (change.query !== undefined || change.filter !== undefined || change.filterColumn !== undefined || change.filterValue !== undefined || change.sortColumn !== undefined || change.sortDirection !== undefined || change.pageSize !== undefined) view.page = 1;
      view.page = Math.min(view.page, pageCount());
      notify("view", "Review view changed");
    }

    function select(id, selected = true) {
      if (!entries.has(id) || !activeOrder.includes(id)) return;
      if (selected) selectedIds.add(id); else selectedIds.delete(id);
      notify("selection", "Selection changed");
    }

    function selectAllVisible(selected = true) {
      const ids = visibleEntries().map((entry) => entry.id);
      ids.forEach((id) => selected ? selectedIds.add(id) : selectedIds.delete(id));
      notify("selection", selected ? "Visible rows selected" : "Visible rows cleared");
    }

    function clearSelection() {
      if (!selectedIds.size) return;
      selectedIds.clear();
      notify("selection", "Selection cleared");
    }

    function selectDeleted(id, selected = true) {
      if (!entries.has(id) || !deletedOrder.includes(id)) return;
      if (selected) deletedSelectedIds.add(id); else deletedSelectedIds.delete(id);
      notify("selection", "Deleted-row selection changed");
    }

    function editCell(id, column, value) {
      if (!entries.has(id) || !columns.includes(column)) return false;
      const next = String(value ?? "");
      return transaction("Edit cell", "edit", () => {
        const entry = entries.get(id);
        if (String(entry.values[column] ?? "") === next) return false;
        entry.values[column] = next;
        return true;
      });
    }

    function restoreCell(id, column) {
      if (!entries.has(id) || !columns.includes(column)) return false;
      return transaction("Restore cell", "restore", () => {
        const entry = entries.get(id);
        const original = String(entry.original[column] ?? "");
        if (String(entry.values[column] ?? "") === original) return false;
        entry.values[column] = original;
        return true;
      });
    }

    function restoreRows(ids) {
      const list = [...new Set(ids)].filter((id) => entries.has(id) && activeOrder.includes(id));
      return transaction("Restore selected rows", "restore", () => {
        let changed = false;
        list.forEach((id) => {
          const entry = entries.get(id);
          columns.forEach((column) => {
            const original = String(entry.original[column] ?? "");
            if (String(entry.values[column] ?? "") !== original) { entry.values[column] = original; changed = true; }
          });
        });
        return changed;
      });
    }

    function restoreAllEdits() {
      return transaction("Restore all review edits", "restore", () => {
        let changed = false;
        entries.forEach((entry) => {
          if (entry.created) return;
          columns.forEach((column) => {
            const original = String(entry.original[column] ?? "");
            if (String(entry.values[column] ?? "") !== original) { entry.values[column] = original; changed = true; }
          });
        });
        return changed;
      });
    }

    function addRow() {
      return transaction("Add row", "add", () => {
        const id = `row-${nextId++}`;
        const values = Object.fromEntries(columns.map((column) => [column, ""]));
        entries.set(id, { id, original: cloneObject(values), values, created: true, removedBy: null, warningMessages: [] });
        activeOrder.push(id);
        selectedIds.clear();
        selectedIds.add(id);
        view.sortColumn = "";
        view.sortDirection = "";
        view.page = pageCount();
        return true;
      });
    }

    function deleteRows(ids) {
      const list = [...new Set(ids)].filter((id) => entries.has(id) && activeOrder.includes(id));
      return transaction(list.length > 1 ? "Delete selected rows" : "Delete row", "delete", () => {
        if (!list.length) return false;
        activeOrder = activeOrder.filter((id) => !list.includes(id));
        deletedOrder.push(...list);
        list.forEach((id) => { selectedIds.delete(id); entries.get(id).removedBy = "review"; });
        return true;
      });
    }

    function restoreDeletedRows(ids) {
      const list = [...new Set(ids)].filter((id) => entries.has(id) && deletedOrder.includes(id));
      return transaction(list.length > 1 ? "Restore deleted rows" : "Restore deleted row", "restore-deleted", () => {
        if (!list.length) return false;
        deletedOrder = deletedOrder.filter((id) => !list.includes(id));
        activeOrder.push(...list);
        list.forEach((id) => { deletedSelectedIds.delete(id); entries.get(id).removedBy = null; });
        return true;
      });
    }

    function setExternalCell(id, column, value) {
      const entry = entries.get(id);
      if (!entry || !columns.includes(column)) return false;
      const next = String(value ?? "");
      if (String(entry.values[column] ?? "") === next) return false;
      entry.values[column] = next;
      return true;
    }

    function removeExternalRows(ids) {
      const list = [...new Set(ids)].filter((id) => entries.has(id) && activeOrder.includes(id));
      if (!list.length) return [];
      activeOrder = activeOrder.filter((id) => !list.includes(id));
      deletedOrder.push(...list);
      list.forEach((id) => { selectedIds.delete(id); entries.get(id).removedBy = "clean"; });
      return list;
    }

    function restoreExternalRows(ids) {
      const list = [...new Set(ids)].filter((id) => entries.has(id) && deletedOrder.includes(id) && entries.get(id).removedBy === "clean");
      if (!list.length) return [];
      deletedOrder = deletedOrder.filter((id) => !list.includes(id));
      activeOrder.push(...list);
      list.forEach((id) => { deletedSelectedIds.delete(id); entries.get(id).removedBy = null; });
      return list;
    }

    function undo() {
      const action = history.pop();
      if (!action) return false;
      const current = capture();
      restore(action.before);
      future.push({ label: action.label, before: action.before, after: current });
      notify("undo", `Undid ${action.label.toLocaleLowerCase()}`);
      return true;
    }

    function redo() {
      const action = future.pop();
      if (!action) return false;
      const current = capture();
      restore(action.after);
      history.push({ label: action.label, before: current, after: action.after });
      if (history.length > limit) history.shift();
      notify("redo", `Redid ${action.label.toLocaleLowerCase()}`);
      return true;
    }

    function visibleEntries() {
      const all = filteredEntries();
      const start = (view.page - 1) * view.pageSize;
      return all.slice(start, start + view.pageSize);
    }

    function getState() {
      const visible = filteredEntries();
      const active = activeEntries();
      const editedCells = active.reduce((total, entry) => total + changedCellCount(entry), 0);
      return {
        headers: [...columns],
        activeEntries: active,
        deletedEntries: deletedEntries(),
        visibleEntries: visibleEntries(),
        visibleCount: visible.length,
        totalRows: active.length,
        selectedIds: [...selectedIds].filter((id) => activeOrder.includes(id)),
        deletedSelectedIds: [...deletedSelectedIds].filter((id) => deletedOrder.includes(id)),
        selectedCount: [...selectedIds].filter((id) => activeOrder.includes(id)).length,
        editedCells,
        changedRows: active.filter(changedRow).length,
        addedRows: active.filter((entry) => entry.created).length,
        deletedRows: deletedOrder.length,
        warningRows: active.filter((entry) => entry.warningMessages.length > 0).length,
        remainingWarnings: active.reduce((total, entry) => total + entry.warningMessages.length, 0),
        originalOrder: [...originalOrder],
        currentOrder: [...activeOrder],
        view: { ...view, pageCount: pageCount(), visibleStart: visible.length ? (view.page - 1) * view.pageSize + 1 : 0, visibleEnd: Math.min(view.page * view.pageSize, visible.length + (view.page - 1) * view.pageSize) },
        canUndo: history.length > 0,
        canRedo: future.length > 0,
        historyLimit: limit
      };
    }

    function getWorkingRows() { return activeOrder.map((id) => entries.get(id)?.values).filter(Boolean); }
    function getOriginalRows() { return originalOrder.map((id) => entries.get(id)?.original).filter(Boolean); }
    function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }

    return {
      headers: [...columns],
      getState,
      getWorkingRows,
      getOriginalRows,
      getEntry: (id) => entries.get(id),
      visibleEntries,
      activeEntries,
      deletedEntries,
      subscribe,
      setView,
      select,
      selectAllVisible,
      clearSelection,
      selectDeleted,
      editCell,
      restoreCell,
      restoreRows,
      restoreAllEdits,
      addRow,
      deleteRows,
      restoreDeletedRows,
      setExternalCell,
      removeExternalRows,
      restoreExternalRows,
      undo,
      redo,
      resetView: () => setView({ query: "", filter: "all", filterColumn: "", filterValue: "", sortColumn: "", sortDirection: "", page: 1 }),
      resetHistory: () => { history = []; future = []; notify("history", "Review history reset"); }
    };
  }

  window.LedgerLiftReviewModel = { HISTORY_LIMITS, create: createReviewModel };
})();
