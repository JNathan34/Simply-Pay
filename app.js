(function () {
  "use strict";

  const STORAGE_KEY = "hoursLogApp.v1";
  const OLD_STORAGE_KEY = "simpleInvoiceApp.v1";
  const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
  const GOOGLE_SAVE_FILE_NAME = "hours-log-save.json";
  const DEFAULT_GOOGLE_CLIENT_ID = "664652124946-e7abvmled21k144u686pfbie60pu5giu.apps.googleusercontent.com";

  const toIsoDate = (date) => {
    const localDate = new Date(date);
    localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
    return localDate.toISOString().slice(0, 10);
  };

  const todayIso = () => toIsoDate(new Date());

  const defaultState = {
    entries: [],
    invoices: [],
    invoiceDraft: {
      invoiceDate: todayIso(),
      billNote: "Thank you for your business",
    },
    settings: {
      businessName: "A nathan Brickwork",
      yourName: "Jacob Nathan",
      businessContact: "",
      bankName: "Jacob Nathan",
      accountNumber: "58925008",
      sortCode: "09-01-28",
      currency: "GBP",
      defaultRate: "",
      defaultWork: "Manual Labour",
      nextInvoiceNumber: "14",
      googleClientId: DEFAULT_GOOGLE_CLIENT_ID,
      darkMode: false,
    },
    account: null,
    updatedAt: "",
  };

  let state = loadState();
  let toastTimer = null;
  let googleRenderTimer = null;
  let lastRenderedGoogleClientId = "";
  let googleTokenClient = null;
  let lastTokenClientId = "";
  let googleAccessToken = "";
  let googleDriveFileId = "";
  let googleTokenRequest = null;
  let cloudSyncTimer = null;
  let cloudSyncing = false;
  let cloudSyncPending = false;
  let applyingCloudState = false;
  let lastGoogleSyncAt = "";

  const els = {
    entryForm: document.querySelector("#entryForm"),
    invoiceForm: document.querySelector("#invoiceForm"),
    settingsForm: document.querySelector("#settingsForm"),
    entryFormTitle: document.querySelector("#entryFormTitle"),
    entryId: document.querySelector("#entryId"),
    workDate: document.querySelector("#workDate"),
    workDescription: document.querySelector("#workDescription"),
    hoursWorked: document.querySelector("#hoursWorked"),
    saveEntry: document.querySelector("#saveEntry span"),
    cancelEdit: document.querySelector("#cancelEdit"),
    logList: document.querySelector("#logList"),
    emptyLog: document.querySelector("#emptyLog"),
    logCount: document.querySelector("#logCount"),
    clearLog: document.querySelector("#clearLog"),
    invoiceDate: document.querySelector("#invoiceDate"),
    invoiceNumber: document.querySelector("#invoiceNumber"),
    billNote: document.querySelector("#billNote"),
    createInvoice: document.querySelector("#createInvoice"),
    invoiceHelp: document.querySelector("#invoiceHelp"),
    historyList: document.querySelector("#historyList"),
    emptyHistory: document.querySelector("#emptyHistory"),
    historyCount: document.querySelector("#historyCount"),
    summaryHours: document.querySelector("#summaryHours"),
    summaryRate: document.querySelector("#summaryRate"),
    summaryTotal: document.querySelector("#summaryTotal"),
    summaryInvoices: document.querySelector("#summaryInvoices"),
    openSettings: document.querySelector("#openSettings"),
    closeSettings: document.querySelector("#closeSettings"),
    settingsDone: document.querySelector("#settingsDone"),
    settingsOverlay: document.querySelector("#settingsOverlay"),
    accountName: document.querySelector("#accountName"),
    accountEmail: document.querySelector("#accountEmail"),
    accountAvatar: document.querySelector("#accountAvatar"),
    googleButton: document.querySelector("#googleButton"),
    googleStatus: document.querySelector("#googleStatus"),
    signOutGoogle: document.querySelector("#signOutGoogle"),
    syncNowGoogle: document.querySelector("#syncNowGoogle"),
    businessName: document.querySelector("#businessName"),
    yourName: document.querySelector("#yourName"),
    businessContact: document.querySelector("#businessContact"),
    bankName: document.querySelector("#bankName"),
    accountNumber: document.querySelector("#accountNumber"),
    sortCode: document.querySelector("#sortCode"),
    currency: document.querySelector("#currency"),
    defaultRate: document.querySelector("#defaultRate"),
    defaultWork: document.querySelector("#defaultWork"),
    nextInvoiceNumber: document.querySelector("#nextInvoiceNumber"),
    darkMode: document.querySelector("#darkMode"),
    toast: document.querySelector("#toast"),
  };

  function loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (stored && typeof stored === "object") {
        return normalizeState(stored);
      }
    } catch (error) {
      // Fall through to migration/default.
    }

    try {
      const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY));
      if (old && typeof old === "object") {
        return migrateOldState(old);
      }
    } catch (error) {
      // Fall through to default.
    }

    return structuredClone(defaultState);
  }

  function normalizeState(stored) {
    return {
      ...structuredClone(defaultState),
      ...stored,
      entries: Array.isArray(stored.entries) ? stored.entries : [],
      invoices: Array.isArray(stored.invoices) ? stored.invoices.map(normalizeInvoice) : [],
      invoiceDraft: { ...defaultState.invoiceDraft, ...(stored.invoiceDraft || {}) },
      settings: normalizeSettings(stored.settings || {}),
      account: stored.account || null,
      updatedAt: stored.updatedAt || "",
    };
  }

  function normalizeInvoice(invoice) {
    const paidAt = invoice.paidAt ? String(invoice.paidAt).slice(0, 10) : "";
    return {
      ...invoice,
      status: invoice.status || (paidAt ? "paid" : "unpaid"),
      paidAt,
    };
  }

  function migrateOldState(old) {
    const oldSettings = old.settings || {};
    const oldBill = old.bill || {};
    const migrated = structuredClone(defaultState);
    migrated.settings = normalizeSettings({
      ...oldSettings,
      nextInvoiceNumber: incrementInvoiceNumber(oldBill.invoiceNumber || oldSettings.nextInvoiceNumber || "13"),
    });
    migrated.invoiceDraft = {
      invoiceDate: oldBill.invoiceDate || todayIso(),
      billNote: oldBill.billNote || defaultState.invoiceDraft.billNote,
    };
    migrated.account = old.account || null;
    return migrated;
  }

  function normalizeSettings(settings) {
    return {
      ...defaultState.settings,
      ...settings,
      nextInvoiceNumber: String(settings.nextInvoiceNumber || defaultState.settings.nextInvoiceNumber),
      googleClientId: DEFAULT_GOOGLE_CLIENT_ID,
      darkMode: Boolean(settings.darkMode),
    };
  }

  function saveState(options = {}) {
    const { touch = true, queueSync = true } = options;
    if (touch) state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (queueSync && !applyingCloudState) queueCloudSync();
  }

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function asNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function roundMoney(value) {
    return Math.round((asNumber(value) + Number.EPSILON) * 100) / 100;
  }

  function currentHours() {
    return state.entries.reduce((total, entry) => total + asNumber(entry.hours), 0);
  }

  function hourlyRate() {
    return asNumber(state.settings.defaultRate);
  }

  function currentTotal() {
    return roundMoney(currentHours() * hourlyRate());
  }

  function formatHours(value) {
    return asNumber(value).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  function money(value, currency = state.settings.currency || "GBP") {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(asNumber(value));
  }

  function plainMoney(value, currency = state.settings.currency || "GBP") {
    return money(value, currency).replace(/\s/g, "");
  }

  function parseIsoDate(isoDate) {
    const [year, month, day] = String(isoDate || todayIso())
      .split("-")
      .map(Number);
    return new Date(year, month - 1, day);
  }

  function ordinalDay(day) {
    if (day > 3 && day < 21) return `${day}th`;
    const suffix = { 1: "st", 2: "nd", 3: "rd" }[day % 10] || "th";
    return `${day}${suffix}`;
  }

  function formatInvoiceDate(isoDate) {
    const date = parseIsoDate(isoDate);
    const day = ordinalDay(date.getDate());
    const month = new Intl.DateTimeFormat(undefined, { month: "long" }).format(date);
    return `${day} ${month} ${date.getFullYear()}`;
  }

  function formatShortDate(isoDate) {
    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(parseIsoDate(isoDate));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function sanitizeFileName(value) {
    return String(value || "invoice")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .slice(0, 80);
  }

  function incrementInvoiceNumber(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(.*?)(\d+)$/);
    if (!match) return text ? `${text}-2` : "1";

    const [, prefix, number] = match;
    return `${prefix}${String(Number(number) + 1).padStart(number.length, "0")}`;
  }

  function syncFormsFromState() {
    els.workDate.value = todayIso();
    els.workDescription.value = state.settings.defaultWork || "Manual Labour";
    els.hoursWorked.value = "";
    els.invoiceDate.value = state.invoiceDraft.invoiceDate || todayIso();
    els.billNote.value = state.invoiceDraft.billNote || defaultState.invoiceDraft.billNote;
    els.invoiceNumber.value = state.settings.nextInvoiceNumber || "1";

    Object.entries(state.settings).forEach(([key, value]) => {
      if (!els[key]) return;
      if (els[key].type === "checkbox") {
        els[key].checked = Boolean(value);
      } else {
        els[key].value = Array.isArray(value) ? value.join("\n") : value;
      }
    });
  }

  function syncSettingsFromForm() {
    const previousDefaultWork = state.settings.defaultWork;

    state.settings = normalizeSettings({
      businessName: els.businessName.value.trim(),
      yourName: els.yourName.value.trim(),
      businessContact: els.businessContact.value.trim(),
      bankName: els.bankName.value.trim(),
      accountNumber: els.accountNumber.value.trim(),
      sortCode: els.sortCode.value.trim(),
      currency: els.currency.value,
      defaultRate: els.defaultRate.value,
      defaultWork: els.defaultWork.value.trim() || "Manual Labour",
      nextInvoiceNumber: els.nextInvoiceNumber.value.trim() || "1",
      darkMode: els.darkMode.checked,
    });

    if (!els.workDescription.value || els.workDescription.value === previousDefaultWork) {
      els.workDescription.value = state.settings.defaultWork;
    }
    els.invoiceNumber.value = state.settings.nextInvoiceNumber;
    saveState();
    render();
  }

  function syncInvoiceDraftFromForm() {
    state.invoiceDraft = {
      invoiceDate: els.invoiceDate.value || todayIso(),
      billNote: els.billNote.value.trim() || defaultState.invoiceDraft.billNote,
    };
    saveState();
  }

  function submitEntry(event) {
    event.preventDefault();

    const hours = asNumber(els.hoursWorked.value);
    if (hours <= 0) {
      showToast("Enter hours greater than zero.");
      return;
    }

    const entry = {
      id: els.entryId.value || uid(),
      date: els.workDate.value || todayIso(),
      work: els.workDescription.value.trim() || state.settings.defaultWork || "Manual Labour",
      hours,
      createdAt: new Date().toISOString(),
    };

    if (els.entryId.value) {
      const existing = state.entries.find((item) => item.id === entry.id);
      entry.createdAt = existing?.createdAt || entry.createdAt;
      state.entries = state.entries.map((item) => (item.id === entry.id ? entry : item));
      showToast("Work day updated.");
    } else {
      state.entries.push(entry);
      showToast("Work day added.");
    }

    resetEntryForm();
    saveState();
    render();
  }

  function resetEntryForm() {
    els.entryId.value = "";
    els.workDate.value = todayIso();
    els.workDescription.value = state.settings.defaultWork || "Manual Labour";
    els.hoursWorked.value = "";
    els.entryFormTitle.textContent = "Add Work Day";
    els.saveEntry.textContent = "Add To Log";
    els.cancelEdit.classList.add("hidden");
  }

  function editEntry(id) {
    const entry = state.entries.find((item) => item.id === id);
    if (!entry) return;

    els.entryId.value = entry.id;
    els.workDate.value = entry.date;
    els.workDescription.value = entry.work || state.settings.defaultWork || "Manual Labour";
    els.hoursWorked.value = entry.hours;
    els.entryFormTitle.textContent = "Edit Work Day";
    els.saveEntry.textContent = "Update Log";
    els.cancelEdit.classList.remove("hidden");
    els.hoursWorked.focus();
  }

  function deleteEntry(id) {
    state.entries = state.entries.filter((entry) => entry.id !== id);
    saveState();
    render();
    showToast("Work day deleted.");
  }

  function clearLog() {
    if (!state.entries.length) return;
    state.entries = [];
    saveState();
    resetEntryForm();
    render();
    showToast("Current log cleared.");
  }

  function createInvoice() {
    syncInvoiceDraftFromForm();

    if (!state.entries.length) {
      showToast("Add work days before creating an invoice.");
      return;
    }
    if (hourlyRate() <= 0) {
      showToast("Set your hourly rate in Settings first.");
      openSettings();
      return;
    }

    const entries = sortedEntries(state.entries).map((entry) => ({ ...entry }));
    const hours = entries.reduce((total, entry) => total + asNumber(entry.hours), 0);
    const rate = hourlyRate();
    const total = roundMoney(hours * rate);
    const number = String(state.settings.nextInvoiceNumber || "1").trim();
    const invoice = {
      id: uid(),
      number,
      date: state.invoiceDraft.invoiceDate || todayIso(),
      note: state.invoiceDraft.billNote || defaultState.invoiceDraft.billNote,
      entries,
      hours,
      rate,
      total,
      currency: state.settings.currency,
      status: "unpaid",
      paidAt: "",
      createdAt: new Date().toISOString(),
      periodStart: entries[0]?.date || todayIso(),
      periodEnd: entries[entries.length - 1]?.date || todayIso(),
      details: {
        businessName: state.settings.businessName,
        yourName: state.settings.yourName,
        businessContact: state.settings.businessContact,
        bankName: state.settings.bankName,
        accountNumber: state.settings.accountNumber,
        sortCode: state.settings.sortCode,
      },
    };

    state.invoices.unshift(invoice);
    state.entries = [];
    state.settings.nextInvoiceNumber = incrementInvoiceNumber(number);
    state.invoiceDraft.invoiceDate = todayIso();
    saveState();
    resetEntryForm();
    syncFormsFromState();
    render();
    showToast(`Invoice ${invoice.number} created.`);
  }

  function sortedEntries(entries) {
    return [...entries].sort((a, b) => `${a.date}${a.createdAt}`.localeCompare(`${b.date}${b.createdAt}`));
  }

  function render() {
    applyTheme();
    renderSummary();
    renderLog();
    renderHistory();
    renderAccount();
    scheduleGoogleSignIn();
    refreshIcons();
  }

  function renderSummary() {
    const hours = currentHours();
    els.summaryHours.textContent = formatHours(hours);
    els.summaryRate.textContent = money(hourlyRate());
    els.summaryTotal.textContent = money(currentTotal());
    els.summaryInvoices.textContent = state.invoices.length;
    els.createInvoice.disabled = !state.entries.length || hourlyRate() <= 0;
    els.invoiceHelp.textContent = state.entries.length
      ? `${formatHours(hours)} unbilled hours ready for invoice ${state.settings.nextInvoiceNumber || "1"}.`
      : "Add hours first, then create an invoice when you are ready.";
    els.invoiceNumber.value = state.settings.nextInvoiceNumber || "1";
  }

  function renderLog() {
    const entries = sortedEntries(state.entries);
    els.logCount.textContent = `${entries.length} ${entries.length === 1 ? "work day" : "work days"}`;
    els.emptyLog.classList.toggle("hidden", entries.length > 0);
    els.logList.innerHTML = entries
      .map(
        (entry) => `
          <article class="work-card">
            <div class="work-card-header">
              <div>
                <strong>${escapeHtml(formatShortDate(entry.date))}</strong>
                <span>${escapeHtml(entry.work || "Manual Labour")}</span>
              </div>
              <span class="badge">${formatHours(entry.hours)} hrs</span>
            </div>
            <div class="work-meta">
              <span>${money(asNumber(entry.hours) * hourlyRate())}</span>
            </div>
            <div class="card-actions">
              <button class="icon-button ghost" type="button" data-action="edit-entry" data-id="${entry.id}">
                <i data-lucide="pencil"></i>
                <span>Edit</span>
              </button>
              <button class="icon-button ghost danger-text" type="button" data-action="delete-entry" data-id="${entry.id}">
                <i data-lucide="trash-2"></i>
                <span>Delete</span>
              </button>
            </div>
          </article>
        `
      )
      .join("");
  }

  function renderHistory() {
    els.historyCount.textContent = `${state.invoices.length} ${state.invoices.length === 1 ? "invoice" : "invoices"}`;
    els.emptyHistory.classList.toggle("hidden", state.invoices.length > 0);
    els.historyList.innerHTML = state.invoices
      .map((invoice) => {
        const paid = invoiceIsPaid(invoice);
        return `
          <article class="history-card">
            <div class="history-card-header">
              <div>
                <strong>Invoice ${escapeHtml(invoice.number)}</strong>
                <span>${escapeHtml(formatShortDate(invoice.date))}</span>
              </div>
              <div class="history-badges">
                <span class="status-badge ${paid ? "paid" : "unpaid"}">
                  <i data-lucide="${paid ? "check-circle-2" : "clock-3"}"></i>
                  <span>${paid ? "Paid" : "Unpaid"}</span>
                </span>
                <span class="badge">${money(invoice.total, invoice.currency)}</span>
              </div>
            </div>
            <div class="history-meta">
              <span>${formatHours(invoice.hours)} hrs</span>
              <span>${escapeHtml(formatShortDate(invoice.periodStart))} to ${escapeHtml(formatShortDate(invoice.periodEnd))}</span>
              ${paid && invoice.paidAt ? `<span>Paid ${escapeHtml(formatShortDate(invoice.paidAt))}</span>` : ""}
            </div>
            <div class="button-group">
              <button class="icon-button paid-toggle ${paid ? "is-paid" : "is-unpaid"}" type="button" data-action="${paid ? "mark-unpaid" : "mark-paid"}" data-id="${invoice.id}">
                <i data-lucide="${paid ? "rotate-ccw" : "check-circle-2"}"></i>
                <span>${paid ? "Undo Paid" : "Mark Paid"}</span>
              </button>
              <button class="icon-button secondary" type="button" data-action="download-pdf" data-id="${invoice.id}">
                <i data-lucide="file-down"></i>
                <span>PDF</span>
              </button>
              <button class="icon-button secondary" type="button" data-action="download-word" data-id="${invoice.id}">
                <i data-lucide="file-text"></i>
                <span>Word</span>
              </button>
              <button class="icon-button ghost danger-text" type="button" data-action="return-invoice" data-id="${invoice.id}">
                <i data-lucide="undo-2"></i>
                <span>Return To Log</span>
              </button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderAccount() {
    const account = state.account;
    els.signOutGoogle.classList.toggle("hidden", !account);

    if (account) {
      els.accountName.textContent = account.name || "Google account";
      els.accountEmail.textContent = account.email || "Signed in with Google";
      els.accountAvatar.innerHTML = account.picture
        ? `<img src="${escapeHtml(account.picture)}" alt="" />`
        : '<i data-lucide="user"></i>';
      return;
    }

    els.accountName.textContent = "Not signed in";
    els.accountEmail.textContent = "Sign in to sync your hours automatically.";
    els.accountAvatar.innerHTML = '<i data-lucide="user"></i>';
  }

  function handleLogAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "edit-entry") editEntry(button.dataset.id);
    if (button.dataset.action === "delete-entry") deleteEntry(button.dataset.id);
  }

  function handleHistoryAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const invoice = state.invoices.find((item) => item.id === button.dataset.id);
    if (!invoice) return;

    if (button.dataset.action === "download-pdf") exportInvoicePdf(invoice);
    if (button.dataset.action === "download-word") exportInvoiceWord(invoice);
    if (button.dataset.action === "mark-paid") setInvoicePaid(invoice.id, true);
    if (button.dataset.action === "mark-unpaid") setInvoicePaid(invoice.id, false);
    if (button.dataset.action === "return-invoice") returnInvoiceToLog(invoice);
  }

  function invoiceIsPaid(invoice) {
    return invoice.status === "paid" || Boolean(invoice.paidAt);
  }

  function setInvoicePaid(id, paid) {
    const invoice = state.invoices.find((item) => item.id === id);
    if (!invoice) return;

    state.invoices = state.invoices.map((item) =>
      item.id === id
        ? {
            ...item,
            status: paid ? "paid" : "unpaid",
            paidAt: paid ? item.paidAt || todayIso() : "",
          }
        : item
    );
    saveState();
    render();
    showToast(`Invoice ${invoice.number} marked ${paid ? "paid" : "unpaid"}.`);
  }

  function returnInvoiceToLog(invoice) {
    const paidWarning = invoiceIsPaid(invoice) ? " It is marked paid right now." : "";
    const confirmed = window.confirm(
      `Return invoice ${invoice.number} to the current log?${paidWarning} This removes it from invoice history and puts the hours back.`
    );
    if (!confirmed) return;

    const restoredEntries = sortedEntries(invoice.entries).map((entry) => ({
      ...entry,
      id: uid(),
      restoredFromInvoice: invoice.id,
      restoredAt: new Date().toISOString(),
    }));

    state.entries = [...state.entries, ...restoredEntries];
    state.invoices = state.invoices.filter((item) => item.id !== invoice.id);

    if (String(state.settings.nextInvoiceNumber || "").trim() === incrementInvoiceNumber(invoice.number)) {
      state.settings.nextInvoiceNumber = String(invoice.number);
    }

    saveState();
    resetEntryForm();
    syncFormsFromState();
    render();
    showToast(`Invoice ${invoice.number} returned to the current log.`);
  }

  function exportInvoicePdf(invoice) {
    if (!window.jspdf?.jsPDF) {
      showToast("PDF tools are still loading. Try again in a moment.");
      return;
    }

    const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
    const margin = 54;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const details = invoice.details || {};
    const teal = [22, 117, 107];
    const tealDark = [13, 81, 74];
    const mint = [230, 245, 239];
    const line = [215, 226, 222];
    const ink = [23, 33, 31];
    const muted = [99, 113, 109];
    const contentWidth = pageWidth - margin * 2;
    const workTitle = invoice.entries[0]?.work || state.settings.defaultWork || "Manual Labour";
    const paid = invoiceIsPaid(invoice);
    let y = 58;

    doc.setFillColor(...teal);
    doc.rect(0, 0, pageWidth, 12, "F");

    doc.setTextColor(...ink);
    doc.setFont("times", "bold");
    doc.setFontSize(25);
    const businessLines = doc.splitTextToSize(details.businessName || "A nathan Brickwork", contentWidth - 180);
    doc.text(businessLines, margin, y);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...tealDark);
    doc.text("INVOICE", pageWidth - margin, y, { align: "right" });
    doc.setFontSize(10);
    doc.setTextColor(...muted);
    doc.text(`No. ${invoice.number}`, pageWidth - margin, y + 18, { align: "right" });
    if (paid) {
      doc.setFillColor(...mint);
      doc.setDrawColor(...teal);
      doc.roundedRect(pageWidth - margin - 112, y + 30, 112, 24, 6, 6, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...tealDark);
      doc.text(invoice.paidAt ? `PAID ${formatShortDate(invoice.paidAt)}` : "PAID", pageWidth - margin - 56, y + 46, {
        align: "center",
      });
    }

    y += Math.max(54, businessLines.length * 24 + 20);
    doc.setDrawColor(...line);
    doc.line(margin, y, pageWidth - margin, y);
    y += 26;

    const cardGap = 12;
    const cardWidth = (contentWidth - cardGap) / 2;
    drawPdfInfoCard(doc, margin, y, cardWidth, "Invoice Date", formatInvoiceDate(invoice.date), muted, ink);
    drawPdfInfoCard(doc, margin + cardWidth + cardGap, y, cardWidth, "Work Period", `${formatShortDate(invoice.periodStart)} to ${formatShortDate(invoice.periodEnd)}`, muted, ink);
    y += 74;

    doc.setFillColor(...mint);
    doc.setDrawColor(182, 214, 206);
    doc.roundedRect(margin, y, contentWidth, 78, 8, 8, "FD");
    doc.setTextColor(...muted);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("TOTAL AMOUNT DUE", margin + 18, y + 24);
    doc.setTextColor(...tealDark);
    doc.setFontSize(25);
    doc.text(plainMoney(invoice.total, invoice.currency), margin + 18, y + 55);
    doc.setTextColor(...ink);
    doc.setFontSize(11);
    doc.text(`${formatHours(invoice.hours)} hours at ${money(invoice.rate, invoice.currency)} per hour`, pageWidth - margin - 18, y + 32, { align: "right" });
    doc.setTextColor(...muted);
    doc.text(workTitle, pageWidth - margin - 18, y + 52, { align: "right" });
    y += 108;

    doc.setTextColor(...ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Work Summary", margin, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...muted);
    const summaryLines = [
      `${workTitle} across ${invoice.entries.length} ${invoice.entries.length === 1 ? "work day" : "work days"}.`
    ].filter(Boolean);
    summaryLines.forEach((lineText) => {
      const wrapped = doc.splitTextToSize(lineText, contentWidth);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 14 + 4;
    });
    y += 14;

    doc.setFillColor(249, 251, 251);
    doc.setDrawColor(...line);
    doc.roundedRect(margin, y, contentWidth, 84, 8, 8, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...ink);
    doc.text("Payment Details", margin + 16, y + 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...muted);
    doc.text(`Name: ${details.bankName || details.yourName || "Jacob Nathan"}`, margin + 16, y + 45);
    doc.text(`Account Number: ${details.accountNumber || ""}`, margin + 16, y + 63);
    doc.text(`Sort Code: ${details.sortCode || ""}`, margin + 260, y + 63);
    y += 112;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...ink);
    doc.text("Work Log", margin, y);
    y += 16;
    y = drawPdfWorkTable(doc, invoice, margin, y, contentWidth, pageHeight, { teal, line, ink });

    y += 30;
    if (y > pageHeight - 110) {
      doc.addPage();
      y = 72;
    }
    doc.setDrawColor(...line);
    doc.line(margin, y, pageWidth - margin, y);
    y += 26;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...ink);
    doc.text(invoice.note || "Thank you for your business", margin, y);
    y += 42;
    doc.text(details.yourName || details.bankName || "Jacob Nathan", margin, y);

    doc.save(`${invoiceFileName(invoice)}.pdf`);
    showToast(`Invoice ${invoice.number} PDF downloaded.`);
  }

  function drawPdfInfoCard(doc, x, y, width, label, value, muted, ink) {
    doc.setFillColor(249, 251, 251);
    doc.setDrawColor(215, 226, 222);
    doc.roundedRect(x, y, width, 56, 8, 8, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text(label.toUpperCase(), x + 14, y + 20);
    doc.setFontSize(12);
    doc.setTextColor(...ink);
    doc.text(value, x + 14, y + 40);
  }

  function drawPdfWorkTable(doc, invoice, margin, startY, width, pageHeight, colors) {
    const colWidths = [120, width - 210, 90];
    const headers = ["Date", "Work", "Hours"];
    let y = startY;

    const drawHeader = () => {
      doc.setFillColor(...colors.teal);
      doc.rect(margin, y, width, 28, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      let x = margin;
      headers.forEach((header, index) => {
        doc.text(header, x + 8, y + 18);
        x += colWidths[index];
      });
      y += 28;
    };

    drawHeader();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    sortedEntries(invoice.entries).forEach((entry, index) => {
      if (y > pageHeight - 88) {
        doc.addPage();
        y = 72;
        drawHeader();
      }

      const rowHeight = 30;
      if (index % 2 === 0) {
        doc.setFillColor(249, 251, 251);
        doc.rect(margin, y, width, rowHeight, "F");
      }
      doc.setDrawColor(...colors.line);
      doc.rect(margin, y, width, rowHeight);
      doc.setTextColor(...colors.ink);
      let x = margin;
      doc.text(formatShortDate(entry.date), x + 8, y + 19);
      x += colWidths[0];
      doc.text(doc.splitTextToSize(entry.work || "Manual Labour", colWidths[1] - 16), x + 8, y + 19);
      x += colWidths[1];
      doc.text(formatHours(entry.hours), x + colWidths[2] - 8, y + 19, { align: "right" });
      y += rowHeight;
    });

    return y;
  }

  function exportInvoiceWord(invoice) {
    const details = invoice.details || {};
    const paid = invoiceIsPaid(invoice);
    const rows = sortedEntries(invoice.entries)
      .map(
        (entry, index) => `
          <tr style="background:${index % 2 === 0 ? "#f9fbfb" : "#ffffff"};">
            <td>${escapeHtml(formatShortDate(entry.date))}</td>
            <td>${escapeHtml(entry.work || "Manual Labour")}</td>
            <td style="text-align:right;">${formatHours(entry.hours)}</td>
          </tr>
        `
      )
      .join("");

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(invoiceFileName(invoice))}</title>
          <style>
            @page { margin: 0.68in; }
            body { background: #ffffff; color: #17211f; font-family: Calibri, Arial, sans-serif; }
            .accent { height: 10px; background: #16756b; margin: -0.68in -0.68in 30px; }
            table { border-collapse: collapse; width: 100%; }
            .header td { border: 0; padding: 0 0 22px; vertical-align: top; }
            .brand { font-family: Cambria, Georgia, serif; font-size: 27pt; font-weight: bold; color: #17211f; }
            .invoice-title { color: #0d514a; font-size: 22pt; font-weight: bold; text-align: right; letter-spacing: 1px; }
            .invoice-no { color: #63716d; font-size: 10pt; font-weight: bold; text-align: right; }
            .paid-stamp { display: inline-block; margin-top: 8px; border: 1px solid #16756b; background: #e6f5ef; color: #0d514a; padding: 5px 9px; font-size: 9pt; font-weight: bold; }
            .rule { border-top: 1px solid #dfe7e4; height: 18px; }
            .meta td { border: 1px solid #dfe7e4; background: #f9fbfb; padding: 11px 13px; width: 50%; }
            .label { color: #63716d; font-size: 8.5pt; font-weight: bold; text-transform: uppercase; }
            .value { color: #17211f; font-size: 12pt; font-weight: bold; padding-top: 4px; }
            .total { margin-top: 18px; border: 1px solid #b6d6ce; background: #e6f5ef; }
            .total td { border: 0; padding: 14px 16px; vertical-align: middle; }
            .total-label { color: #63716d; font-size: 9pt; font-weight: bold; text-transform: uppercase; }
            .total-value { color: #0d514a; font-size: 24pt; font-weight: bold; padding-top: 3px; }
            .summary { color: #17211f; font-size: 11pt; font-weight: bold; text-align: right; }
            h2 { margin: 24px 0 8px; color: #17211f; font-size: 13pt; }
            p { margin: 0 0 5px; font-size: 11pt; line-height: 1.35; }
            .muted { color: #63716d; }
            .payment { margin-top: 18px; border: 1px solid #dfe7e4; background: #f9fbfb; }
            .payment td { border: 0; padding: 12px 14px; }
            .work-log { margin-top: 10px; }
            .work-log th, .work-log td { border: 1px solid #dfe7e4; padding: 8px; font-size: 10.5pt; }
            .work-log th { background: #16756b; color: #ffffff; text-align: left; font-weight: bold; }
            .thanks { margin-top: 24px; border-top: 1px solid #dfe7e4; padding-top: 18px; font-weight: bold; }
            .signature { margin-top: 36px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="accent"></div>
          <table class="header">
            <tr>
              <td style="width:68%;"><div class="brand">${escapeHtml(details.businessName || "A nathan Brickwork")}</div></td>
              <td style="width:32%;">
                <div class="invoice-title">INVOICE</div>
                <div class="invoice-no">No. ${escapeHtml(invoice.number)}</div>
                ${paid ? `<div class="paid-stamp">PAID${invoice.paidAt ? ` ${escapeHtml(formatShortDate(invoice.paidAt))}` : ""}</div>` : ""}
              </td>
            </tr>
          </table>
          <div class="rule"></div>
          <table class="meta">
            <tr>
              <td>
                <div class="label">Invoice Date</div>
                <div class="value">${escapeHtml(formatInvoiceDate(invoice.date))}</div>
              </td>
              <td>
                <div class="label">Work Period</div>
                <div class="value">${escapeHtml(formatShortDate(invoice.periodStart))} to ${escapeHtml(formatShortDate(invoice.periodEnd))}</div>
              </td>
            </tr>
          </table>
          <table class="total">
            <tr>
              <td style="width:48%;">
                <div class="total-label">Total Amount Due</div>
                <div class="total-value">${escapeHtml(plainMoney(invoice.total, invoice.currency))}</div>
              </td>
              <td style="width:52%;" class="summary">
                ${formatHours(invoice.hours)} hours at ${escapeHtml(money(invoice.rate, invoice.currency))} per hour<br />
                ${escapeHtml(invoice.entries[0]?.work || "Manual Labour")}
              </td>
            </tr>
          </table>
          <h2>Work Summary</h2>
          <p>${escapeHtml(invoice.entries[0]?.work || "Manual Labour")} across ${invoice.entries.length} ${invoice.entries.length === 1 ? "work day" : "work days"}.</p>
          <table class="payment">
            <tr>
              <td>
                <div class="label">Payment Details</div>
                <p><strong>Name:</strong> ${escapeHtml(details.bankName || details.yourName || "Jacob Nathan")}</p>
                <p><strong>Account Number:</strong> ${escapeHtml(details.accountNumber || "")}</p>
                <p><strong>Sort Code:</strong> ${escapeHtml(details.sortCode || "")}</p>
              </td>
            </tr>
          </table>
          <h2>Work Log</h2>
          <table class="work-log">
            <thead>
              <tr><th>Date</th><th>Work</th><th>Hours</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p class="thanks">${escapeHtml(invoice.note || "Thank you for your business")}</p>
          <p class="signature">${escapeHtml(details.yourName || details.bankName || "Jacob Nathan")}</p>
        </body>
      </html>
    `;

    downloadBlob(`${invoiceFileName(invoice)}.doc`, html, "application/msword;charset=utf-8");
    showToast(`Invoice ${invoice.number} Word document downloaded.`);
  }

  function invoiceFileName(invoice) {
    const name = invoice.details?.yourName || invoice.details?.bankName || "Invoice";
    return sanitizeFileName(`Invoice ${invoice.number} ${name}`);
  }

  function downloadBlob(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function scheduleGoogleSignIn() {
    window.clearTimeout(googleRenderTimer);
    googleRenderTimer = window.setTimeout(renderGoogleSignIn, 80);
  }

  function renderGoogleSignIn() {
    const clientId = state.settings.googleClientId.trim();
    if (!clientId) {
      lastRenderedGoogleClientId = "";
      lastTokenClientId = "";
      googleTokenClient = null;
      els.googleButton.innerHTML = "";
      els.syncNowGoogle.classList.add("hidden");
      els.googleStatus.textContent = "Google sign-in is ready once a Client ID is saved.";
      return;
    }

    if (!window.google?.accounts?.id) {
      els.googleStatus.textContent = "Google sign-in is loading.";
      return;
    }

    setupGoogleTokenClient(clientId);
    els.syncNowGoogle.classList.toggle("hidden", !state.account);

    if (lastRenderedGoogleClientId === clientId && els.googleButton.children.length) {
      updateGoogleStatus();
      return;
    }

    try {
      els.googleButton.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential,
        auto_select: false,
      });
      window.google.accounts.id.renderButton(els.googleButton, {
        theme: "outline",
        size: "large",
        type: "standard",
        shape: "rectangular",
        text: "signin_with",
        width: 320,
      });
      lastRenderedGoogleClientId = clientId;
      updateGoogleStatus();
    } catch (error) {
      lastRenderedGoogleClientId = "";
      els.googleStatus.textContent = "Google sign-in could not start with that Client ID.";
    }
  }

  function updateGoogleStatus(message) {
    if (message) {
      els.googleStatus.textContent = message;
      return;
    }

    if (window.location.protocol === "file:") {
      els.googleStatus.textContent = "Google sync needs the app opened from http://localhost or HTTPS.";
      return;
    }

    if (state.account && googleAccessToken) {
      els.googleStatus.textContent = lastGoogleSyncAt
        ? `Google Drive sync is on. Last saved ${formatShortDate(lastGoogleSyncAt)}.`
        : "Google Drive sync is on.";
      return;
    }

    els.googleStatus.textContent = state.account
      ? "Signed in. Click Sync now if Google asks for Drive permission."
      : "Google sign-in is ready. Your hours will sync to Google Drive after permission.";
  }

  function setupGoogleTokenClient(clientId) {
    if (!window.google?.accounts?.oauth2 || lastTokenClientId === clientId) return Boolean(googleTokenClient);

    googleAccessToken = "";
    googleTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_DRIVE_SCOPE,
      callback: handleGoogleTokenResponse,
      error_callback: () => {
        if (googleTokenRequest) {
          googleTokenRequest.reject(new Error("Google permission was not completed."));
          googleTokenRequest = null;
        }
      },
    });
    lastTokenClientId = clientId;
    return true;
  }

  async function handleGoogleCredential(response) {
    try {
      const profile = decodeJwtPayload(response.credential);
      state.account = {
        provider: "google",
        sub: profile.sub || "",
        name: profile.name || "",
        email: profile.email || "",
        picture: profile.picture || "",
        signedInAt: new Date().toISOString(),
      };

      if (!state.settings.yourName && state.account.name) {
        state.settings.yourName = state.account.name;
      }
      if (!state.settings.businessContact && state.account.email) {
        state.settings.businessContact = state.account.email;
      }

      saveState({ touch: false, queueSync: false });
      syncFormsFromState();
      render();
      showToast("Signed in with Google.");
      await connectGoogleDriveSync(true);
    } catch (error) {
      showToast("Google sign-in could not be completed.");
    }
  }

  function handleGoogleTokenResponse(response) {
    if (response?.error) {
      if (googleTokenRequest) {
        googleTokenRequest.reject(new Error(response.error));
        googleTokenRequest = null;
      }
      return;
    }

    googleAccessToken = response.access_token || "";
    if (googleTokenRequest) {
      googleTokenRequest.resolve(googleAccessToken);
      googleTokenRequest = null;
    }
  }

  function requestGoogleDriveAccess(prompt = "") {
    const clientId = state.settings.googleClientId.trim();
    if (!clientId) return Promise.reject(new Error("Missing Google Client ID."));
    if (!setupGoogleTokenClient(clientId)) return Promise.reject(new Error("Google tools are still loading."));

    return new Promise((resolve, reject) => {
      googleTokenRequest = { resolve, reject };
      googleTokenClient.requestAccessToken({ prompt });
    });
  }

  async function connectGoogleDriveSync(interactive = false) {
    if (window.location.protocol === "file:") {
      updateGoogleStatus("Google sync needs the app opened from http://localhost or HTTPS.");
      return;
    }

    try {
      updateGoogleStatus("Connecting Google Drive sync...");
      await requestGoogleDriveAccess(interactive ? "consent" : "");
      await pullThenPushGoogleSave();
      updateGoogleStatus();
    } catch (error) {
      googleAccessToken = "";
      updateGoogleStatus("Google Drive sync could not connect. Check the Client ID origin and Drive API, then try Sync now.");
    }
  }

  function queueCloudSync() {
    if (!state.account || !googleAccessToken || applyingCloudState) return;

    window.clearTimeout(cloudSyncTimer);
    cloudSyncTimer = window.setTimeout(() => {
      pushGoogleSave().catch(() => {
        updateGoogleStatus("Google sync paused. Click Sync now to reconnect.");
      });
    }, 900);
  }

  async function pullThenPushGoogleSave() {
    const file = await findGoogleSaveFile();
    googleDriveFileId = file?.id || "";

    if (file?.id) {
      const remotePayload = await downloadGoogleSave(file.id);
      const remoteState = normalizeRemoteState(remotePayload);
      if (shouldUseRemoteState(remoteState)) {
        applyRemoteState(remoteState);
        lastGoogleSyncAt = todayIso();
        showToast("Loaded your Google save.");
        return;
      }
    }

    await pushGoogleSave();
  }

  async function pushGoogleSave() {
    if (!googleAccessToken || !state.account) return;
    if (cloudSyncing) {
      cloudSyncPending = true;
      return;
    }

    cloudSyncing = true;
    try {
      const fileId = googleDriveFileId || (await findGoogleSaveFile())?.id || "";
      if (fileId) {
        googleDriveFileId = fileId;
        await uploadGoogleSave(fileId);
      } else {
        const created = await createGoogleSave();
        googleDriveFileId = created.id || "";
      }
      lastGoogleSyncAt = todayIso();
      updateGoogleStatus();
    } finally {
      cloudSyncing = false;
      if (cloudSyncPending) {
        cloudSyncPending = false;
        queueCloudSync();
      }
    }
  }

  function normalizeRemoteState(payload) {
    const remote = payload?.state && typeof payload.state === "object" ? payload.state : payload;
    return normalizeState(remote || {});
  }

  function shouldUseRemoteState(remoteState) {
    const remoteTime = Date.parse(remoteState.updatedAt || "");
    const localTime = Date.parse(state.updatedAt || "");
    const remoteHasWork = remoteState.entries.length || remoteState.invoices.length;
    const localHasWork = state.entries.length || state.invoices.length;

    if (Number.isFinite(remoteTime) && Number.isFinite(localTime)) return remoteTime > localTime;
    if (remoteHasWork && !localHasWork) return true;
    return Number.isFinite(remoteTime) && !Number.isFinite(localTime);
  }

  function applyRemoteState(remoteState) {
    const currentAccount = state.account;
    applyingCloudState = true;
    state = normalizeState({
      ...remoteState,
      account: currentAccount || remoteState.account,
      settings: remoteState.settings,
    });
    saveState({ touch: false, queueSync: false });
    syncFormsFromState();
    applyingCloudState = false;
    render();
  }

  function googleSavePayload() {
    return {
      app: "hours-log",
      version: 2,
      updatedAt: state.updatedAt || new Date().toISOString(),
      state: {
        entries: state.entries,
        invoices: state.invoices,
        invoiceDraft: state.invoiceDraft,
        settings: state.settings,
        account: state.account,
        updatedAt: state.updatedAt || new Date().toISOString(),
      },
    };
  }

  async function findGoogleSaveFile() {
    const query = encodeURIComponent(`name='${GOOGLE_SAVE_FILE_NAME}' and trashed=false`);
    const data = await googleDriveRequest(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&pageSize=1&fields=files(id,name,modifiedTime)&q=${query}`
    );
    return data.files?.[0] || null;
  }

  async function downloadGoogleSave(fileId) {
    return googleDriveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
  }

  async function createGoogleSave() {
    return uploadGoogleSave("", true);
  }

  async function uploadGoogleSave(fileId, create = false) {
    const metadata = create
      ? { name: GOOGLE_SAVE_FILE_NAME, parents: ["appDataFolder"], mimeType: "application/json" }
      : { name: GOOGLE_SAVE_FILE_NAME, mimeType: "application/json" };
    const body = multipartBody(metadata, JSON.stringify(googleSavePayload(), null, 2));
    const url = create
      ? "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime"
      : `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,modifiedTime`;

    return googleDriveRequest(url, {
      method: create ? "POST" : "PATCH",
      headers: { "Content-Type": `multipart/related; boundary=${body.boundary}` },
      body: body.content,
    });
  }

  function multipartBody(metadata, json) {
    const boundary = `hours_log_${Date.now().toString(36)}`;
    const content = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      json,
      `--${boundary}--`,
      "",
    ].join("\r\n");
    return { boundary, content };
  }

  async function googleDriveRequest(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${googleAccessToken}`,
      },
    });

    if (response.status === 401 || response.status === 403) {
      googleAccessToken = "";
      throw new Error("Google permission expired.");
    }
    if (!response.ok) throw new Error(`Google Drive request failed (${response.status}).`);

    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }

  function decodeJwtPayload(token) {
    const payload = String(token || "").split(".")[1];
    if (!payload) throw new Error("Missing token payload");

    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const json = decodeURIComponent(
      Array.from(window.atob(padded), (character) => {
        return `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`;
      }).join("")
    );
    return JSON.parse(json);
  }

  function signOutGoogle() {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
    state.account = null;
    googleAccessToken = "";
    googleDriveFileId = "";
    lastGoogleSyncAt = "";
    saveState({ touch: false, queueSync: false });
    render();
    showToast("Signed out.");
  }

  function applyTheme() {
    const dark = Boolean(state.settings.darkMode);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0f1514" : "#16756b");
  }

  function openSettings() {
    els.settingsOverlay.classList.remove("hidden");
    els.settingsOverlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("settings-open");
    scheduleGoogleSignIn();
    refreshIcons();
  }

  function closeSettings() {
    els.settingsOverlay.classList.add("hidden");
    els.settingsOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("settings-open");
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.remove("hidden");
    toastTimer = window.setTimeout(() => {
      els.toast.classList.add("hidden");
    }, 2400);
  }

  function refreshIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || window.location.protocol === "file:") return;

    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        // The app still works normally if install support is unavailable.
      });
    });
  }

  function bindEvents() {
    els.entryForm.addEventListener("submit", submitEntry);
    els.cancelEdit.addEventListener("click", resetEntryForm);
    els.logList.addEventListener("click", handleLogAction);
    els.historyList.addEventListener("click", handleHistoryAction);
    els.clearLog.addEventListener("click", clearLog);
    els.createInvoice.addEventListener("click", createInvoice);
    els.invoiceForm.addEventListener("input", syncInvoiceDraftFromForm);
    els.invoiceForm.addEventListener("change", syncInvoiceDraftFromForm);
    els.settingsForm.addEventListener("submit", (event) => event.preventDefault());
    els.settingsForm.addEventListener("input", syncSettingsFromForm);
    els.settingsForm.addEventListener("change", syncSettingsFromForm);
    els.openSettings.addEventListener("click", openSettings);
    els.closeSettings.addEventListener("click", closeSettings);
    els.settingsDone.addEventListener("click", closeSettings);
    els.settingsOverlay.addEventListener("click", (event) => {
      if (event.target === els.settingsOverlay) closeSettings();
    });
    els.signOutGoogle.addEventListener("click", signOutGoogle);
    els.syncNowGoogle.addEventListener("click", () => connectGoogleDriveSync(true));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !els.settingsOverlay.classList.contains("hidden")) closeSettings();
    });
    window.addEventListener("load", scheduleGoogleSignIn);
  }

  bindEvents();
  syncFormsFromState();
  saveState({ touch: false, queueSync: false });
  render();
  registerServiceWorker();
})();
