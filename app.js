(function () {
  "use strict";

  const STORAGE_KEY = "hoursLogApp.v1";
  const OLD_STORAGE_KEY = "simpleInvoiceApp.v1";
  const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
  const GOOGLE_SAVE_FILE_NAME = "hours-log-save.json";
  const DEFAULT_GOOGLE_CLIENT_ID = "664652124946-e7abvmled21k144u686pfbie60pu5giu.apps.googleusercontent.com";
  const DEFAULT_COMPANY = "General";
  const COMPANY_COLORS = [
    { name: "Teal", value: "#16756b" },
    { name: "Indigo", value: "#4f46e5" },
    { name: "Amber", value: "#d97706" },
    { name: "Rose", value: "#be123c" },
    { name: "Blue", value: "#2563eb" },
    { name: "Green", value: "#16a34a" },
    { name: "Purple", value: "#9333ea" },
    { name: "Red", value: "#dc2626" },
    { name: "Cyan", value: "#0891b2" },
    { name: "Gold", value: "#ca8a04" },
  ];

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
      company: DEFAULT_COMPANY,
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
      companies: [DEFAULT_COMPANY],
      companyColors: {},
      defaultCompany: DEFAULT_COMPANY,
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
  let cloudReconnectPromise = null;
  let applyingCloudState = false;
  let lastGoogleSyncAt = "";
  let calendarMonthDate = startOfMonthDate(todayIso());
  let selectedCalendarDate = todayIso();

  const els = {
    entryForm: document.querySelector("#entryForm"),
    invoiceForm: document.querySelector("#invoiceForm"),
    settingsForm: document.querySelector("#settingsForm"),
    entryFormTitle: document.querySelector("#entryFormTitle"),
    entryId: document.querySelector("#entryId"),
    workDate: document.querySelector("#workDate"),
    entryCompany: document.querySelector("#entryCompany"),
    workDescription: document.querySelector("#workDescription"),
    chargeType: document.querySelector("#chargeType"),
    hoursWorkedLabel: document.querySelector("#hoursWorkedLabel"),
    hoursWorked: document.querySelector("#hoursWorked"),
    fixedAmountLabel: document.querySelector("#fixedAmountLabel"),
    fixedAmount: document.querySelector("#fixedAmount"),
    saveEntry: document.querySelector("#saveEntry span"),
    cancelEdit: document.querySelector("#cancelEdit"),
    logList: document.querySelector("#logList"),
    emptyLog: document.querySelector("#emptyLog"),
    logCount: document.querySelector("#logCount"),
    clearLog: document.querySelector("#clearLog"),
    invoiceCompany: document.querySelector("#invoiceCompany"),
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
    calendarSummary: document.querySelector("#calendarSummary"),
    calendarMonthTitle: document.querySelector("#calendarMonthTitle"),
    calendarLegend: document.querySelector("#calendarLegend"),
    workCalendar: document.querySelector("#workCalendar"),
    calendarDayDetails: document.querySelector("#calendarDayDetails"),
    calendarPrev: document.querySelector("#calendarPrev"),
    calendarToday: document.querySelector("#calendarToday"),
    calendarNext: document.querySelector("#calendarNext"),
    workspace: document.querySelector("#workspace"),
    billingContent: document.querySelector("#billingContent"),
    productSwitcher: document.querySelector("#productSwitcher"),
    productMenu: document.querySelector("#productMenu"),
    brandMark: document.querySelector("#brandMark"),
    productTitle: document.querySelector("#productTitle"),
    productEyebrow: document.querySelector("#productEyebrow"),
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
    currencySymbols: document.querySelectorAll("[data-currency-symbol]"),
    defaultRate: document.querySelector("#defaultRate"),
    defaultWork: document.querySelector("#defaultWork"),
    newCompanyName: document.querySelector("#newCompanyName"),
    addCompany: document.querySelector("#addCompany"),
    companiesList: document.querySelector("#companiesList"),
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
    const settings = normalizeSettings(stored.settings || {});
    const entries = Array.isArray(stored.entries) ? stored.entries.map((entry) => normalizeEntry(entry, settings)) : [];
    const invoices = Array.isArray(stored.invoices) ? stored.invoices.map((invoice) => normalizeInvoice(invoice, settings)) : [];
    const invoiceDraft = { ...defaultState.invoiceDraft, ...(stored.invoiceDraft || {}) };
    invoiceDraft.company = companyChoice(invoiceDraft.company || settings.defaultCompany, invoiceCompanyOptionsFromEntries(entries, settings));

    return {
      ...structuredClone(defaultState),
      ...stored,
      entries,
      invoices,
      invoiceDraft,
      settings,
      account: stored.account || null,
      updatedAt: stored.updatedAt || "",
    };
  }

  function normalizeEntry(entry, settings = defaultState.settings) {
    const source = entry && typeof entry === "object" ? entry : {};
    const fixedAmount = roundMoney(source.fixedAmount ?? source.amount);
    const chargeType = source.chargeType === "fixed" || (fixedAmount > 0 && asNumber(source.hours) <= 0) ? "fixed" : "hours";

    return {
      ...source,
      company: companyFromList(source.company || source.companyName || settings.defaultCompany, settings.companies),
      chargeType,
      hours: chargeType === "fixed" ? 0 : asNumber(source.hours),
      fixedAmount: chargeType === "fixed" ? fixedAmount : 0,
    };
  }

  function normalizeInvoice(invoice, settings = defaultState.settings) {
    const source = invoice && typeof invoice === "object" ? invoice : {};
    const paidAt = source.paidAt ? String(source.paidAt).slice(0, 10) : "";
    const entries = Array.isArray(source.entries) ? source.entries.map((entry) => normalizeEntry(entry, settings)) : [];
    return {
      ...source,
      entries,
      company: normalizeCompanyName(source.company) || invoiceCompanyNameFromEntries(entries, settings),
      status: source.status || (paidAt ? "paid" : "unpaid"),
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
      company: migrated.settings.defaultCompany,
    };
    migrated.account = old.account || null;
    return migrated;
  }

  function normalizeSettings(settings) {
    const companies = normalizeCompanies(settings.companies);
    const defaultCompany = companyChoice(settings.defaultCompany || companies[0], companies);
    const companyColors = normalizeCompanyColors(settings.companyColors, companies);

    return {
      ...defaultState.settings,
      ...settings,
      companies,
      companyColors,
      defaultCompany,
      nextInvoiceNumber: String(settings.nextInvoiceNumber || defaultState.settings.nextInvoiceNumber),
      googleClientId: DEFAULT_GOOGLE_CLIENT_ID,
      darkMode: Boolean(settings.darkMode),
    };
  }

  function saveState(options = {}) {
    const { touch = true, queueSync = true, syncDelay = 0 } = options;
    if (touch) state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (queueSync && !applyingCloudState) queueCloudSync(syncDelay);
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

  function entryIsFixed(entry) {
    return entry?.chargeType === "fixed";
  }

  function entryHours(entry) {
    return entryIsFixed(entry) ? 0 : asNumber(entry?.hours);
  }

  function entryAmount(entry, rate = hourlyRate()) {
    return entryIsFixed(entry) ? roundMoney(entry?.fixedAmount) : roundMoney(entryHours(entry) * rate);
  }

  function entryQuantityLabel(entry) {
    return entryIsFixed(entry) ? "Fixed" : `${formatHours(entryHours(entry))} hrs`;
  }

  function entriesNeedHourlyRate(entries) {
    return entries.some((entry) => !entryIsFixed(entry));
  }

  function entriesHours(entries) {
    return entries.reduce((total, entry) => total + entryHours(entry), 0);
  }

  function entriesTotal(entries, rate = hourlyRate()) {
    return roundMoney(entries.reduce((total, entry) => total + entryAmount(entry, rate), 0));
  }

  function entriesFixedTotal(entries) {
    return roundMoney(entries.filter(entryIsFixed).reduce((total, entry) => total + entryAmount(entry), 0));
  }

  function billingSummary(entries, currency = state.settings.currency || "GBP", rate = hourlyRate()) {
    const hours = entriesHours(entries);
    const fixedTotal = entriesFixedTotal(entries);
    if (hours > 0 && fixedTotal > 0) return `${formatHours(hours)} hrs + ${money(fixedTotal, currency)} fixed`;
    if (hours > 0) return `${formatHours(hours)} hrs`;
    if (fixedTotal > 0) return `${money(fixedTotal, currency)} fixed`;
    return "0 hrs";
  }

  function invoiceBillingSummary(invoice) {
    const entries = invoice.entries || [];
    const hours = entriesHours(entries);
    const fixedTotal = entriesFixedTotal(entries);
    if (hours > 0 && fixedTotal > 0) {
      return `${formatHours(hours)} hours at ${money(invoice.rate, invoice.currency)} per hour + ${money(fixedTotal, invoice.currency)} fixed`;
    }
    if (hours > 0) return `${formatHours(hours)} hours at ${money(invoice.rate, invoice.currency)} per hour`;
    return `${money(invoice.total, invoice.currency)} fixed amount`;
  }

  function currentHours() {
    return entriesHours(state.entries);
  }

  function hourlyRate() {
    return asNumber(state.settings.defaultRate);
  }

  function currentTotal() {
    return entriesTotal(state.entries);
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

  function currencySymbol(currency = state.settings.currency || "GBP") {
    try {
      const parts = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).formatToParts(0);
      return parts.find((part) => part.type === "currency")?.value || currency;
    } catch (error) {
      return currency;
    }
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

  function formatWorkDate(isoDate) {
    const date = parseIsoDate(isoDate);
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(date);
    const month = new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);
    return `${weekday} the ${ordinalDay(date.getDate())} ${month} ${date.getFullYear()}`;
  }

  function startOfMonthDate(isoDate) {
    const date = parseIsoDate(isoDate);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function addMonths(date, amount) {
    return new Date(date.getFullYear(), date.getMonth() + amount, 1);
  }

  function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function formatCalendarMonth(date) {
    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
    }).format(date);
  }

  function shortWeekday(date) {
    return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
  }

  function formatSyncTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "just now";
    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
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

  function normalizeCompanyName(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 80);
  }

  function uniqueCompanyNames(values) {
    const source = Array.isArray(values) ? values : String(values || "").split(/\r?\n/);
    const seen = new Set();
    const companies = [];

    source.forEach((value) => {
      const company = normalizeCompanyName(value);
      const key = company.toLocaleLowerCase();
      if (!company || seen.has(key)) return;
      seen.add(key);
      companies.push(company);
    });

    return companies;
  }

  function normalizeCompanies(values) {
    const companies = uniqueCompanyNames(values);
    return companies.length ? companies : [DEFAULT_COMPANY];
  }

  function sameCompanyName(first, second) {
    return normalizeCompanyName(first).toLocaleLowerCase() === normalizeCompanyName(second).toLocaleLowerCase();
  }

  function companyFromList(value, companies = [DEFAULT_COMPANY]) {
    const choices = normalizeCompanies(companies);
    const company = normalizeCompanyName(value);
    return choices.find((choice) => sameCompanyName(choice, company)) || company || choices[0] || DEFAULT_COMPANY;
  }

  function companyChoice(value, companies = [DEFAULT_COMPANY]) {
    const choices = normalizeCompanies(companies);
    const company = normalizeCompanyName(value);
    return choices.find((choice) => sameCompanyName(choice, company)) || choices[0] || DEFAULT_COMPANY;
  }

  function validCompanyColor(value) {
    const color = String(value || "").trim().toLocaleLowerCase();
    return COMPANY_COLORS.some((option) => option.value === color) ? color : "";
  }

  function automaticCompanyColor(company) {
    const name = normalizeCompanyName(company) || DEFAULT_COMPANY;
    let hash = 0;

    for (let index = 0; index < name.length; index += 1) {
      hash = (hash * 31 + name.charCodeAt(index)) % 2147483647;
    }

    return COMPANY_COLORS[Math.abs(hash) % COMPANY_COLORS.length].value;
  }

  function normalizeCompanyColors(colors = {}, companies = [DEFAULT_COMPANY]) {
    const source = colors && typeof colors === "object" ? colors : {};
    const normalized = {};

    normalizeCompanies(companies).forEach((company) => {
      const storedKey = Object.keys(source).find((key) => sameCompanyName(key, company));
      normalized[company] = validCompanyColor(source[storedKey]) || automaticCompanyColor(company);
    });

    return normalized;
  }

  function invoiceCompanyOptionsFromEntries(entries, settings = defaultState.settings) {
    const companies = uniqueCompanyNames((entries || []).map((entry) => entry.company || entry.companyName));
    return companies.length ? companies : settings.companies;
  }

  function invoiceCompanyNameFromEntries(entries, settings = defaultState.settings) {
    const companies = uniqueCompanyNames((entries || []).map((entry) => entry.company || entry.companyName || settings.defaultCompany));
    if (companies.length > 1) return "Multiple companies";
    return companies[0] || settings.defaultCompany || DEFAULT_COMPANY;
  }

  function entryCompanyName(entry) {
    return companyFromList(entry?.company || entry?.companyName || state.settings.defaultCompany, [
      ...state.settings.companies,
      entry?.company,
      entry?.companyName,
    ]);
  }

  function invoiceCompanyName(invoice) {
    return normalizeCompanyName(invoice?.company) || invoiceCompanyNameFromEntries(invoice?.entries || [], state.settings);
  }

  function invoiceHasMultipleCompanies(invoice) {
    return uniqueCompanyNames((invoice?.entries || []).map((entry) => entryCompanyName(entry))).length > 1;
  }

  function invoiceWorkDescription(entry, invoice) {
    const work = entry.work || "Manual Labour";
    if (!invoiceHasMultipleCompanies(invoice)) return work;
    return `${work} (${entryCompanyName(entry)})`;
  }

  function invoiceCompanyOptions() {
    return invoiceCompanyOptionsFromEntries(state.entries, state.settings);
  }

  function selectedInvoiceCompany() {
    return companyChoice(els.invoiceCompany.value || state.invoiceDraft.company || state.settings.defaultCompany, invoiceCompanyOptions());
  }

  function entriesForCompany(company) {
    return state.entries.filter((entry) => sameCompanyName(entryCompanyName(entry), company));
  }

  function companyColor(company) {
    const name = normalizeCompanyName(company) || DEFAULT_COMPANY;
    const colorKey = Object.keys(state.settings.companyColors || {}).find((key) => sameCompanyName(key, name));
    return validCompanyColor(state.settings.companyColors?.[colorKey]) || automaticCompanyColor(name);
  }

  function companyColorStyle(company) {
    return `--company-color: ${companyColor(company)};`;
  }

  function renderCompanyControls() {
    const entrySelection = state.settings.companies.some((company) => sameCompanyName(company, els.entryCompany.value))
      ? els.entryCompany.value
      : state.settings.defaultCompany;
    const invoiceChoices = invoiceCompanyOptions();
    const invoiceSelection = invoiceChoices.some((company) => sameCompanyName(company, els.invoiceCompany.value))
      ? els.invoiceCompany.value
      : companyChoice(state.invoiceDraft.company || state.settings.defaultCompany, invoiceChoices);

    renderCompanySelect(els.entryCompany, state.settings.companies, entrySelection);
    renderCompanySelect(els.invoiceCompany, invoiceChoices, invoiceSelection);
    renderCompaniesList();
  }

  function renderCompanySelect(select, companies, selected) {
    const choices = normalizeCompanies(companies);
    const selectedCompany = normalizeCompanyName(selected);

    if (selectedCompany && !choices.some((company) => sameCompanyName(company, selectedCompany))) {
      choices.push(selectedCompany);
    }

    const value = companyFromList(selectedCompany, choices);
    select.innerHTML = choices
      .map((company) => `<option value="${escapeHtml(company)}">${escapeHtml(company)}</option>`)
      .join("");
    select.value = value;
    return value;
  }

  function renderCompanyColorOptions(selectedColor) {
    const selected = validCompanyColor(selectedColor) || COMPANY_COLORS[0].value;
    return COMPANY_COLORS.map(
      (option) => `<option value="${option.value}" ${option.value === selected ? "selected" : ""}>${escapeHtml(option.name)}</option>`
    ).join("");
  }

  function renderCompaniesList() {
    els.companiesList.innerHTML = state.settings.companies
      .map(
        (company) => `
          <div class="company-pill" style="${companyColorStyle(company)}">
            <div class="company-pill-main">
              <span class="company-color-swatch" aria-hidden="true"></span>
              <strong>${escapeHtml(company)}</strong>
            </div>
            <label class="company-color-control">
              <span>Color</span>
              <select data-action="set-company-color" data-company="${escapeHtml(company)}">
                ${renderCompanyColorOptions(companyColor(company))}
              </select>
            </label>
            <button class="icon-only ghost" type="button" data-action="remove-company" data-company="${escapeHtml(company)}" title="Remove company" ${
          state.settings.companies.length <= 1 ? "disabled" : ""
        }>
              <i data-lucide="x"></i>
            </button>
          </div>
        `
      )
      .join("");
  }

  function setCompanyColor(company, color) {
    const name = companyFromList(company, state.settings.companies);
    const selectedColor = validCompanyColor(color);
    if (!selectedColor) return;

    state.settings.companyColors = normalizeCompanyColors(
      {
        ...(state.settings.companyColors || {}),
        [name]: selectedColor,
      },
      state.settings.companies
    );
    saveState();
    render();
    showToast(`${name} colour updated.`);
  }

  function addCompany() {
    const company = normalizeCompanyName(els.newCompanyName.value);
    if (!company) {
      showToast("Enter a company name.");
      return;
    }

    const existing = state.settings.companies.find((item) => sameCompanyName(item, company));
    if (existing) {
      state.settings.defaultCompany = existing;
      els.newCompanyName.value = "";
      els.entryCompany.value = existing;
      saveState();
      render();
      showToast("Company already exists.");
      return;
    }

    state.settings.companies = normalizeCompanies([...state.settings.companies, company]);
    state.settings.companyColors = normalizeCompanyColors(
      {
        ...(state.settings.companyColors || {}),
        [company]: automaticCompanyColor(company),
      },
      state.settings.companies
    );
    state.settings.defaultCompany = company;
    els.newCompanyName.value = "";
    els.entryCompany.value = company;
    saveState();
    render();
    showToast("Company added.");
  }

  function removeCompany(company) {
    if (state.settings.companies.length <= 1) {
      showToast("Keep at least one company.");
      return;
    }

    state.settings.companies = normalizeCompanies(state.settings.companies.filter((item) => !sameCompanyName(item, company)));
    state.settings.companyColors = normalizeCompanyColors(state.settings.companyColors, state.settings.companies);
    if (sameCompanyName(state.settings.defaultCompany, company)) {
      state.settings.defaultCompany = state.settings.companies[0];
    }

    saveState();
    render();
    showToast("Company removed.");
  }

  function syncFormsFromState() {
    els.workDate.value = todayIso();
    els.workDescription.value = state.settings.defaultWork || "Manual Labour";
    els.chargeType.value = "hours";
    els.hoursWorked.value = "";
    els.fixedAmount.value = "";
    els.invoiceDate.value = state.invoiceDraft.invoiceDate || todayIso();
    els.billNote.value = state.invoiceDraft.billNote || defaultState.invoiceDraft.billNote;
    els.invoiceNumber.value = state.settings.nextInvoiceNumber || "1";
    renderCompanyControls();
    updateChargeTypeControls();

    Object.entries(state.settings).forEach(([key, value]) => {
      if (!els[key]) return;
      if (els[key].type === "checkbox") {
        els[key].checked = Boolean(value);
      } else {
        els[key].value = Array.isArray(value) ? value.join("\n") : value;
      }
    });
  }

  function updateChargeTypeControls() {
    const fixed = els.chargeType.value === "fixed";
    els.hoursWorkedLabel.classList.toggle("hidden", fixed);
    els.fixedAmountLabel.classList.toggle("hidden", !fixed);
    els.hoursWorked.required = !fixed;
    els.fixedAmount.required = fixed;
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
      companies: state.settings.companies,
      companyColors: state.settings.companyColors,
      defaultCompany: state.settings.defaultCompany,
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
      company: selectedInvoiceCompany(),
      invoiceDate: els.invoiceDate.value || todayIso(),
      billNote: els.billNote.value.trim() || defaultState.invoiceDraft.billNote,
    };
    saveState();
    renderSummary();
  }

  function submitEntry(event) {
    event.preventDefault();

    const chargeType = els.chargeType.value === "fixed" ? "fixed" : "hours";
    const hours = chargeType === "hours" ? asNumber(els.hoursWorked.value) : 0;
    const fixedAmount = chargeType === "fixed" ? roundMoney(els.fixedAmount.value) : 0;

    if (chargeType === "hours" && hours <= 0) {
      showToast("Enter hours greater than zero.");
      return;
    }
    if (chargeType === "fixed" && fixedAmount <= 0) {
      showToast("Enter a fixed amount greater than zero.");
      return;
    }

    const entry = {
      id: els.entryId.value || uid(),
      date: els.workDate.value || todayIso(),
      company: companyFromList(els.entryCompany.value, state.settings.companies),
      work: els.workDescription.value.trim() || state.settings.defaultWork || "Manual Labour",
      chargeType,
      hours,
      fixedAmount,
      createdAt: new Date().toISOString(),
    };
    state.settings.defaultCompany = entry.company;
    selectedCalendarDate = entry.date;
    calendarMonthDate = startOfMonthDate(entry.date);

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
    renderCompanySelect(els.entryCompany, state.settings.companies, state.settings.defaultCompany);
    els.workDescription.value = state.settings.defaultWork || "Manual Labour";
    els.chargeType.value = "hours";
    els.hoursWorked.value = "";
    els.fixedAmount.value = "";
    updateChargeTypeControls();
    els.entryFormTitle.textContent = "Add Work Day";
    els.saveEntry.textContent = "Add To Log";
    els.cancelEdit.classList.add("hidden");
  }

  function editEntry(id) {
    const entry = state.entries.find((item) => item.id === id);
    if (!entry) return;

    els.entryId.value = entry.id;
    els.workDate.value = entry.date;
    renderCompanySelect(els.entryCompany, [...state.settings.companies, entryCompanyName(entry)], entryCompanyName(entry));
    els.workDescription.value = entry.work || state.settings.defaultWork || "Manual Labour";
    els.chargeType.value = entryIsFixed(entry) ? "fixed" : "hours";
    els.hoursWorked.value = entryIsFixed(entry) ? "" : entryHours(entry);
    els.fixedAmount.value = entryIsFixed(entry) ? entry.fixedAmount : "";
    updateChargeTypeControls();
    els.entryFormTitle.textContent = "Edit Work Day";
    els.saveEntry.textContent = "Update Log";
    els.cancelEdit.classList.remove("hidden");
    (entryIsFixed(entry) ? els.fixedAmount : els.hoursWorked).focus();
  }

  function deleteEntry(id) {
    state.entries = state.entries.filter((entry) => entry.id !== id);
    saveState();
    render();
    showToast("Work day deleted.");
  }

  function clearLog() {
    if (!state.entries.length) return;
    const workDays = state.entries.length;
    const confirmed = window.confirm(
      `Clear ${workDays} ${workDays === 1 ? "work day" : "work days"} (${billingSummary(state.entries)}, ${money(currentTotal())}) from the current log? Invoice history will stay saved.`
    );
    if (!confirmed) return;

    state.entries = [];
    saveState();
    resetEntryForm();
    render();
    showToast("Current log cleared.");
  }

  function createInvoice() {
    syncInvoiceDraftFromForm();

    const company = selectedInvoiceCompany();
    const entries = sortedEntries(entriesForCompany(company)).map((entry) => ({ ...entry, company: entryCompanyName(entry) }));

    if (!entries.length) {
      showToast(`Add work days for ${company} before creating an invoice.`);
      return;
    }
    if (entriesNeedHourlyRate(entries) && hourlyRate() <= 0) {
      showToast("Set your hourly rate in Settings first.");
      openSettings();
      return;
    }

    const hours = entriesHours(entries);
    const rate = hourlyRate();
    const total = entriesTotal(entries, rate);
    const number = String(state.settings.nextInvoiceNumber || "1").trim();
    const invoice = {
      id: uid(),
      number,
      date: state.invoiceDraft.invoiceDate || todayIso(),
      note: state.invoiceDraft.billNote || defaultState.invoiceDraft.billNote,
      company,
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
    state.entries = state.entries.filter((entry) => !sameCompanyName(entryCompanyName(entry), company));
    state.settings.nextInvoiceNumber = incrementInvoiceNumber(number);
    state.invoiceDraft.invoiceDate = todayIso();
    state.invoiceDraft.company = invoiceCompanyOptions()[0] || state.settings.defaultCompany;
    saveState();
    resetEntryForm();
    syncFormsFromState();
    render();
    showToast(`Invoice ${invoice.number} created for ${company}.`);
  }

  function sortedEntries(entries) {
    return [...entries].sort((a, b) => `${a.date}${a.createdAt}`.localeCompare(`${b.date}${b.createdAt}`));
  }

  function calendarWorkItems() {
    const currentItems = state.entries.map((entry) => ({
      ...entry,
      company: entryCompanyName(entry),
      source: "Current log",
      billed: false,
    }));
    const invoiceItems = state.invoices.flatMap((invoice) =>
      (invoice.entries || []).map((entry) => ({
        ...entry,
        company: companyFromList(entry.company || entry.companyName || invoice.company || state.settings.defaultCompany, [
          ...state.settings.companies,
          entry.company,
          entry.companyName,
          invoice.company,
        ]),
        source: `Invoice ${invoice.number}`,
        billed: true,
        invoiceNumber: invoice.number,
        paid: invoiceIsPaid(invoice),
      }))
    );

    return [...currentItems, ...invoiceItems].filter((entry) => entry.date);
  }

  function calendarDayMap(items = calendarWorkItems()) {
    const map = new Map();
    items.forEach((entry) => {
      const date = String(entry.date || "").slice(0, 10);
      if (!date) return;

      const day = map.get(date) || {
        date,
        hours: 0,
        fixedTotal: 0,
        companies: new Set(),
        items: [],
      };
      day.hours += entryHours(entry);
      if (entryIsFixed(entry)) day.fixedTotal += entryAmount(entry);
      day.companies.add(entry.company || state.settings.defaultCompany);
      day.items.push(entry);
      map.set(date, day);
    });
    return map;
  }

  function calendarMonthDates(monthDate) {
    const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    const leadingDays = (firstDay.getDay() + 6) % 7;
    const startDate = new Date(firstDay);
    startDate.setDate(firstDay.getDate() - leadingDays);

    const dates = [];
    const totalCells = Math.ceil((leadingDays + lastDay.getDate()) / 7) * 7;
    for (let index = 0; index < totalCells; index += 1) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + index);
      dates.push(date);
    }
    return dates;
  }

  function calendarDayBillingLabel(day) {
    if (!day) return "";
    const hoursText = day.hours > 0 ? `${formatHours(day.hours)}h` : "";
    const fixedText = day.fixedTotal > 0 ? money(day.fixedTotal) : "";
    return [hoursText, fixedText].filter(Boolean).join(" + ");
  }

  function renderCompanyDots(companies) {
    return companies
      .map((company) => `<span class="company-dot" style="${companyColorStyle(company)}" title="${escapeHtml(company)}"></span>`)
      .join("");
  }

  function renderCalendarLegend(days) {
    const companies = uniqueCompanyNames(days.flatMap((day) => [...day.companies]));

    els.calendarLegend.classList.toggle("hidden", companies.length === 0);
    els.calendarLegend.innerHTML = companies
      .map(
        (company) => `
          <span class="calendar-legend-item">
            <span class="company-dot" style="${companyColorStyle(company)}"></span>
            <span>${escapeHtml(company)}</span>
          </span>
        `
      )
      .join("");
  }

  function renderCalendar() {
    const days = calendarMonthDates(calendarMonthDate);
    const workByDate = calendarDayMap();
    const month = monthKey(calendarMonthDate);
    const monthWork = [...workByDate.values()].filter((day) => monthKey(parseIsoDate(day.date)) === month);
    const workedDays = monthWork.length;
    const workedHours = monthWork.reduce((total, day) => total + day.hours, 0);
    const workedFixedTotal = monthWork.reduce((total, day) => total + day.fixedTotal, 0);
    const selectedDay = workByDate.get(selectedCalendarDate);

    els.calendarMonthTitle.textContent = formatCalendarMonth(calendarMonthDate);
    els.calendarSummary.textContent = workedDays
      ? `${workedDays} ${workedDays === 1 ? "worked day" : "worked days"} - ${[workedHours > 0 ? `${formatHours(workedHours)} hrs` : "", workedFixedTotal > 0 ? `${money(workedFixedTotal)} fixed` : ""].filter(Boolean).join(" + ")}`
      : "No worked days this month";
    renderCalendarLegend(monthWork);

    els.workCalendar.innerHTML = days
      .map((date) => {
        const isoDate = toIsoDate(date);
        const day = workByDate.get(isoDate);
        const inMonth = date.getMonth() === calendarMonthDate.getMonth();
        const isToday = isoDate === todayIso();
        const isSelected = isoDate === selectedCalendarDate;
        const dayCompanies = day ? [...day.companies] : [];
        const companies = dayCompanies.join(", ");
        const dayBilling = calendarDayBillingLabel(day);
        const title = day
          ? `${formatWorkDate(isoDate)} - ${dayBilling} - ${companies}`
          : formatWorkDate(isoDate);
        const style = dayCompanies.length ? ` style="${companyColorStyle(dayCompanies[0])}"` : "";

        return `
          <button class="calendar-day ${inMonth ? "" : "outside-month"} ${day ? "has-work" : ""} ${isToday ? "today" : ""} ${
          isSelected ? "selected" : ""
        }" type="button" data-date="${isoDate}" title="${escapeHtml(title)}" aria-pressed="${isSelected ? "true" : "false"}"${style}>
            <span class="calendar-day-number">${date.getDate()}</span>
            ${
              day
                ? `<div class="calendar-company-dots">${renderCompanyDots(dayCompanies)}</div><strong>${escapeHtml(dayBilling)}</strong><small>${escapeHtml(companies)}</small>`
                : ""
            }
          </button>
        `;
      })
      .join("");

    renderCalendarDayDetails(selectedDay);
  }

  function renderCalendarDayDetails(day) {
    if (!day) {
      els.calendarDayDetails.classList.add("hidden");
      els.calendarDayDetails.innerHTML = "";
      return;
    }

    const items = sortedEntries(day.items);
    els.calendarDayDetails.classList.remove("hidden");
    els.calendarDayDetails.innerHTML = `
      <div class="calendar-detail-heading">
        <strong>${escapeHtml(formatWorkDate(day.date))}</strong>
        <span>${escapeHtml(calendarDayBillingLabel(day))} total</span>
      </div>
      <div class="calendar-detail-list">
        ${items
          .map(
            (item) => `
              <div class="calendar-detail-item" style="${companyColorStyle(item.company || state.settings.defaultCompany)}">
                <div>
                  <strong>${escapeHtml(item.company || state.settings.defaultCompany)}</strong>
                  <span>${escapeHtml(item.work || "Manual Labour")}</span>
                </div>
                <div>
                  <span>${entryIsFixed(item) ? money(entryAmount(item)) : `${formatHours(entryHours(item))} hrs`}</span>
                  <small>${escapeHtml(item.source)}</small>
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  function showCalendarMonth(amount) {
    calendarMonthDate = addMonths(calendarMonthDate, amount);
    selectedCalendarDate = toIsoDate(calendarMonthDate);
    renderCalendar();
    refreshIcons();
  }

  function showCurrentCalendarMonth() {
    selectedCalendarDate = todayIso();
    calendarMonthDate = startOfMonthDate(selectedCalendarDate);
    renderCalendar();
    refreshIcons();
  }

  function selectCalendarDay(date) {
    selectedCalendarDate = String(date || todayIso()).slice(0, 10);
    calendarMonthDate = startOfMonthDate(selectedCalendarDate);
    renderCalendar();
    refreshIcons();
  }

  function render() {
    applyTheme();
    renderCurrencySymbols();
    renderCompanyControls();
    renderSummary();
    renderLog();
    renderHistory();
    renderCalendar();
    renderAccount();
    scheduleGoogleSignIn();
    refreshIcons();
  }

  function renderCurrencySymbols() {
    const symbol = currencySymbol();
    els.currencySymbols.forEach((element) => {
      element.textContent = symbol;
    });
  }

  function renderSummary() {
    const hours = currentHours();
    const company = selectedInvoiceCompany();
    const companyEntries = entriesForCompany(company);
    const companyTotal = entriesTotal(companyEntries);
    els.summaryHours.textContent = formatHours(hours);
    els.summaryRate.textContent = money(hourlyRate());
    els.summaryTotal.textContent = money(currentTotal());
    els.summaryInvoices.textContent = state.invoices.length;
    els.createInvoice.disabled = !companyEntries.length || (entriesNeedHourlyRate(companyEntries) && hourlyRate() <= 0);
    els.invoiceHelp.textContent = companyEntries.length
      ? `${billingSummary(companyEntries)} for ${company} (${money(companyTotal)}) ready for invoice ${state.settings.nextInvoiceNumber || "1"}.`
      : "Add work first, then create an invoice when you are ready.";
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
                <strong>${escapeHtml(formatWorkDate(entry.date))}</strong>
              <span>${escapeHtml(entry.work || "Manual Labour")}</span>
            </div>
              <span class="badge">${escapeHtml(entryQuantityLabel(entry))}</span>
            </div>
            <div class="work-meta">
              <span>${escapeHtml(entryCompanyName(entry))}</span>
              <span>${entryIsFixed(entry) ? "Fixed amount" : "Hourly"}</span>
              <span>${money(entryAmount(entry))}</span>
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
                <span>${escapeHtml(invoiceCompanyName(invoice))} - ${escapeHtml(formatShortDate(invoice.date))}</span>
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
              <span>${escapeHtml(billingSummary(invoice.entries || [], invoice.currency, invoice.rate))}</span>
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

  function handleCompanyAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "remove-company") removeCompany(button.dataset.company);
  }

  function handleCompanyChange(event) {
    const select = event.target.closest('select[data-action="set-company-color"]');
    if (!select) return;
    setCompanyColor(select.dataset.company, select.value);
  }

  function handleCalendarAction(event) {
    const button = event.target.closest("button[data-date]");
    if (!button) return;
    selectCalendarDay(button.dataset.date);
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
    const companyName = invoiceCompanyName(invoice);
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

    const cardGap = 10;
    const cardWidth = (contentWidth - cardGap * 2) / 3;
    drawPdfInfoCard(doc, margin, y, cardWidth, "Invoice Date", formatInvoiceDate(invoice.date), muted, ink);
    drawPdfInfoCard(doc, margin + cardWidth + cardGap, y, cardWidth, "Company", companyName, muted, ink);
    drawPdfInfoCard(doc, margin + (cardWidth + cardGap) * 2, y, cardWidth, "Work Period", `${formatShortDate(invoice.periodStart)} to ${formatShortDate(invoice.periodEnd)}`, muted, ink);
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
    doc.text(invoiceBillingSummary(invoice), pageWidth - margin - 18, y + 32, { align: "right" });
    doc.setTextColor(...muted);
    doc.text(companyName, pageWidth - margin - 18, y + 52, { align: "right" });
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
      `${workTitle} for ${companyName} across ${invoice.entries.length} ${invoice.entries.length === 1 ? "work day" : "work days"}: ${billingSummary(invoice.entries || [], invoice.currency, invoice.rate)}.`
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
    doc.text(doc.splitTextToSize(value, width - 28).slice(0, 2), x + 14, y + 40);
  }

  function drawPdfWorkTable(doc, invoice, margin, startY, width, pageHeight, colors) {
    const colWidths = [150, width - 340, 82, 108];
    const headers = ["Date", "Work", "Hours", "Amount"];
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

      const rowHeight = 32;
      if (index % 2 === 0) {
        doc.setFillColor(249, 251, 251);
        doc.rect(margin, y, width, rowHeight, "F");
      }
      doc.setDrawColor(...colors.line);
      doc.rect(margin, y, width, rowHeight);
      doc.setTextColor(...colors.ink);
      let x = margin;
      doc.text(doc.splitTextToSize(formatWorkDate(entry.date), colWidths[0] - 16), x + 8, y + 19);
      x += colWidths[0];
      doc.text(doc.splitTextToSize(invoiceWorkDescription(entry, invoice), colWidths[1] - 16), x + 8, y + 19);
      x += colWidths[1];
      doc.text(entryIsFixed(entry) ? "Fixed" : formatHours(entryHours(entry)), x + colWidths[2] - 8, y + 19, { align: "right" });
      x += colWidths[2];
      doc.text(plainMoney(entryAmount(entry, invoice.rate), invoice.currency), x + colWidths[3] - 8, y + 19, { align: "right" });
      y += rowHeight;
    });

    return y;
  }

  async function exportInvoiceWord(invoice) {
    if (!window.JSZip) {
      showToast("Word export is still loading. Try again in a second.");
      return;
    }

    try {
      const blob = await createInvoiceDocx(invoice);
      downloadGeneratedBlob(`${invoiceFileName(invoice)}.docx`, blob);
      showToast(`Invoice ${invoice.number} Word document downloaded.`);
    } catch (error) {
      showToast("Could not create the Word document.");
    }
  }

  async function createInvoiceDocx(invoice) {
    const zip = new window.JSZip();

    zip.file("[Content_Types].xml", docxContentTypesXml());
    zip.folder("_rels").file(".rels", docxPackageRelationshipsXml());
    zip.folder("docProps").file("core.xml", docxCorePropertiesXml(invoice));
    zip.folder("docProps").file("app.xml", docxAppPropertiesXml());

    const word = zip.folder("word");
    word.file("document.xml", docxDocumentXml(invoice));
    word.file("styles.xml", docxStylesXml());
    word.folder("_rels").file("document.xml.rels", docxDocumentRelationshipsXml());

    return zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }

  function docxDocumentXml(invoice) {
    const details = invoice.details || {};
    const paid = invoiceIsPaid(invoice);
    const workTitle = invoice.entries[0]?.work || "Manual Labour";
    const companyName = invoiceCompanyName(invoice);
    const period = `${formatShortDate(invoice.periodStart)} to ${formatShortDate(invoice.periodEnd)}`;
    const paidText = paid ? `PAID${invoice.paidAt ? ` ${formatShortDate(invoice.paidAt)}` : ""}` : "";

    const body = [
      docxTable([
        [
          docxCell([docxParagraph(details.businessName || "A nathan Brickwork", { bold: true, size: 54, font: "Cambria" })], 6500, { border: "none" }),
          docxCell(
            [
              docxParagraph("INVOICE", { align: "right", bold: true, color: "0D514A", size: 44 }),
              docxParagraph(`No. ${invoice.number}`, { align: "right", bold: true, color: "63716D", size: 20 }),
              paidText ? docxParagraph(paidText, { align: "right", bold: true, color: "0D514A", size: 20 }) : "",
            ],
            2900,
            { border: "none" }
          ),
        ],
      ]),
      docxParagraph("", { after: 160 }),
      docxTable([
        [
          docxCell(
            [docxParagraph("INVOICE DATE", { bold: true, color: "63716D", size: 18 }), docxParagraph(formatInvoiceDate(invoice.date), { bold: true, size: 24 })],
            3134,
            { shading: "F9FBFB" }
          ),
          docxCell(
            [docxParagraph("COMPANY", { bold: true, color: "63716D", size: 18 }), docxParagraph(companyName, { bold: true, size: 24 })],
            3133,
            { shading: "F9FBFB" }
          ),
          docxCell(
            [docxParagraph("WORK PERIOD", { bold: true, color: "63716D", size: 18 }), docxParagraph(period, { bold: true, size: 24 })],
            3133,
            { shading: "F9FBFB" }
          ),
        ],
      ]),
      docxParagraph("", { after: 180 }),
      docxTable([
        [
          docxCell(
            [docxParagraph("TOTAL AMOUNT DUE", { bold: true, color: "63716D", size: 18 }), docxParagraph(plainMoney(invoice.total, invoice.currency), { bold: true, color: "0D514A", size: 48 })],
            4700,
            { shading: "E6F5EF", borderColor: "B6D6CE" }
          ),
          docxCell(
            [docxParagraph(invoiceBillingSummary(invoice), { align: "right", bold: true, size: 22 }), docxParagraph(companyName, { align: "right", bold: true, size: 22 })],
            4700,
            { shading: "E6F5EF", borderColor: "B6D6CE" }
          ),
        ],
      ]),
      docxParagraph("Work Summary", { bold: true, size: 26, before: 360, after: 120 }),
      docxParagraph(
        `${workTitle} for ${companyName} across ${invoice.entries.length} ${invoice.entries.length === 1 ? "work day" : "work days"}: ${billingSummary(invoice.entries || [], invoice.currency, invoice.rate)}.`,
        { size: 22, after: 120 }
      ),
      docxTable([
        [
          docxCell(
            [
              docxParagraph("PAYMENT DETAILS", { bold: true, color: "63716D", size: 18 }),
              docxParagraph(`Name: ${details.bankName || details.yourName || "Jacob Nathan"}`, { size: 21 }),
              docxParagraph(`Account Number: ${details.accountNumber || ""}`, { size: 21 }),
              docxParagraph(`Sort Code: ${details.sortCode || ""}`, { size: 21 }),
            ],
            9400,
            { shading: "F9FBFB" }
          ),
        ],
      ]),
      docxParagraph("Work Log", { bold: true, size: 26, before: 360, after: 120 }),
      docxWorkLogTable(invoice),
      docxParagraph(invoice.note || "Thank you for your business", { bold: true, size: 22, before: 360, after: 320 }),
      docxParagraph(details.yourName || details.bankName || "Jacob Nathan", { bold: true, size: 22 }),
      docxSectionProperties(),
    ].join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <w:body>${body}</w:body>
      </w:document>`;
  }

  function docxWorkLogTable(invoice) {
    const header = [
      docxCell([docxParagraph("Date", { bold: true, color: "FFFFFF", size: 19 })], 2800, { shading: "16756B", borderColor: "16756B" }),
      docxCell([docxParagraph("Work", { bold: true, color: "FFFFFF", size: 19 })], 4100, { shading: "16756B", borderColor: "16756B" }),
      docxCell([docxParagraph("Hours", { bold: true, color: "FFFFFF", size: 19 })], 1200, { shading: "16756B", borderColor: "16756B" }),
      docxCell([docxParagraph("Amount", { bold: true, color: "FFFFFF", size: 19 })], 1300, { shading: "16756B", borderColor: "16756B" }),
    ];
    const rows = sortedEntries(invoice.entries).map((entry, index) => [
      docxCell([docxParagraph(formatWorkDate(entry.date), { size: 20 })], 2800, { shading: index % 2 === 0 ? "F9FBFB" : "FFFFFF" }),
      docxCell([docxParagraph(invoiceWorkDescription(entry, invoice), { size: 20 })], 4100, { shading: index % 2 === 0 ? "F9FBFB" : "FFFFFF" }),
      docxCell([docxParagraph(entryIsFixed(entry) ? "Fixed" : formatHours(entryHours(entry)), { align: "right", size: 20 })], 1200, { shading: index % 2 === 0 ? "F9FBFB" : "FFFFFF" }),
      docxCell([docxParagraph(plainMoney(entryAmount(entry, invoice.rate), invoice.currency), { align: "right", size: 20 })], 1300, { shading: index % 2 === 0 ? "F9FBFB" : "FFFFFF" }),
    ]);

    return docxTable([header, ...rows]);
  }

  function docxTable(rows) {
    return `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="9400" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="DFE7E4"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="DFE7E4"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="DFE7E4"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="DFE7E4"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="DFE7E4"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="DFE7E4"/>
        </w:tblBorders>
      </w:tblPr>
      ${rows.map((row) => `<w:tr>${row.join("")}</w:tr>`).join("")}
    </w:tbl>`;
  }

  function docxCell(content, width, options = {}) {
    const borderColor = options.borderColor || "DFE7E4";
    const borders =
      options.border === "none"
        ? `<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>`
        : `<w:tcBorders><w:top w:val="single" w:sz="4" w:color="${borderColor}"/><w:left w:val="single" w:sz="4" w:color="${borderColor}"/><w:bottom w:val="single" w:sz="4" w:color="${borderColor}"/><w:right w:val="single" w:sz="4" w:color="${borderColor}"/></w:tcBorders>`;

    return `<w:tc>
      <w:tcPr>
        <w:tcW w:w="${width}" w:type="dxa"/>
        ${options.shading ? `<w:shd w:fill="${options.shading}"/>` : ""}
        ${borders}
        <w:tcMar><w:top w:w="120" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tcMar>
      </w:tcPr>
      ${content.filter(Boolean).join("")}
    </w:tc>`;
  }

  function docxParagraph(text, options = {}) {
    const paragraphProps = [
      options.align ? `<w:jc w:val="${options.align}"/>` : "",
      options.before || options.after ? `<w:spacing w:before="${options.before || 0}" w:after="${options.after || 0}"/>` : "",
    ]
      .filter(Boolean)
      .join("");
    const runProps = [
      options.bold ? "<w:b/>" : "",
      options.color ? `<w:color w:val="${options.color}"/>` : "",
      options.size ? `<w:sz w:val="${options.size}"/>` : "",
      options.font ? `<w:rFonts w:ascii="${xmlEscape(options.font)}" w:hAnsi="${xmlEscape(options.font)}"/>` : "",
    ]
      .filter(Boolean)
      .join("");

    return `<w:p>
      ${paragraphProps ? `<w:pPr>${paragraphProps}</w:pPr>` : ""}
      <w:r>${runProps ? `<w:rPr>${runProps}</w:rPr>` : ""}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>
    </w:p>`;
  }

  function docxSectionProperties() {
    return `<w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="980" w:right="980" w:bottom="980" w:left="980" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>`;
  }

  function docxContentTypesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
        <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
        <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
        <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
      </Types>`;
  }

  function docxPackageRelationshipsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
        <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
        <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
      </Relationships>`;
  }

  function docxDocumentRelationshipsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
      </Relationships>`;
  }

  function docxCorePropertiesXml(invoice) {
    const now = new Date().toISOString();
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <dc:title>${xmlEscape(invoiceFileName(invoice))}</dc:title>
        <dc:creator>Simply Pay</dc:creator>
        <cp:lastModifiedBy>Simply Pay</cp:lastModifiedBy>
        <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
        <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
      </cp:coreProperties>`;
  }

  function docxAppPropertiesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
        <Application>Simply Pay</Application>
      </Properties>`;
  }

  function docxStylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:docDefaults>
          <w:rPrDefault>
            <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:color w:val="17211F"/></w:rPr>
          </w:rPrDefault>
          <w:pPrDefault>
            <w:pPr><w:spacing w:after="80"/></w:pPr>
          </w:pPrDefault>
        </w:docDefaults>
      </w:styles>`;
  }

  function xmlEscape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function invoiceFileName(invoice) {
    const name = invoice.details?.yourName || invoice.details?.bankName || "Invoice";
    return sanitizeFileName(`Invoice ${invoice.number} ${invoiceCompanyName(invoice)} ${name}`);
  }

  function downloadBlob(filename, content, type) {
    const blob = new Blob([content], { type });
    downloadGeneratedBlob(filename, blob);
  }

  function downloadGeneratedBlob(filename, blob) {
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
      els.googleButton.classList.remove("hidden");
      els.syncNowGoogle.classList.add("hidden");
      els.googleStatus.textContent = "Google sign-in is ready once a Client ID is saved.";
      return;
    }

    if (!window.google?.accounts?.id) {
      els.googleStatus.textContent = "Google sign-in is loading.";
      return;
    }

    setupGoogleTokenClient(clientId);
    const signedIn = Boolean(state.account);
    els.syncNowGoogle.classList.toggle("hidden", !signedIn);
    els.googleButton.classList.toggle("hidden", signedIn);

    if (signedIn) {
      els.googleButton.innerHTML = "";
      updateGoogleStatus();
      return;
    }

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
        ? `Google Drive sync is on. Last saved ${formatSyncTime(lastGoogleSyncAt)}.`
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

  function queueCloudSync(delayMs = 0) {
    if (!state.account || applyingCloudState) return;

    window.clearTimeout(cloudSyncTimer);
    cloudSyncTimer = window.setTimeout(() => {
      pushGoogleSaveWithReconnect().catch(() => {
        updateGoogleStatus("Google sync paused. Click Sync now to reconnect.");
      });
    }, Math.max(0, delayMs));
  }

  async function ensureGoogleAccessToken() {
    if (googleAccessToken) return true;
    if (!state.account) return false;

    if (window.location.protocol === "file:") {
      updateGoogleStatus("Google sync needs the app opened from http://localhost or HTTPS.");
      return false;
    }

    if (!window.google?.accounts?.oauth2) {
      updateGoogleStatus("Google sync will start when Google finishes loading.");
      return false;
    }

    if (!cloudReconnectPromise) {
      cloudReconnectPromise = requestGoogleDriveAccess("")
        .then(() => Boolean(googleAccessToken))
        .catch(() => {
          updateGoogleStatus("Google needs Drive permission again. Click Sync now.");
          return false;
        })
        .finally(() => {
          cloudReconnectPromise = null;
        });
    }

    return cloudReconnectPromise;
  }

  async function pushGoogleSaveWithReconnect(retry = true) {
    const hasAccess = await ensureGoogleAccessToken();
    if (!hasAccess) return;

    try {
      await pushGoogleSave();
    } catch (error) {
      if (retry && state.account && !googleAccessToken) {
        const refreshed = await ensureGoogleAccessToken();
        if (refreshed) {
          await pushGoogleSaveWithReconnect(false);
          return;
        }
      }
      throw error;
    }
  }

  async function pullThenPushGoogleSave() {
    const file = await findGoogleSaveFile();
    googleDriveFileId = file?.id || "";

    if (file?.id) {
      const remotePayload = await downloadGoogleSave(file.id);
      const remoteState = normalizeRemoteState(remotePayload);
      if (shouldUseRemoteState(remoteState)) {
        applyRemoteState(remoteState);
        lastGoogleSyncAt = new Date().toISOString();
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
      lastGoogleSyncAt = new Date().toISOString();
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

  function toggleProductMenu() {
    const willOpen = els.productMenu.classList.contains("hidden");
    els.productMenu.classList.toggle("hidden", !willOpen);
    els.productSwitcher.setAttribute("aria-expanded", String(willOpen));
  }

  function closeProductMenu() {
    els.productMenu.classList.add("hidden");
    els.productSwitcher.setAttribute("aria-expanded", "false");
  }

  function selectProduct(product) {
    const isPlexPoint = product === "plexpoint";
    els.productTitle.textContent = isPlexPoint ? "PlexPoint" : "Simply Pay";
    els.productEyebrow.classList.toggle("hidden", isPlexPoint);
    els.brandMark.src = isPlexPoint ? "icons/plexpoint-pay-logo.png" : "icons/simply-pay-logo.svg";
    els.brandMark.alt = isPlexPoint ? "PlexPoint" : "";
    document.title = isPlexPoint ? "PlexPoint" : "Simply Pay";
    els.workspace.classList.toggle("plexpoint-workspace", isPlexPoint);
    els.billingContent.classList.toggle("hidden", isPlexPoint);
    els.productMenu.querySelectorAll("[data-product]").forEach((item) => {
      const selected = item.dataset.product === product;
      item.classList.toggle("active", selected);
      item.toggleAttribute("aria-current", selected);
    });
    closeProductMenu();
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
    els.chargeType.addEventListener("change", updateChargeTypeControls);
    els.cancelEdit.addEventListener("click", resetEntryForm);
    els.logList.addEventListener("click", handleLogAction);
    els.historyList.addEventListener("click", handleHistoryAction);
    els.clearLog.addEventListener("click", clearLog);
    els.workCalendar.addEventListener("click", handleCalendarAction);
    els.calendarPrev.addEventListener("click", () => showCalendarMonth(-1));
    els.calendarNext.addEventListener("click", () => showCalendarMonth(1));
    els.calendarToday.addEventListener("click", showCurrentCalendarMonth);
    els.createInvoice.addEventListener("click", createInvoice);
    els.invoiceForm.addEventListener("input", syncInvoiceDraftFromForm);
    els.invoiceForm.addEventListener("change", syncInvoiceDraftFromForm);
    els.settingsForm.addEventListener("submit", (event) => event.preventDefault());
    els.settingsForm.addEventListener("input", (event) => {
      if (event.target === els.newCompanyName || els.companiesList.contains(event.target)) return;
      syncSettingsFromForm();
    });
    els.settingsForm.addEventListener("change", (event) => {
      if (event.target === els.newCompanyName || els.companiesList.contains(event.target)) return;
      syncSettingsFromForm();
    });
    els.addCompany.addEventListener("click", addCompany);
    els.newCompanyName.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      addCompany();
    });
    els.companiesList.addEventListener("click", handleCompanyAction);
    els.companiesList.addEventListener("change", handleCompanyChange);
    els.productSwitcher.addEventListener("click", toggleProductMenu);
    els.productMenu.addEventListener("click", (event) => {
      const product = event.target.closest("[data-product]")?.dataset.product;
      if (product) selectProduct(product);
    });
    els.openSettings.addEventListener("click", openSettings);
    els.closeSettings.addEventListener("click", closeSettings);
    els.settingsDone.addEventListener("click", closeSettings);
    els.settingsOverlay.addEventListener("click", (event) => {
      if (event.target === els.settingsOverlay) closeSettings();
    });
    document.addEventListener("click", (event) => {
      if (!els.productMenu.classList.contains("hidden") && !event.target.closest(".product-switcher")) closeProductMenu();
    });
    els.signOutGoogle.addEventListener("click", signOutGoogle);
    els.syncNowGoogle.addEventListener("click", () => connectGoogleDriveSync(true));
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!els.settingsOverlay.classList.contains("hidden")) closeSettings();
      closeProductMenu();
    });
    window.addEventListener("load", scheduleGoogleSignIn);
  }

  bindEvents();
  syncFormsFromState();
  saveState({ touch: false, queueSync: false });
  render();
  registerServiceWorker();
})();
