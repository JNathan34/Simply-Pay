(function () {
  "use strict";

  const STORAGE_KEY = "hoursLogApp.v1";
  const OLD_STORAGE_KEY = "simpleInvoiceApp.v1";
  const PRODUCT_MODE_KEY = "simplyPay.activeProduct";
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
    plexPayments: [],
    moneyOwed: [],
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
      moneyOwedCurrency: "GBP",
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
  let googleIdCredential = "";
  let googleAccessToken = "";
  let googleDriveFileId = "";
  let googleTokenRequest = null;
  let cloudSyncTimer = null;
  let cloudSyncing = false;
  let cloudSyncPending = false;
  let cloudReconnectPromise = null;
  let accountSyncing = false;
  let accountSyncPending = false;
  let accountSyncReady = null;
  let applyingCloudState = false;
  let lastGoogleSyncAt = "";
  let arrivalGoogleRefreshRequested = false;
  let calendarMonthDate = startOfMonthDate(todayIso());
  let selectedCalendarDate = todayIso();
  let activeProduct = ["plexpoint", "money-owed"].includes(localStorage.getItem(PRODUCT_MODE_KEY)) ? localStorage.getItem(PRODUCT_MODE_KEY) : "simply-pay";
  let selectedOwedId = null;
  const PLEXPOINT_API = "https://plexpoint.uk/api/portal/admin/";
  const PLEXPOINT_PLEX_API = "https://plexpoint.uk/api/portal/plex/";
  const PLEX_MANAGER_SESSION_KEY = "plexpoint_manager_session";
  const plexManager = { users: [], selectedId: null, detail: null, loaded: false, editingPaymentId: null };
  const plexImport = { busy: false, users: [] };
  let plexDemoStatus = { total: 0, enabled: 0, active: false };
  let plexSort = { column: null, direction: "asc" };

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
    plexpointContent: document.querySelector("#plexpointContent"),
    moneyOwedContent: document.querySelector("#moneyOwedContent"),
    moneyOwedForm: document.querySelector("#moneyOwedForm"),
    owedPerson: document.querySelector("#owedPerson"),
    owedPeopleOptions: document.querySelector("#owedPeopleOptions"),
    owedAmount: document.querySelector("#owedAmount"),
    owedReason: document.querySelector("#owedReason"),
    owedTotal: document.querySelector("#owedTotal"),
    owedPeople: document.querySelector("#owedPeople"),
    owedCount: document.querySelector("#owedCount"),
    moneyOwedList: document.querySelector("#moneyOwedList"),
    moneyOwedEmpty: document.querySelector("#moneyOwedEmpty"),
    owedDetailEmpty: document.querySelector("#owedDetailEmpty"),
    owedDetailContent: document.querySelector("#owedDetailContent"),
    owedAddToTabForm: document.querySelector("#owedAddToTabForm"),
    owedAddToTabAmount: document.querySelector("#owedAddToTabAmount"),
    owedAddToTabReason: document.querySelector("#owedAddToTabReason"),
    moneyPaymentForm: document.querySelector("#moneyPaymentForm"),
    owedPaymentAmount: document.querySelector("#owedPaymentAmount"),
    owedPaymentDate: document.querySelector("#owedPaymentDate"),
    owedPaymentHistory: document.querySelector("#owedPaymentHistory"),
    deleteOwedDebt: document.querySelector("#deleteOwedDebt"),
    productSwitcher: document.querySelector("#productSwitcher"),
    productMenu: document.querySelector("#productMenu"),
    brandMark: document.querySelector("#brandMark"),
    productTitle: document.querySelector("#productTitle"),
    productEyebrow: document.querySelector("#productEyebrow"),
    openSettings: document.querySelector("#openSettings"),
    closeSettings: document.querySelector("#closeSettings"),
    settingsDone: document.querySelector("#settingsDone"),
    settingsOverlay: document.querySelector("#settingsOverlay"),
    settingsEyebrow: document.querySelector("#settingsEyebrow"),
    settingsTitle: document.querySelector("#settingsTitle"),
    plexpointSettings: document.querySelector("#plexpointSettings"),
    plexpointSettingsDone: document.querySelector("#plexpointSettingsDone"),
    plexImportLoad: document.querySelector("#plexImportLoad"),
    plexImportStatus: document.querySelector("#plexImportStatus"),
    plexImportList: document.querySelector("#plexImportList"),
    plexImportFooter: document.querySelector("#plexImportFooter"),
    plexImportAll: document.querySelector("#plexImportAll"),
    plexImportSave: document.querySelector("#plexImportSave"),
    plexUsersLoad: document.querySelector("#plexUsersLoad"),
    plexDemoUsers: document.querySelector("#plexDemoUsers"),
    plexDemoToggle: document.querySelector("#plexDemoToggle"),
    plexManagedUsers: document.querySelector("#plexManagedUsers"),
    accountName: document.querySelector("#accountName"),
    accountEmail: document.querySelector("#accountEmail"),
    accountAvatar: document.querySelector("#accountAvatar"),
    googleButton: document.querySelector("#googleButton"),
    googleAccountSection: document.querySelector("#googleAccountSection"),
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
    moneyOwedCurrency: document.querySelector("#moneyOwedCurrency"),
    currencySymbols: document.querySelectorAll("[data-currency-symbol]"),
    defaultRate: document.querySelector("#defaultRate"),
    defaultWork: document.querySelector("#defaultWork"),
    newCompanyName: document.querySelector("#newCompanyName"),
    addCompany: document.querySelector("#addCompany"),
    companiesList: document.querySelector("#companiesList"),
    nextInvoiceNumber: document.querySelector("#nextInvoiceNumber"),
    darkMode: document.querySelector("#darkMode"),
    plexpointNotice: document.querySelector("#plexpointNotice"),
    plexSigninPanel: document.querySelector("#plexSigninPanel"),
    plexSigninButton: document.querySelector("#plexSigninButton"),
    plexLiveContent: document.querySelector("#plexLiveContent"),
    plexMonthlyRevenue: document.querySelector("#plexMonthlyRevenue"),
    plexActiveCustomers: document.querySelector("#plexActiveCustomers"),
    plexDueSoonTotal: document.querySelector("#plexDueSoonTotal"),
    plexOverdueTotal: document.querySelector("#plexOverdueTotal"),
    plexSearch: document.querySelector("#plexSearch"),
    plexPaymentTable: document.querySelector("#plexPaymentTable"),
    plexUserRows: document.querySelector("#plexUserRows"),
    plexEmptyUsers: document.querySelector("#plexEmptyUsers"),
    plexEmptyDetail: document.querySelector("#plexEmptyDetail"),
    plexDetail: document.querySelector("#plexDetail"),
    plexCustomerName: document.querySelector("#plexCustomerName"),
    plexCustomerEmail: document.querySelector("#plexCustomerEmail"),
    plexCustomerStatus: document.querySelector("#plexCustomerStatus"),
    plexArrears: document.querySelector("#plexArrears"),
    plexTierPicker: document.querySelector("#plexTierPicker"),
    plexAccessPicker: document.querySelector("#plexAccessPicker"),
    plexPlanForm: document.querySelector("#plexPlanForm"),
    plexTier: document.querySelector("#plexTier"),
    plexAccess: document.querySelector("#plexAccess"),
    plexStartsOn: document.querySelector("#plexStartsOn"),
    plexNextDueOn: document.querySelector("#plexNextDueOn"),
    plexPaymentForm: document.querySelector("#plexPaymentForm"),
    plexPaymentFormTitle: document.querySelector("#plexPaymentFormTitle"),
    plexPaymentSubmitText: document.querySelector("#plexPaymentSubmitText"),
    plexCancelPaymentEdit: document.querySelector("#plexCancelPaymentEdit"),
    plexAmount: document.querySelector("#plexAmount"),
    plexMonths: document.querySelector("#plexMonths"),
    plexMethodPicker: document.querySelector("#plexMethodPicker"),
    plexMethod: document.querySelector("#plexMethod"),
    plexReceivedOn: document.querySelector("#plexReceivedOn"),
    plexReference: document.querySelector("#plexReference"),
    plexPaymentHistory: document.querySelector("#plexPaymentHistory"),
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
    const plexPayments = Array.isArray(stored.plexPayments)
      ? stored.plexPayments.map(normalizePlexPayment).filter(Boolean)
      : Array.isArray(stored.plexSubscriptions)
        ? stored.plexSubscriptions.map(subscriptionToPayment).filter(Boolean)
      : [];
    const moneyOwed = Array.isArray(stored.moneyOwed) ? stored.moneyOwed.map(normalizeMoneyOwed).filter(Boolean) : [];
    const invoiceDraft = { ...defaultState.invoiceDraft, ...(stored.invoiceDraft || {}) };
    invoiceDraft.company = companyChoice(invoiceDraft.company || settings.defaultCompany, invoiceCompanyOptionsFromEntries(entries, settings));

    return {
      ...structuredClone(defaultState),
      ...stored,
      entries,
      invoices,
      plexPayments,
      moneyOwed,
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

  function normalizePlexPayment(payment) {
    const source = payment && typeof payment === "object" ? payment : {};
    const user = String(source.user || "").trim();
    const plan = String(source.plan || "").trim();
    const amount = roundMoney(source.amount);
    if (!user || !plan || amount <= 0) return null;
    return {
      id: String(source.id || uid()),
      user,
      plan,
      amount,
      status: source.status === "paid" ? "paid" : "due",
      dueDate: String(source.dueDate || "").slice(0, 10),
    };
  }

  function normalizeMoneyOwed(item) {
    const source = item && typeof item === "object" ? item : {};
    const person = String(source.person || "").trim();
    const amount = roundMoney(source.amount);
    if (!person || amount <= 0) return null;
    return {
      id: String(source.id || uid()), person, amount,
      reason: String(source.reason || "").trim().slice(0, 160),
      payments: Array.isArray(source.payments) ? source.payments.map((payment) => ({
        id: String(payment?.id || uid()), amount: roundMoney(payment?.amount), date: String(payment?.date || "").slice(0, 10),
      })).filter((payment) => payment.amount > 0) : [],
    };
  }

  function subscriptionToPayment(subscription) {
    const source = subscription && typeof subscription === "object" ? subscription : {};
    return normalizePlexPayment({
      id: source.id,
      user: source.name,
      plan: source.cycle === "yearly" ? "Yearly plan" : "Monthly plan",
      amount: source.price,
      status: "due",
    });
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
      moneyOwedCurrency: ["GBP", "USD", "EUR", "CAD", "AUD"].includes(settings.moneyOwedCurrency)
        ? settings.moneyOwedCurrency
        : (settings.currency || defaultState.settings.moneyOwedCurrency),
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

  function owedMoney(value) {
    return money(value, state.settings.moneyOwedCurrency || "GBP");
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
      moneyOwedCurrency: els.moneyOwedCurrency.value,
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
    renderMoneyOwed();
    if (shouldPrepareGoogleSignIn()) scheduleGoogleSignIn();
    refreshIcons();
  }

  function owedBalance(item) {
    return roundMoney(item.amount - item.payments.reduce((total, payment) => total + payment.amount, 0));
  }

  function owedStatus(item) {
    const balance = owedBalance(item);
    return balance <= 0 ? "settled" : "owed";
  }

  function owedStatusClass(status) {
    return status === "settled" ? "paid" : "unpaid";
  }

  function owedPersonKey(person) {
    return String(person || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
  }

  function renderMoneyOwed() {
    const debts = state.moneyOwed || [];
    const open = debts.filter((item) => owedBalance(item) > 0);
    const total = open.reduce((sum, item) => sum + owedBalance(item), 0);
    els.owedTotal.textContent = owedMoney(total);
    els.owedPeople.textContent = String(open.length);
    els.owedCount.textContent = `${debts.length} ${debts.length === 1 ? "person" : "people"}`;
    els.owedPeopleOptions.innerHTML = debts
      .slice()
      .sort((left, right) => left.person.localeCompare(right.person))
      .map((item) => `<option value="${escapeHtml(item.person)}"></option>`)
      .join("");
    els.moneyOwedEmpty.classList.toggle("hidden", debts.length > 0);
    els.moneyOwedList.innerHTML = debts.slice().sort((a, b) => owedBalance(b) - owedBalance(a)).map((item) => {
      const status = owedStatus(item);
      return `<button class="money-owed-row ${item.id === selectedOwedId ? "selected" : ""}" type="button" data-owed-id="${escapeHtml(item.id)}"><span><strong>${escapeHtml(item.person)}</strong><small>${escapeHtml(item.reason || "No reason added")}</small></span><span><strong>${escapeHtml(owedMoney(owedBalance(item)))}</strong><em class="status-badge ${owedStatusClass(status)}">${escapeHtml(status)}</em></span></button>`;
    }).join("");
    const debt = debts.find((item) => item.id === selectedOwedId);
    els.owedDetailEmpty.classList.toggle("hidden", Boolean(debt));
    els.owedDetailContent.classList.toggle("hidden", !debt);
    if (!debt) { refreshIcons(); return; }
    els.owedPaymentHistory.innerHTML = debt.payments.length ? debt.payments.slice().reverse().map((payment) => `<div class="owed-payment-row"><span>${escapeHtml(formatShortDate(payment.date))}</span><strong>${escapeHtml(owedMoney(payment.amount))}</strong></div>`).join("") : "<p>No payments recorded yet.</p>";
    refreshIcons();
  }

  function addMoneyOwed(event) {
    event.preventDefault();
    const person = els.owedPerson.value.trim();
    const amount = roundMoney(els.owedAmount.value);
    if (!person || amount <= 0) return;
    const reason = els.owedReason.value.trim();
    const existing = state.moneyOwed.find((item) => owedPersonKey(item.person) === owedPersonKey(person));
    if (existing) {
      existing.amount = roundMoney(existing.amount + amount);
      if (reason) existing.reason = reason;
      selectedOwedId = existing.id;
      els.moneyOwedForm.reset(); saveState(); renderMoneyOwed(); showToast(`Added ${owedMoney(amount)} to ${existing.person}'s tab.`);
      return;
    }

    const debt = { id: uid(), person, amount, reason, payments: [] };
    state.moneyOwed.push(debt); selectedOwedId = debt.id;
    els.moneyOwedForm.reset(); saveState(); renderMoneyOwed(); showToast("Debt added.");
  }

  function recordOwedPayment(event) {
    event.preventDefault();
    const debt = state.moneyOwed.find((item) => item.id === selectedOwedId);
    const amount = roundMoney(els.owedPaymentAmount.value);
    if (!debt || amount <= 0) return;
    debt.payments.push({ id: uid(), amount, date: els.owedPaymentDate.value || todayIso() });
    els.moneyPaymentForm.reset(); els.owedPaymentDate.value = todayIso(); saveState(); renderMoneyOwed(); showToast("Payment recorded.");
  }

  function addToOwedTab(event) {
    event.preventDefault();
    const debt = state.moneyOwed.find((item) => item.id === selectedOwedId);
    const amount = roundMoney(els.owedAddToTabAmount.value);
    if (!debt || amount <= 0) return;
    const reason = els.owedAddToTabReason.value.trim();
    debt.amount = roundMoney(debt.amount + amount);
    if (reason) debt.reason = reason;
    els.owedAddToTabForm.reset(); saveState(); renderMoneyOwed(); showToast(`Added ${owedMoney(amount)} to ${debt.person}'s debt.`);
  }

  function removeMoneyOwed() {
    const debt = state.moneyOwed.find((item) => item.id === selectedOwedId);
    if (!debt || !window.confirm(`Remove ${debt.person}'s debt record?`)) return;
    state.moneyOwed = state.moneyOwed.filter((item) => item.id !== debt.id); selectedOwedId = null;
    saveState(); renderMoneyOwed(); showToast("Debt removed.");
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

  function renderPlexPayments() {
    const payments = [...state.plexPayments].sort((left, right) => left.user.localeCompare(right.user));
    const received = payments.filter((payment) => payment.status === "paid").reduce((total, payment) => total + payment.amount, 0);
    const outstanding = payments.filter((payment) => payment.status === "due").reduce((total, payment) => total + payment.amount, 0);

    els.paymentUserCount.textContent = String(new Set(payments.map((payment) => payment.user.toLowerCase())).size);
    els.paymentReceivedTotal.textContent = money(received);
    els.paymentOutstandingTotal.textContent = money(outstanding);
    els.paymentListCount.textContent = `${payments.length} saved`;
    els.emptyPayments.classList.toggle("hidden", payments.length > 0);
    els.paymentList.innerHTML = payments
      .map((payment) => {
        const dueDate = payment.dueDate ? `Due ${formatShortDate(payment.dueDate)}` : "No due date";
        const statusText = payment.status === "paid" ? "Paid" : "Due";
        return `
          <article class="subscription-row">
            <div class="subscription-mark">${escapeHtml(payment.user.charAt(0).toUpperCase())}</div>
            <div class="subscription-details">
              <strong>${escapeHtml(payment.user)}</strong>
              <span>${escapeHtml(payment.plan)} · ${escapeHtml(dueDate)}</span>
            </div>
            <div class="subscription-cost"><strong>${money(payment.amount)}</strong><span class="status-badge ${payment.status === "paid" ? "paid" : "unpaid"}">${statusText}</span></div>
            <button class="icon-only ghost" type="button" data-payment-action="remove" data-payment-id="${escapeHtml(payment.id)}" title="Remove ${escapeHtml(payment.user)}'s payment">
              <i data-lucide="trash-2"></i><span class="sr-only">Remove ${escapeHtml(payment.user)}'s payment</span>
            </button>
          </article>`;
      })
      .join("");
  }

  function submitPayment(event) {
    event.preventDefault();
    const user = els.paymentUser.value.trim();
    const plan = els.paymentPlan.value.trim();
    const amount = roundMoney(els.paymentAmount.value);
    if (!user || !plan || amount <= 0) {
      showToast("Add a user, plan, and amount.");
      return;
    }

    state.plexPayments.push({
      id: uid(),
      user,
      plan,
      amount,
      status: els.paymentStatus.value === "paid" ? "paid" : "due",
      dueDate: els.paymentDueDate.value,
    });
    els.paymentForm.reset();
    saveState();
    renderPlexPayments();
    refreshIcons();
    showToast(`Payment for ${user} saved.`);
  }

  function handlePaymentAction(event) {
    const button = event.target.closest("[data-payment-action]");
    if (!button || button.dataset.paymentAction !== "remove") return;
    const payment = state.plexPayments.find((item) => item.id === button.dataset.paymentId);
    if (!payment) return;
    state.plexPayments = state.plexPayments.filter((item) => item.id !== payment.id);
    saveState();
    renderPlexPayments();
    refreshIcons();
    showToast(`${payment.user}'s payment removed.`);
  }

  const plexToday = () => new Date().toISOString().slice(0, 10);
  const plexMoney = (minor, currency = "GBP") => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(Number(minor || 0) / 100);
  const plexDate = (value) => value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value)) : "—";
  const plexDateInput = (value) => value ? new Date(value).toISOString().slice(0, 10) : "";
  const plexTierSlug = (name) => String(name || "none").toLowerCase().replace(/\s+tier$/, "").replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "") || "none";
  const plexTierIcons = { bronze: "user-round", silver: "shield-check", gold: "crown", diamond: "gem", ruby: "gem", platinum: "zap", vip: "star", none: "gem" };
  const plexAccessIcons = { enabled: "shield-check", pending: "clock-3", suspended: "shield-alert", cancelled: "shield-x" };
  const plexMethodIcons = { bank_transfer: "landmark", cash: "banknote", card: "credit-card", paypal: "wallet-cards", other: "ellipsis" };
  const plexStatusClass = (status) => {
    const normalized = String(status || "").toLowerCase().replace(/\s+/g, "_");
    if (["paid", "enabled"].includes(normalized)) return "paid";
    if (["pending", "awaiting_payment"].includes(normalized)) return "pending";
    if (["due", "due_soon", "unpaid"].includes(normalized)) return "due";
    if (["overdue", "suspended", "cancelled", "disabled"].includes(normalized)) return "overdue";
    return "neutral";
  };
  const plexInitial = (name) => String(name || "?").trim().charAt(0).toUpperCase() || "?";

  function plexPickerIcon(type, value) {
    if (type === "tier") return plexTierIcons[plexTierSlug(value)] || "gem";
    if (type === "access") return plexAccessIcons[value] || "shield";
    return plexMethodIcons[value] || "wallet";
  }

  function renderPlexCustomPicker(picker, select) {
    const type = picker.dataset.picker;
    const selected = select.selectedOptions[0];
    const trigger = picker.querySelector(".plex-picker-trigger");
    const menu = picker.querySelector(".plex-picker-menu");
    if (!selected || !trigger || !menu) return;
    trigger.innerHTML = `<i class="plex-picker-icon" data-lucide="${plexPickerIcon(type, selected.value)}" aria-hidden="true"></i><span>${escapeHtml(selected.textContent)}</span><i class="plex-picker-chevron" data-lucide="chevron-down" aria-hidden="true"></i>`;
    menu.innerHTML = Array.from(select.options).map((option) => `<button type="button" role="option" aria-selected="${option.selected}" data-picker-type="${type}" data-picker-value="${escapeHtml(option.value)}" data-tier="${type === "tier" ? escapeHtml(plexTierSlug(option.value)) : ""}"><i class="plex-picker-icon" data-lucide="${plexPickerIcon(type, option.value)}" aria-hidden="true"></i><span>${escapeHtml(option.textContent)}</span></button>`).join("");
  }

  function renderPlexCustomPickers() {
    renderPlexCustomPicker(els.plexTierPicker, els.plexTier);
    renderPlexCustomPicker(els.plexAccessPicker, els.plexAccess);
    renderPlexCustomPicker(els.plexMethodPicker, els.plexMethod);
  }

  function updatePlexAccessPicker() {
    els.plexAccessPicker.dataset.access = els.plexAccess.value;
    renderPlexCustomPicker(els.plexAccessPicker, els.plexAccess);
  }

  function updatePlexMethodPicker() {
    els.plexMethodPicker.dataset.method = els.plexMethod.value;
    renderPlexCustomPicker(els.plexMethodPicker, els.plexMethod);
  }

  function plexMessage(message = "", error = false) {
    els.plexpointNotice.textContent = message;
    els.plexpointNotice.classList.toggle("hidden", !message);
    els.plexpointNotice.classList.toggle("error", error);
  }

  async function plexRequest(path, body) {
    const managerSession = localStorage.getItem(PLEX_MANAGER_SESSION_KEY) || sessionStorage.getItem(PLEX_MANAGER_SESSION_KEY);
    if (managerSession && !localStorage.getItem(PLEX_MANAGER_SESSION_KEY)) localStorage.setItem(PLEX_MANAGER_SESSION_KEY, managerSession);
    const response = await fetch(`${PLEXPOINT_API}${path}`, {
      method: body ? "POST" : "GET", credentials: "include", cache: "no-store",
      headers: { ...(body ? { "Content-Type": "application/json", "X-PlexPoint-Request": "1" } : {}), ...(managerSession ? { "X-PlexPoint-Manager-Session": managerSession } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.message || "PlexPoint billing is unavailable."), { status: response.status });
    return data;
  }

  function plexImportMessage(message = "", error = false) {
    els.plexImportStatus.textContent = message;
    els.plexImportStatus.classList.toggle("error", error);
  }

  function renderPlexImportUsers() {
    const available = plexImport.users.filter((user) => user.status === "available");
    els.plexImportList.innerHTML = available.map((user) => {
      const avatar = user.avatarUrl
        ? `<img src="${escapeHtml(user.avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
        : `<span>${escapeHtml(plexInitial(user.displayName))}</span>`;
      return `<label class="plexpoint-import-user"><input type="checkbox" value="${escapeHtml(user.overseerrId)}" data-plex-import-user /><span class="plexpoint-import-avatar">${avatar}</span><span><strong>${escapeHtml(user.displayName)}</strong><small>${escapeHtml(user.username)} · ${escapeHtml(user.email)}</small></span></label>`;
    }).join("");
    els.plexImportList.classList.toggle("hidden", available.length === 0);
    els.plexImportFooter.classList.toggle("hidden", available.length === 0);
    els.plexImportAll.checked = false;
  }

  function renderManagedPlexUsers() {
    const users = plexManager.users.filter((user) => user.accountStatus !== "disabled");
    els.plexManagedUsers.innerHTML = users.length ? users.map((user) => {
      const avatar = user.plexProfileAvatarUrl
        ? `<img src="${escapeHtml(user.plexProfileAvatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
        : `<span>${escapeHtml(plexInitial(user.displayName))}</span>`;
      return `<article class="plexpoint-managed-user"><span class="plexpoint-import-avatar">${avatar}</span><span><strong>${escapeHtml(user.displayName)}</strong><small>${escapeHtml(user.plexUsername || user.email)}</small></span><div><button class="icon-only ghost" type="button" data-plex-user-action="rename" data-plex-user-id="${escapeHtml(user.id)}" title="Rename ${escapeHtml(user.displayName)}"><i data-lucide="pencil"></i></button><button class="icon-only ghost danger" type="button" data-plex-user-action="remove" data-plex-user-id="${escapeHtml(user.id)}" title="Remove ${escapeHtml(user.displayName)}"><i data-lucide="trash-2"></i></button></div></article>`;
    }).join("") : "<p class=\"settings-note\">No active payment users loaded yet.</p>";
    refreshIcons();
  }

  async function loadManagedPlexUsers() {
    plexImportMessage("Loading payment users…");
    try { await loadPlexManager(); renderManagedPlexUsers(); plexImportMessage(""); }
    catch (error) { plexImportMessage(error.message || "Could not load payment users.", true); }
  }

  async function managePlexUser(event) {
    const button = event.target.closest("[data-plex-user-action]");
    if (!button || plexImport.busy) return;
    const user = plexManager.users.find((item) => item.id === button.dataset.plexUserId);
    if (!user) return;
    if (button.dataset.plexUserAction === "rename") {
      const displayName = window.prompt("Customer name", user.displayName);
      if (displayName === null || displayName.trim() === user.displayName) return;
      setPlexImportBusy(true); plexImportMessage("Saving name…");
      try {
        await plexRequest("billing", { action: "rename_user", userId: user.id, displayName: displayName.trim() });
        await loadPlexManager(); renderManagedPlexUsers(); plexImportMessage("Customer renamed.");
      } catch (error) { plexImportMessage(error.message || "Could not rename this customer.", true); }
      finally { setPlexImportBusy(false); }
      return;
    }
    if (!window.confirm(`Remove ${user.displayName} from the payment manager? Their payment history will be kept.`)) return;
    setPlexImportBusy(true); plexImportMessage("Removing customer…");
    try {
      await plexRequest("billing", { action: "remove_user", userId: user.id });
      if (plexManager.selectedId === user.id) { plexManager.selectedId = null; plexManager.detail = null; }
      await loadPlexManager(); renderManagedPlexUsers(); plexImportMessage("Customer removed from the payment manager.");
    } catch (error) { plexImportMessage(error.message || "Could not remove this customer.", true); }
    finally { setPlexImportBusy(false); }
  }

  function setPlexImportBusy(busy) {
    plexImport.busy = busy;
    for (const control of [els.plexImportLoad, els.plexImportAll, els.plexImportSave, els.plexDemoUsers, els.plexDemoToggle]) control.disabled = busy;
    for (const control of els.plexImportList.querySelectorAll("input")) control.disabled = busy;
  }

  function renderPlexDemoToggle() {
    const added = Number(plexDemoStatus.total || 0) > 0;
    els.plexDemoToggle.checked = Boolean(plexDemoStatus.active);
    els.plexDemoToggle.disabled = !added || plexImport.busy;
    els.plexDemoUsers.classList.toggle("hidden", added);
  }

  async function loadPlexDemoStatus() {
    try {
      plexDemoStatus = await plexRequest("billing", { action: "demo_users_status" });
      renderPlexDemoToggle();
    } catch (error) {
      plexImportMessage(error.message || "Could not load the demo-user setting.", true);
    }
  }

  async function createPlexDemoUsers() {
    if (plexImport.busy) return;
    setPlexImportBusy(true);
    plexImportMessage("Adding 48 paid demo customers…");
    try {
      const result = await plexRequest("billing", { action: "create_demo_users" });
      const created = Number(result.created || 0);
      plexImportMessage(created
        ? `${created} paid demo users added — £${(Number(result.monthlyTotalMinor || 0) / 100).toFixed(2)} monthly in total.`
        : "The 48 paid demo users are already in the payment manager.");
      await loadPlexManager();
      renderManagedPlexUsers();
      await loadPlexDemoStatus();
    } catch (error) { plexImportMessage(error.message || "Could not add demo users.", true); }
    finally { setPlexImportBusy(false); renderPlexDemoToggle(); }
  }

  async function setPlexDemoUsersEnabled() {
    if (plexImport.busy || !Number(plexDemoStatus.total || 0)) return;
    const enabled = els.plexDemoToggle.checked;
    setPlexImportBusy(true);
    plexImportMessage(enabled ? "Showing paid demo users…" : "Hiding paid demo users…");
    try {
      plexDemoStatus = await plexRequest("billing", { action: "set_demo_users_enabled", enabled });
      await loadPlexManager();
      renderManagedPlexUsers();
      plexImportMessage(enabled ? "Paid demo users are now visible." : "Paid demo users are now hidden.");
    } catch (error) {
      els.plexDemoToggle.checked = !enabled;
      plexImportMessage(error.message || "Could not update the demo-user setting.", true);
    } finally {
      setPlexImportBusy(false);
      renderPlexDemoToggle();
    }
  }

  async function loadPlexImportUsers() {
    if (plexImport.busy) return;
    setPlexImportBusy(true);
    plexImportMessage("Loading Overseerr users…");
    try {
      const data = await plexRequest("overseerr-users");
      if (!Array.isArray(data.users)) throw new Error("Overseerr returned an unexpected user list.");
      plexImport.users = data.users;
      renderPlexImportUsers();
      const count = data.users.filter((user) => user.status === "available").length;
      plexImportMessage(count ? `Choose from ${count} user${count === 1 ? "" : "s"} ready to import.` : "Every usable Overseerr user is already in the payment manager.");
    } catch (error) { plexImportMessage(error.message || "Could not load Overseerr users.", true); }
    finally { setPlexImportBusy(false); refreshIcons(); }
  }

  async function importPlexUsers() {
    if (plexImport.busy) return;
    const userIds = [...els.plexImportList.querySelectorAll("input[data-plex-import-user]:checked")].map((input) => Number(input.value));
    if (!userIds.length) { plexImportMessage("Choose at least one user to import.", true); return; }
    setPlexImportBusy(true);
    plexImportMessage("Importing selected users…");
    try {
      const result = await plexRequest("overseerr-users", { action: "import_users", userIds });
      const imported = Array.isArray(result.imported) ? result.imported.length : 0;
      plexImportMessage(imported ? `${imported} user${imported === 1 ? "" : "s"} imported into the payment manager.` : "No new users were imported.");
      const importedIds = new Set((result.imported || []).map((user) => user.overseerrId));
      plexImport.users = plexImport.users.map((user) => importedIds.has(user.overseerrId) ? { ...user, status: "imported" } : user);
      renderPlexImportUsers();
      await loadPlexManager();
    } catch (error) { plexImportMessage(error.message || "Could not import those users.", true); }
    finally { setPlexImportBusy(false); }
  }

  async function plexAuth(action, body = {}) {
    const response = await fetch(`${PLEXPOINT_PLEX_API}${action}`, {
      method: "POST", credentials: "include", cache: "no-store",
      headers: { "Content-Type": "application/json", "X-PlexPoint-Request": "1" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 202) throw new Error(data.message || "Unable to sign in with Plex.");
    return data;
  }

  function renderPlexSummary() {
    const now = Date.now();
    const soon = now + (7 * 24 * 60 * 60 * 1000);
    const active = plexManager.users.filter((user) => user.accountStatus === "enabled" && user.subscription?.status === "enabled");
    const dueSoon = active.filter((user) => {
      const due = Date.parse(user.billing?.nextDueAt || "");
      return Number.isFinite(due) && due >= now && due <= soon;
    });
    const overdue = plexManager.users.filter((user) => user.billing?.status === "overdue");
    const revenueMinor = active.reduce((total, user) => total + Number(user.subscription?.monthlyPriceMinor || 0), 0);
    const currency = active.find((user) => user.subscription?.currency)?.subscription?.currency || "GBP";
    els.plexMonthlyRevenue.textContent = plexMoney(revenueMinor, currency);
    els.plexActiveCustomers.textContent = String(active.length);
    els.plexDueSoonTotal.textContent = String(dueSoon.length);
    els.plexOverdueTotal.textContent = String(overdue.length);
  }

  function renderPlexUsers() {
    const filter = els.plexSearch.value.trim().toLowerCase();
    const users = plexManager.users.filter((user) => user.accountStatus === "enabled" && [user.displayName, user.email, user.plexUsername].filter(Boolean)
      .some((value) => value.toLowerCase().includes(filter))).map((user, index) => ({ user, index }));
    if (plexSort.column) {
      users.sort((left, right) => {
        const a = plexSortValue(left.user, plexSort.column);
        const b = plexSortValue(right.user, plexSort.column);
        const comparison = typeof a === "string" ? a.localeCompare(b) : a - b;
        return comparison ? comparison * (plexSort.direction === "asc" ? 1 : -1) : left.index - right.index;
      });
    }
    renderPlexSortHeaders();
    els.plexUserRows.innerHTML = users.map(({ user }) => {
      const billing = user.billing;
      const status = billing?.status || user.subscription?.status || "No plan";
      const tier = user.subscription?.tier || "No plan";
      const avatar = user.plexProfileAvatarUrl
        ? `<img class="plex-avatar" src="${escapeHtml(user.plexProfileAvatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
        : `<span class="plex-avatar plex-avatar-fallback" aria-hidden="true">${escapeHtml(plexInitial(user.displayName))}</span>`;
      const outstanding = billing ? plexMoney(billing.outstandingMinor, billing.currency) : "—";
      const outstandingLabel = `<strong>${escapeHtml(outstanding)}</strong>`;
      return `<tr class="${user.id === plexManager.selectedId ? "selected" : ""}" data-plex-user-id="${escapeHtml(user.id)}"><td><div class="plex-customer-cell">${avatar}<div><strong>${escapeHtml(user.displayName)}</strong><span>${escapeHtml(user.plexUsername || user.email)}</span></div></div></td><td><span class="plex-tier-label" data-tier="${escapeHtml(plexTierSlug(tier))}"><i class="plex-tier-icon" data-lucide="${plexPickerIcon("tier", tier)}"></i>${escapeHtml(tier)}</span></td><td><span class="status-badge ${plexStatusClass(status)}">${escapeHtml(status.replaceAll("_", " "))}</span></td><td>${billing?.nextDueAt ? escapeHtml(plexDate(billing.nextDueAt)) : "—"}</td><td class="plex-outstanding-cell">${outstandingLabel}</td></tr>`;
    }).join("");
    els.plexEmptyUsers.classList.toggle("hidden", users.length > 0);
    refreshIcons();
  }

  function plexSortValue(user, column) {
    const billing = user.billing || {};
    if (column === "customer") return (user.displayName || "").toLocaleLowerCase();
    if (column === "plan") {
      const tiers = { "bronze tier": 1, "silver tier": 2, "gold tier": 3, "diamond tier": 4, "ruby tier": 5, "platinum tier": 6, vip: 7 };
      return tiers[(user.subscription?.tier || "").toLocaleLowerCase()] || 0;
    }
    if (column === "status") return (billing.status || user.subscription?.status || "").toLocaleLowerCase();
    if (column === "due") return Date.parse(billing.nextDueAt || "") || Number.MAX_SAFE_INTEGER;
    return Number(billing.outstandingMinor || 0);
  }

  function renderPlexSortHeaders() {
    els.plexPaymentTable.querySelectorAll("[data-plex-sort]").forEach((button) => {
      const active = button.dataset.plexSort === plexSort.column;
      const direction = active ? plexSort.direction : "none";
      button.parentElement.setAttribute("aria-sort", direction === "none" ? "none" : direction === "asc" ? "ascending" : "descending");
      button.querySelector("span").textContent = active ? (direction === "asc" ? "↑" : "↓") : "";
    });
  }

  function sortPlexUsers(column) {
    plexSort = plexSort.column === column
      ? { column, direction: plexSort.direction === "asc" ? "desc" : "asc" }
      : { column, direction: column === "plan" ? "desc" : "asc" };
    renderPlexUsers();
  }

  function renderPlexDetail() {
    const detail = plexManager.detail;
    els.plexEmptyDetail.classList.toggle("hidden", Boolean(detail));
    els.plexDetail.classList.toggle("hidden", !detail);
    if (!detail) { renderPlexSummary(); return; }
    const { account, billing, tiers } = detail;
    const subscription = billing.subscription;
    const period = billing.currentPeriod;
    els.plexCustomerName.textContent = account.displayName;
    els.plexCustomerEmail.textContent = account.email;
    els.plexCustomerStatus.textContent = period?.paymentStatus || subscription?.accessStatus || "No plan";
    els.plexCustomerStatus.className = `status-badge ${plexStatusClass(period?.paymentStatus || subscription?.accessStatus)}`;
    const outstanding = Number(period?.outstandingMinor || 0);
    if (outstanding > 0) {
      const months = Number(period?.monthsDue || 1);
      els.plexArrears.textContent = `${plexMoney(outstanding, period.currency)} outstanding · ${months} month${months === 1 ? "" : "s"} unpaid`;
      els.plexArrears.classList.remove("hidden");
    } else {
      els.plexArrears.textContent = "";
      els.plexArrears.classList.add("hidden");
    }
    const selectedTierName = subscription?.tier || "";
    els.plexTierPicker.dataset.tier = plexTierSlug(selectedTierName);
    els.plexTier.innerHTML = (tiers || []).map((tier) => `<option value="${escapeHtml(tier.id)}" data-tier="${escapeHtml(plexTierSlug(tier.name))}" ${tier.id === subscription?.tierId ? "selected" : ""}>${escapeHtml(tier.name)} — ${escapeHtml(plexMoney(tier.monthlyPriceMinor, tier.currency))} / month</option>`).join("");
    els.plexAccess.value = subscription?.accessStatus || "enabled";
    updatePlexAccessPicker();
    els.plexStartsOn.value = plexDateInput(subscription?.startsAt) || plexToday();
    els.plexNextDueOn.value = plexDateInput(subscription?.endsAt) || plexToday();
    const payments = (billing.payments || []).filter((payment) => payment.status !== "void").slice(0, 8);
    els.plexPaymentHistory.innerHTML = payments.length ? payments.map((payment) => {
      const paymentTier = payment.tier || subscription?.tier || "Payment";
      return `<div class="plex-history-row"><div><strong class="plex-payment-tier plex-tier-label" data-tier="${escapeHtml(plexTierSlug(paymentTier))}"><i class="plex-tier-icon" data-lucide="${plexPickerIcon("tier", paymentTier)}" aria-hidden="true"></i>${escapeHtml(paymentTier)}</strong><span>${escapeHtml(plexDate(payment.receivedAt))} · ${escapeHtml(payment.method || "manual")}${payment.reference ? ` · ${escapeHtml(payment.reference)}` : ""}</span></div><div class="plex-payment-actions"><strong>${escapeHtml(plexMoney(payment.amountMinor, payment.currency))}</strong><button class="icon-only ghost" type="button" data-plex-payment-action="edit" data-payment-id="${escapeHtml(payment.id)}" title="Edit payment"><i data-lucide="pencil"></i></button><button class="icon-only ghost danger" type="button" data-plex-payment-action="remove" data-payment-id="${escapeHtml(payment.id)}" title="Remove payment"><i data-lucide="trash-2"></i></button></div></div>`;
    }).join("") : "<p>No payments recorded yet.</p>";
    renderPlexCustomPickers();
    refreshIcons();
    renderPlexSummary();
  }

  async function selectPlexUser(id) {
    plexManager.selectedId = id;
    plexManager.detail = null;
    renderPlexUsers(); renderPlexDetail(); plexMessage("Loading customer billing…");
    try {
      plexManager.detail = await plexRequest(`billing?userId=${encodeURIComponent(id)}`);
      const period = plexManager.detail.billing?.currentPeriod;
      const userIndex = plexManager.users.findIndex((user) => user.id === id);
      if (userIndex >= 0 && period) {
        const user = plexManager.users[userIndex];
        plexManager.users[userIndex] = {
          ...user,
          billing: {
            ...user.billing,
            status: period.paymentStatus,
            nextDueAt: period.endsAt,
            amountDueMinor: period.amountDueMinor,
            outstandingMinor: period.outstandingMinor,
            monthsDue: period.monthsDue,
            currency: period.currency,
          },
        };
      }
      plexMessage(); renderPlexUsers(); renderPlexDetail();
    }
    catch (error) { plexMessage(error.message, true); }
  }

  async function loadPlexManager() {
    plexMessage("Loading live PlexPoint payment data…");
    try {
      const data = await plexRequest("users");
      plexManager.users = (data.users || []).filter((user) => user.accountStatus !== "disabled"); plexManager.loaded = true;
      els.plexSigninPanel.classList.add("hidden");
      els.plexLiveContent.classList.remove("hidden");
      renderPlexSummary(); renderPlexUsers(); renderPlexDetail(); plexMessage();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        localStorage.removeItem(PLEX_MANAGER_SESSION_KEY);
        sessionStorage.removeItem(PLEX_MANAGER_SESSION_KEY);
        plexManager.users = []; plexManager.detail = null; plexManager.loaded = false;
        els.plexSigninPanel.classList.remove("hidden");
        els.plexLiveContent.classList.add("hidden");
        plexMessage();
      }
      else plexMessage(error.message || "Could not load PlexPoint payments.", true);
    }
  }

  async function startPlexSignin() {
    plexMessage("Opening Plex sign-in…");
    try {
      const returnTo = `${window.location.origin}${window.location.pathname}`;
      window.location.assign(`${PLEXPOINT_PLEX_API}start?returnTo=${encodeURIComponent(returnTo)}`);
    } catch (error) {
      plexMessage(error.message, true);
    }
  }

  async function finishPlexSignin() {
    selectProduct("plexpoint");
    plexMessage("Completing Plex sign-in…");
    try {
      const data = await plexAuth("complete");
      if (data.pending) {
        plexMessage("Waiting for Plex approval. Refresh after you finish signing in.");
        return;
      }
      await loadPlexManager();
    } catch (error) { plexMessage(error.message, true); }
  }

  async function submitPlexPlan(event) {
    event.preventDefault(); if (!plexManager.detail) return;
    plexMessage("Saving membership…");
    try {
      plexManager.detail = await plexRequest("billing", { action: "save_plan", userId: plexManager.detail.account.id, tierId: els.plexTier.value, accessStatus: els.plexAccess.value, startsOn: els.plexStartsOn.value, nextDueOn: els.plexNextDueOn.value });
      await loadPlexManager(); renderPlexDetail(); plexMessage("Membership saved.");
    } catch (error) { plexMessage(error.message, true); }
  }

  async function submitPlexPayment(event) {
    event.preventDefault(); if (!plexManager.detail) return;
    plexMessage("Recording payment…");
    try {
      const editing = plexManager.editingPaymentId;
      plexManager.detail = await plexRequest("billing", editing ? { action: "update_payment", userId: plexManager.detail.account.id, paymentId: editing, amountMinor: Math.round(Number(els.plexAmount.value) * 100), method: els.plexMethod.value, receivedOn: els.plexReceivedOn.value, reference: els.plexReference.value.trim() } : { action: "record_payment", userId: plexManager.detail.account.id, amountMinor: Math.round(Number(els.plexAmount.value) * 100), coverageMonths: Number(els.plexMonths.value), method: els.plexMethod.value, receivedOn: els.plexReceivedOn.value, reference: els.plexReference.value.trim() });
      plexManager.editingPaymentId = null; els.plexPaymentForm.reset(); updatePlexMethodPicker(); els.plexReceivedOn.value = plexToday();
      await loadPlexManager(); renderPlexDetail(); plexMessage(editing ? "Payment updated." : "Payment recorded.");
    } catch (error) { plexMessage(error.message, true); }
  }

  function resetPlexPaymentEditor() {
    plexManager.editingPaymentId = null;
    els.plexPaymentForm.reset();
    els.plexReceivedOn.value = plexToday();
    updatePlexMethodPicker();
    els.plexPaymentFormTitle.textContent = "Record payment";
    els.plexPaymentSubmitText.textContent = "Record payment";
    els.plexCancelPaymentEdit.classList.add("hidden");
  }

  async function handlePlexPaymentAction(event) {
    const button = event.target.closest("[data-plex-payment-action]");
    if (!button || !plexManager.detail) return;
    const payment = plexManager.detail.billing.payments.find((item) => item.id === button.dataset.paymentId);
    if (!payment) return;
    if (button.dataset.plexPaymentAction === "edit") {
      plexManager.editingPaymentId = payment.id;
      els.plexAmount.value = (Number(payment.amountMinor) / 100).toFixed(2);
      els.plexMethod.value = payment.method || "bank_transfer";
      els.plexReceivedOn.value = plexDateInput(payment.receivedAt);
      els.plexReference.value = payment.reference || "";
      updatePlexMethodPicker();
      els.plexPaymentFormTitle.textContent = "Edit payment";
      els.plexPaymentSubmitText.textContent = "Save changes";
      els.plexCancelPaymentEdit.classList.remove("hidden");
      els.plexPaymentForm.scrollIntoView({ behavior: "smooth", block: "start" });
      refreshIcons();
      return;
    }
    if (!window.confirm("Remove this payment? This will void it and recalculate the customer's balance.")) return;
    plexMessage("Removing payment…");
    try {
      plexManager.detail = await plexRequest("billing", { action: "void_payment", userId: plexManager.detail.account.id, paymentId: payment.id });
      await loadPlexManager(); renderPlexDetail(); plexMessage("Payment removed.");
    } catch (error) { plexMessage(error.message, true); }
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
    els.accountEmail.textContent = "Sign in to keep your data synced.";
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

  function shouldPrepareGoogleSignIn() {
    return activeProduct !== "plexpoint" && (!state.account || accountSyncReady === false);
  }

  function scheduleGoogleSignIn() {
    if (!shouldPrepareGoogleSignIn()) return;
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
    const signedIn = Boolean(state.account) && accountSyncReady !== false;
    els.syncNowGoogle.classList.toggle("hidden", !signedIn);
    els.googleButton.classList.toggle("hidden", signedIn);

    if (signedIn) {
      els.googleButton.innerHTML = "";
      updateGoogleStatus();
      refreshGoogleDataOnArrival();
      return;
    }

    if (lastRenderedGoogleClientId === clientId && els.googleButton.children.length) {
      updateGoogleStatus();
      refreshGoogleDataOnArrival();
      return;
    }

    try {
      els.googleButton.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential,
        auto_select: true,
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
      if (state.account && accountSyncReady === false) window.google.accounts.id.prompt();
    } catch (error) {
      lastRenderedGoogleClientId = "";
      els.googleStatus.textContent = "Google sign-in could not start with that Client ID.";
    }
  }

  function refreshGoogleDataOnArrival() {
    if (activeProduct === "plexpoint" || !state.account || arrivalGoogleRefreshRequested) return;
    arrivalGoogleRefreshRequested = true;
    void pullAccountSave();
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

    if (state.account && accountSyncReady) {
      els.googleStatus.textContent = lastGoogleSyncAt
        ? `Automatic Google account sync is on. Last saved ${formatSyncTime(lastGoogleSyncAt)}.`
        : "Automatic Google account sync is on.";
      return;
    }

    els.googleStatus.textContent = state.account
      ? "Reconnect Google once to turn automatic sync back on."
      : "Sign in once on this device to keep your data synced automatically.";
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
      googleIdCredential = response.credential || "";
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
      await connectGoogleDriveSync(false);
      const pulled = await pullAccountSave();
      const synced = pulled === null ? await syncAccountSave() : pulled;
      render();
      showToast(synced ? "Signed in. Automatic sync is on." : "Google signed in, but automatic sync could not start.");
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
      await requestGoogleDriveAccess(interactive ? "consent" : "none");
      await pullThenPushGoogleSave();
      updateGoogleStatus();
      return true;
    } catch (error) {
      googleAccessToken = "";
      updateGoogleStatus("Google Drive sync could not connect. Check the Client ID origin and Drive API, then try Sync now.");
      return false;
    }
  }

  function queueCloudSync(delayMs = 0) {
    if (!state.account || applyingCloudState) return;

    window.clearTimeout(cloudSyncTimer);
    cloudSyncTimer = window.setTimeout(() => {
      syncGoogleAutomatically().catch(() => {
        updateGoogleStatus("Automatic sync is waiting for Google sign-in on this device.");
      });
    }, Math.max(0, delayMs));
  }

  async function syncGoogleAutomatically() {
    if (!state.account || applyingCloudState) return false;
    return syncAccountSave();
  }

  async function syncAccountSave() {
    if (!state.account || applyingCloudState) return false;
    if (accountSyncing) {
      accountSyncPending = true;
      return false;
    }

    accountSyncing = true;
    try {
      const headers = { "Content-Type": "application/json" };
      if (googleIdCredential) headers.Authorization = `Bearer ${googleIdCredential}`;
      const response = await fetch("/api/sync", {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: JSON.stringify({ state, updatedAt: state.updatedAt }),
      });

      if (response.status === 401) {
        accountSyncReady = false;
        updateGoogleStatus();
        scheduleGoogleSignIn();
        return false;
      }
      if (!response.ok) throw new Error(`Automatic sync failed (${response.status}).`);

      const data = await response.json();
      const remoteState = normalizeRemoteState(data.state || {});
      if (shouldUseRemoteState(remoteState)) applyRemoteState(remoteState);
      accountSyncReady = true;
      googleIdCredential = "";
      lastGoogleSyncAt = new Date().toISOString();
      updateGoogleStatus();
      return true;
    } catch (error) {
      accountSyncReady = false;
      updateGoogleStatus("Automatic sync could not connect. It will retry when the app is active.");
      return false;
    } finally {
      accountSyncing = false;
      if (accountSyncPending) {
        accountSyncPending = false;
        queueCloudSync(100);
      }
    }
  }

  async function pullAccountSave() {
    if (!state.account || applyingCloudState) return false;
    try {
      const headers = {};
      if (googleIdCredential) headers.Authorization = `Bearer ${googleIdCredential}`;
      const response = await fetch("/api/sync", {
        method: "GET",
        credentials: "same-origin",
        headers,
      });

      if (response.status === 401) {
        accountSyncReady = false;
        updateGoogleStatus();
        scheduleGoogleSignIn();
        return false;
      }
      if (!response.ok) throw new Error(`Automatic sync failed (${response.status}).`);

      const data = await response.json();
      accountSyncReady = true;
      googleIdCredential = "";
      if (!data.state) {
        updateGoogleStatus();
        return null;
      }

      const remoteState = normalizeRemoteState(data.state);
      if (shouldUseRemoteState(remoteState)) applyRemoteState(remoteState);
      lastGoogleSyncAt = new Date().toISOString();
      updateGoogleStatus();
      return true;
    } catch (error) {
      accountSyncReady = false;
      updateGoogleStatus("Automatic sync could not connect. It will retry when the app is active.");
      return false;
    }
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
      cloudReconnectPromise = requestGoogleDriveAccess("none")
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
    const remoteHasData = remoteState.entries.length || remoteState.invoices.length || remoteState.plexPayments.length || remoteState.moneyOwed.length;
    const localHasData = state.entries.length || state.invoices.length || state.plexPayments.length || state.moneyOwed.length;

    if (Number.isFinite(remoteTime) && Number.isFinite(localTime)) return remoteTime > localTime;
    if (remoteHasData && !localHasData) return true;
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
        plexPayments: state.plexPayments,
        moneyOwed: state.moneyOwed,
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

  async function signOutGoogle() {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
    await fetch("/api/sync", { method: "DELETE", credentials: "same-origin" }).catch(() => {});
    state.account = null;
    googleIdCredential = "";
    googleAccessToken = "";
    googleDriveFileId = "";
    accountSyncReady = false;
    lastGoogleSyncAt = "";
    saveState({ touch: false, queueSync: false });
    render();
    showToast("Signed out.");
  }

  async function forceGoogleSync() {
    const accountSynced = await syncAccountSave();
    const driveSynced = await connectGoogleDriveSync(true);
    if (driveSynced) await syncAccountSave();
    showToast(accountSynced || driveSynced ? "Sync complete." : "Sign in with Google to sync this device.");
  }

  function applyTheme() {
    const dark = Boolean(state.settings.darkMode);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0f1514" : "#16756b");
  }

  function openSettings() {
    const isPlexPoint = activeProduct === "plexpoint";
    const isWorkBilling = activeProduct === "simply-pay";
    const isDebtTracker = activeProduct === "money-owed";
    els.settingsForm.classList.toggle("hidden", isPlexPoint);
    els.googleAccountSection.classList.toggle("hidden", !(isWorkBilling || isDebtTracker));
    document.querySelectorAll(".work-billing-settings").forEach((section) => section.classList.toggle("hidden", !isWorkBilling));
    document.querySelectorAll(".debt-tracker-settings").forEach((section) => section.classList.toggle("hidden", !isDebtTracker));
    els.plexpointSettings.classList.toggle("hidden", !isPlexPoint);
    els.plexpointSettings.setAttribute("aria-hidden", String(!isPlexPoint));
    els.settingsEyebrow.textContent = isPlexPoint ? "PlexPoint" : isDebtTracker ? "Debt Tracker" : "Shift Logger";
    els.settingsTitle.textContent = "Settings";
    els.settingsOverlay.classList.remove("hidden");
    els.settingsOverlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("settings-open");
    if (isWorkBilling || isDebtTracker) renderGoogleSignIn();
    if (isPlexPoint) {
      renderManagedPlexUsers();
      void (async () => { await loadPlexDemoStatus(); await loadManagedPlexUsers(); })();
    }
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
    const isMoneyOwed = product === "money-owed";
    activeProduct = product;
    localStorage.setItem(PRODUCT_MODE_KEY, activeProduct);
    els.productTitle.textContent = isPlexPoint ? "PlexPoint" : isMoneyOwed ? "Money Owed" : "Simply Pay";
    els.productEyebrow.textContent = isPlexPoint ? "Plex Billing" : isMoneyOwed ? "Personal tracker" : "Work Billing";
    els.brandMark.src = isPlexPoint ? "icons/plexpoint-pay-logo.png?v=2" : isMoneyOwed ? "icons/money-owed-logo.png?v=2" : "icons/work-billing-logo.png?v=2";
    els.brandMark.alt = isPlexPoint ? "PlexPoint" : isMoneyOwed ? "Money Owed" : "";
    els.brandMark.classList.toggle("is-plexpoint", isPlexPoint);
    els.brandMark.classList.toggle("is-money-owed", isMoneyOwed);
    document.title = isPlexPoint ? "PlexPoint" : isMoneyOwed ? "Money Owed" : "Simply Pay";
    els.workspace.classList.toggle("plexpoint-workspace", isPlexPoint);
    els.billingContent.classList.toggle("hidden", isPlexPoint || isMoneyOwed);
    els.plexpointContent.classList.toggle("hidden", !isPlexPoint);
    els.moneyOwedContent.classList.toggle("hidden", !isMoneyOwed);
    if (isPlexPoint && !plexManager.loaded) loadPlexManager();
    if (isMoneyOwed) { els.owedPaymentDate.value = todayIso(); renderMoneyOwed(); }
    if (product === "simply-pay") {
      scheduleGoogleSignIn();
    }
    if (product === "money-owed" && !state.account) scheduleGoogleSignIn();
    if (!isPlexPoint) refreshGoogleDataOnArrival();
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

  function startAutomaticGoogleSync() {
    const syncWhenActive = () => {
      if (document.visibilityState !== "hidden") void syncGoogleAutomatically();
    };

    window.addEventListener("focus", syncWhenActive);
    window.addEventListener("online", syncWhenActive);
    document.addEventListener("visibilitychange", syncWhenActive);
    window.setInterval(syncWhenActive, 60000);
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
    els.plexSigninButton.addEventListener("click", startPlexSignin);
    els.plexSearch.addEventListener("input", renderPlexUsers);
    els.plexPaymentTable.querySelector("thead").addEventListener("click", (event) => {
      const column = event.target.closest("[data-plex-sort]")?.dataset.plexSort;
      if (column) sortPlexUsers(column);
    });
    els.plexUserRows.addEventListener("click", (event) => {
      const id = event.target.closest("[data-plex-user-id]")?.dataset.plexUserId;
      if (id) selectPlexUser(id);
    });
    els.plexTier.addEventListener("change", () => {
      els.plexTierPicker.dataset.tier = els.plexTier.selectedOptions[0]?.dataset.tier || "none";
      renderPlexCustomPicker(els.plexTierPicker, els.plexTier);
      refreshIcons();
    });
    els.plexAccess.addEventListener("change", () => {
      updatePlexAccessPicker();
      refreshIcons();
    });
    els.plexMethod.addEventListener("change", () => {
      updatePlexMethodPicker();
      refreshIcons();
    });
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest(".plex-picker-trigger");
      const option = event.target.closest("[data-picker-value]");
      if (option) {
        const picker = option.closest(".plex-custom-picker");
        const select = picker?.querySelector("select");
        if (select) { select.value = option.dataset.pickerValue; select.dispatchEvent(new Event("change", { bubbles: true })); }
        picker?.classList.remove("is-open");
        picker?.querySelector(".plex-picker-trigger")?.setAttribute("aria-expanded", "false");
        return;
      }
      if (trigger) {
        const picker = trigger.closest(".plex-custom-picker");
        const opening = !picker.classList.contains("is-open");
        document.querySelectorAll(".plex-custom-picker.is-open").forEach((openPicker) => {
          if (openPicker !== picker) { openPicker.classList.remove("is-open"); openPicker.querySelector(".plex-picker-trigger")?.setAttribute("aria-expanded", "false"); }
        });
        picker.classList.toggle("is-open", opening);
        trigger.setAttribute("aria-expanded", String(opening));
        return;
      }
      document.querySelectorAll(".plex-custom-picker.is-open").forEach((picker) => { picker.classList.remove("is-open"); picker.querySelector(".plex-picker-trigger")?.setAttribute("aria-expanded", "false"); });
    });
    els.plexPlanForm.addEventListener("submit", submitPlexPlan);
    els.plexPaymentForm.addEventListener("submit", submitPlexPayment);
    els.plexPaymentHistory.addEventListener("click", handlePlexPaymentAction);
    els.moneyOwedForm.addEventListener("submit", addMoneyOwed);
    els.moneyOwedList.addEventListener("click", (event) => { const id = event.target.closest("[data-owed-id]")?.dataset.owedId; if (id) { selectedOwedId = id; renderMoneyOwed(); } });
    els.owedAddToTabForm.addEventListener("submit", addToOwedTab);
    els.moneyPaymentForm.addEventListener("submit", recordOwedPayment);
    els.deleteOwedDebt.addEventListener("click", removeMoneyOwed);
    els.plexCancelPaymentEdit.addEventListener("click", resetPlexPaymentEditor);
    els.plexImportLoad.addEventListener("click", () => void loadPlexImportUsers());
    els.plexImportSave.addEventListener("click", () => void importPlexUsers());
    els.plexImportAll.addEventListener("change", (event) => {
      els.plexImportList.querySelectorAll("input[data-plex-import-user]").forEach((input) => { input.checked = event.target.checked; });
    });
    els.plexUsersLoad.addEventListener("click", () => void loadManagedPlexUsers());
    els.plexDemoUsers.addEventListener("click", () => void createPlexDemoUsers());
    els.plexDemoToggle.addEventListener("change", () => void setPlexDemoUsersEnabled());
    els.plexManagedUsers.addEventListener("click", (event) => void managePlexUser(event));
    els.productSwitcher.addEventListener("click", toggleProductMenu);
    els.productMenu.addEventListener("click", (event) => {
      const product = event.target.closest("[data-product]")?.dataset.product;
      if (product) selectProduct(product);
    });
    els.openSettings.addEventListener("click", openSettings);
    els.closeSettings.addEventListener("click", closeSettings);
    els.settingsDone.addEventListener("click", closeSettings);
    els.plexpointSettingsDone.addEventListener("click", closeSettings);
    els.settingsOverlay.addEventListener("click", (event) => {
      if (event.target === els.settingsOverlay) closeSettings();
    });
    document.addEventListener("click", (event) => {
      if (!els.productMenu.classList.contains("hidden") && !event.target.closest(".product-switcher")) closeProductMenu();
    });
    els.signOutGoogle.addEventListener("click", signOutGoogle);
    els.syncNowGoogle.addEventListener("click", () => void forceGoogleSync());
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!els.settingsOverlay.classList.contains("hidden")) closeSettings();
      closeProductMenu();
    });
    window.addEventListener("load", scheduleGoogleSignIn);
  }

  bindEvents();
  els.plexReceivedOn.value = plexToday();
  updatePlexMethodPicker();
  syncFormsFromState();
  saveState({ touch: false, queueSync: false });
  render();
  selectProduct(activeProduct);
  const managerSession = new URLSearchParams(window.location.hash.slice(1)).get("manager_session");
  if (managerSession && /^[a-f0-9]{64}$/.test(managerSession)) {
    localStorage.setItem(PLEX_MANAGER_SESSION_KEY, managerSession);
    history.replaceState({}, "", window.location.pathname);
    selectProduct("plexpoint");
  } else if (new URLSearchParams(window.location.search).get("plex") === "return") {
    history.replaceState({}, "", window.location.pathname);
    void finishPlexSignin();
  }
  registerServiceWorker();
  startAutomaticGoogleSync();
})();
