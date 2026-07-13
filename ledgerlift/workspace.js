(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const steps = [
    { id: 1, label: "Import", description: "Upload a CSV, TSV, or supported XLSX file." },
    { id: 2, label: "Review", description: "Confirm the file loaded correctly." },
    { id: 3, label: "Clean", description: "Normalize the fields you will map." },
    { id: 4, label: "Map Columns", description: "Choose the date, description, and amount fields." },
    { id: 5, label: "Map Accounts", description: "Choose the accounts for exported transactions." },
    { id: 6, label: "Validate", description: "Check dates, amounts, and rows before export." },
    { id: 7, label: "Preview", description: "Review the normalized transaction rows." },
    { id: 8, label: "Export", description: "Download the IIF after validation." }
  ];
  const mode = new URLSearchParams(location.search).get("mode");
  const tier = mode === "plus" ? "plus" : mode === "standard" ? "standard" : "free";
  const converter = $("converter");
  if (!converter || $("ledgerliftWorkspace")) return;

  const state = { current: 1, imported: false, cleaned: false, cleanVisited: false, mapColumnsVisited: false, mapAccountsVisited: false, analyzed: false, previewed: false, exported: false, cleanSummary: null };
  const accountView = { query: "", filter: "all", sort: "frequency", templatePreview: null };
  const accountSelected = new Set();
  const ACCOUNT_ROLE_LABELS = { account: "Account", category: "Category", name: "Name", vendor: "Vendor", customer: "Customer", employee: "Employee", class: "Class", customerJob: "Customer / job", transactionType: "Transaction type", clearedStatus: "Cleared status", taxCode: "Tax code" };
  const destinationTypeLabel = (type) => window.LedgerLiftAccountMapper?.DESTINATION_TYPES?.find((item) => item.id === type)?.label || type;

  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  function tierCopy() {
    if (tier === "plus") return { label: "Plus workspace", description: "Import larger files locally and keep room for future batch workflows.", note: "Supported here: CSV, TSV, and XLSX. OFX, QFX, QBO, IIF, and batch importing are planned for later phases." };
    if (tier === "standard") return { label: "Standard workspace", description: "Import CSV, TSV, and XLSX files into a focused local workspace.", note: "Supported here: CSV, TSV, and XLSX. Your source file is still processed locally." };
    return { label: "Free workspace", description: "Import a CSV or TSV, review the detected structure, and continue into the conversion workflow.", note: "Supported here: CSV and TSV. XLSX, OFX, QFX, QBO, IIF, and saved projects require later phases or a paid workspace." };
  }

  function injectStyles() {
    if (document.querySelector("link[data-ledgerlift-workspace-styles]")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "workspace.css?v=8f5e2b1";
    link.dataset.ledgerliftWorkspaceStyles = "true";
    document.head.append(link);
  }

  function createStepButton(step) {
    const item = make("li", "workflow-step");
    item.dataset.step = String(step.id);
    if (step.unavailable) {
      const unavailable = make("span", "workflow-step-control");
      unavailable.setAttribute("aria-label", `${step.label}: coming later`);
      unavailable.append(make("span", "workflow-step-number", String(step.id)), make("span", "workflow-step-copy", step.label), make("span", "workflow-step-status", "Coming later"));
      item.append(unavailable);
      return item;
    }
    const button = make("button", "workflow-step-control");
    button.type = "button";
    button.dataset.stepButton = String(step.id);
    button.append(make("span", "workflow-step-number", String(step.id)), make("span", "workflow-step-copy", step.label), make("span", "workflow-step-status", "Not started"));
    button.addEventListener("click", () => { if (!button.disabled) setStep(step.id); });
    item.append(button);
    return item;
  }

  function createResultsControls() {
    const results = $("results");
    if (!results || $("continueToPreview")) return;
    const validation = $("validation");
    const preview = make("button", "button secondary", "Continue to Preview");
    preview.type = "button";
    preview.id = "continueToPreview";
    preview.addEventListener("click", () => { state.previewed = true; setStep(7); });
    validation?.after(preview);
    const actions = results.querySelector(".actions");
    const exportStep = make("button", "button secondary", "Continue to Export");
    exportStep.type = "button";
    exportStep.id = "continueToExport";
    exportStep.addEventListener("click", () => setStep(8));
    actions?.prepend(exportStep);
    const download = $("download");
    if (download) download.textContent = "Download IIF file";
  }

  function createShell() {
    const copy = tierCopy();
    const shell = make("section", "workspace-shell");
    shell.id = "ledgerliftWorkspace";
    shell.setAttribute("aria-labelledby", "workspaceTitle");
    const heading = make("div", "workspace-heading");
    const headingCopy = make("div");
    headingCopy.append(make("p", "workspace-kicker", "Conversion workspace"), make("h2", "", "Work through your file step by step"), make("p", "workspace-description", copy.description));
    headingCopy.querySelector("h2").id = "workspaceTitle";
    const tierBadge = make("span", "workspace-tier", copy.label);
    tierBadge.id = "workspaceTier";
    tierBadge.dataset.tier = tier;
    heading.append(headingCopy, tierBadge);
    const list = make("ol", "workflow-steps");
    list.setAttribute("aria-label", "LedgerLift conversion steps");
    steps.forEach((step) => list.append(createStepButton(step)));
    const message = make("div", "workflow-message");
    message.id = "workflowMessage";
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    message.tabIndex = -1;

    const entry = make("section", "workspace-entry");
    entry.id = "workspaceEntry";
    entry.setAttribute("aria-labelledby", "workspaceEntryTitle");
    const entryHeading = make("div", "workspace-entry-heading");
    entryHeading.append(make("h3", "", "Upload a transaction file"), make("p", "", "LedgerLift will inspect the file and help identify its columns."));
    entryHeading.querySelector("h3").id = "workspaceEntryTitle";
    const entryActions = make("div", "workspace-entry-actions");
    entryActions.id = "workspaceEntryActions";
    const start = make("button", "button secondary", "Start a new conversion");
    start.type = "button";
    start.id = "startNewConversion";
    const upload = make("button", "button", "Upload a supported file");
    upload.type = "button";
    upload.id = "uploadSupportedFile";
    entryActions.append(start, upload);
    const entryNote = make("p", "workspace-entry-note", `${copy.note} Files are inspected locally; transaction rows are not uploaded.`);
    entryNote.id = "workspaceEntryNote";
    entry.append(entryHeading, entryActions, entryNote);

    const importPreview = make("section", "import-preview hidden");
    importPreview.id = "importPreview";
    importPreview.setAttribute("aria-labelledby", "importPreviewTitle");
    const previewHeading = make("div", "workspace-review-header");
    const previewCopy = make("div");
    previewCopy.append(make("h3", "", "Import preview"), make("p", "", "Check the detected structure before LedgerLift adds these rows to your workspace."));
    previewCopy.querySelector("h3").id = "importPreviewTitle";
    previewCopy.querySelector("h3").tabIndex = -1;
    const previewStatus = make("strong", "workspace-review-summary", "No file inspected");
    previewStatus.id = "importPreviewStatus";
    previewHeading.append(previewCopy, previewStatus);
    const previewMeta = make("div", "import-preview-meta");
    ["importFormat", "importWorksheet", "importDelimiter", "importHeader", "importRows", "importColumns"].forEach((id) => { const item = make("div", "import-meta-item"); item.id = id; previewMeta.append(item); });
    const previewControls = make("div", "import-preview-controls");
    const worksheetLabel = make("label", "", "Worksheet");
    const worksheetSelect = make("select"); worksheetSelect.id = "importWorksheetSelect"; worksheetLabel.append(worksheetSelect);
    const headerLabel = make("label", "", "Header row");
    const headerSelect = make("select"); headerSelect.id = "importHeaderSelect"; headerLabel.append(headerSelect);
    previewControls.append(worksheetLabel, headerLabel);
    const importErrors = make("div", "import-errors hidden");
    importErrors.id = "importErrors";
    importErrors.setAttribute("role", "alert");
    const previewTableWrap = make("div", "table-wrap import-preview-table");
    const previewTable = make("table");
    const caption = make("caption", "sr-only", "First transaction rows from the imported file");
    previewTable.append(caption, make("thead"), make("tbody"));
    previewTable.querySelector("tbody").id = "importPreviewRows";
    previewTableWrap.append(previewTable);
    const suggestions = make("div", "import-suggestions");
    suggestions.id = "importSuggestions";
    suggestions.append(make("h4", "", "Suggested column roles"), make("ul"));
    const importNotes = make("div", "import-warnings");
    importNotes.id = "importWarnings";
    importNotes.append(make("h4", "", "Import notes"), make("ul"));
    const previewActions = make("div", "actions import-preview-actions");
    const confirmImport = make("button", "button", "Confirm import");
    confirmImport.type = "button";
    confirmImport.id = "confirmImport";
    confirmImport.addEventListener("click", () => window.dispatchEvent(new Event("ledgerlift:confirm-import")));
    previewActions.append(confirmImport);
    importPreview.append(previewHeading, previewMeta, previewControls, importErrors, previewTableWrap, suggestions, importNotes, previewActions);

    const review = make("section", "workspace-review hidden");
    review.id = "workspaceReview";
    review.setAttribute("aria-labelledby", "workspaceReviewTitle");
    const reviewHeader = make("div", "workspace-review-header");
    const reviewCopy = make("div");
    reviewCopy.append(make("h3", "", "Review your transactions"), make("p", "", "Check the imported rows and correct anything that does not look right before continuing."));
    reviewCopy.querySelector("h3").id = "workspaceReviewTitle";
    const summary = make("strong", "workspace-review-summary", "No file loaded");
    summary.id = "workspaceReviewSummary";
    reviewHeader.append(reviewCopy, summary);
    const reviewMeta = make("div", "review-meta");
    ["reviewFileMeta", "reviewWorksheetMeta", "reviewRowsMeta", "reviewVisibleMeta", "reviewSelectedMeta"].forEach((id) => { const item = make("div", "review-meta-item", ""); item.id = id; reviewMeta.append(item); });
    const reviewToolbar = make("div", "review-toolbar");
    const searchLabel = make("label", "review-search", "Search transactions");
    const search = make("input"); search.id = "reviewSearch"; search.type = "search"; search.placeholder = "Search transactions"; search.autocomplete = "off"; searchLabel.append(search);
    const filterLabel = make("label", "", "Filter rows");
    const filter = make("select"); filter.id = "reviewFilter";
    [["all", "All rows"], ["blank", "Rows with blank values"], ["changed", "Rows changed by me"], ["new", "New rows"], ["warnings", "Rows with import warnings"]].forEach(([value, label]) => { const option = make("option", "", label); option.value = value; filter.append(option); });
    filterLabel.append(filter);
    const sortLabel = make("label", "", "Sort by");
    const sort = make("select"); sort.id = "reviewSortColumn"; sort.append(make("option", "", "Original order")); sortLabel.append(sort);
    const direction = make("select"); direction.id = "reviewSortDirection"; direction.append(make("option", "", "Ascending"), make("option", "", "Descending")); direction.setAttribute("aria-label", "Sort direction");
    const resetView = make("button", "button quiet", "Clear view"); resetView.type = "button"; resetView.id = "reviewResetView";
    reviewToolbar.append(searchLabel, filterLabel, sortLabel, direction, resetView);
    const selectionToolbar = make("div", "review-selection-toolbar");
    const selectVisibleLabel = make("label", "review-select-visible");
    const selectVisible = make("input"); selectVisible.type = "checkbox"; selectVisible.id = "reviewSelectVisible"; selectVisibleLabel.append(selectVisible, make("span", "", "Select visible rows"));
    const selectedText = make("span", "review-selected-count", "0 selected"); selectedText.id = "reviewSelectedCount";
    const clearSelection = make("button", "button quiet", "Clear selection"); clearSelection.type = "button"; clearSelection.id = "reviewClearSelection";
    const deleteSelected = make("button", "button quiet", "Delete selected"); deleteSelected.type = "button"; deleteSelected.id = "reviewDeleteSelected";
    const restoreSelected = make("button", "button quiet", "Restore selected edits"); restoreSelected.type = "button"; restoreSelected.id = "reviewRestoreSelected";
    const restoreAll = make("button", "button quiet", "Restore all edits"); restoreAll.type = "button"; restoreAll.id = "reviewRestoreAll";
    const undo = make("button", "button secondary", "Undo"); undo.type = "button"; undo.id = "reviewUndo";
    const redo = make("button", "button secondary", "Redo"); redo.type = "button"; redo.id = "reviewRedo";
    const addRow = make("button", "button", "Add blank row"); addRow.type = "button"; addRow.id = "reviewAddRow";
    selectionToolbar.append(selectVisibleLabel, selectedText, clearSelection, deleteSelected, restoreSelected, restoreAll, undo, redo, addRow);
    const warningPanel = make("details", "review-warning-panel");
    const warningSummary = make("summary", "", "Import warnings and observations"); warningPanel.append(warningSummary);
    const warningList = make("ul", "", ""); warningList.id = "reviewImportWarnings"; warningPanel.append(warningList);
    const reviewNoRows = make("div", "review-empty hidden", "No transaction rows remain. Add or restore at least one row before continuing."); reviewNoRows.id = "reviewNoRows"; reviewNoRows.setAttribute("role", "status");
    const reviewWrap = make("div", "table-wrap workspace-review-table");
    const reviewTable = make("table");
    const tableCaption = make("caption", "sr-only", "Imported transaction rows. Cells can be edited as plain text.");
    reviewTable.append(tableCaption, make("thead"), make("tbody"));
    reviewTable.querySelector("thead").id = "workspaceReviewHead";
    reviewTable.querySelector("tbody").id = "workspaceReviewRows";
    reviewWrap.append(reviewTable);
    const pagination = make("div", "review-pagination");
    const range = make("span", "", "No rows shown"); range.id = "reviewPageRange";
    const previousPage = make("button", "button quiet", "Previous"); previousPage.type = "button"; previousPage.id = "reviewPreviousPage";
    const pageSize = make("select"); pageSize.id = "reviewPageSize"; pageSize.setAttribute("aria-label", "Rows per page"); [25, 50, 100].forEach((size) => { const option = make("option", "", `${size} rows per page`); option.value = String(size); pageSize.append(option); });
    const nextPage = make("button", "button quiet", "Next"); nextPage.type = "button"; nextPage.id = "reviewNextPage";
    pagination.append(range, previousPage, pageSize, nextPage);
    const deletedPanel = make("details", "review-deleted-panel hidden");
    const deletedSummary = make("summary", "", "Deleted rows"); deletedPanel.append(deletedSummary);
    const deletedList = make("div", "review-deleted-list"); deletedList.id = "reviewDeletedRows";
    const restoreDeleted = make("button", "button secondary", "Restore selected deleted rows"); restoreDeleted.type = "button"; restoreDeleted.id = "reviewRestoreDeleted";
    deletedPanel.append(deletedList, restoreDeleted);
    const reviewSummary = make("div", "review-summary"); reviewSummary.id = "reviewSummary"; reviewSummary.setAttribute("aria-live", "polite");
    const reviewActions = make("div", "actions workspace-review-actions");
    const continueToClean = make("button", "button", "Continue to Clean");
    continueToClean.type = "button";
    continueToClean.id = "continueToClean";
    continueToClean.addEventListener("click", () => setStep(3));
    reviewActions.append(continueToClean);
    review.append(reviewHeader, reviewMeta, reviewToolbar, selectionToolbar, warningPanel, reviewNoRows, reviewWrap, pagination, deletedPanel, reviewSummary, reviewActions);

    const cleanPanel = make("section", "workspace-clean hidden");
    cleanPanel.id = "workspaceClean";
    cleanPanel.setAttribute("aria-labelledby", "workspaceCleanTitle");
    const cleanHeader = make("div", "workspace-review-header");
    const cleanCopy = make("div");
    cleanCopy.append(make("h3", "", "Clean your transaction data"), make("p", "", "Fix formatting issues and inconsistencies before mapping your columns."));
    cleanCopy.querySelector("h3").id = "workspaceCleanTitle";
    const cleanStatus = make("strong", "workspace-review-summary", "Scan not run"); cleanStatus.id = "cleanStatus"; cleanHeader.append(cleanCopy, cleanStatus);
    const cleanMeta = make("div", "clean-meta");
    ["cleanFileMeta", "cleanRowsMeta", "cleanIssueMeta", "cleanSuggestedMeta", "cleanAppliedMeta"].forEach((id) => { const item = make("div", "clean-meta-item", ""); item.id = id; cleanMeta.append(item); });
    const cleanNotice = make("div", "clean-notice", "Cleaning is optional. Preview changes before applying them."); cleanNotice.id = "cleanNotice"; cleanNotice.setAttribute("role", "status"); cleanNotice.setAttribute("aria-live", "polite");
    const cleanSummary = make("div", "clean-summary"); cleanSummary.id = "cleanSummary"; cleanSummary.setAttribute("aria-live", "polite");
    const cleanTools = make("div", "clean-tools"); cleanTools.id = "cleanTools";
    const cleanPreview = make("section", "clean-preview hidden"); cleanPreview.id = "cleanPreview"; cleanPreview.setAttribute("aria-labelledby", "cleanPreviewTitle");
    cleanPreview.append(make("h4", "", "Preview changes"), make("p", "", "These values have not changed yet. Include only the rows and cells you want LedgerLift to apply."));
    cleanPreview.querySelector("h4").id = "cleanPreviewTitle";
    const cleanPreviewMeta = make("div", "clean-preview-meta", ""); cleanPreviewMeta.id = "cleanPreviewMeta";
    const cleanPreviewWrap = make("div", "table-wrap clean-preview-table"); const cleanPreviewTable = make("table"); cleanPreviewTable.append(make("caption", "sr-only", "Cleaning changes before and after preview"), make("thead"), make("tbody")); cleanPreviewTable.querySelector("thead").id = "cleanPreviewHead"; cleanPreviewTable.querySelector("tbody").id = "cleanPreviewRows"; cleanPreviewWrap.append(cleanPreviewTable);
    const cleanPreviewActions = make("div", "actions clean-preview-actions");
    const selectAllPreview = make("button", "button quiet", "Select all preview items"); selectAllPreview.type = "button"; selectAllPreview.id = "cleanSelectAllPreview";
    const closePreview = make("button", "button quiet", "Close preview"); closePreview.type = "button"; closePreview.id = "cleanClosePreview";
    const applyPreview = make("button", "button", "Apply selected changes"); applyPreview.type = "button"; applyPreview.id = "cleanApplyPreview";
    cleanPreviewActions.append(selectAllPreview, closePreview, applyPreview); cleanPreview.append(cleanPreviewMeta, cleanPreviewWrap, cleanPreviewActions);
    const cleanHistory = make("div", "clean-history"); cleanHistory.id = "cleanHistory";
    const cleanUndo = make("button", "button secondary", "Undo cleaning"); cleanUndo.type = "button"; cleanUndo.id = "cleanUndo";
    const cleanRedo = make("button", "button secondary", "Redo cleaning"); cleanRedo.type = "button"; cleanRedo.id = "cleanRedo";
    const restoreAllClean = make("button", "button quiet", "Restore all Clean changes"); restoreAllClean.type = "button"; restoreAllClean.id = "restoreAllClean";
    cleanHistory.append(cleanUndo, cleanRedo, restoreAllClean);
    const cleanActions = make("div", "workspace-clean-actions");
    const continueToMapColumns = make("button", "button", "Continue to Map Columns"); continueToMapColumns.type = "button"; continueToMapColumns.id = "continueToMapColumns"; continueToMapColumns.addEventListener("click", () => { window.LedgerLiftCore?.markCleanReady?.(); state.cleaned = true; setStep(4); });
    cleanActions.append(continueToMapColumns);
    cleanPanel.append(cleanHeader, cleanMeta, cleanNotice, cleanSummary, cleanTools, cleanPreview, cleanHistory, cleanActions);

    const mapPanel = make("section", "workspace-map hidden");
    mapPanel.id = "workspaceMapColumns";
    mapPanel.setAttribute("aria-labelledby", "workspaceMapColumnsTitle");
    const mapHeader = make("div", "workspace-review-header");
    const mapCopy = make("div");
    mapCopy.append(make("h3", "", "Map your columns"), make("p", "", "Confirm what each source column means before LedgerLift prepares your transactions."));
    mapCopy.querySelector("h3").id = "workspaceMapColumnsTitle";
    const mapStatus = make("strong", "workspace-review-summary", "Mapping not confirmed"); mapStatus.id = "mappingStatus";
    mapHeader.append(mapCopy, mapStatus);
    const mapMeta = make("div", "mapping-meta");
    ["mappingFileMeta", "mappingRowsMeta", "mappingMappedMeta", "mappingIssuesMeta"].forEach((id) => { const item = make("div", "mapping-meta-item", ""); item.id = id; mapMeta.append(item); });
    const mapNotice = make("div", "mapping-notice", "Suggestions are only a starting point. Review each required field before continuing."); mapNotice.id = "mappingNotice"; mapNotice.setAttribute("role", "status"); mapNotice.setAttribute("aria-live", "polite");
    const mapToolbar = make("div", "mapping-toolbar");
    const applySuggestions = make("button", "button secondary", "Apply high-confidence suggestions"); applySuggestions.type = "button"; applySuggestions.id = "mappingApplySuggestions";
    const resetMappings = make("button", "button quiet", "Reset to suggestions"); resetMappings.type = "button"; resetMappings.id = "mappingResetAll";
    const clearMappings = make("button", "button quiet", "Clear all mappings"); clearMappings.type = "button"; clearMappings.id = "mappingClearAll";
    const mappingUndo = make("button", "button secondary", "Undo"); mappingUndo.type = "button"; mappingUndo.id = "mappingUndo";
    const mappingRedo = make("button", "button secondary", "Redo"); mappingRedo.type = "button"; mappingRedo.id = "mappingRedo";
    mapToolbar.append(applySuggestions, resetMappings, clearMappings, mappingUndo, mappingRedo);
    const amountStructure = make("div", "mapping-amount-structure");
    const amountLabel = make("label", "", "Amount structure"); const amountSelect = make("select"); amountSelect.id = "mappingAmountMode";
    [["unresolved", "Choose signed amount or debit / credit"], ["amount", "One signed amount column"], ["debit-credit", "Separate debit and credit columns"], ["debit-only", "Debit / withdrawal only"], ["credit-only", "Credit / deposit only"]].forEach(([value, label]) => { const option = make("option", "", label); option.value = value; amountSelect.append(option); });
    amountLabel.append(amountSelect); amountStructure.append(amountLabel, make("span", "mapping-amount-help", "If both structures are present, choose deliberately before continuing."));
    const mappingIssues = make("div", "mapping-issues"); mappingIssues.id = "mappingIssues"; mappingIssues.setAttribute("role", "alert");
    const mappingColumns = make("div", "mapping-columns"); mappingColumns.id = "mappingColumns";
    const templatePanel = make("section", "mapping-templates"); templatePanel.id = "mappingTemplates"; templatePanel.setAttribute("aria-labelledby", "mappingTemplatesTitle");
    templatePanel.append(make("h4", "", "Saved mapping templates"), make("p", "mapping-template-note", "Templates save only column names, positions, and roles—not transaction values.")); templatePanel.querySelector("h4").id = "mappingTemplatesTitle";
    const templateUnavailable = make("p", "mapping-template-unavailable", "Saved mapping templates are available in Standard and Plus workspaces."); templateUnavailable.id = "mappingTemplateUnavailable";
    const templateControls = make("div", "mapping-template-controls"); templateControls.id = "mappingTemplateControls";
    const templateName = make("input"); templateName.id = "mappingTemplateName"; templateName.placeholder = "Template name"; templateName.setAttribute("aria-label", "New mapping template name");
    const saveTemplate = make("button", "button secondary", "Save template"); saveTemplate.type = "button"; saveTemplate.id = "mappingSaveTemplate";
    const templateSelect = make("select"); templateSelect.id = "mappingTemplateSelect"; templateSelect.setAttribute("aria-label", "Saved mapping template");
    const applyTemplate = make("button", "button quiet", "Apply selected template"); applyTemplate.type = "button"; applyTemplate.id = "mappingApplyTemplate";
    const deleteTemplate = make("button", "button quiet", "Delete selected template"); deleteTemplate.type = "button"; deleteTemplate.id = "mappingDeleteTemplate";
    templateControls.append(templateName, saveTemplate, templateSelect, applyTemplate, deleteTemplate); templatePanel.append(templateUnavailable, templateControls);
    const mapPreview = make("section", "mapping-preview"); mapPreview.id = "mappingPreview"; mapPreview.setAttribute("aria-labelledby", "mappingPreviewTitle");
    mapPreview.append(make("h4", "", "Mapping preview"), make("p", "", "A small sample of the fields LedgerLift will carry forward. This does not change your data.")); mapPreview.querySelector("h4").id = "mappingPreviewTitle";
    const mapPreviewMeta = make("div", "mapping-preview-meta", ""); mapPreviewMeta.id = "mappingPreviewMeta";
    const mapPreviewWrap = make("div", "table-wrap mapping-preview-table"); const mapPreviewTable = make("table"); mapPreviewTable.append(make("caption", "sr-only", "Preview of mapped transaction fields"), make("thead"), make("tbody")); mapPreviewTable.querySelector("thead").id = "mappingPreviewHead"; mapPreviewTable.querySelector("tbody").id = "mappingPreviewRows"; mapPreviewWrap.append(mapPreviewTable); mapPreview.append(mapPreviewMeta, mapPreviewWrap);
    const mapActions = make("div", "workspace-map-actions");
    const continueToAccounts = make("button", "button", "Continue to Map Accounts"); continueToAccounts.type = "button"; continueToAccounts.id = "continueToMapAccounts"; continueToAccounts.addEventListener("click", () => { const mapper = mapperModel(); if (!mapper?.getValidation().canContinue) return; window.LedgerLiftCore?.markMapColumnsReady?.(mapper.getMapping()); state.mapColumnsVisited = true; setStep(5); });
    mapActions.append(continueToAccounts);
    mapPanel.append(mapHeader, mapMeta, mapNotice, mapToolbar, amountStructure, mappingIssues, mappingColumns, templatePanel, mapPreview, mapActions);

    const accountPanel = make("section", "workspace-accounts hidden");
    accountPanel.id = "workspaceMapAccounts";
    accountPanel.setAttribute("aria-labelledby", "workspaceMapAccountsTitle");
    const accountHeader = make("div", "workspace-review-header");
    const accountCopy = make("div"); accountCopy.append(make("h3", "", "Map accounts and transaction details"), make("p", "", "Match imported account, category, and name values to the values LedgerLift should use in the converted file.")); accountCopy.querySelector("h3").id = "workspaceMapAccountsTitle";
    const accountStatus = make("strong", "workspace-review-summary", "Mapping not ready"); accountStatus.id = "accountMappingStatus"; accountHeader.append(accountCopy, accountStatus);
    const accountMeta = make("div", "account-meta"); ["accountFileMeta", "accountRowsMeta", "accountUniqueMeta", "accountMappedMeta", "accountUnmappedMeta", "accountAffectedMeta"].forEach((id) => { const item = make("div", "account-meta-item", ""); item.id = id; accountMeta.append(item); });
    const accountNotice = make("div", "account-notice", "All source values are inspected locally. Suggestions are not confirmed until you accept them."); accountNotice.id = "accountMappingNotice"; accountNotice.setAttribute("role", "status"); accountNotice.setAttribute("aria-live", "polite");
    const sourceAccount = make("section", "account-source-panel"); sourceAccount.setAttribute("aria-labelledby", "accountSourceTitle"); sourceAccount.append(make("h4", "", "Default source account"), make("p", "", "Which account do these transactions belong to? This is usually the bank, credit-card, or cash account represented by the imported file.")); sourceAccount.querySelector("h4").id = "accountSourceTitle";
    const sourceControls = make("div", "account-source-controls"); const sourceLabel = make("label", "", "Account represented by this file"); const sourceSelect = make("select"); sourceSelect.id = "accountSourceSelect"; sourceSelect.setAttribute("aria-label", "Default source account"); sourceLabel.append(sourceSelect); const sourceType = make("span", "account-source-type", "No account selected"); sourceType.id = "accountSourceType"; sourceControls.append(sourceLabel, sourceType); sourceAccount.append(sourceControls);
    const sourceMessage = make("p", "account-source-message", "Create an Account destination below, then select it here."); sourceMessage.id = "accountSourceMessage"; sourceAccount.append(sourceMessage);
    const accountToolbar = make("div", "account-toolbar");
    const accountSearchLabel = make("label", "", "Search source values"); const accountSearch = make("input"); accountSearch.id = "accountMappingSearch"; accountSearch.type = "search"; accountSearch.placeholder = "Search source values"; accountSearch.autocomplete = "off"; accountSearchLabel.append(accountSearch);
    const accountFilterLabel = make("label", "", "Filter values"); const accountFilter = make("select"); accountFilter.id = "accountMappingFilter"; [["all", "All values"], ["unmapped", "Unmapped"], ["mapped", "Mapped"], ["suggested", "Suggested"], ["ignored", "Ignored"], ["review", "Needs review"], ["frequency", "High-frequency values"], ["blank", "Blank-affected rows"]].forEach(([value, label]) => { const option = make("option", "", label); option.value = value; accountFilter.append(option); }); accountFilterLabel.append(accountFilter);
    const accountSortLabel = make("label", "", "Sort values"); const accountSort = make("select"); accountSort.id = "accountMappingSort"; [["frequency", "Most transactions"], ["source", "Source value A–Z"], ["status", "Mapping status"], ["destination", "Destination A–Z"]].forEach(([value, label]) => { const option = make("option", "", label); option.value = value; accountSort.append(option); }); accountSortLabel.append(accountSort); accountToolbar.append(accountSearchLabel, accountFilterLabel, accountSortLabel);
    const accountActions = make("div", "account-selection-toolbar"); const selectValues = make("label", "account-select-visible"); const selectAllValues = make("input"); selectAllValues.type = "checkbox"; selectAllValues.id = "accountSelectVisible"; selectValues.append(selectAllValues, make("span", "", "Select visible values")); const selectedValues = make("span", "account-selected-count", "0 values selected"); selectedValues.id = "accountSelectedCount";
    const bulkLabel = make("label", "", "Assign selected to"); const bulkDestination = make("select"); bulkDestination.id = "accountBulkDestination"; bulkDestination.setAttribute("aria-label", "Bulk destination"); bulkLabel.append(bulkDestination); const bulkAssign = make("button", "button secondary", "Assign selected"); bulkAssign.type = "button"; bulkAssign.id = "accountBulkAssign"; const bulkClear = make("button", "button quiet", "Clear selected"); bulkClear.type = "button"; bulkClear.id = "accountBulkClear"; const bulkIgnore = make("button", "button quiet", "Ignore selected"); bulkIgnore.type = "button"; bulkIgnore.id = "accountBulkIgnore"; const accountSuggestions = make("button", "button secondary", "Apply exact suggestions"); accountSuggestions.type = "button"; accountSuggestions.id = "accountApplySuggestions"; const accountUndo = make("button", "button secondary", "Undo"); accountUndo.type = "button"; accountUndo.id = "accountUndo"; const accountRedo = make("button", "button secondary", "Redo"); accountRedo.type = "button"; accountRedo.id = "accountRedo"; accountActions.append(selectValues, selectedValues, bulkLabel, bulkAssign, bulkClear, bulkIgnore, accountSuggestions, accountUndo, accountRedo);
    const accountIssues = make("div", "account-issues"); accountIssues.id = "accountMappingIssues"; accountIssues.setAttribute("role", "alert");
    const valueList = make("div", "account-value-list"); valueList.id = "accountValueList";
    const destinationPanel = make("details", "destination-library"); destinationPanel.open = true; const destinationSummary = make("summary", "", "Destination library and creation"); destinationPanel.append(destinationSummary);
    const destinationForm = make("div", "destination-form"); const destinationTypeLabel = make("label", "", "Destination type"); const destinationType = make("select"); destinationType.id = "accountDestinationType"; (window.LedgerLiftAccountMapper?.DESTINATION_TYPES || []).forEach((item) => { const option = make("option", "", item.label); option.value = item.id; destinationType.append(option); }); destinationTypeLabel.append(destinationType);
    const destinationNameLabel = make("label", "", "Name"); const destinationName = make("input"); destinationName.id = "accountDestinationName"; destinationName.placeholder = "e.g. Checking or Office Supplies"; destinationNameLabel.append(destinationName);
    const destinationAccountTypeLabel = make("label", "", "Account type"); const destinationAccountType = make("select"); destinationAccountType.id = "accountDestinationAccountType"; (window.LedgerLiftAccountMapper?.ACCOUNT_TYPES || []).forEach((item) => { const option = make("option", "", item.label); option.value = item.id; destinationAccountType.append(option); }); destinationAccountTypeLabel.append(destinationAccountType);
    const destinationParentLabel = make("label", "", "Parent account (optional)"); const destinationParent = make("select"); destinationParent.id = "accountDestinationParent"; destinationParentLabel.append(destinationParent);
    const destinationDescriptionLabel = make("label", "", "Description (optional)"); const destinationDescription = make("input"); destinationDescription.id = "accountDestinationDescription"; destinationDescriptionLabel.append(destinationDescription);
    const createDestination = make("button", "button", "Create destination"); createDestination.type = "button"; createDestination.id = "accountCreateDestination"; const destinationFormMessage = make("p", "destination-form-message", ""); destinationFormMessage.id = "accountDestinationFormMessage"; destinationForm.append(destinationTypeLabel, destinationNameLabel, destinationAccountTypeLabel, destinationParentLabel, destinationDescriptionLabel, createDestination, destinationFormMessage); destinationPanel.append(destinationForm);
    const destinationList = make("div", "destination-list"); destinationList.id = "accountDestinationList"; destinationPanel.append(destinationList);
    const accountTemplates = make("section", "account-mapping-templates"); accountTemplates.id = "accountMappingTemplates"; accountTemplates.setAttribute("aria-labelledby", "accountTemplatesTitle"); accountTemplates.append(make("h4", "", "Saved value-mapping templates"), make("p", "", "Templates store only the source value you explicitly mapped, its role, and destination structure—not transaction rows or amounts.")); accountTemplates.querySelector("h4").id = "accountTemplatesTitle";
    const accountTemplateUnavailable = make("p", "account-template-unavailable", "Persistent value-mapping templates are available in Standard and Plus workspaces."); accountTemplateUnavailable.id = "accountTemplateUnavailable"; accountTemplates.append(accountTemplateUnavailable);
    const accountTemplateControls = make("div", "account-template-controls"); accountTemplateControls.id = "accountTemplateControls"; const accountTemplateName = make("input"); accountTemplateName.id = "accountTemplateName"; accountTemplateName.placeholder = "Template name"; accountTemplateName.setAttribute("aria-label", "New value-mapping template name"); const accountSaveTemplate = make("button", "button secondary", "Save template"); accountSaveTemplate.type = "button"; accountSaveTemplate.id = "accountSaveTemplate"; const accountTemplateSelect = make("select"); accountTemplateSelect.id = "accountTemplateSelect"; accountTemplateSelect.setAttribute("aria-label", "Saved value-mapping template"); const accountApplyTemplate = make("button", "button quiet", "Preview selected template"); accountApplyTemplate.type = "button"; accountApplyTemplate.id = "accountPreviewTemplate"; const accountApplyConfirmed = make("button", "button quiet", "Apply selected matches"); accountApplyConfirmed.type = "button"; accountApplyConfirmed.id = "accountApplyTemplate"; const accountRenameTemplate = make("button", "button quiet", "Rename template"); accountRenameTemplate.type = "button"; accountRenameTemplate.id = "accountRenameTemplate"; const accountDeleteTemplate = make("button", "button quiet", "Delete template"); accountDeleteTemplate.type = "button"; accountDeleteTemplate.id = "accountDeleteTemplate"; accountTemplateControls.append(accountTemplateName, accountSaveTemplate, accountTemplateSelect, accountApplyTemplate, accountApplyConfirmed, accountRenameTemplate, accountDeleteTemplate); accountTemplates.append(accountTemplateControls);
    const accountPreview = make("section", "account-mapping-preview"); accountPreview.id = "accountMappingPreview"; accountPreview.setAttribute("aria-labelledby", "accountPreviewTitle"); accountPreview.append(make("h4", "", "Account mapping preview"), make("p", "", "This preview shows assigned accounts and names. LedgerLift has not completed accounting validation yet.")); accountPreview.querySelector("h4").id = "accountPreviewTitle"; const accountPreviewMeta = make("div", "account-preview-meta", ""); accountPreviewMeta.id = "accountPreviewMeta"; const accountPreviewWrap = make("div", "table-wrap account-preview-table"); const accountPreviewTable = make("table"); accountPreviewTable.append(make("caption", "sr-only", "Preview of account mappings"), make("thead"), make("tbody")); accountPreviewTable.querySelector("thead").id = "accountPreviewHead"; accountPreviewTable.querySelector("tbody").id = "accountPreviewRows"; accountPreviewWrap.append(accountPreviewTable); accountPreview.append(accountPreviewMeta, accountPreviewWrap);
    const accountActionsBottom = make("div", "workspace-account-actions"); const backToColumns = make("button", "button secondary", "Back to Map Columns"); backToColumns.type = "button"; backToColumns.id = "backToMapColumns"; backToColumns.addEventListener("click", () => setStep(4)); const continueToValidate = make("button", "button", "Continue to Validate"); continueToValidate.type = "button"; continueToValidate.id = "continueToValidate"; continueToValidate.addEventListener("click", () => { const accountModel = accountMapperModel(); if (!accountModel?.getValidation().canContinue) return; window.LedgerLiftCore?.markMapAccountsReady?.(accountModel.getState()); state.mapAccountsVisited = true; setStep(6); }); accountActionsBottom.append(backToColumns, continueToValidate);
    accountPanel.append(accountHeader, accountMeta, accountNotice, sourceAccount, accountToolbar, accountActions, accountIssues, valueList, destinationPanel, accountTemplates, accountPreview, accountActionsBottom);

    shell.append(heading, list, message, entry, importPreview, review, cleanPanel, mapPanel, accountPanel);
    converter.prepend(shell);

    const sectionTitle = converter.querySelector(".section-title");
    if (sectionTitle) {
      sectionTitle.querySelector("h2").textContent = "Upload a transaction file";
      sectionTitle.querySelector("p").textContent = "LedgerLift will inspect the file and help identify its columns.";
    }
    const work = $("work");
    if (work) {
      const marker = work.querySelector(".section-title .step");
      if (marker) { marker.textContent = ""; marker.setAttribute("aria-hidden", "true"); }
      const analyze = $("analyze");
      if (analyze) analyze.textContent = "Validate and preview";
    }
    const sourceActions = converter.querySelector("#sampleBtn")?.closest(".actions");
    const sample = $("sampleBtn");
    const clear = $("clearBtn");
    const fileStatus = $("fileStatus");
    const fileInput = $("fileInput");
    const dropStrong = $("dropZone")?.querySelector("strong");
    const dropSmall = $("dropZone")?.querySelector("small");
    if (fileInput) fileInput.accept = tier === "free" ? ".csv,.tsv,text/csv,text/tab-separated-values" : ".csv,.tsv,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (dropStrong) dropStrong.textContent = "Upload a transaction file";
    if (dropSmall) dropSmall.textContent = tier === "free" ? "CSV and TSV · 10 MB maximum · processed locally" : "CSV, TSV, and XLSX · processed locally";
    if (sourceActions) sourceActions.classList.add("workspace-source-actions");
    if (sample) entryActions.append(sample);
    if (clear) { clear.textContent = "Remove file"; entryActions.append(clear); }
    if (fileStatus) entryActions.append(fileStatus);
    start.addEventListener("click", () => { clear?.click(); $("fileInput")?.focus(); });
    upload.addEventListener("click", () => $("fileInput")?.click());
    $("importWorksheetSelect").addEventListener("change", (event) => window.dispatchEvent(new CustomEvent("ledgerlift:import-config-changed", { detail: { worksheetIndex: Number(event.target.value), headerRow: window.LedgerLiftCore?.state?.headerRow ?? 0 } })));
    $("importHeaderSelect").addEventListener("change", (event) => window.dispatchEvent(new CustomEvent("ledgerlift:import-config-changed", { detail: { headerRow: Number(event.target.value) } })));
    let searchTimer;
    $("reviewSearch").addEventListener("input", (event) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => reviewModel()?.setView({ query: event.target.value }), 120); });
    $("reviewFilter").addEventListener("change", (event) => reviewModel()?.setView({ filter: event.target.value }));
    $("reviewSortColumn").addEventListener("change", (event) => reviewModel()?.setView({ sortColumn: event.target.value, sortDirection: event.target.value ? $("reviewSortDirection").value : "" }));
    $("reviewSortDirection").addEventListener("change", (event) => reviewModel()?.setView({ sortDirection: event.target.value }));
    $("reviewResetView").addEventListener("click", () => reviewModel()?.resetView());
    $("reviewSelectVisible").addEventListener("change", (event) => reviewModel()?.selectAllVisible(event.target.checked));
    $("reviewClearSelection").addEventListener("click", () => reviewModel()?.clearSelection());
    $("reviewDeleteSelected").addEventListener("click", deleteSelectedRows);
    $("reviewRestoreSelected").addEventListener("click", () => reviewModel()?.restoreRows(reviewModel()?.getState().selectedIds || []));
    $("reviewRestoreAll").addEventListener("click", () => reviewModel()?.restoreAllEdits());
    $("reviewUndo").addEventListener("click", () => reviewModel()?.undo());
    $("reviewRedo").addEventListener("click", () => reviewModel()?.redo());
    $("reviewAddRow").addEventListener("click", () => reviewModel()?.addRow());
    $("reviewPreviousPage").addEventListener("click", () => changeReviewPage(-1));
    $("reviewNextPage").addEventListener("click", () => changeReviewPage(1));
    $("reviewPageSize").addEventListener("change", (event) => reviewModel()?.setView({ pageSize: Number(event.target.value) }));
    $("reviewRestoreDeleted").addEventListener("click", restoreSelectedDeletedRows);
    $("cleanTools").addEventListener("click", (event) => {
      const previewButton = event.target.closest("[data-clean-preview]");
      if (previewButton) { const card = previewButton.closest(".clean-tool-card"); cleanerModel()?.preview(previewButton.dataset.cleanPreview, cleanOptionsFromCard(previewButton.dataset.cleanPreview, card)); return; }
      const restoreButton = event.target.closest("[data-clean-restore]");
      if (restoreButton) { cleanerModel()?.restoreLatestTool(restoreButton.dataset.cleanRestore); return; }
    });
    $("cleanPreviewRows").addEventListener("change", (event) => {
      if (event.target.matches("[data-clean-preview-key]")) cleanerModel()?.setPreviewSelection(event.target.dataset.cleanPreviewKey, event.target.checked);
    });
    $("cleanSelectAllPreview").addEventListener("click", () => {
      const preview = cleanerModel()?.getPreview();
      preview?.changes.forEach((change) => cleanerModel().setPreviewSelection(change.key || (change.row ? change.id : `${change.id}::${change.column}`), true));
    });
    $("cleanClosePreview").addEventListener("click", () => { cleanerModel()?.closePreview?.(); renderCleanPreview(); });
    $("cleanApplyPreview").addEventListener("click", () => { cleanerModel()?.applyPreview(); $("cleanPreviewTitle")?.focus(); });
    $("cleanUndo").addEventListener("click", () => cleanerModel()?.undo());
    $("cleanRedo").addEventListener("click", () => cleanerModel()?.redo());
    $("restoreAllClean").addEventListener("click", () => cleanerModel()?.restoreAll());
    $("cleanHistory").addEventListener("click", (event) => {
      const operation = event.target.closest("[data-clean-restore-operation]");
      if (operation) { const current = cleanerModel()?.getOperations?.().find((item) => item.id === operation.dataset.cleanRestoreOperation); if (current) cleanerModel()?.restoreLatestTool(current.toolId); return; }
      const cell = event.target.closest("[data-clean-restore-cell]");
      if (cell) { const [id, ...column] = cell.dataset.cleanRestoreCell.split("::"); cleanerModel()?.restoreCell(id, column.join("::")); return; }
      const row = event.target.closest("[data-clean-restore-row]");
      if (row) cleanerModel()?.restoreRow(row.dataset.cleanRestoreRow);
    });
    $("mappingColumns").addEventListener("change", (event) => {
      const role = event.target.closest("[data-map-role]");
      if (role) mapperModel()?.setRole(role.dataset.columnId, role.value);
    });
    $("mappingColumns").addEventListener("click", (event) => {
      const clear = event.target.closest("[data-map-clear]");
      const reset = event.target.closest("[data-map-reset]");
      if (clear) mapperModel()?.clearColumn(clear.dataset.mapClear);
      if (reset) mapperModel()?.resetColumn(reset.dataset.mapReset);
    });
    $("mappingIssues").addEventListener("click", (event) => {
      const action = event.target.closest("[data-map-conflict]");
      if (action) mapperModel()?.resolveConflict(action.dataset.mapConflict);
      const amount = event.target.closest("[data-map-amount-resolve]");
      if (amount) mapperModel()?.setAmountMode(amount.dataset.mapAmountResolve, { resolve: true });
    });
    $("mappingApplySuggestions").addEventListener("click", () => mapperModel()?.applyHighConfidence());
    $("mappingResetAll").addEventListener("click", () => mapperModel()?.resetAll());
    $("mappingClearAll").addEventListener("click", () => mapperModel()?.clearAll());
    $("mappingUndo").addEventListener("click", () => mapperModel()?.undo());
    $("mappingRedo").addEventListener("click", () => mapperModel()?.redo());
    $("mappingAmountMode").addEventListener("change", (event) => { const result = mapperModel()?.setAmountMode(event.target.value); if (result?.conflict) renderMapping(); });
    $("mappingSaveTemplate").addEventListener("click", () => {
      const mapper = mapperModel(), store = mapper?.getTemplateStore?.();
      if (!store) return;
      const result = store.save($("mappingTemplateName").value, mapper.mappingTemplateBlueprint());
      $("mappingNotice").textContent = result.ok ? `Saved “${result.template.name}” on this device. No transaction data was included.` : result.reason;
      if (result.ok) { $("mappingTemplateName").value = ""; renderMapping(); }
    });
    $("mappingApplyTemplate").addEventListener("click", () => { const mapper = mapperModel(), store = mapper?.getTemplateStore?.(), selected = store?.list?.().find((template) => template.id === $("mappingTemplateSelect").value); if (mapper && selected) mapper.applyTemplate(selected); });
    $("mappingDeleteTemplate").addEventListener("click", () => { const store = mapperModel()?.getTemplateStore?.(); if (store?.remove($("mappingTemplateSelect").value)) renderMapping(); });
    $("accountSourceSelect").addEventListener("change", (event) => { accountMapperModel()?.setDefaultSourceAccount(event.target.value); });
    $("accountMappingSearch").addEventListener("input", (event) => { accountView.query = event.target.value; renderAccountMapping(); });
    $("accountMappingFilter").addEventListener("change", (event) => { accountView.filter = event.target.value; renderAccountMapping(); });
    $("accountMappingSort").addEventListener("change", (event) => { accountView.sort = event.target.value; renderAccountMapping(); });
    $("accountSelectVisible").addEventListener("change", (event) => { const model = accountMapperModel(); const ids = filteredAccountRecords().map((record) => record.id); ids.forEach((id) => event.target.checked ? accountSelected.add(id) : accountSelected.delete(id)); renderAccountMapping(); });
    $("accountValueList").addEventListener("change", (event) => {
      const select = event.target.closest("[data-account-record-destination]");
      if (select) accountMapperModel()?.setMapping(select.dataset.recordId, select.value);
      const checkbox = event.target.closest("[data-account-record-select]");
      if (checkbox) { checkbox.checked ? accountSelected.add(checkbox.dataset.recordId) : accountSelected.delete(checkbox.dataset.recordId); renderAccountMapping(); }
    });
    $("accountValueList").addEventListener("click", (event) => {
      const action = event.target.closest("[data-account-record-action]"); if (!action) return;
      const model = accountMapperModel(); const id = action.dataset.recordId;
      if (action.dataset.accountRecordAction === "ignore") model?.ignore(id);
      if (action.dataset.accountRecordAction === "restore") model?.restoreIgnored(id);
      if (action.dataset.accountRecordAction === "clear") model?.resetRecord(id);
      if (action.dataset.accountRecordAction === "reset-column") model?.resetColumn(action.dataset.columnId);
    });
    $("accountBulkAssign").addEventListener("click", () => { const model = accountMapperModel(); model?.bulkAssign([...accountSelected], $("accountBulkDestination").value); });
    $("accountBulkClear").addEventListener("click", () => { accountMapperModel()?.bulkClear([...accountSelected]); });
    $("accountBulkIgnore").addEventListener("click", () => { accountMapperModel()?.bulkIgnore([...accountSelected]); });
    $("accountApplySuggestions").addEventListener("click", () => accountMapperModel()?.applyExactSuggestions());
    $("accountUndo").addEventListener("click", () => accountMapperModel()?.undo());
    $("accountRedo").addEventListener("click", () => accountMapperModel()?.redo());
    $("accountCreateDestination").addEventListener("click", () => {
      const model = accountMapperModel(); const result = model?.createDestination({ type: $("accountDestinationType").value, name: $("accountDestinationName").value, accountType: $("accountDestinationAccountType").value, parentId: $("accountDestinationParent").value, description: $("accountDestinationDescription").value });
      $("accountDestinationFormMessage").textContent = result?.ok ? `Created ${result.destination.name}. Select it where needed.` : result?.reason || "Could not create that destination.";
      if (result?.ok) { $("accountDestinationName").value = ""; $("accountDestinationDescription").value = ""; renderAccountMapping(); }
    });
    $("accountDestinationType").addEventListener("change", () => renderAccountMapping());
    $("accountSaveTemplate").addEventListener("click", () => {
      const store = accountMapperModel()?.getTemplateStore?.(), model = accountMapperModel(); if (!store || !model) return;
      const result = store.save($("accountTemplateName").value, model.mappingTemplateBlueprint()); $("accountMappingNotice").textContent = result.ok ? `Saved “${result.template.name}” on this device. Only explicit mapping keys were included.` : result.reason; if (result.ok) { $("accountTemplateName").value = ""; renderAccountMapping(); }
    });
    $("accountPreviewTemplate").addEventListener("click", () => {
      const store = accountMapperModel()?.getTemplateStore?.(), template = store?.list?.().find((item) => item.id === $("accountTemplateSelect").value); if (!template) return;
      const preview = accountMapperModel()?.previewTemplate(template); accountView.templatePreview = preview; renderAccountMapping();
    });
    $("accountApplyTemplate").addEventListener("click", () => {
      const store = accountMapperModel()?.getTemplateStore?.(), template = store?.list?.().find((item) => item.id === $("accountTemplateSelect").value); if (template) accountMapperModel()?.applyTemplate(template, accountView.templatePreview?.matches?.map((match) => match.recordId) || []);
    });
    $("accountRenameTemplate").addEventListener("click", () => {
      const store = accountMapperModel()?.getTemplateStore?.(), id = $("accountTemplateSelect").value; if (store && id) { const result = store.rename(id, window.prompt("New template name", store.list().find((item) => item.id === id)?.name || "")); $("accountMappingNotice").textContent = result.reason || "Template renamed."; renderAccountMapping(); }
    });
    $("accountDeleteTemplate").addEventListener("click", () => { const store = accountMapperModel()?.getTemplateStore?.(); if (store?.remove($("accountTemplateSelect").value)) renderAccountMapping(); });
    document.addEventListener("keydown", (event) => {
      const reviewPanel = $("workspaceReview");
      const activeElement = document.activeElement;
      const cleanPanel = $("workspaceClean");
      const inReview = reviewPanel && !reviewPanel.classList.contains("hidden") && (reviewPanel.contains(event.target) || reviewPanel.contains(activeElement));
      const inClean = cleanPanel && !cleanPanel.classList.contains("hidden") && (cleanPanel.contains(event.target) || cleanPanel.contains(activeElement));
      if (!inReview && !inClean) return;
      const key = String(event.key || "").toLocaleLowerCase();
      const modifier = event.metaKey || event.ctrlKey || event.getModifierState?.("Meta") || event.getModifierState?.("Control");
      if (!modifier) return;
      if (key === "z" || event.code === "KeyZ") { event.preventDefault(); if (inClean) event.shiftKey ? cleanerModel()?.redo() : cleanerModel()?.undo(); else event.shiftKey ? reviewModel()?.redo() : reviewModel()?.undo(); }
      if (key === "y" || event.code === "KeyY") { event.preventDefault(); if (inClean) cleanerModel()?.redo(); else reviewModel()?.redo(); }
    });
    createResultsControls();
  }

  function renderImportPreview(preview) {
    const panel = $("importPreview");
    if (!panel || !preview) return;
    $("importPreviewStatus").textContent = `${preview.fileMeta.name} · ${preview.rows.length} rows found`;
    const meta = {
      importFormat: ["Format", preview.format],
      importWorksheet: ["Worksheet", preview.worksheetName || "Text file"],
      importDelimiter: ["Delimiter", preview.delimiter === "\t" ? "Tab" : preview.delimiter === ";" ? "Semicolon" : preview.delimiter ? "Comma" : "Not applicable"],
      importHeader: ["Header row", `Row ${preview.headerRow + 1} · ${preview.headerConfidence} confidence`],
      importRows: ["Transaction rows", `${preview.estimatedTransactionRows}`],
      importColumns: ["Columns", `${preview.columns}`]
    };
    Object.entries(meta).forEach(([id, [label, value]]) => { const node = $(id); node.replaceChildren(make("span", "import-meta-label", label), make("strong", "", value)); });
    const worksheetSelect = $("importWorksheetSelect");
    const worksheetLabel = worksheetSelect.closest("label");
    worksheetSelect.replaceChildren(...(preview.worksheets || []).map((sheet, index) => { const option = make("option", "", sheet.name); option.value = String(index); return option; }));
    if (preview.worksheets?.length) { worksheetSelect.value = String(preview.worksheetIndex || 0); worksheetLabel.hidden = preview.worksheets.length < 2; }
    else { worksheetLabel.hidden = true; }
    const headerSelect = $("importHeaderSelect");
    headerSelect.replaceChildren(...(preview.headerOptions || []).map((optionData) => { const option = make("option", "", `${optionData.label}${optionData.index === preview.detectedHeaderRow ? " · suggested" : ""}${optionData.preview ? ` — ${optionData.preview}` : ""}`); option.value = String(optionData.index); return option; }));
    headerSelect.value = String(preview.headerRow);
    const errorPanel = $("importErrors");
    errorPanel.replaceChildren();
    if (preview.blocking.length) { errorPanel.classList.remove("hidden"); preview.blocking.forEach((message) => errorPanel.append(make("strong", "", message), make("p", "", "Choose another file or adjust the import settings above."))); }
    else errorPanel.classList.add("hidden");
    const head = panel.querySelector(".import-preview-table thead");
    head.replaceChildren();
    const headRow = make("tr");
    preview.headers.forEach((header) => { const cell = make("th", "", header); cell.scope = "col"; headRow.append(cell); });
    head.append(headRow);
    const body = $("importPreviewRows");
    body.replaceChildren();
    preview.rows.slice(0, 8).forEach((row) => { const tableRow = make("tr"); preview.headers.forEach((header) => tableRow.append(make("td", "", String(row[header] ?? "")))); body.append(tableRow); });
    const suggestionList = $("importSuggestions").querySelector("ul");
    suggestionList.replaceChildren();
    ["date", "description", "memo", "amount", "debit", "credit", "balance", "account", "category", "reference"].forEach((role) => {
      const suggestion = preview.suggestions?.roles?.[role];
      const text = suggestion ? `Likely ${suggestion.label}: ${suggestion.column} (${suggestion.confidence} confidence)` : `Not identified: ${role}`;
      suggestionList.append(make("li", suggestion ? "suggestion-found" : "suggestion-missing", text));
    });
    const warningList = $("importWarnings").querySelector("ul");
    warningList.replaceChildren();
    if (preview.warnings.length) preview.warnings.forEach((warning) => warningList.append(make("li", `import-note-${warning.level}`, warning.message)));
    else warningList.append(make("li", "import-note-info", "No import warnings were found."));
    $("confirmImport").disabled = Boolean(preview.blocking.length) || state.imported;
    $("confirmImport").textContent = state.imported ? "Import confirmed" : "Confirm import";
  }

  function reviewModel() { return window.LedgerLiftCore?.state?.review || null; }

  function cleanerModel() { return window.LedgerLiftCore?.state?.cleaner || null; }

  function mapperModel() { return window.LedgerLiftCore?.state?.mapper || null; }

  function accountMapperModel() { return window.LedgerLiftCore?.state?.accountMapper || null; }

  function accountRecordStatus(record) {
    if (record.ignored) return "Ignored";
    if (record.warning || record.suggestion?.confidence === "Possible") return "Needs review";
    if (record.destinationId) return record.origin === "suggestion" || record.origin === "template" ? "Suggested" : "Mapped";
    return "Unmapped";
  }

  function filteredAccountRecords() {
    const model = accountMapperModel();
    if (!model) return [];
    const records = model.getState().records.filter((record) => {
      const query = accountView.query.trim().toLocaleLowerCase();
      const status = accountRecordStatus(record);
      if (query && !`${record.sourceValue} ${record.sourceRole} ${record.columnHeader}`.toLocaleLowerCase().includes(query)) return false;
      if (accountView.filter === "unmapped" && status !== "Unmapped") return false;
      if (accountView.filter === "mapped" && status !== "Mapped") return false;
      if (accountView.filter === "suggested" && status !== "Suggested") return false;
      if (accountView.filter === "ignored" && status !== "Ignored") return false;
      if (accountView.filter === "review" && status !== "Needs review") return false;
      if (accountView.filter === "frequency" && record.count < 3) return false;
      return true;
    });
    return records.sort((left, right) => {
      if (accountView.sort === "source") return left.sourceValue.localeCompare(right.sourceValue, undefined, { numeric: true, sensitivity: "base" });
      if (accountView.sort === "status") return accountRecordStatus(left).localeCompare(accountRecordStatus(right));
      if (accountView.sort === "destination") return (model.getDestination(left.destinationId)?.name || "").localeCompare(model.getDestination(right.destinationId)?.name || "", undefined, { sensitivity: "base" });
      return right.count - left.count || left.sourceValue.localeCompare(right.sourceValue, undefined, { sensitivity: "base" });
    });
  }

  function accountDestinationOptions(role, selected = "") {
    const model = accountMapperModel();
    const options = [{ id: "", label: "Not mapped" }];
    (model?.getState().destinations || []).filter((destination) => {
      const accepted = window.LedgerLiftAccountMapper?.DESTINATION_TYPES ? { account: ["account"], category: ["account"], name: ["vendor", "customer", "employee", "other-name"], vendor: ["vendor"], customer: ["customer"], employee: ["employee"], class: ["class"], customerJob: ["customer-job"], transactionType: ["transaction-type"], clearedStatus: ["cleared-status"], taxCode: ["tax-code"] }[role] || [] : [];
      return accepted.includes(destination.type);
    }).forEach((destination) => options.push({ id: destination.id, label: destination.type === "account" && destination.parentId ? `${accountDestinationName(destination.parentId)}:${destination.name}` : destination.name }));
    return options.map((item) => { const option = make("option", "", item.label); option.value = item.id; option.selected = item.id === selected; return option; });
  }

  function accountDestinationName(id) { return accountMapperModel()?.getState().destinations.find((destination) => destination.id === id)?.name || ""; }

  function renderAccountMapping() {
    const model = accountMapperModel();
    if (!model) return;
    const modelState = model.getState(), validation = modelState.validation, core = window.LedgerLiftCore?.state;
    const fileName = core?.fileMeta?.name || `${core?.name || "transactions"}.csv`;
    const setMeta = (id, label, value) => $(id)?.replaceChildren(make("span", "account-meta-label", label), make("strong", "", String(value)));
    setMeta("accountFileMeta", "File", fileName); setMeta("accountRowsMeta", "Active rows", validation.activeRows); setMeta("accountUniqueMeta", "Unique source values", validation.uniqueValues); setMeta("accountMappedMeta", "Mapped values", validation.mappedValues); setMeta("accountUnmappedMeta", "Unmapped / ignored", `${validation.unmappedValues} / ${validation.ignoredValues}`); setMeta("accountAffectedMeta", "Rows needing review", validation.rowsAffected);
    $("accountMappingStatus").textContent = validation.canContinue ? "Ready to continue" : `${validation.blocking.length} required issue${validation.blocking.length === 1 ? "" : "s"}`;
    $("accountMappingNotice").textContent = validation.canContinue ? "Required values are mapped. Optional values can remain unresolved, or you can return later without losing these choices." : "Resolve the required account setup below before continuing to Validate.";
    const sourceSelect = $("accountSourceSelect"); sourceSelect.replaceChildren(); const accounts = modelState.destinations.filter((destination) => destination.type === "account"); sourceSelect.append(make("option", "", "Choose a source account")); sourceSelect.firstChild.value = ""; accounts.forEach((destination) => { const option = make("option", "", destination.parentId ? `${accountDestinationName(destination.parentId)}:${destination.name}` : destination.name); option.value = destination.id; option.selected = destination.id === modelState.sourceAccount.destinationId; sourceSelect.append(option); });
    $("accountSourceType").textContent = modelState.sourceAccount.destinationId ? `${modelState.sourceAccount.name} · ${window.LedgerLiftAccountMapper?.ACCOUNT_TYPES.find((item) => item.id === modelState.sourceAccount.accountType)?.label || modelState.sourceAccount.accountType}` : validation.hasSourceAccountColumn ? "Source Account column is mapped" : "Required before Validate";
    $("accountSourceMessage").textContent = validation.hasSourceAccountColumn ? "The source Account column will provide the account per row. A default is only used for blank values." : accounts.length ? "Choose the account represented by this file." : "Create an Account destination below, then select it here.";
    const issues = $("accountMappingIssues"); issues.replaceChildren(); validation.blocking.forEach((issue) => { const item = make("div", "account-issue account-issue-blocking"); item.append(make("strong", "", "Required"), make("span", "", issue.message)); issues.append(item); }); validation.warnings.forEach((warning) => { const item = make("div", "account-issue account-issue-warning"); item.append(make("strong", "", "Review recommended"), make("span", "", warning.message)); issues.append(item); }); if (!validation.blocking.length && !validation.warnings.length) issues.append(make("p", "account-success", "No account-mapping issues are waiting for review."));
    const records = filteredAccountRecords(), valueList = $("accountValueList"); valueList.replaceChildren(); if (!modelState.sourceColumns.length) valueList.append(make("p", "account-empty", "No account, category, party, class, customer/job, or other eligible source columns were mapped. You can still assign the default source account above.")); else if (accountView.filter === "blank") { const blankColumns = modelState.blankByColumn.filter((column) => column.count > 0); valueList.append(make("p", "account-empty", blankColumns.length ? `Blank source values are not listed as destinations. ${blankColumns.map((column) => `${column.header}: ${column.count} row${column.count === 1 ? "" : "s"}`).join(" · ")}.` : "No blank source values were found.")); } else if (!records.length) valueList.append(make("p", "account-empty", "No source values match this search or filter."));
    records.slice(0, 150).forEach((record) => {
      const card = make("article", "account-value-card"); card.dataset.recordId = record.id; const head = make("div", "account-value-head"); const check = make("input"); check.type = "checkbox"; check.dataset.accountRecordSelect = "true"; check.dataset.recordId = record.id; check.checked = accountSelected.has(record.id); check.setAttribute("aria-label", `Select ${record.sourceValue} from ${record.columnHeader}`); const title = make("div", "account-value-title"); title.append(make("strong", "", record.sourceValue), make("span", "", `${ACCOUNT_ROLE_LABELS[record.sourceRole] || record.sourceRole} · ${record.count} transaction${record.count === 1 ? "" : "s"}`)); const status = make("span", `account-value-status account-status-${accountRecordStatus(record).toLocaleLowerCase().replace(/\s+/g, "-")}`, accountRecordStatus(record)); head.append(check, title, status); card.append(head);
      const controls = make("div", "account-value-controls"); const destinationLabel = make("label", "", "Destination"); const destinationSelect = make("select"); destinationSelect.dataset.accountRecordDestination = "true"; destinationSelect.dataset.recordId = record.id; destinationSelect.setAttribute("aria-label", `Destination for ${record.sourceValue}`); destinationSelect.append(...accountDestinationOptions(record.sourceRole, record.destinationId)); destinationLabel.append(destinationSelect); controls.append(destinationLabel);
      if (record.suggestion) controls.append(make("span", "account-suggestion", `${record.suggestion.confidence}: ${record.suggestion.reason}`)); else controls.append(make("span", "account-suggestion", "No suggestion"));
      const action = make("button", "button quiet", record.ignored ? "Restore" : record.destinationId ? "Clear" : "Ignore"); action.type = "button"; action.dataset.accountRecordAction = record.ignored ? "restore" : record.destinationId ? "clear" : "ignore"; action.dataset.recordId = record.id; action.disabled = !record.ignored && !record.destinationId && window.LedgerLiftAccountMapper?.REQUIRED_ROLES.has(record.sourceRole); action.setAttribute("aria-label", `${record.ignored ? "Restore" : record.destinationId ? "Clear" : "Ignore"} mapping for ${record.sourceValue}`); controls.append(action); card.append(controls);
      if (record.warning) card.append(make("p", "account-value-warning", record.warning)); const sample = record.rowIds.slice(0, 3).map((id) => `Row ${id.replace("row-", "")}`).join(" · "); card.append(make("p", "account-value-sample", `Affected rows: ${sample}${record.rowIds.length > 3 ? " · more" : ""}`)); valueList.append(card);
    });
    const visibleIds = records.slice(0, 150).map((record) => record.id); $("accountSelectedCount").textContent = `${accountSelected.size} value${accountSelected.size === 1 ? "" : "s"} selected`; $("accountSelectVisible").checked = visibleIds.length > 0 && visibleIds.every((id) => accountSelected.has(id)); $("accountBulkAssign").disabled = !accountSelected.size || !$("accountBulkDestination").value; $("accountBulkClear").disabled = !accountSelected.size; $("accountBulkIgnore").disabled = !accountSelected.size; $("accountApplySuggestions").disabled = !modelState.records.some((record) => record.suggestion?.confidence === "Exact match" && !record.destinationId && !record.ignored); $("accountUndo").disabled = !modelState.canUndo; $("accountRedo").disabled = !modelState.canRedo; $("continueToValidate").disabled = !validation.canContinue;
    const bulk = $("accountBulkDestination"); bulk.replaceChildren(make("option", "", "Choose destination")); bulk.firstChild.value = ""; modelState.destinations.forEach((destination) => { const option = make("option", "", destination.name); option.value = destination.id; bulk.append(option); });
    const destinationAccountType = $("accountDestinationAccountType"), destinationParent = $("accountDestinationParent"); const accountTypeVisible = $("accountDestinationType").value === "account"; destinationAccountType.closest("label").hidden = !accountTypeVisible; destinationParent.closest("label").hidden = !accountTypeVisible; destinationParent.replaceChildren(make("option", "", "No parent")); destinationParent.firstChild.value = ""; modelState.destinations.filter((destination) => destination.type === "account").forEach((destination) => { const option = make("option", "", destination.parentId ? `${accountDestinationName(destination.parentId)}:${destination.name}` : destination.name); option.value = destination.id; destinationParent.append(option); });
    const destinationList = $("accountDestinationList"); destinationList.replaceChildren(); if (!modelState.destinations.length) destinationList.append(make("p", "destination-empty", "No destinations created in this session yet.")); modelState.destinations.forEach((destination) => { const item = make("div", "destination-item"); item.append(make("strong", "", destination.parentId ? `${accountDestinationName(destination.parentId)}:${destination.name}` : destination.name), make("span", "", `${destinationTypeLabel(destination.type)}${destination.accountType ? ` · ${destination.accountType}` : ""}`)); destinationList.append(item); });
    const store = model.getTemplateStore?.(), eligible = Boolean(store && store.limit > 0); $("accountTemplateControls").hidden = !eligible; $("accountTemplateUnavailable").hidden = eligible; if (eligible) { const select = $("accountTemplateSelect"); select.replaceChildren(); store.list().forEach((template) => { const option = make("option", "", template.name); option.value = template.id; select.append(option); }); const has = select.options.length > 0; $("accountPreviewTemplate").disabled = !has; $("accountApplyTemplate").disabled = !has || !accountView.templatePreview?.matches?.length; $("accountRenameTemplate").disabled = !has; $("accountDeleteTemplate").disabled = !has; }
    const preview = model.getPreview(6); $("accountPreviewMeta").textContent = `${preview.length} sample rows shown · unresolved fields are not final validation results.`; const previewHead = $("accountPreviewHead"); previewHead.replaceChildren(); ["Date", "Description", "Amount", "Source account", "Destination account/category", "Name", "Class", "Customer/job", "Status"].forEach((label) => { const th = make("th", "", label); th.scope = "col"; previewHead.append(th); }); const previewBody = $("accountPreviewRows"); previewBody.replaceChildren(); preview.forEach((row) => { const tr = make("tr"); [row.date, row.description, row.amount || `${row.debit || ""} / ${row.credit || ""}`, row.sourceAccount, row.destination, row.name, row.className, row.customerJob, row.status].forEach((value) => tr.append(make("td", "", textForDisplay(value) || "—"))); previewBody.append(tr); });
    if (accountView.templatePreview) { const summary = accountView.templatePreview; $("accountMappingNotice").textContent = `${summary.matches?.length || 0} template matches previewed; ${summary.unmatched?.length || 0} current values have no saved match. Applying will remain local and reversible.`; }
  }

  function mappingRoleOptions(selected) {
    const roles = window.LedgerLiftMapper?.ROLE_DEFINITIONS || [];
    return roles.map((role) => { const option = make("option", "", role.label); option.value = role.id; option.selected = role.id === selected; return option; });
  }

  function renderMapping() {
    const mapper = mapperModel();
    if (!mapper) return;
    const modelState = mapper.getState();
    const validation = modelState.validation;
    const core = window.LedgerLiftCore?.state;
    const fileName = core?.fileMeta?.name || `${core?.name || "transactions"}.csv`;
    const setMeta = (id, label, value) => $(id)?.replaceChildren(make("span", "mapping-meta-label", label), make("strong", "", String(value)));
    setMeta("mappingFileMeta", "File", fileName);
    setMeta("mappingRowsMeta", "Active rows", core?.review?.getState?.().totalRows || 0);
    setMeta("mappingMappedMeta", "Mapped / ignored", `${validation.mappedCount} / ${validation.ignoredCount}`);
    setMeta("mappingIssuesMeta", "Required issues", validation.blocking.length);
    $("mappingStatus").textContent = validation.canContinue ? "Ready to continue" : `${validation.blocking.length} required issue${validation.blocking.length === 1 ? "" : "s"}`;
    $("mappingNotice").textContent = validation.canContinue ? "Your required fields are mapped. You can still return and adjust them before Map Accounts." : "Review the required fields below. Suggestions are not confirmed until you choose them.";
    const issues = $("mappingIssues"); issues.replaceChildren();
    if (!validation.issues.length) issues.append(make("p", "mapping-success", "All required fields are mapped. No conflicts are waiting for resolution."));
    validation.issues.forEach((issue) => {
      const item = make("div", `mapping-issue mapping-issue-${issue.severity}`);
      item.append(make("strong", "", issue.severity === "blocking" ? "Required" : "Review recommended"), make("span", "", issue.message));
      if (issue.code === "amount-structure-conflict") {
        const amountButton = make("button", "button quiet", "Use signed amount"); amountButton.type = "button"; amountButton.dataset.mapAmountResolve = "amount";
        const splitButton = make("button", "button quiet", "Use debit and credit"); splitButton.type = "button"; splitButton.dataset.mapAmountResolve = "debit-credit";
        item.append(amountButton, splitButton);
      }
      if (issue.code === "pending-conflict") {
        const replace = make("button", "button quiet", "Replace existing assignment"); replace.type = "button"; replace.dataset.mapConflict = "replace";
        const swap = make("button", "button quiet", "Swap assignments"); swap.type = "button"; swap.dataset.mapConflict = "swap";
        item.append(replace, swap);
      }
      issues.append(item);
    });
    const amountSelect = $("mappingAmountMode"); amountSelect.value = validation.mode;
    const columns = $("mappingColumns"); columns.replaceChildren();
    modelState.columns.forEach((column) => {
      const card = make("article", "mapping-column-card"); card.dataset.columnId = column.id;
      const head = make("div", "mapping-column-head");
      const title = make("div", "mapping-column-title"); title.append(make("strong", "", column.header), make("span", "", `Source column ${column.index + 1}`));
      const profile = column.profile || {}; const stat = profile.nonBlank ? `${profile.nonBlank} values · ${profile.blankPercent}% blank` : "No values detected";
      head.append(title, make("span", "mapping-column-stat", stat)); card.append(head);
      const controls = make("div", "mapping-column-controls");
      const label = make("label", "", "Map as"); const select = make("select"); select.dataset.mapRole = "true"; select.dataset.columnId = column.id; select.setAttribute("aria-label", `Map ${column.header}`); select.append(...mappingRoleOptions(column.role)); label.append(select);
      const suggestion = column.suggestions?.[0];
      const suggestionText = suggestion ? `${suggestion.label}: ${suggestion.confidence} suggestion` : "Not identified by the import scan";
      const suggestionNode = make("span", "mapping-column-suggestion", suggestionText);
      const clear = make("button", "button quiet", "Clear"); clear.type = "button"; clear.dataset.mapClear = column.id; clear.setAttribute("aria-label", `Clear mapping for ${column.header}`);
      const reset = make("button", "button quiet", "Reset"); reset.type = "button"; reset.dataset.mapReset = column.id; reset.setAttribute("aria-label", `Reset ${column.header} to its suggestion`);
      controls.append(label, suggestionNode, clear, reset); card.append(controls);
      if (profile.samples?.length) card.append(make("p", "mapping-column-samples", `Examples: ${profile.samples.map((value) => textForDisplay(value)).join(" · ")}`));
      if (column.origin === "manual") card.append(make("span", "mapping-origin", "Chosen by you"));
      else if (column.origin === "suggestion") card.append(make("span", "mapping-origin mapping-origin-suggested", "Suggested; please confirm"));
      columns.append(card);
    });
    const store = mapper.getTemplateStore?.();
    const templateControls = $("mappingTemplateControls"), unavailable = $("mappingTemplateUnavailable");
    const eligible = Boolean(store && store.limit > 0);
    templateControls.hidden = !eligible; unavailable.hidden = eligible;
    if (eligible) {
      const select = $("mappingTemplateSelect"); select.replaceChildren(); (store.list?.() || []).forEach((template) => { const option = make("option", "", template.name); option.value = template.id; select.append(option); });
      const hasTemplates = select.options.length > 0; $("mappingApplyTemplate").disabled = !hasTemplates; $("mappingDeleteTemplate").disabled = !hasTemplates;
    }
    const preview = mapper.getPreview(6); $("mappingPreviewMeta").textContent = `${preview.length} sample rows shown · source values remain local and unchanged.`;
    const previewHead = $("mappingPreviewHead"); previewHead.replaceChildren(); ["Date", "Description", "Memo", validation.mode === "debit-credit" ? "Debit / Credit" : "Amount", "Reference", "Account", "Category"].forEach((label) => { const th = make("th", "", label); th.scope = "col"; previewHead.append(th); });
    const previewBody = $("mappingPreviewRows"); previewBody.replaceChildren(); preview.forEach((row) => { const tr = make("tr"); [row.fields.date, row.fields.description, row.fields.memo, validation.mode === "debit-credit" ? `${row.fields.debit || "—"} / ${row.fields.credit || "—"}` : row.fields.amount, row.fields.reference, row.fields.account, row.fields.category].forEach((value) => tr.append(make("td", "", textForDisplay(value) || "—"))); previewBody.append(tr); });
    $("mappingApplySuggestions").disabled = !modelState.columns.some((column) => column.suggestions?.some((suggestion) => suggestion.confidence === "High") && column.origin !== "manual");
    $("mappingResetAll").disabled = !modelState.columns.some((column) => column.role !== "unmapped");
    $("mappingClearAll").disabled = validation.mappedCount === 0 && validation.ignoredCount === 0;
    $("mappingUndo").disabled = !modelState.canUndo; $("mappingRedo").disabled = !modelState.canRedo;
    $("continueToMapAccounts").disabled = !validation.canContinue;
  }

  function textForDisplay(value) { return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim(); }

  function syncReviewRows() { window.LedgerLiftCore?.syncReviewRows?.(); }

  function commitReviewCell(input) {
    if (!input || input.dataset.committed === "true") return;
    input.dataset.committed = "true";
    const model = reviewModel();
    if (!model) return;
    const id = input.dataset.rowId, column = input.dataset.column;
    if (String(model.getEntry(id)?.values?.[column] ?? "") === input.value) return;
    model.editCell(id, column, input.value);
    syncReviewRows();
  }

  function cancelReviewCell(input) {
    const model = reviewModel();
    if (!input || !model) return;
    input.value = String(model.getEntry(input.dataset.rowId)?.values?.[input.dataset.column] ?? "");
    input.dataset.committed = "true";
  }

  function makeReviewInput(entry, column, rowNumber) {
    const cell = make("td");
    const input = make("input");
    input.type = "text";
    input.value = String(entry.values[column] ?? "");
    input.dataset.rowId = entry.id;
    input.dataset.column = column;
    input.dataset.committed = "true";
    input.setAttribute("aria-label", `${column} for row ${rowNumber}`);
    input.addEventListener("focus", () => { input.dataset.committed = "false"; });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); commitReviewCell(input); input.blur(); }
      if (event.key === "Escape") { event.preventDefault(); cancelReviewCell(input); input.blur(); }
    });
    input.addEventListener("blur", () => commitReviewCell(input));
    cell.append(input);
    if (String(entry.values[column] ?? "") !== String(entry.original[column] ?? "")) cell.append(make("span", "review-cell-edited", "Edited"));
    cell.classList.toggle("review-cell-changed", String(entry.values[column] ?? "") !== String(entry.original[column] ?? ""));
    return cell;
  }

  function deleteSelectedRows() {
    const model = reviewModel();
    const ids = model?.getState().selectedIds || [];
    if (!ids.length) return;
    if (ids.length > 10 && !window.confirm(`Delete ${ids.length} selected rows? You can restore them with Undo.`)) return;
    model.deleteRows(ids);
  }

  function restoreSelectedDeletedRows() {
    const model = reviewModel();
    model?.restoreDeletedRows(model.getState().deletedSelectedIds || []);
  }

  function changeReviewPage(delta) {
    const model = reviewModel();
    if (!model) return;
    const current = model.getState().view;
    model.setView({ page: Math.max(1, Math.min(current.pageCount, current.page + delta)) });
  }

  function renderReviewTable() {
    const model = reviewModel();
    const head = $("workspaceReviewHead");
    const body = $("workspaceReviewRows");
    if (!model || !head || !body) return;
    const modelState = model.getState();
    head.replaceChildren();
    const headRow = make("tr");
    const selectHead = make("th"); selectHead.scope = "col"; selectHead.textContent = "Select"; headRow.append(selectHead);
    const rowHead = make("th", "", "Row"); rowHead.scope = "col"; headRow.append(rowHead);
    modelState.headers.forEach((column) => { const th = make("th", "", column); th.scope = "col"; headRow.append(th); });
    const actionHead = make("th", "", "Actions"); actionHead.scope = "col"; headRow.append(actionHead);
    head.append(headRow);
    body.replaceChildren();
    modelState.visibleEntries.forEach((entry) => {
      const rowNumber = modelState.currentOrder.indexOf(entry.id) + 1;
      const tableRow = make("tr");
      tableRow.dataset.rowId = entry.id;
      tableRow.classList.toggle("review-row-changed", entry.created || modelState.headers.some((column) => String(entry.values[column] ?? "") !== String(entry.original[column] ?? "")));
      tableRow.classList.toggle("review-row-new", entry.created);
      tableRow.classList.toggle("review-row-warning", entry.warningMessages.length > 0);
      const selectCell = make("td", "review-select-cell");
      const checkbox = make("input"); checkbox.type = "checkbox"; checkbox.checked = modelState.selectedIds.includes(entry.id); checkbox.setAttribute("aria-label", `Select row ${rowNumber}`); checkbox.addEventListener("change", () => model.select(entry.id, checkbox.checked)); selectCell.append(checkbox); tableRow.append(selectCell);
      const rowNumberCell = make("th", "row-number", String(rowNumber)); rowNumberCell.scope = "row"; tableRow.append(rowNumberCell);
      if (entry.warningMessages.length) {
        rowNumberCell.append(make("span", "review-warning-badge", "Warning"));
        rowNumberCell.title = entry.warningMessages.join(" ");
        rowNumberCell.setAttribute("aria-label", `Row ${rowNumber}. Import warning: ${entry.warningMessages.join(" ")}`);
      }
      modelState.headers.forEach((column) => tableRow.append(makeReviewInput(entry, column, rowNumber)));
      const actions = make("td", "review-row-actions");
      if (!entry.created && modelState.headers.some((column) => String(entry.values[column] ?? "") !== String(entry.original[column] ?? ""))) {
        const restore = make("button", "button quiet", "Restore row"); restore.type = "button"; restore.dataset.reviewRestoreRow = "true"; restore.setAttribute("aria-label", `Restore edits in row ${rowNumber}`); restore.addEventListener("click", () => model.restoreRows([entry.id])); actions.append(restore);
      }
      const remove = make("button", "button quiet", "Delete"); remove.type = "button"; remove.setAttribute("aria-label", `Delete row ${rowNumber}`); remove.addEventListener("click", () => model.deleteRows([entry.id])); actions.append(remove);
      tableRow.append(actions);
      body.append(tableRow);
    });
    renderReviewControls();
  }

  function updateReviewRowAfterEdit(row, entry, model) {
    if (!row || !entry) return;
    const changed = entry.created || model.headers.some((column) => String(entry.values[column] ?? "") !== String(entry.original[column] ?? ""));
    row.classList.toggle("review-row-changed", changed);
    row.querySelectorAll("input[data-column]").forEach((input) => {
      const cell = input.closest("td");
      const cellChanged = String(entry.values[input.dataset.column] ?? "") !== String(entry.original[input.dataset.column] ?? "");
      cell.classList.toggle("review-cell-changed", cellChanged);
      const note = cell.querySelector(".review-cell-edited");
      if (cellChanged && !note) cell.append(make("span", "review-cell-edited", "Edited"));
      if (!cellChanged && note) note.remove();
    });
    const actions = row.querySelector(".review-row-actions");
    if (!actions) return;
    const restore = actions.querySelector("[data-review-restore-row]");
    if (changed && !entry.created && !restore) {
      const button = make("button", "button quiet", "Restore row");
      button.type = "button";
      button.dataset.reviewRestoreRow = "true";
      button.setAttribute("aria-label", `Restore edits in row ${model.getState().currentOrder.indexOf(entry.id) + 1}`);
      button.addEventListener("click", () => model.restoreRows([entry.id]));
      actions.prepend(button);
    } else if ((!changed || entry.created) && restore) restore.remove();
  }

  function renderReviewWarnings() {
    const list = $("reviewImportWarnings");
    const warnings = window.LedgerLiftCore?.state?.importWarnings || [];
    if (!list) return;
    list.replaceChildren();
    if (!warnings.length) list.append(make("li", "", "No import warnings were found."));
    else warnings.forEach((warning) => list.append(make("li", `import-note-${warning.level || "info"}`, warning.message)));
  }

  function renderDeletedRows(modelState, model) {
    const panel = $("workspaceReview")?.querySelector(".review-deleted-panel");
    const list = $("reviewDeletedRows");
    const button = $("reviewRestoreDeleted");
    if (!panel || !list || !button) return;
    panel.classList.toggle("hidden", !modelState.deletedEntries.length);
    list.replaceChildren();
    modelState.deletedEntries.forEach((entry) => {
      const label = make("label", "review-deleted-row");
      const checkbox = make("input"); checkbox.type = "checkbox"; checkbox.checked = modelState.deletedSelectedIds.includes(entry.id); checkbox.setAttribute("aria-label", `Select deleted row ${entry.id}`); checkbox.addEventListener("change", () => model.selectDeleted(entry.id, checkbox.checked));
      const preview = modelState.headers.map((column) => String(entry.values[column] ?? "")).filter(Boolean).slice(0, 2).join(" · ");
      label.append(checkbox, make("span", "", preview || "Blank row")); list.append(label);
    });
    button.disabled = !modelState.deletedSelectedIds.length;
  }

  function renderReviewControls() {
    const model = reviewModel();
    if (!model) return;
    const modelState = model.getState();
    const core = window.LedgerLiftCore?.state;
    const fileName = core?.fileMeta?.name || `${core?.name || "transactions"}.csv`;
    $("reviewFileMeta").replaceChildren(make("span", "review-meta-label", "File"), make("strong", "", fileName));
    $("reviewWorksheetMeta").replaceChildren(make("span", "review-meta-label", "Worksheet"), make("strong", "", core?.worksheetName || "Text file"));
    $("reviewRowsMeta").replaceChildren(make("span", "review-meta-label", "Working rows"), make("strong", "", String(modelState.totalRows)));
    $("reviewVisibleMeta").replaceChildren(make("span", "review-meta-label", "Visible rows"), make("strong", "", String(modelState.visibleCount)));
    $("reviewSelectedMeta").replaceChildren(make("span", "review-meta-label", "Selected"), make("strong", "", String(modelState.selectedCount)));
    $("workspaceReviewSummary").textContent = `${fileName} · ${modelState.totalRows} rows · ${modelState.selectedCount} selected`;
    const search = $("reviewSearch"); if (search.value !== modelState.view.query) search.value = modelState.view.query;
    const filter = $("reviewFilter"); if (filter.value !== modelState.view.filter) filter.value = modelState.view.filter;
    const sort = $("reviewSortColumn");
    sort.replaceChildren(make("option", "", "Original order"));
    modelState.headers.forEach((column) => { const option = make("option", "", column); option.value = column; sort.append(option); });
    sort.value = modelState.view.sortColumn;
    $("reviewSortDirection").value = modelState.view.sortDirection || "asc";
    $("reviewPageSize").value = String(modelState.view.pageSize);
    const visibleIds = modelState.visibleEntries.map((entry) => entry.id);
    const selectVisible = $("reviewSelectVisible"); selectVisible.checked = visibleIds.length > 0 && visibleIds.every((id) => modelState.selectedIds.includes(id)); selectVisible.indeterminate = visibleIds.some((id) => modelState.selectedIds.includes(id)) && !selectVisible.checked;
    $("reviewSelectedCount").textContent = `${modelState.selectedCount} selected`;
    $("reviewClearSelection").disabled = !modelState.selectedCount;
    $("reviewDeleteSelected").disabled = !modelState.selectedCount;
    $("reviewRestoreSelected").disabled = !modelState.selectedCount || !modelState.activeEntries.some((entry) => modelState.selectedIds.includes(entry.id) && !entry.created && modelState.headers.some((column) => String(entry.values[column] ?? "") !== String(entry.original[column] ?? "")));
    $("reviewRestoreAll").disabled = !modelState.editedCells;
    $("reviewUndo").disabled = !modelState.canUndo;
    $("reviewRedo").disabled = !modelState.canRedo;
    $("reviewPageRange").textContent = modelState.visibleCount ? `Showing ${modelState.view.visibleStart}–${modelState.view.visibleEnd} of ${modelState.visibleCount}` : "No matching rows";
    $("reviewPreviousPage").disabled = modelState.view.page <= 1;
    $("reviewNextPage").disabled = modelState.view.page >= modelState.view.pageCount;
    $("reviewNoRows").classList.toggle("hidden", modelState.totalRows > 0);
    $("continueToClean").disabled = modelState.totalRows === 0;
    $("reviewSummary").textContent = `${modelState.totalRows} working rows · ${modelState.editedCells} edited cells · ${modelState.addedRows} added · ${modelState.deletedRows} deleted · ${modelState.remainingWarnings} import warnings remaining.`;
    renderDeletedRows(modelState, model);
    renderReviewWarnings();
  }

  function cleanRowNumber(id) {
    const order = reviewModel()?.getState().currentOrder || [];
    const index = order.indexOf(id);
    return index < 0 ? "Deleted" : String(index + 1);
  }

  function cleanToolCount(toolId, scan) {
    const counts = {
      whitespace: scan.whitespace.length,
      "blank-values": scan.blankValues.length,
      capitalization: scan.capitalization.length,
      dates: scan.dates.length + scan.dateAmbiguous.length,
      numbers: scan.numbers.length + scan.numberAmbiguous.length,
      "blank-rows": scan.blankRows.length,
      duplicates: scan.duplicates.reduce((sum, group) => sum + Math.max(0, group.ids.length - 1), 0),
      "near-duplicates": scan.nearDuplicates.length,
      invisible: scan.invisible.length,
      summaries: scan.summaries.length
    };
    return counts[toolId] || 0;
  }

  function appendColumnChoices(container, columns, prefix, checked = true) {
    const list = make("div", "clean-column-list");
    columns.forEach((column) => {
      const label = make("label", "clean-column-choice");
      const checkbox = make("input"); checkbox.type = "checkbox"; checkbox.checked = checked; checkbox.value = column; checkbox.dataset.cleanColumn = "true"; checkbox.id = `${prefix}-${column.replace(/[^a-z0-9]+/gi, "-")}`;
      label.append(checkbox, make("span", "", column)); list.append(label);
    });
    if (!columns.length) list.append(make("span", "clean-muted", "No eligible text columns were identified."));
    container.append(list);
  }

  function cleanOptionsFromCard(toolId, card) {
    if (toolId === "whitespace") return { collapse: Boolean(card.querySelector("[data-clean-option='collapse']")?.checked) };
    if (toolId === "capitalization") return { mode: card.querySelector("[data-clean-option='mode']")?.value || "title", columns: [...card.querySelectorAll("[data-clean-column]:checked")].map((input) => input.value) };
    if (toolId === "dates") return { format: card.querySelector("[data-clean-option='format']")?.value || "MM/DD/YYYY", assumption: card.querySelector("[data-clean-option='assumption']")?.value || "leave" };
    if (toolId === "numbers") return { columns: [...card.querySelectorAll("[data-clean-column]:checked")].map((input) => input.value) };
    return {};
  }

  function renderCleanTools() {
    const panel = $("cleanTools");
    const cleaner = cleanerModel();
    if (!panel || !cleaner) return;
    const scan = cleaner.getState().scan;
    panel.replaceChildren();
    cleaner.getTools().forEach((tool) => {
      const card = make("details", "clean-tool-card");
      const summary = make("summary", "clean-tool-summary");
      const summaryCopy = make("span", "clean-tool-copy");
      summaryCopy.append(make("strong", "", tool.label), make("span", "", tool.description));
      const count = make("span", "clean-tool-count", `${cleanToolCount(tool.id, scan)} found`);
      summary.append(summaryCopy, count); card.append(summary);
      const body = make("div", "clean-tool-body");
      body.append(make("p", "clean-tool-explanation", tool.available ? "Preview the proposed changes first. Applying them changes only the current working data." : `This tool is planned for ${tool.tier === "plus" ? "Plus" : "Standard"}. It is not enabled in this workspace yet.`));
      if (tool.available) {
        if (tool.id === "whitespace") {
          const label = make("label", "clean-option"); const input = make("input"); input.type = "checkbox"; input.dataset.cleanOption = "collapse"; label.append(input, make("span", "", "Also collapse repeated internal spaces")); body.append(label);
        }
        if (tool.id === "capitalization") {
          const label = make("label", "clean-option", "Text case"); const select = make("select"); select.dataset.cleanOption = "mode"; [["title", "Title case"], ["upper", "UPPERCASE"], ["lower", "lowercase"]].forEach(([value, text]) => { const option = make("option", "", text); option.value = value; select.append(option); }); label.append(select); body.append(label);
          body.append(make("span", "clean-option-label", "Choose text columns")); appendColumnChoices(body, scan.textColumns, `clean-cap-${tool.id}`);
        }
        if (tool.id === "dates") {
          const formatLabel = make("label", "clean-option", "Output date format"); const format = make("select"); format.dataset.cleanOption = "format"; [["MM/DD/YYYY", "MM/DD/YYYY"], ["YYYY-MM-DD", "YYYY-MM-DD"], ["DD/MM/YYYY", "DD/MM/YYYY"]].forEach(([value, text]) => { const option = make("option", "", text); option.value = value; format.append(option); }); formatLabel.append(format); body.append(formatLabel);
          const assumptionLabel = make("label", "clean-option", "Ambiguous dates"); const assumption = make("select"); assumption.dataset.cleanOption = "assumption"; [["leave", "Leave ambiguous dates unchanged"], ["mdy", "Interpret as month/day"], ["dmy", "Interpret as day/month"]].forEach(([value, text]) => { const option = make("option", "", text); option.value = value; assumption.append(option); }); assumptionLabel.append(assumption); body.append(assumptionLabel);
          if (scan.dateAmbiguous.length) body.append(make("p", "clean-ambiguity", `${scan.dateAmbiguous.length} date${scan.dateAmbiguous.length === 1 ? " is" : "s are"} ambiguous. Choose an interpretation before applying.`));
        }
        if (tool.id === "numbers") {
          body.append(make("span", "clean-option-label", "Choose numeric columns")); appendColumnChoices(body, scan.headers.filter((column) => scan.numbers.some((change) => change.column === column) || scan.amountColumn === column), `clean-num-${tool.id}`);
          if (scan.numberAmbiguous.length) body.append(make("p", "clean-ambiguity", `${scan.numberAmbiguous.length} numeric value${scan.numberAmbiguous.length === 1 ? " is" : "s are"} ambiguous and will remain unchanged.`));
        }
        const actions = make("div", "clean-tool-actions");
        const preview = make("button", "button secondary", "Preview changes"); preview.type = "button"; preview.dataset.cleanPreview = tool.id; actions.append(preview);
        if (tool.applied) { const restore = make("button", "button quiet", "Restore latest"); restore.type = "button"; restore.dataset.cleanRestore = tool.id; restore.setAttribute("aria-label", `Restore the latest ${tool.label} operation`); actions.append(restore); }
        body.append(actions);
      } else {
        body.append(make("span", "clean-unavailable", `Available in ${tool.tier === "plus" ? "Plus" : "Standard"} in a later implementation phase.`));
      }
      card.append(body); panel.append(card);
    });
  }

  function renderCleanPreview() {
    const panel = $("cleanPreview"), cleaner = cleanerModel(), preview = cleaner?.getPreview();
    if (!panel || !cleaner) return;
    panel.classList.toggle("hidden", !preview);
    if (!preview) return;
    const shown = preview.changes.slice(0, 100);
    $("cleanPreviewTitle").textContent = `Preview ${cleaner.getTools().find((tool) => tool.id === preview.toolId)?.label || "changes"}`;
    $("cleanPreviewMeta").textContent = `${preview.selectedCount} of ${preview.count} suggested changes selected${preview.count > shown.length ? ` · showing first ${shown.length}` : ""}.`;
    const head = $("cleanPreviewHead"); head.replaceChildren(); ["Include", "Row", "Column", "Before", "After", "Reason"].forEach((label) => { const th = make("th", "", label); th.scope = "col"; head.append(th); });
    const body = $("cleanPreviewRows"); body.replaceChildren();
    shown.forEach((change) => {
      const key = change.key || (change.row ? change.id : `${change.id}::${change.column}`);
      const row = make("tr");
      const include = make("td"); const checkbox = make("input"); checkbox.type = "checkbox"; checkbox.checked = Boolean(change.selected); checkbox.dataset.cleanPreviewKey = key; checkbox.setAttribute("aria-label", `Include cleaning change for row ${cleanRowNumber(change.id)}${change.column ? `, ${change.column}` : ""}`); include.append(checkbox); row.append(include);
      row.append(make("th", "", cleanRowNumber(change.id))); row.lastChild.scope = "row";
      row.append(make("td", "", change.column || "Entire row"), make("td", "clean-before", String(change.before ?? "")), make("td", "clean-after", String(change.after ?? "")), make("td", "", change.reason)); body.append(row);
    });
    $("cleanApplyPreview").disabled = preview.selectedCount === 0;
    $("cleanSelectAllPreview").disabled = preview.count === 0;
  }

  function renderCleanSummary(summary = cleanerModel()?.getSummary() || state.cleanSummary) {
    const cleaner = cleanerModel();
    if (!cleaner || !summary) {
      $("cleanStatus").textContent = "Scan not run";
      return;
    }
    state.cleanSummary = summary;
    $("cleanStatus").textContent = `Scan complete · ${summary.rowsScanned} rows scanned`;
    const core = window.LedgerLiftCore?.state;
    const fileName = core?.fileMeta?.name || `${core?.name || "transactions"}.csv`;
    const setMeta = (id, label, value) => $(id)?.replaceChildren(make("span", "clean-meta-label", label), make("strong", "", String(value)));
    setMeta("cleanFileMeta", "File", fileName); setMeta("cleanRowsMeta", "Active rows", summary.rowsScanned); setMeta("cleanIssueMeta", "Rows with suggestions", summary.issueRows); setMeta("cleanSuggestedMeta", "Suggested changes", summary.suggestedChanges); setMeta("cleanAppliedMeta", "Clean changes applied", `${summary.cellsChanged} cells · ${summary.rowsRemoved} rows removed`);
    $("cleanNotice").textContent = cleaner.getState().notice || "Cleaning is optional. Preview changes before applying them.";
    const summaryPanel = $("cleanSummary"); summaryPanel.replaceChildren();
    const list = make("ul", "clean-summary-list"); [["Rows scanned", summary.rowsScanned], ["Rows with suggestions", summary.issueRows], ["Cells changed by cleaning", summary.cellsChanged], ["Rows removed by cleaning", summary.rowsRemoved], ["Exact duplicate rows", summary.exactDuplicates], ["Possible duplicates", summary.possibleDuplicates], ["Ambiguous dates", summary.ambiguousDates], ["Unrecognized numeric values", summary.unrecognizedNumbers], ["Possible summary rows", summary.summaries]].forEach(([label, value]) => list.append(make("li", "", `${label}: ${value}`))); summaryPanel.append(make("h4", "", "Cleaning summary"), list);
    const operations = cleaner.getOperations();
    const history = $("cleanHistory");
    history.querySelectorAll(".clean-history-list").forEach((node) => node.remove());
    const historyList = make("ul", "clean-history-list");
    operations.slice().reverse().forEach((operation, index) => {
      const item = make("li", ""); item.append(make("span", "", `${operation.label} · ${operation.changes.length} cells · ${operation.removedRows.length} rows`));
      if (index === 0) { const restore = make("button", "button quiet", "Restore operation"); restore.type = "button"; restore.dataset.cleanRestoreOperation = operation.id; item.append(restore); }
      const firstChange = operation.changes[0];
      if (firstChange) { const restoreCell = make("button", "button quiet", "Restore cell"); restoreCell.type = "button"; restoreCell.dataset.cleanRestoreCell = `${firstChange.id}::${firstChange.column}`; item.append(restoreCell); const restoreRow = make("button", "button quiet", "Restore row"); restoreRow.type = "button"; restoreRow.dataset.cleanRestoreRow = firstChange.id; item.append(restoreRow); }
      historyList.append(item);
    });
    if (!operations.length) historyList.append(make("li", "clean-muted", "No cleaning operations have been applied."));
    history.append(historyList);
    $("cleanUndo").disabled = !cleaner.getState().canUndo; $("cleanRedo").disabled = !cleaner.getState().canRedo; $("restoreAllClean").disabled = !summary.cellsChanged && !summary.rowsRemoved; $("continueToMapColumns").disabled = summary.rowsScanned === 0;
    renderCleanTools(); renderCleanPreview();
  }

  function allRowsValid() {
    const transactions = window.LedgerLiftCore?.state?.tx || [];
    return transactions.length > 0 && transactions.every((transaction) => transaction.ok);
  }

  function available(step) {
    if (step === 1) return true;
    if (step === 2) return state.imported;
    if (step === 3) return state.imported && (reviewModel()?.getState().totalRows || 0) > 0;
    if (step === 4) return state.imported && state.cleanVisited && state.cleaned && (reviewModel()?.getState().totalRows || 0) > 0;
    if (step === 5) return state.cleaned && state.mapColumnsVisited && Boolean(mapperModel()?.getValidation().canContinue);
    if (step === 6) return state.mapAccountsVisited && Boolean(accountMapperModel()?.getValidation().canContinue);
    if (step === 7) return state.analyzed;
    if (step === 8) return state.previewed && allRowsValid();
    return false;
  }

  function completed(step) {
    if (step === 1) return state.imported;
    if (step === 2) return state.cleanVisited;
    if (step === 3) return state.cleanVisited && state.cleaned;
    if (step === 4) return state.mapColumnsVisited && Boolean(mapperModel()?.getValidation().canContinue);
    if (step === 5) return state.mapAccountsVisited && Boolean(accountMapperModel()?.getValidation().canContinue);
    if (step === 6) return state.previewed;
    if (step === 7 || step === 8) return state.exported;
    return false;
  }

  function stepStatus(step) {
    if (step.unavailable) return "Coming later";
    if (completed(step.id)) return "Complete";
    if (state.current === step.id) return "Current";
    if (!available(step.id)) return "Locked";
    return "Ready";
  }

  function messageForCurrentStep() {
    if (state.current === 1) return window.LedgerLiftCore?.state?.imported ? "Your confirmed import is still retained. Review its metadata or remove the file to start over." : window.LedgerLiftCore?.state?.importPreview ? "The file is inspected locally. Review the detected format, header row, and column suggestions before confirming the import." : "Upload a CSV, TSV, or supported XLSX file. The source stays on this device while you work.";
    if (state.current === 2) return state.imported ? ((reviewModel()?.getState().totalRows || 0) > 0 ? "Your file is loaded. Review and edit the imported rows, then continue to cleaning." : "No transaction rows remain. Add or restore at least one row before continuing.") : "Import a file to unlock the review step.";
    if (state.current === 3) return "Normalize dates, descriptions, and amounts locally. Rows that remain invalid will be called out.";
    if (state.current === 4) return "Choose the date, description, and signed amount columns from your file.";
    if (state.current === 5) return "Assign the source account and review account, category, party, class, and customer/job values before validation.";
    if (state.current === 6) {
      const transactions = window.LedgerLiftCore?.state?.tx || [];
      const ready = transactions.filter((transaction) => transaction.ok).length;
      return state.analyzed ? `${ready} of ${transactions.length} rows are ready. Review any rows marked Review before continuing.` : "Validate your mapping to check dates, amounts, and rows.";
    }
    if (state.current === 7) return "Preview the normalized rows before you export. Raw IIF syntax stays hidden unless a future advanced view is added.";
    return allRowsValid() ? "Your validated file is ready to download as IIF." : "Finish validation before exporting.";
  }

  function render() {
    const shell = $("ledgerliftWorkspace");
    if (!shell) return;
    shell.dataset.currentStep = String(state.current);
    $("workflowMessage").textContent = messageForCurrentStep();
    delete $("workflowMessage").dataset.error;
    document.body.classList.toggle("ledgerlift-has-data", state.imported);
    document.body.classList.toggle("ledgerlift-pre-map-active", state.current < 4 && state.imported);
    document.body.classList.toggle("ledgerlift-map-active", state.current >= 4 && state.imported);
    document.body.classList.toggle("ledgerlift-map-columns-active", state.current === 4 && state.imported);
    document.body.classList.toggle("ledgerlift-map-accounts-active", state.current === 5 && state.imported);
    steps.forEach((step) => {
      const item = shell.querySelector(`[data-step="${step.id}"]`);
      const button = shell.querySelector(`[data-step-button="${step.id}"]`);
      if (!item) return;
      item.dataset.state = step.unavailable ? "unavailable" : state.current === step.id ? "current" : completed(step.id) ? "complete" : available(step.id) ? "available" : "locked";
      if (button) {
        button.disabled = !available(step.id);
        button.setAttribute("aria-disabled", String(button.disabled));
        if (state.current === step.id) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current");
        button.querySelector(".workflow-step-status").textContent = stepStatus(step);
      }
    });
    const review = $("workspaceReview");
    review.classList.toggle("hidden", !state.imported || state.current !== 2);
    if (state.imported && state.current === 2) renderReviewTable();
    const entry = $("workspaceEntry");
    entry.classList.toggle("hidden", state.current !== 1);
    const importPreview = $("importPreview");
    const corePreview = window.LedgerLiftCore?.state?.importPreview;
    importPreview.classList.toggle("hidden", !corePreview || state.current !== 1);
    if (corePreview) renderImportPreview(corePreview);
    const cleanPanel = $("workspaceClean");
    cleanPanel.classList.toggle("hidden", !state.imported || state.current !== 3);
    const mapPanel = $("workspaceMapColumns");
    mapPanel.classList.toggle("hidden", !state.imported || state.current !== 4);
    const accountPanel = $("workspaceMapAccounts");
    accountPanel.classList.toggle("hidden", !state.imported || state.current !== 5);
    renderCleanSummary();
    if (state.imported && state.current === 4) renderMapping();
    if (state.imported && state.current === 5) renderAccountMapping();
    $("continueToPreview").hidden = !state.analyzed;
    $("continueToExport").disabled = !state.previewed || !allRowsValid();
    $("download").hidden = !state.previewed || !allRowsValid();
  }

  function targetFor(step) {
    if (step === 1) return $("converter");
    if (step === 2) return $("workspaceReview");
    if (step === 3) return $("workspaceClean");
    if (step === 4) return $("workspaceMapColumns");
    if (step === 5) return $("workspaceMapAccounts");
    if (step === 6 || step === 7) return $("validation");
    if (step === 8) return $("download");
    return $("ledgerliftWorkspace");
  }

  function setStep(step) {
    if (!available(step) && step !== state.current) return;
    if (step === 3) { state.cleanVisited = true; window.LedgerLiftCore?.markCleanReady?.(); state.cleaned = true; }
    state.current = step;
    render();
    const target = targetFor(step);
    if (target && step !== 1) target.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function syncFromCore() {
    const coreState = window.LedgerLiftCore?.state;
    state.imported = Boolean(coreState?.imported);
    state.cleaned = Boolean(coreState?.cleaned);
    state.cleanSummary = coreState?.cleaner?.getSummary?.() || coreState?.cleanSummary || null;
    state.analyzed = Boolean(coreState?.tx?.length);
    if (!state.imported) {
      state.current = 1;
      state.cleanVisited = false;
      state.mapColumnsVisited = false;
      state.mapAccountsVisited = false;
      state.cleaned = false;
      state.cleanSummary = null;
      state.analyzed = false;
      state.previewed = false;
      state.exported = false;
    }
  }

  injectStyles();
  document.body.dataset.ledgerliftTier = tier;
  createShell();
  createResultsControls();
  render();

  window.addEventListener("ledgerlift:review-changed", (event) => {
    if (!reviewModel()) return;
    syncReviewRows();
    if (event.detail?.type === "edit") {
      renderReviewControls();
      document.querySelectorAll("#workspaceReviewRows tr[data-row-id]").forEach((row) => {
        const entry = reviewModel().getEntry(row.dataset.rowId);
        if (!entry) return;
        updateReviewRowAfterEdit(row, entry, reviewModel());
      });
      if (state.current === 3) renderCleanSummary();
      return;
    }
    renderReviewTable();
  });
  window.addEventListener("ledgerlift:import-preview-ready", (event) => { state.imported = false; state.current = 1; renderImportPreview(event.detail?.preview); render(); $("importPreviewTitle")?.focus(); });
  window.addEventListener("ledgerlift:import-error", (event) => { $("workflowMessage").textContent = event.detail?.message || "LedgerLift could not read that file. Choose another file and try again."; $("workflowMessage").dataset.error = "true"; $("workflowMessage")?.focus(); });
  window.addEventListener("ledgerlift:data-loaded", () => { accountSelected.clear(); state.imported = true; state.cleaned = false; state.cleanVisited = false; state.cleanSummary = null; state.mapColumnsVisited = false; state.mapAccountsVisited = false; state.analyzed = false; state.previewed = false; state.exported = false; state.current = 2; renderReviewTable(); render(); $("workspaceReviewTitle")?.focus(); });
  window.addEventListener("ledgerlift:clean-state-changed", (event) => { state.cleanSummary = cleanerModel()?.getSummary?.() || state.cleanSummary; if (event.detail?.type !== "review-change") state.cleaned = true; if (state.current === 3) { if (event.detail?.type === "preview") renderCleanPreview(); else render(); } });
  window.addEventListener("ledgerlift:mapping-changed", () => { accountMapperModel()?.sync(); if (state.current === 4) renderMapping(); else { state.mapAccountsVisited = false; state.analyzed = false; if (state.current === 5) renderAccountMapping(); render(); } });
  window.addEventListener("ledgerlift:account-mapping-changed", () => { if (state.current === 5) renderAccountMapping(); });
  window.addEventListener("ledgerlift:cleaned", (event) => { state.imported = true; state.cleaned = true; state.cleanSummary = event.detail?.summary || null; state.analyzed = false; state.mapColumnsVisited = false; state.mapAccountsVisited = false; state.previewed = false; state.exported = false; accountSelected.clear(); render(); });
  window.addEventListener("ledgerlift:review-edited", () => { state.cleaned = false; state.cleanSummary = cleanerModel()?.getSummary?.() || null; state.analyzed = false; state.mapColumnsVisited = false; state.mapAccountsVisited = false; state.previewed = false; state.exported = false; state.current = 2; render(); });
  window.addEventListener("ledgerlift:analyzed", () => { state.imported = true; state.mapColumnsVisited = true; state.mapAccountsVisited = true; state.analyzed = true; state.previewed = false; state.exported = false; state.current = 6; render(); });
  window.addEventListener("ledgerlift:cleared", () => { accountSelected.clear(); syncFromCore(); state.current = 1; render(); });
  window.addEventListener("ledgerlift:exported", () => { state.exported = true; state.current = 8; render(); });
  window.LedgerLiftWorkspace = { state, setStep, canExport: () => state.previewed && allRowsValid() };
})();
