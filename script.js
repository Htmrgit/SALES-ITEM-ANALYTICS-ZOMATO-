/**
 * SALES & ITEM ANALYTICS DASHBOARD
 * Modern BI Engine using Vanilla JS, PapaParse, and Chart.js
 */

// Application Global State
const appState = {
  rawRows: [],
  normalizedRecords: [],
  filteredRecords: [],
  detectedFormat: 'matrix', // 'matrix' or 'transactional'
  availableMonths: [],
  last6Months: [],
  latestMonth: '',
  previousMonth: '',
  mappedColumns: {},
  currencySymbol: '₹',
  fileName: 'punjabi_chulha_sales.csv',
  
  filters: {
    search: '',
    month: 'ALL',
    category: 'ALL',
    brand: 'ALL',
    outlet: 'ALL',
    classification: 'ALL'
  },

  sort: {
    topItems: { key: 'sales', dir: 'desc' },
    itemDirectory: { key: 'sales', dir: 'desc' },
    growing: { key: 'growthPercent', dir: 'desc' },
    declining: { key: 'declinePercent', dir: 'asc' }
  },

  pagination: {
    itemDirectory: { page: 1, perPage: 25 },
    rawData: { page: 1, perPage: 25 }
  },

  charts: {
    monthlyTrend: null,
    topItems: null,
    categoryShare: null,
    modalTrajectory: null
  },

  trendMetric: 'sales',
  topItemsLimit: 20,
  monthWiseSelectedMonth: 'ALL',
  selectedItemForModal: null
};

// Common Month Names for chronological matching
const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];
const MONTH_SHORT = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
];

/* ==========================================================================
   INITIALIZATION & EVENT BINDINGS
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  setupEventListeners();
  loadInitialDataset();
});

function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function showToast(message, isSpinning = false) {
  const toast = document.getElementById('toastNotification');
  const spinner = document.getElementById('toastSpinner');
  const msgEl = document.getElementById('toastMessage');
  if (!toast) return;

  msgEl.textContent = message;
  spinner.style.display = isSpinning ? 'block' : 'none';
  toast.classList.add('show');
  
  if (!isSpinning) {
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }
}

function hideToast() {
  const toast = document.getElementById('toastNotification');
  if (toast) toast.classList.remove('show');
}

/* ==========================================================================
   PERSISTENCE LAYER (IndexedDB + localStorage Fallback)
   Ensures uploaded CSV persists on browser refresh ("REFRARCE BROSWER CLEAR NA")
   ========================================================================== */
const DB_NAME = 'SalesAnalyticsBI_DB';
const DB_VERSION = 1;
const STORE_NAME = 'dataset_store';
const KEY_ACTIVE_DATASET = 'current_active_dataset';

function openIndexedDbStore() {
  return new Promise((resolve) => {
    if (!window.indexedDB) {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

async function persistDatasetToStorage(csvText, fileName) {
  try {
    const db = await openIndexedDbStore();
    if (db) {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ csvText, fileName, updated: Date.now() }, KEY_ACTIVE_DATASET);
      return true;
    }
  } catch (e) {
    console.warn('IndexedDB write error, trying localStorage fallback:', e);
  }

  try {
    localStorage.setItem('sales_dash_csv_text', csvText);
    localStorage.setItem('sales_dash_file_name', fileName);
    return true;
  } catch (e) {
    console.warn('Storage quota exceeded or error:', e);
    return false;
  }
}

async function retrieveDatasetFromStorage() {
  try {
    const db = await openIndexedDbStore();
    if (db) {
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(KEY_ACTIVE_DATASET);
        req.onsuccess = (e) => resolve(e.target.result || null);
        req.onerror = () => resolve(null);
      });
    }
  } catch (e) {
    console.warn('IndexedDB read error, trying fallback:', e);
  }

  try {
    const text = localStorage.getItem('sales_dash_csv_text');
    const name = localStorage.getItem('sales_dash_file_name');
    if (text) {
      return { csvText: text, fileName: name || 'saved_sales.csv' };
    }
  } catch (e) {}

  return null;
}

async function removeDatasetFromStorage() {
  try {
    const db = await openIndexedDbStore();
    if (db) {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(KEY_ACTIVE_DATASET);
    }
  } catch (e) {}

  try {
    localStorage.removeItem('sales_dash_csv_text');
    localStorage.removeItem('sales_dash_file_name');
  } catch (e) {}
}

/* ==========================================================================
   DATA LOADING & FILE HANDLING
   ========================================================================== */
async function loadInitialDataset() {
  // Check if user explicitly clicked "Clear Data"
  const isExplicitlyCleared = localStorage.getItem('sales_dash_cleared') === 'true';
  if (isExplicitlyCleared) {
    clearAllData(false);
    return;
  }

  // Check if there is previously uploaded/active CSV dataset in storage
  const saved = await retrieveDatasetFromStorage();
  if (saved && saved.csvText) {
    showToast(`Restoring ${saved.fileName || 'saved sales dataset'}...`, true);
    processCsvText(saved.csvText, saved.fileName || 'uploaded_sales.csv', false);
    return;
  }

  // Otherwise, load Punjabi Chulha default sample
  await loadSampleDataset();
}

async function loadSampleDataset() {
  showToast('Loading Punjabi Chulha 6-Month dataset...', true);
  try {
    const response = await fetch('/punjabi_chulha_sales.csv');
    if (!response.ok) throw new Error('File fetch failed');
    const csvText = await response.text();
    localStorage.removeItem('sales_dash_cleared');
    await persistDatasetToStorage(csvText, 'punjabi_chulha_sales.csv');
    processCsvText(csvText, 'punjabi_chulha_sales.csv', false);
  } catch (err) {
    console.warn('Initial sample fetch failed, ready for manual upload', err);
    clearAllData(false);
    hideToast();
  }
}

async function clearAllData(confirmFirst = true) {
  if (confirmFirst) {
    const confirmed = window.confirm('Are you sure you want to clear all loaded data? The dashboard will be reset to a clean blank state.');
    if (!confirmed) return;
  }

  // Mark as explicitly cleared and remove stored dataset
  localStorage.setItem('sales_dash_cleared', 'true');
  await removeDatasetFromStorage();

  // Reset internal state
  appState.rawRows = [];
  appState.normalizedRecords = [];
  appState.filteredRecords = [];
  appState.availableMonths = [];
  appState.last6Months = [];
  appState.latestMonth = '';
  appState.previousMonth = '';
  appState.mappedColumns = {};
  appState.fileName = 'None (Cleared)';

  // Reset filters
  resetFiltersState();

  // Reset file input element so re-selecting same file works
  const fileInput = document.getElementById('csvFileInput');
  if (fileInput) fileInput.value = '';

  // Destroy all active charts
  if (appState.charts.monthlyTrend) {
    appState.charts.monthlyTrend.destroy();
    appState.charts.monthlyTrend = null;
  }
  if (appState.charts.topItems) {
    appState.charts.topItems.destroy();
    appState.charts.topItems = null;
  }
  if (appState.charts.categoryShare) {
    appState.charts.categoryShare.destroy();
    appState.charts.categoryShare = null;
  }
  if (appState.charts.modalTrajectory) {
    appState.charts.modalTrajectory.destroy();
    appState.charts.modalTrajectory = null;
  }

  // Clear canvases
  ['chartMonthlyTrend', 'chartTopSellingItems', 'chartCategoryShare', 'chartItemModalTrajectory'].forEach((id) => {
    const cvs = document.getElementById(id);
    if (cvs) {
      const ctx = cvs.getContext('2d');
      ctx.clearRect(0, 0, cvs.width, cvs.height);
    }
  });

  // Reset specs UI
  document.getElementById('valFileName').textContent = 'None';
  document.getElementById('valFormatType').textContent = '-';
  document.getElementById('valTotalRows').textContent = '0';
  document.getElementById('valTotalCols').textContent = '0';
  document.getElementById('valCurrency').textContent = '₹';
  document.getElementById('activeDatasetLabel').textContent = 'No active data loaded (Cleared)';
  document.getElementById('valDataPeriod').textContent = 'No Data';
  document.getElementById('valLastUpdated').textContent = 'Cleared';
  document.getElementById('subGrowingPeriod').textContent = 'No data available';
  document.getElementById('subDecliningPeriod').textContent = 'No data available';

  // Empty dropdown selects
  populateFilterDropdowns();

  // Render KPIs & empty tables
  applyFiltersAndRender();

  // Expand upload drawer so user can drop/browse a new CSV
  const uploadSection = document.getElementById('uploadSection');
  if (uploadSection && uploadSection.classList.contains('collapsed')) {
    uploadSection.classList.remove('collapsed');
    const label = document.getElementById('uploadToggleLabel');
    const icon = document.getElementById('uploadChevronIcon');
    if (label) label.textContent = 'Hide Upload Box';
    if (icon) icon.setAttribute('data-lucide', 'chevron-up');
    initIcons();
  }

  showToast('Sales data cleared. Ready for new CSV upload.');
}

function setupEventListeners() {
  // File Upload
  const fileInput = document.getElementById('csvFileInput');
  const btnBrowse = document.getElementById('btnBrowseCsv');
  const dropzone = document.getElementById('dropzoneContainer');
  const btnSample = document.getElementById('btnLoadSampleData');

  if (btnBrowse && fileInput) {
    btnBrowse.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelect(e.target.files[0]);
      }
    });
  }

  if (dropzone) {
    dropzone.addEventListener('click', () => fileInput && fileInput.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-active');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-active');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-active');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });
  }

  if (btnSample) {
    btnSample.addEventListener('click', async (e) => {
      e.stopPropagation();
      await loadSampleDataset();
    });
  }

  // Clear Data Actions (Header, Drawer, Footer)
  const handleClearDataClick = () => clearAllData(true);
  document.getElementById('btnClearAllData')?.addEventListener('click', handleClearDataClick);
  document.getElementById('btnClearDataDrawer')?.addEventListener('click', handleClearDataClick);
  document.getElementById('btnFooterClearData')?.addEventListener('click', handleClearDataClick);

  // Footer Actions
  document.getElementById('btnFooterUpload')?.addEventListener('click', () => {
    const uploadSection = document.getElementById('uploadSection');
    if (uploadSection && uploadSection.classList.contains('collapsed')) {
      toggleUploadDrawer();
    }
    uploadSection?.scrollIntoView({ behavior: 'smooth' });
    fileInput?.click();
  });

  document.getElementById('btnFooterScrollTop')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Upload drawer toggle
  const uploadHeaderBar = document.getElementById('uploadHeaderBar');
  const btnToggleUpload = document.getElementById('btnToggleUploadInner');
  const btnHeaderUpload = document.getElementById('btnToggleUploadDrawer');
  const uploadSection = document.getElementById('uploadSection');

  function toggleUploadDrawer() {
    if (!uploadSection) return;
    uploadSection.classList.toggle('collapsed');
    const isCollapsed = uploadSection.classList.contains('collapsed');
    const label = document.getElementById('uploadToggleLabel');
    const icon = document.getElementById('uploadChevronIcon');
    if (label) label.textContent = isCollapsed ? 'Show Upload Box' : 'Hide Upload Box';
    if (icon) icon.setAttribute('data-lucide', isCollapsed ? 'chevron-down' : 'chevron-up');
    initIcons();
  }

  if (uploadHeaderBar) uploadHeaderBar.addEventListener('click', toggleUploadDrawer);
  if (btnToggleUpload) btnToggleUpload.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleUploadDrawer();
  });
  if (btnHeaderUpload) btnHeaderUpload.addEventListener('click', () => {
    if (uploadSection && uploadSection.classList.contains('collapsed')) {
      toggleUploadDrawer();
    }
    uploadSection?.scrollIntoView({ behavior: 'smooth' });
  });

  // Header Actions
  document.getElementById('btnRefreshData')?.addEventListener('click', () => {
    showToast('Refreshing metrics...', true);
    setTimeout(() => {
      applyFiltersAndRender();
      showToast('Analysis updated successfully.');
    }, 200);
  });

  document.getElementById('btnResetFilters')?.addEventListener('click', resetAllFilters);
  document.getElementById('btnQuickClearAllFilters')?.addEventListener('click', resetAllFilters);

  // Export Dropdown
  const btnExportMenu = document.getElementById('btnExportMenuToggle');
  const exportDropdown = document.getElementById('exportDropdownMenu');
  if (btnExportMenu && exportDropdown) {
    btnExportMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      exportDropdown.classList.toggle('show');
    });

    document.addEventListener('click', () => {
      exportDropdown.classList.remove('show');
    });

    exportDropdown.querySelectorAll('.dropdown-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const type = e.currentTarget.getAttribute('data-export');
        exportDropdown.classList.remove('show');
        handleCsvExport(type);
      });
    });
  }

  // Specific Export triggers in UI
  document.getElementById('btnExportMonthlyFromCard')?.addEventListener('click', () => handleCsvExport('monthly'));
  document.getElementById('btnExportTopItemsFromCard')?.addEventListener('click', () => handleCsvExport('top-items'));
  document.getElementById('btnExportMonthWiseTop')?.addEventListener('click', () => handleCsvExport('month-wise-top'));
  document.getElementById('btnExportItemPerformance')?.addEventListener('click', () => handleCsvExport('performance'));
  document.getElementById('btnExportCategory')?.addEventListener('click', () => handleCsvExport('category'));
  document.getElementById('btnExportBrand')?.addEventListener('click', () => handleCsvExport('brand'));
  document.getElementById('btnExportFilteredDataFromTab')?.addEventListener('click', () => handleCsvExport('filtered'));

  // Navigation Tabs
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');
      tabButtons.forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content-panel').forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetId)?.classList.add('active');

      // Trigger resize for charts in newly visible tab
      setTimeout(() => {
        Object.values(appState.charts).forEach((c) => c && c.resize && c.resize());
      }, 50);
    });
  });

  // Filter Inputs
  const searchInput = document.getElementById('globalSearchInput');
  const searchClear = document.getElementById('searchClearBtn');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      appState.filters.search = e.target.value.trim().toLowerCase();
      if (searchClear) searchClear.classList.toggle('visible', appState.filters.search.length > 0);
      appState.pagination.itemDirectory.page = 1;
      appState.pagination.rawData.page = 1;
      applyFiltersAndRender();
    });
  }

  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      appState.filters.search = '';
      searchClear.classList.remove('visible');
      applyFiltersAndRender();
    });
  }

  ['filterMonth', 'filterCategory', 'filterBrand', 'filterOutlet', 'filterClassification'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', (e) => {
      const key = id.replace('filter', '').toLowerCase();
      appState.filters[key] = e.target.value;
      appState.pagination.itemDirectory.page = 1;
      appState.pagination.rawData.page = 1;
      applyFiltersAndRender();
    });
  });

  // Top Items Selectors
  document.getElementById('selectTopItemsLimit')?.addEventListener('change', (e) => {
    appState.topItemsLimit = e.target.value === 'ALL' ? 9999 : parseInt(e.target.value, 10);
    renderTopSellingItemsSection();
  });

  document.getElementById('selectTopItemsSort')?.addEventListener('change', (e) => {
    const val = e.target.value;
    const [key, dir] = val.split('-');
    appState.sort.topItems = { key, dir };
    renderTopSellingItemsSection();
  });

  // Monthly Trend Metric Switcher
  document.querySelectorAll('#trendMetricSwitcher .metric-switch-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('#trendMetricSwitcher .metric-switch-btn').forEach((b) => b.classList.remove('active'));
      e.target.classList.add('active');
      appState.trendMetric = e.target.getAttribute('data-metric');
      renderMonthlyTrendChart();
    });
  });

  // Month-wise top items month selector
  document.getElementById('selectMonthWiseMonth')?.addEventListener('change', (e) => {
    appState.monthWiseSelectedMonth = e.target.value;
    renderMonthWiseTopItemsTable();
  });

  // Directory Pagination
  document.getElementById('selectItemsPerPage')?.addEventListener('change', (e) => {
    appState.pagination.itemDirectory.perPage = parseInt(e.target.value, 10);
    appState.pagination.itemDirectory.page = 1;
    renderItemDirectoryTable();
  });

  document.getElementById('btnPagePrev')?.addEventListener('click', () => {
    if (appState.pagination.itemDirectory.page > 1) {
      appState.pagination.itemDirectory.page--;
      renderItemDirectoryTable();
    }
  });

  document.getElementById('btnPageNext')?.addEventListener('click', () => {
    appState.pagination.itemDirectory.page++;
    renderItemDirectoryTable();
  });

  // Modals (Item Detail & Report)
  const itemModal = document.getElementById('itemDetailModal');
  document.getElementById('btnCloseItemModal')?.addEventListener('click', () => itemModal.classList.remove('show'));
  document.getElementById('btnCloseItemModal2')?.addEventListener('click', () => itemModal.classList.remove('show'));
  document.getElementById('btnFilterByThisItem')?.addEventListener('click', () => {
    if (appState.selectedItemForModal) {
      const searchInput = document.getElementById('globalSearchInput');
      if (searchInput) searchInput.value = appState.selectedItemForModal;
      appState.filters.search = appState.selectedItemForModal.toLowerCase();
      document.getElementById('searchClearBtn')?.classList.add('visible');
      itemModal.classList.remove('show');
      applyFiltersAndRender();
    }
  });

  const reportModal = document.getElementById('reportGenerationModal');
  document.getElementById('btnOpenReportModal')?.addEventListener('click', openReportModal);
  document.getElementById('btnCloseReportModal')?.addEventListener('click', () => reportModal.classList.remove('show'));
  document.getElementById('btnPrintReport')?.addEventListener('click', () => window.print());
  document.getElementById('btnDownloadPdfReport')?.addEventListener('click', exportReportToPdf);

  // Close modals on background click
  window.addEventListener('click', (e) => {
    if (e.target === itemModal) itemModal.classList.remove('show');
    if (e.target === reportModal) reportModal.classList.remove('show');
  });

  // Table header sorting
  setupTableSortListeners();
}

async function handleFileSelect(file) {
  if (!file) return;

  // Clear previous dataset, filters and remove explicit cleared flag
  resetFiltersState();
  localStorage.removeItem('sales_dash_cleared');

  appState.fileName = file.name;
  showToast(`Uploading and analyzing ${file.name}...`, true);

  const progressBox = document.getElementById('uploadProgressBox');
  const progressBar = document.getElementById('progressBarFill');
  if (progressBox) progressBox.classList.add('show');
  if (progressBar) progressBar.style.width = '35%';

  try {
    const csvText = await file.text();
    if (progressBar) progressBar.style.width = '70%';

    // Persist to storage so refresh preserves it
    await persistDatasetToStorage(csvText, file.name);

    if (progressBar) progressBar.style.width = '90%';

    Papa.parse(csvText, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        if (progressBar) progressBar.style.width = '100%';
        processParsedData(results.data, results.meta.fields, file.name);
        setTimeout(() => progressBox?.classList.remove('show'), 500);
      },
      error: (error) => {
        console.error('CSV Parsing Error:', error);
        showToast('Error reading CSV file. Please check format.');
        progressBox?.classList.remove('show');
      }
    });
  } catch (err) {
    console.error('File read error:', err);
    showToast('Failed to read CSV file.');
    progressBox?.classList.remove('show');
  }
}

function processCsvText(csvText, fileName, persist = false) {
  if (persist) {
    persistDatasetToStorage(csvText, fileName);
  }
  Papa.parse(csvText, {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: 'greedy',
    complete: (results) => {
      processParsedData(results.data, results.meta.fields, fileName);
    },
    error: (err) => {
      console.error('CSV Parsing Error:', err);
      showToast('Error parsing CSV data.');
    }
  });
}

/* ==========================================================================
   INTELLIGENT COLUMN & FORMAT DETECTION
   ========================================================================== */
function processParsedData(data, fields, fileName) {
  if (!data || data.length === 0) {
    showToast('The uploaded CSV has no rows.');
    return;
  }

  appState.rawRows = data;
  appState.fileName = fileName;

  // Clean and normalize fields
  const cleanFields = fields.map((f) => f.trim());

  // 1. Check for Matrix / Pivot Format (e.g., has "Metric" and Month columns)
  const metricCol = cleanFields.find((f) => /metric/i.test(f));
  const detectedMonthCols = cleanFields.filter((col) => {
    const c = col.toLowerCase().trim();
    return MONTH_NAMES.some((m) => c === m) || MONTH_SHORT.some((m) => c === m) || /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(c);
  });

  if (metricCol && detectedMonthCols.length >= 2) {
    appState.detectedFormat = 'matrix';
    normalizeMatrixFormat(data, cleanFields, metricCol, detectedMonthCols);
  } else {
    appState.detectedFormat = 'transactional';
    normalizeTransactionalFormat(data, cleanFields);
  }

  // Update specs UI
  document.getElementById('valFileName').textContent = fileName;
  document.getElementById('valFormatType').textContent = appState.detectedFormat === 'matrix' ? 'Matrix / Pivot by Metric' : 'Standard Transactional';
  document.getElementById('valTotalRows').textContent = data.length.toLocaleString();
  document.getElementById('valTotalCols').textContent = cleanFields.length;
  document.getElementById('valCurrency').textContent = `${appState.currencySymbol} (Auto-detected)`;
  document.getElementById('activeDatasetLabel').textContent = `Active: ${fileName} (${data.length} rows)`;

  // Run full analytical pipeline
  computeTimePeriods();
  populateFilterDropdowns();
  applyFiltersAndRender();

  showToast('Analysis completed successfully.');
}

function parseNumeric(val) {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val).trim();
  if (str === '' || str === '-' || str === 'NA' || str === 'N/A' || str === 'NULL' || str === 'null') return 0;
  
  // Detect currency symbol
  if (str.includes('₹')) appState.currencySymbol = '₹';
  else if (str.includes('$')) appState.currencySymbol = '$';
  else if (str.includes('€')) appState.currencySymbol = '€';
  else if (str.includes('£')) appState.currencySymbol = '£';

  // Strip currency and commas
  const cleaned = str.replace(/[₹$€£,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Normalizes Matrix/Pivot format (like Zomato/Swiggy item performance report)
 * where items have multiple metric rows ("Item quantity sold", "Unit cost", "Orders")
 */
function normalizeMatrixFormat(rows, fields, metricColName, monthCols) {
  // Find metadata columns
  const itemCol = fields.find((f) => /item\s*name|product|menu\s*item/i.test(f)) || fields.find((f) => /item/i.test(f)) || fields[4] || 'Item name';
  const categoryCol = fields.find((f) => /item\s*category|category|group/i.test(f)) || 'Item category';
  const subcategoryCol = fields.find((f) => /subcategory/i.test(f)) || 'Item subcategory';
  const brandCol = fields.find((f) => /restaurant\s*name|brand|vendor/i.test(f)) || 'Restaurant name';
  const outletCol = fields.find((f) => /subzone|outlet|branch|store/i.test(f)) || 'Subzone';
  const cityCol = fields.find((f) => /city|location/i.test(f)) || 'City';

  appState.mappedColumns = {
    item: itemCol,
    category: categoryCol,
    subcategory: subcategoryCol,
    brand: brandCol,
    outlet: outletCol,
    city: cityCol,
    metric: metricColName,
    months: monthCols
  };

  // Group rows by unique item entity
  const itemGroups = new Map();

  rows.forEach((row) => {
    const itemName = (row[itemCol] || '').trim();
    if (!itemName) return;

    const brand = (row[brandCol] || 'Restaurant').trim();
    const outlet = (row[outletCol] || '').trim();
    const category = (row[categoryCol] || 'General').trim();
    const subcategory = (row[subcategoryCol] || '').trim();
    const city = (row[cityCol] || '').trim();
    const metric = (row[metricColName] || '').trim();

    const groupKey = `${itemName}__${brand}__${outlet}`;
    if (!itemGroups.has(groupKey)) {
      itemGroups.set(groupKey, {
        itemName,
        category,
        subcategory,
        brand,
        outlet,
        city,
        metrics: {}
      });
    }

    itemGroups.get(groupKey).metrics[metric] = row;
  });

  // Convert grouped items into monthly normalized records
  const normalized = [];

  itemGroups.forEach((itemData) => {
    const qtyRow = findMetricRow(itemData.metrics, /quantity|qty/i);
    const costRow = findMetricRow(itemData.metrics, /unit\s*cost|price|rate/i);
    const ordersRow = findMetricRow(itemData.metrics, /orders/i);
    const ratingRow = findMetricRow(itemData.metrics, /rating/i);

    monthCols.forEach((mCol) => {
      const qty = qtyRow ? parseNumeric(qtyRow[mCol]) : 0;
      const unitPrice = costRow ? parseNumeric(costRow[mCol]) : 0;
      const orders = ordersRow ? parseNumeric(ordersRow[mCol]) : (qty > 0 ? 1 : 0);
      const rating = ratingRow ? parseNumeric(ratingRow[mCol]) : 0;
      const sales = qty * unitPrice;

      normalized.push({
        month: mCol,
        item: itemData.itemName,
        category: itemData.category,
        subcategory: itemData.subcategory,
        brand: itemData.brand,
        outlet: itemData.outlet || itemData.brand,
        city: itemData.city,
        quantity: qty,
        unitPrice: unitPrice,
        sales: sales,
        orders: orders,
        rating: rating,
        rawDate: mCol
      });
    });
  });

  appState.normalizedRecords = normalized;
  appState.availableMonths = monthCols;
}

function findMetricRow(metricsMap, regex) {
  for (const key in metricsMap) {
    if (regex.test(key)) return metricsMap[key];
  }
  return null;
}

/**
 * Normalizes Standard Row-based Transactional CSVs
 */
function normalizeTransactionalFormat(rows, fields) {
  const dateCol = fields.find((f) => /date|time|created/i.test(f)) || fields[0];
  const itemCol = fields.find((f) => /item\s*name|product|item|description|menu/i.test(f)) || fields[1];
  const qtyCol = fields.find((f) => /qty|quantity|units|count/i.test(f));
  const salesCol = fields.find((f) => /sales|amount|revenue|total|net/i.test(f));
  const priceCol = fields.find((f) => /unit\s*price|price|rate|cost/i.test(f));
  const orderCol = fields.find((f) => /order|invoice|bill/i.test(f));
  const categoryCol = fields.find((f) => /category|group|type/i.test(f));
  const brandCol = fields.find((f) => /brand|restaurant|vendor/i.test(f));
  const outletCol = fields.find((f) => /outlet|store|branch|location/i.test(f));

  appState.mappedColumns = {
    date: dateCol,
    item: itemCol,
    quantity: qtyCol,
    sales: salesCol,
    unitPrice: priceCol,
    order: orderCol,
    category: categoryCol,
    brand: brandCol,
    outlet: outletCol
  };

  const normalized = [];
  const monthsFound = new Set();

  rows.forEach((r) => {
    const itemName = (r[itemCol] || '').trim();
    if (!itemName) return;

    const rawDate = (r[dateCol] || '').trim();
    const month = extractMonthName(rawDate) || 'Unknown';
    if (month !== 'Unknown') monthsFound.add(month);

    let qty = qtyCol ? parseNumeric(r[qtyCol]) : 1;
    let unitPrice = priceCol ? parseNumeric(r[priceCol]) : 0;
    let sales = salesCol ? parseNumeric(r[salesCol]) : 0;
    if (sales === 0 && qty > 0 && unitPrice > 0) sales = qty * unitPrice;
    if (unitPrice === 0 && qty > 0 && sales > 0) unitPrice = sales / qty;

    normalized.push({
      month: month,
      item: itemName,
      category: (categoryCol && r[categoryCol]) ? String(r[categoryCol]).trim() : 'General',
      subcategory: '',
      brand: (brandCol && r[brandCol]) ? String(r[brandCol]).trim() : 'Main Brand',
      outlet: (outletCol && r[outletCol]) ? String(r[outletCol]).trim() : 'Main Store',
      city: '',
      quantity: qty,
      unitPrice: unitPrice,
      sales: sales,
      orders: orderCol ? 1 : 1,
      rating: 0,
      rawDate: rawDate
    });
  });

  appState.normalizedRecords = normalized;
  appState.availableMonths = Array.from(monthsFound);
}

function extractMonthName(dateStr) {
  if (!dateStr) return '';
  const clean = dateStr.toLowerCase();
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    if (clean.includes(MONTH_NAMES[i]) || clean.includes(MONTH_SHORT[i])) {
      return capitalize(MONTH_NAMES[i]);
    }
  }
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }
  return dateStr;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* ==========================================================================
   TIME PERIODS & LAST 6 MONTHS ENGINE
   ========================================================================== */
function computeTimePeriods() {
  const months = appState.availableMonths;
  if (months.length === 0) return;

  // Determine chronological sequence
  if (months.length <= 6) {
    appState.last6Months = [...months];
  } else {
    // Take the latest 6
    appState.last6Months = months.slice(months.length - 6);
  }

  appState.latestMonth = appState.last6Months[appState.last6Months.length - 1];
  appState.previousMonth = appState.last6Months.length >= 2 ? appState.last6Months[appState.last6Months.length - 2] : '';

  const periodText = `${appState.last6Months[0]} – ${appState.latestMonth}`;
  document.getElementById('valDataPeriod').textContent = periodText;
  document.getElementById('rptPeriodSub').textContent = `Performance Evaluation Period: ${periodText}`;
  document.getElementById('subGrowingPeriod').textContent = `Comparing ${appState.latestMonth} vs ${appState.previousMonth || 'Prior Month'}`;
  document.getElementById('subDecliningPeriod').textContent = `Comparing ${appState.latestMonth} vs ${appState.previousMonth || 'Prior Month'}`;
  document.getElementById('thGrowingPrevMonth').textContent = `${appState.previousMonth || 'Prev'} Sales`;
  document.getElementById('thGrowingCurrMonth').textContent = `${appState.latestMonth} Sales`;
  document.getElementById('thDecliningPrevMonth').textContent = `${appState.previousMonth || 'Prev'} Sales`;
  document.getElementById('thDecliningCurrMonth').textContent = `${appState.latestMonth} Sales`;
  document.getElementById('valLastUpdated').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ==========================================================================
   FILTER SYSTEM & DROPDOWNS
   ========================================================================== */
function populateFilterDropdowns() {
  const records = appState.normalizedRecords;
  const categories = new Set();
  const brands = new Set();
  const outlets = new Set();

  records.forEach((r) => {
    if (r.category) categories.add(r.category);
    if (r.brand) brands.add(r.brand);
    if (r.outlet) outlets.add(r.outlet);
  });

  populateSelect('filterMonth', appState.last6Months, 'All Last 6 Months');
  populateSelect('selectMonthWiseMonth', appState.last6Months, 'All 6 Months (Combined Table)');
  populateSelect('filterCategory', Array.from(categories).sort(), 'All Categories');
  populateSelect('filterBrand', Array.from(brands).sort(), 'All Brands');
  populateSelect('filterOutlet', Array.from(outlets).sort(), 'All Outlets');
}

function populateSelect(selectId, items, defaultLabel) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = `<option value="ALL">${defaultLabel}</option>`;
  items.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item;
    opt.textContent = item;
    sel.appendChild(opt);
  });
}

function resetFiltersState() {
  appState.filters = {
    search: '',
    month: 'ALL',
    category: 'ALL',
    brand: 'ALL',
    outlet: 'ALL',
    classification: 'ALL'
  };

  const searchInput = document.getElementById('globalSearchInput');
  if (searchInput) searchInput.value = '';
  document.getElementById('searchClearBtn')?.classList.remove('visible');

  ['filterMonth', 'filterCategory', 'filterBrand', 'filterOutlet', 'filterClassification'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = 'ALL';
  });

  appState.pagination.itemDirectory.page = 1;
  appState.pagination.rawData.page = 1;
}

function resetAllFilters() {
  resetFiltersState();
  applyFiltersAndRender();
  showToast('Filters reset.');
}

function applyFiltersAndRender() {
  const { search, month, category, brand, outlet } = appState.filters;

  // 1. Filter base records
  let filtered = appState.normalizedRecords.filter((rec) => {
    // Month filter
    if (month !== 'ALL' && rec.month !== month) return false;
    // Default to Last 6 Months if month is ALL
    if (month === 'ALL' && !appState.last6Months.includes(rec.month)) return false;
    // Category filter
    if (category !== 'ALL' && rec.category !== category) return false;
    // Brand filter
    if (brand !== 'ALL' && rec.brand !== brand) return false;
    // Outlet filter
    if (outlet !== 'ALL' && rec.outlet !== outlet) return false;
    // Global search
    if (search) {
      const matchText = `${rec.item} ${rec.category} ${rec.subcategory} ${rec.brand} ${rec.outlet} ${rec.city}`.toLowerCase();
      if (!matchText.includes(search)) return false;
    }
    return true;
  });

  appState.filteredRecords = filtered;

  // Update active filter counter
  updateActiveFilterCounter();

  // 2. Aggregate & Render all views
  renderKpis();
  renderLast6MonthsMoMTable();
  renderMonthlyTrendChart();
  renderTopSellingItemsSection();
  renderMonthWiseTopItemsTable();
  renderItemDirectoryTable();
  renderGrowthAnalysisCards();
  renderCategoryAndBrandAnalysis();
  renderRawDataExplorer();
  initIcons();
}

function updateActiveFilterCounter() {
  const activeKeys = Object.entries(appState.filters).filter(([k, v]) => v !== 'ALL' && v !== '');
  const badge = document.getElementById('valActiveFilters');
  const countText = document.getElementById('filterCountText');
  const totalRec = document.getElementById('valTotalRecords');

  if (totalRec) totalRec.textContent = appState.filteredRecords.length.toLocaleString();

  if (activeKeys.length === 0) {
    if (badge) badge.textContent = 'None (Showing All 6 Months)';
    if (countText) countText.textContent = 'All 6 Months Active';
  } else {
    const desc = activeKeys.map(([k, v]) => `${capitalize(k)}: ${v}`).join(', ');
    if (badge) badge.textContent = desc;
    if (countText) countText.textContent = `${activeKeys.length} Filter${activeKeys.length > 1 ? 's' : ''} Active`;
  }
}

/* ==========================================================================
   KPI CARDS RENDERER
   ========================================================================== */
function renderKpis() {
  const records = appState.filteredRecords;
  const sym = appState.currencySymbol;

  if (records.length === 0) {
    document.getElementById('valKpiSales').textContent = `${sym}0.00`;
    document.getElementById('valKpiQuantity').textContent = '0';
    document.getElementById('valKpiOrders').textContent = '0';
    document.getElementById('valKpiAov').textContent = `${sym}0.00`;
    document.getElementById('valKpiItems').textContent = '0';
    document.getElementById('valKpiBrands').textContent = '0';
    document.getElementById('valKpiCategories').textContent = '0';
    document.getElementById('valKpiAvgMonthlySales').textContent = `${sym}0.00`;
    const pill = document.getElementById('kpiSalesGrowthPill');
    if (pill) {
      pill.className = 'growth-pill';
      pill.innerHTML = '<i data-lucide="minus" style="width: 12px; height: 12px;"></i> MoM: 0.0%';
    }
    const qtyPill = document.getElementById('kpiQtyGrowthPill');
    if (qtyPill) qtyPill.textContent = 'MoM: 0.0%';
    initIcons();
    return;
  }

  let totalSales = 0;
  let totalQty = 0;
  let totalOrders = 0;
  const uniqueItems = new Set();
  const uniqueBrands = new Set();
  const uniqueCategories = new Set();

  records.forEach((r) => {
    totalSales += r.sales;
    totalQty += r.quantity;
    totalOrders += r.orders;
    if (r.item) uniqueItems.add(r.item);
    if (r.brand) uniqueBrands.add(r.brand);
    if (r.category) uniqueCategories.add(r.category);
  });

  const aov = totalOrders > 0 ? (totalSales / totalOrders) : 0;
  const monthCount = appState.filters.month === 'ALL' ? (appState.last6Months.length || 1) : 1;
  const avgMonthlySales = totalSales / monthCount;

  // Format and update KPI cards
  document.getElementById('valKpiSales').textContent = `${sym}${formatMoney(totalSales)}`;
  document.getElementById('valKpiQuantity').textContent = totalQty.toLocaleString();
  document.getElementById('valKpiOrders').textContent = totalOrders.toLocaleString();
  document.getElementById('valKpiAov').textContent = `${sym}${formatMoney(aov)}`;
  document.getElementById('valKpiItems').textContent = uniqueItems.size;
  document.getElementById('valKpiBrands').textContent = uniqueBrands.size || 1;
  document.getElementById('valKpiCategories').textContent = uniqueCategories.size;
  document.getElementById('valKpiAvgMonthlySales').textContent = `${sym}${formatMoney(avgMonthlySales)}`;

  // Calculate MoM growth for latest vs previous month
  const momGrowth = calculateLatestMoMGrowth();
  const pill = document.getElementById('kpiSalesGrowthPill');
  if (pill) {
    pill.className = `growth-pill ${momGrowth.class}`;
    pill.innerHTML = `<i data-lucide="${momGrowth.icon}" style="width: 12px; height: 12px;"></i> MoM: ${momGrowth.text}`;
  }

  // Hide KPI cards if data completely absent
  document.getElementById('kpiTotalBrands').style.display = uniqueBrands.size > 0 ? 'flex' : 'none';
  document.getElementById('kpiTotalCategories').style.display = uniqueCategories.size > 0 ? 'flex' : 'none';
  document.getElementById('kpiTotalOrders').style.display = totalOrders > 0 ? 'flex' : 'none';
  document.getElementById('kpiAvgOrderValue').style.display = totalOrders > 0 ? 'flex' : 'none';
  initIcons();
}

function calculateLatestMoMGrowth() {
  const latest = appState.latestMonth;
  const prev = appState.previousMonth;
  if (!latest || !prev) return { text: 'N/A', class: 'stable', icon: 'minus' };

  let latestSales = 0;
  let prevSales = 0;

  appState.filteredRecords.forEach((r) => {
    if (r.month === latest) latestSales += r.sales;
    if (r.month === prev) prevSales += r.sales;
  });

  if (prevSales === 0) {
    return { text: latestSales > 0 ? '+100%' : '0.0%', class: 'positive', icon: 'trending-up' };
  }

  const growth = ((latestSales - prevSales) / prevSales) * 100;
  const formatted = `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`;

  if (growth > 1) return { text: formatted, class: 'positive', icon: 'trending-up' };
  if (growth < -1) return { text: formatted, class: 'negative', icon: 'trending-down' };
  return { text: formatted, class: 'stable', icon: 'minus' };
}

/* ==========================================================================
   LAST 6 MONTHS MoM PERFORMANCE TABLE
   ========================================================================== */
function renderLast6MonthsMoMTable() {
  const tbody = document.getElementById('tbodyLast6Months');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (appState.last6Months.length === 0 || appState.filteredRecords.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center" style="padding: 2.5rem 1rem; color: #94a3b8; text-align: center;">
          <div style="font-size: 1rem; font-weight: 600; margin-bottom: 0.25rem;">No Monthly Data Available</div>
          <div style="font-size: 0.82rem;">Upload a sales CSV file or click "Reload Punjabi Chulha 6-Mo Data" to display metrics.</div>
        </td>
      </tr>
    `;
    return;
  }

  const sym = appState.currencySymbol;
  const monthData = [];

  appState.last6Months.forEach((m) => {
    let sales = 0;
    let qty = 0;
    let orders = 0;

    appState.filteredRecords.forEach((r) => {
      if (r.month === m) {
        sales += r.sales;
        qty += r.quantity;
        orders += r.orders;
      }
    });

    monthData.push({ month: m, sales, qty, orders, aov: orders > 0 ? (sales / orders) : 0 });
  });

  for (let i = 0; i < monthData.length; i++) {
    const cur = monthData[i];
    const prev = i > 0 ? monthData[i - 1] : null;
    let growthText = 'Baseline';
    let badgeClass = 'stable';
    let statusText = '➡ Base Period';

    if (prev && prev.sales > 0) {
      const g = ((cur.sales - prev.sales) / prev.sales) * 100;
      growthText = `${g >= 0 ? '+' : ''}${g.toFixed(1)}%`;
      if (g > 1) {
        badgeClass = 'positive';
        statusText = '🟢 Growth';
      } else if (g < -1) {
        badgeClass = 'negative';
        statusText = '🔴 Decline';
      } else {
        badgeClass = 'stable';
        statusText = '⚪ Stable';
      }
    } else if (prev && prev.sales === 0 && cur.sales > 0) {
      growthText = '+100%';
      badgeClass = 'positive';
      statusText = '🟢 Growth';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${cur.month}</strong></td>
      <td class="num bold-num">${sym}${formatMoney(cur.sales)}</td>
      <td class="num">${cur.qty.toLocaleString()}</td>
      <td class="num">${cur.orders.toLocaleString()}</td>
      <td class="num">${sym}${formatMoney(cur.aov)}</td>
      <td class="num">
        <span class="growth-pill ${badgeClass}">${growthText}</span>
      </td>
      <td><strong>${statusText}</strong></td>
    `;
    tbody.appendChild(tr);
  }
}

/* ==========================================================================
   MONTHLY TREND INTERACTIVE CHART (Chart.js)
   ========================================================================== */
function renderMonthlyTrendChart() {
  const canvas = document.getElementById('chartMonthlyTrend');
  if (!canvas) return;

  const months = appState.last6Months;
  const metric = appState.trendMetric;
  const sym = appState.currencySymbol;

  if (months.length === 0 || appState.filteredRecords.length === 0) {
    if (appState.charts.monthlyTrend) {
      appState.charts.monthlyTrend.destroy();
      appState.charts.monthlyTrend = null;
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const dataPoints = [];
  const backgroundColors = [];
  let prevSales = null;

  months.forEach((m) => {
    let sales = 0;
    let qty = 0;
    let orders = 0;

    appState.filteredRecords.forEach((r) => {
      if (r.month === m) {
        sales += r.sales;
        qty += r.quantity;
        orders += r.orders;
      }
    });

    if (metric === 'sales') {
      dataPoints.push(Math.round(sales));
    } else if (metric === 'quantity') {
      dataPoints.push(qty);
    } else if (metric === 'orders') {
      dataPoints.push(orders);
    } else if (metric === 'growth') {
      if (prevSales === null || prevSales === 0) {
        dataPoints.push(0);
      } else {
        const g = ((sales - prevSales) / prevSales) * 100;
        dataPoints.push(parseFloat(g.toFixed(1)));
      }
      prevSales = sales;
    }
  });

  if (appState.charts.monthlyTrend) {
    appState.charts.monthlyTrend.destroy();
  }

  const ctx = canvas.getContext('2d');
  const labelText = {
    sales: `Monthly Sales (${sym})`,
    quantity: 'Total Units Sold',
    orders: 'Total Orders / Invoices',
    growth: 'MoM Growth Rate (%)'
  }[metric];

  const chartType = metric === 'growth' ? 'bar' : 'line';

  appState.charts.monthlyTrend = new Chart(ctx, {
    type: chartType,
    data: {
      labels: months,
      datasets: [{
        label: labelText,
        data: dataPoints,
        borderColor: '#2563eb',
        backgroundColor: chartType === 'bar' ? dataPoints.map(v => v >= 0 ? '#059669' : '#e11d48') : 'rgba(37, 99, 235, 0.08)',
        fill: chartType === 'line',
        tension: 0.35,
        pointBackgroundColor: '#2563eb',
        pointRadius: 5,
        pointHoverRadius: 7,
        borderWidth: 2.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              if (metric === 'sales') return ` ${sym}${context.parsed.y.toLocaleString()}`;
              if (metric === 'growth') return ` ${context.parsed.y > 0 ? '+' : ''}${context.parsed.y}%`;
              return ` ${context.parsed.y.toLocaleString()}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: metric !== 'growth',
          grid: { color: '#f1f5f9' },
          ticks: {
            callback: (val) => {
              if (metric === 'sales') return `${sym}${formatCompact(val)}`;
              if (metric === 'growth') return `${val}%`;
              return formatCompact(val);
            }
          }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
}

/* ==========================================================================
   TOP SELLING ITEMS SECTION & HORIZONTAL BAR CHART
   ========================================================================== */
function getItemAggregates() {
  const itemMap = new Map();
  const latest = appState.latestMonth;
  const prev = appState.previousMonth;

  appState.filteredRecords.forEach((r) => {
    if (!itemMap.has(r.item)) {
      itemMap.set(r.item, {
        item: r.item,
        category: r.category || 'General',
        brand: r.brand || '',
        quantity: 0,
        sales: 0,
        orders: 0,
        monthsSold: new Set(),
        monthlySales: {},
        latestSales: 0,
        prevSales: 0
      });
    }

    const it = itemMap.get(r.item);
    it.quantity += r.quantity;
    it.sales += r.sales;
    it.orders += r.orders;
    if (r.quantity > 0) it.monthsSold.add(r.month);

    it.monthlySales[r.month] = (it.monthlySales[r.month] || 0) + r.sales;
    if (r.month === latest) it.latestSales += r.sales;
    if (r.month === prev) it.prevSales += r.sales;
  });

  // Calculate totals for contribution
  let totalCatalogSales = 0;
  itemMap.forEach((it) => { totalCatalogSales += it.sales; });

  const itemsArray = [];
  itemMap.forEach((it) => {
    const avgPrice = it.quantity > 0 ? (it.sales / it.quantity) : 0;
    const contribution = totalCatalogSales > 0 ? ((it.sales / totalCatalogSales) * 100) : 0;
    
    // MoM growth between latest and previous
    let growth = 0;
    if (it.prevSales > 0) {
      growth = ((it.latestSales - it.prevSales) / it.prevSales) * 100;
    } else if (it.prevSales === 0 && it.latestSales > 0) {
      growth = 100;
    }

    // Best and Worst months
    let bestM = 'N/A';
    let bestVal = -1;
    let worstM = 'N/A';
    let worstVal = Infinity;

    for (const [m, s] of Object.entries(it.monthlySales)) {
      if (s > bestVal) { bestVal = s; bestM = m; }
      if (s < worstVal && s > 0) { worstVal = s; worstM = m; }
    }
    if (worstM === 'N/A') worstM = bestM;

    // Classification
    const classification = assignItemClassification(it.sales, totalCatalogSales, growth, it.monthsSold.size);

    itemsArray.push({
      ...it,
      avgPrice,
      contribution,
      growth,
      bestMonth: bestM,
      worstMonth: worstM,
      monthsSoldCount: it.monthsSold.size,
      classification
    });
  });

  return itemsArray;
}

function assignItemClassification(itemSales, totalSales, growth, monthsCount) {
  const share = totalSales > 0 ? (itemSales / totalSales) * 100 : 0;
  if (share >= 3.0 || itemSales > 25000) return 'FAST_MOVING';
  if (growth >= 10.0) return 'GROWING';
  if (growth <= -10.0) return 'DECLINING';
  if (monthsCount <= 2 || itemSales < 1500) return 'SLOW_MOVING';
  return 'STABLE';
}

function renderTopSellingItemsSection() {
  const items = getItemAggregates();
  const sym = appState.currencySymbol;
  const tbody = document.getElementById('tbodyTopSellingItems');
  if (!tbody) return;

  if (items.length === 0 || appState.filteredRecords.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center" style="padding: 2.5rem 1rem; color: #94a3b8; text-align: center;">
          <div style="font-size: 1rem; font-weight: 600; margin-bottom: 0.25rem;">No Items Available</div>
          <div style="font-size: 0.82rem;">Upload a sales CSV file or adjust your search filter.</div>
        </td>
      </tr>
    `;
    renderTopItemsHorizontalBar([]);
    return;
  }

  // Sorting
  const { key, dir } = appState.sort.topItems;
  items.sort((a, b) => {
    let vA = a[key] ?? 0;
    let vB = b[key] ?? 0;
    if (typeof vA === 'string') {
      return dir === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
    }
    return dir === 'asc' ? vA - vB : vB - vA;
  });

  const limit = appState.topItemsLimit;
  const displayedItems = items.slice(0, limit);

  tbody.innerHTML = '';
  displayedItems.forEach((item, index) => {
    const rank = index + 1;
    const rankBadgeClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
    const growthClass = item.growth > 0 ? 'positive' : item.growth < 0 ? 'negative' : 'stable';
    const growthText = `${item.growth >= 0 ? '+' : ''}${item.growth.toFixed(1)}%`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="rank-badge ${rankBadgeClass}">${rank}</span></td>
      <td>
        <a class="item-link" data-item="${escapeHtml(item.item)}">${escapeHtml(item.item)}</a>
        <span class="item-subtext">${escapeHtml(item.brand || '')}</span>
      </td>
      <td>${escapeHtml(item.category)}</td>
      <td class="num">${item.quantity.toLocaleString()}</td>
      <td class="num bold-num">${sym}${formatMoney(item.sales)}</td>
      <td class="num">${sym}${formatMoney(item.avgPrice)}</td>
      <td class="num">
        ${item.contribution.toFixed(1)}%
        <span class="progress-cell-bar"><span class="progress-cell-fill" style="width: ${Math.min(item.contribution * 4, 100)}%;"></span></span>
      </td>
      <td class="num">
        <span class="growth-pill ${growthClass}">${growthText}</span>
      </td>
      <td style="text-align: center;">
        <button class="btn btn-sm btn-secondary btn-inspect-item" data-item="${escapeHtml(item.item)}" title="View Trajectory">
          <i data-lucide="eye"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Attach click listeners to open modal
  tbody.querySelectorAll('.item-link, .btn-inspect-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      const itemName = e.currentTarget.getAttribute('data-item');
      openItemDetailModal(itemName);
    });
  });

  // Render Horizontal Bar Chart
  renderTopItemsHorizontalBar(items.slice(0, 10));
}

function renderTopItemsHorizontalBar(topItems) {
  const canvas = document.getElementById('chartTopSellingItems');
  if (!canvas) return;

  if (!topItems || topItems.length === 0) {
    if (appState.charts.topItems) {
      appState.charts.topItems.destroy();
      appState.charts.topItems = null;
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const sym = appState.currencySymbol;
  const labels = topItems.map((it) => it.item.length > 24 ? it.item.slice(0, 22) + '...' : it.item);
  const data = topItems.map((it) => Math.round(it.sales));

  if (appState.charts.topItems) {
    appState.charts.topItems.destroy();
  }

  const ctx = canvas.getContext('2d');
  appState.charts.topItems = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: `Sales Revenue (${sym})`,
        data: data,
        backgroundColor: '#2563eb',
        borderRadius: 4,
        borderSkipped: false
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` Sales: ${sym}${ctx.parsed.x.toLocaleString()}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: '#f1f5f9' },
          ticks: {
            callback: (v) => `${sym}${formatCompact(v)}`
          }
        },
        y: {
          grid: { display: false }
        }
      }
    }
  });
}

/* ==========================================================================
   MONTH-WISE TOP ITEMS TABLE
   ========================================================================== */
function renderMonthWiseTopItemsTable() {
  const tbody = document.getElementById('tbodyMonthWiseTop');
  if (!tbody) return;
  tbody.innerHTML = '';

  const selectedMonth = appState.monthWiseSelectedMonth;
  const sym = appState.currencySymbol;
  const targetMonths = selectedMonth === 'ALL' ? appState.last6Months : [selectedMonth];

  if (targetMonths.length === 0 || appState.filteredRecords.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center" style="padding: 2.5rem 1rem; color: #94a3b8; text-align: center;">
          <div style="font-size: 1rem; font-weight: 600; margin-bottom: 0.25rem;">No Month-Wise Records</div>
          <div style="font-size: 0.82rem;">Upload a sales CSV to inspect monthly item rankings.</div>
        </td>
      </tr>
    `;
    return;
  }

  targetMonths.forEach((month) => {
    // Collect item totals for this specific month
    const itemMap = new Map();
    appState.filteredRecords.forEach((r) => {
      if (r.month === month) {
        if (!itemMap.has(r.item)) {
          itemMap.set(r.item, {
            item: r.item,
            category: r.category,
            quantity: 0,
            sales: 0,
            orders: 0,
            unitPrice: r.unitPrice
          });
        }
        const it = itemMap.get(r.item);
        it.quantity += r.quantity;
        it.sales += r.sales;
        it.orders += r.orders;
      }
    });

    const items = Array.from(itemMap.values());
    items.sort((a, b) => b.sales - a.sales);
    const top10 = items.slice(0, 10);

    top10.forEach((item, index) => {
      const rank = index + 1;
      const rankBadge = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${month}</strong></td>
        <td><span class="rank-badge ${rankBadge}">${rank}</span></td>
        <td>
          <a class="item-link" data-item="${escapeHtml(item.item)}">${escapeHtml(item.item)}</a>
        </td>
        <td>${escapeHtml(item.category)}</td>
        <td class="num">${item.quantity.toLocaleString()}</td>
        <td class="num bold-num">${sym}${formatMoney(item.sales)}</td>
        <td class="num">${sym}${formatMoney(item.unitPrice || (item.quantity > 0 ? item.sales / item.quantity : 0))}</td>
        <td class="num">${item.orders.toLocaleString()}</td>
      `;
      tbody.appendChild(tr);
    });
  });

  tbody.querySelectorAll('.item-link').forEach((el) => {
    el.addEventListener('click', (e) => {
      openItemDetailModal(e.currentTarget.getAttribute('data-item'));
    });
  });
}

/* ==========================================================================
   ITEM PERFORMANCE DIRECTORY & PAGINATION
   ========================================================================== */
function renderItemDirectoryTable() {
  let items = getItemAggregates();
  const tbody = document.getElementById('tbodyItemPerformance');
  if (!tbody) return;

  // Filter by velocity classification if selected
  const classFilter = appState.filters.classification;
  if (classFilter !== 'ALL') {
    items = items.filter((it) => it.classification === classFilter);
  }

  // Sorting
  const { key, dir } = appState.sort.itemDirectory;
  items.sort((a, b) => {
    let vA = a[key] ?? 0;
    let vB = b[key] ?? 0;
    if (typeof vA === 'string') {
      return dir === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
    }
    return dir === 'asc' ? vA - vB : vB - vA;
  });

  // Pagination
  const { page, perPage } = appState.pagination.itemDirectory;
  const totalItems = items.length;

  if (totalItems === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="text-center" style="padding: 2.5rem 1rem; color: #94a3b8; text-align: center;">
          <div style="font-size: 1rem; font-weight: 600; margin-bottom: 0.25rem;">No Items Found in Directory</div>
          <div style="font-size: 0.82rem;">Upload a sales CSV file or reset filters to inspect items.</div>
        </td>
      </tr>
    `;
    document.getElementById('paginationInfoText').textContent = 'Showing 0 items';
    const prevBtn = document.getElementById('btnPagePrev');
    const nextBtn = document.getElementById('btnPageNext');
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    const numContainer = document.getElementById('pageNumberButtons');
    if (numContainer) numContainer.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(totalItems / perPage) || 1;
  const start = (page - 1) * perPage;
  const end = Math.min(start + perPage, totalItems);
  const pagedItems = items.slice(start, end);

  tbody.innerHTML = '';
  const sym = appState.currencySymbol;

  pagedItems.forEach((item) => {
    const growthClass = item.growth > 0 ? 'positive' : item.growth < 0 ? 'negative' : 'stable';
    const growthText = `${item.growth >= 0 ? '+' : ''}${item.growth.toFixed(1)}%`;
    const classBadge = getClassificationBadge(item.classification);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <a class="item-link" data-item="${escapeHtml(item.item)}">${escapeHtml(item.item)}</a>
      </td>
      <td>${escapeHtml(item.category)}</td>
      <td class="num">${item.quantity.toLocaleString()}</td>
      <td class="num bold-num">${sym}${formatMoney(item.sales)}</td>
      <td class="num">${sym}${formatMoney(item.avgPrice)}</td>
      <td class="num">${item.monthsSoldCount} / ${appState.last6Months.length}</td>
      <td><strong>${item.bestMonth}</strong></td>
      <td><span style="color: var(--text-secondary);">${item.worstMonth}</span></td>
      <td class="num"><span class="growth-pill ${growthClass}">${growthText}</span></td>
      <td class="num">${item.contribution.toFixed(1)}%</td>
      <td>${classBadge}</td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.item-link').forEach((el) => {
    el.addEventListener('click', (e) => {
      openItemDetailModal(e.currentTarget.getAttribute('data-item'));
    });
  });

  // Update Pagination Controls
  document.getElementById('paginationInfoText').textContent = `Showing ${totalItems > 0 ? start + 1 : 0} to ${end} of ${totalItems} items`;
  const prevBtn = document.getElementById('btnPagePrev');
  const nextBtn = document.getElementById('btnPageNext');
  if (prevBtn) prevBtn.disabled = page <= 1;
  if (nextBtn) nextBtn.disabled = page >= totalPages;

  const numContainer = document.getElementById('pageNumberButtons');
  if (numContainer) {
    numContainer.innerHTML = '';
    const maxBtns = Math.min(totalPages, 5);
    for (let i = 1; i <= maxBtns; i++) {
      const btn = document.createElement('button');
      btn.className = `page-btn ${i === page ? 'active' : ''}`;
      btn.textContent = i;
      btn.addEventListener('click', () => {
        appState.pagination.itemDirectory.page = i;
        renderItemDirectoryTable();
      });
      numContainer.appendChild(btn);
    }
  }
}

function getClassificationBadge(classification) {
  switch (classification) {
    case 'FAST_MOVING':
      return '<span class="badge-class fast-moving">🔥 Fast Moving</span>';
    case 'GROWING':
      return '<span class="badge-class growing">📈 Growing</span>';
    case 'STABLE':
      return '<span class="badge-class stable">➡ Stable</span>';
    case 'DECLINING':
      return '<span class="badge-class declining">📉 Declining</span>';
    case 'SLOW_MOVING':
    default:
      return '<span class="badge-class slow-moving">🐢 Slow Moving</span>';
  }
}

/* ==========================================================================
   TOP GROWING & DECLINING ITEMS (Latest Month vs Previous Month)
   ========================================================================== */
function renderGrowthAnalysisCards() {
  const latest = appState.latestMonth;
  const prev = appState.previousMonth;
  const sym = appState.currencySymbol;

  const tbodyGrowing = document.getElementById('tbodyTopGrowing');
  const tbodyDeclining = document.getElementById('tbodyTopDeclining');
  if (!tbodyGrowing || !tbodyDeclining) return;

  const itemMap = new Map();
  appState.filteredRecords.forEach((r) => {
    if (!itemMap.has(r.item)) {
      itemMap.set(r.item, { item: r.item, prevSales: 0, latestSales: 0 });
    }
    const it = itemMap.get(r.item);
    if (r.month === prev) it.prevSales += r.sales;
    if (r.month === latest) it.latestSales += r.sales;
  });

  const growing = [];
  const declining = [];

  itemMap.forEach((it) => {
    if (it.prevSales > 0 || it.latestSales > 0) {
      const diff = it.latestSales - it.prevSales;
      const pct = it.prevSales > 0 ? ((diff / it.prevSales) * 100) : (it.latestSales > 0 ? 100 : 0);

      if (diff > 0) {
        growing.push({
          item: it.item,
          prevSales: it.prevSales,
          currSales: it.latestSales,
          diff: diff,
          pct: pct
        });
      } else if (diff < 0) {
        declining.push({
          item: it.item,
          prevSales: it.prevSales,
          currSales: it.latestSales,
          diff: Math.abs(diff),
          pct: Math.abs(pct)
        });
      }
    }
  });

  // Sort Growing by selected mode
  const sortGrowEl = document.getElementById('sortGrowingBy');
  const growSortMode = sortGrowEl ? sortGrowEl.value : 'percent-desc';
  growing.sort((a, b) => growSortMode === 'amount-desc' ? b.diff - a.diff : b.pct - a.pct);

  // Sort Declining by selected mode
  const sortDecEl = document.getElementById('sortDecliningBy');
  const decSortMode = sortDecEl ? sortDecEl.value : 'percent-asc';
  declining.sort((a, b) => decSortMode === 'amount-desc' ? b.diff - a.diff : b.pct - a.pct);

  // Render Growing Table
  tbodyGrowing.innerHTML = '';
  if (growing.length === 0) {
    tbodyGrowing.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 1.5rem; color: #94a3b8; text-align: center;">No growing items detected.</td></tr>';
  } else {
    growing.slice(0, 10).forEach((it) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><a class="item-link" data-item="${escapeHtml(it.item)}">${escapeHtml(it.item)}</a></td>
        <td class="num">${sym}${formatMoney(it.prevSales)}</td>
        <td class="num bold-num">${sym}${formatMoney(it.currSales)}</td>
        <td class="num" style="color: var(--color-growth); font-weight: 700;">+${sym}${formatMoney(it.diff)}</td>
        <td class="num"><span class="growth-pill positive">+${it.pct.toFixed(1)}%</span></td>
      `;
      tbodyGrowing.appendChild(tr);
    });
  }

  // Render Declining Table
  tbodyDeclining.innerHTML = '';
  if (declining.length === 0) {
    tbodyDeclining.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 1.5rem; color: #94a3b8; text-align: center;">No declining items detected.</td></tr>';
  } else {
    declining.slice(0, 10).forEach((it) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><a class="item-link" data-item="${escapeHtml(it.item)}">${escapeHtml(it.item)}</a></td>
        <td class="num">${sym}${formatMoney(it.prevSales)}</td>
        <td class="num bold-num">${sym}${formatMoney(it.currSales)}</td>
        <td class="num" style="color: var(--color-decline); font-weight: 700;">-${sym}${formatMoney(it.diff)}</td>
        <td class="num"><span class="growth-pill negative">-${it.pct.toFixed(1)}%</span></td>
      `;
      tbodyDeclining.appendChild(tr);
    });
  }

  document.querySelectorAll('#tbodyTopGrowing .item-link, #tbodyTopDeclining .item-link').forEach((el) => {
    el.addEventListener('click', (e) => {
      openItemDetailModal(e.currentTarget.getAttribute('data-item'));
    });
  });
}

/* ==========================================================================
   CATEGORY & BRAND/OUTLET ANALYSIS
   ========================================================================== */
function renderCategoryAndBrandAnalysis() {
  const records = appState.filteredRecords;
  const sym = appState.currencySymbol;

  // 1. Categories
  const catMap = new Map();
  let totalSales = 0;

  records.forEach((r) => {
    totalSales += r.sales;
    const cat = r.category || 'General';
    if (!catMap.has(cat)) {
      catMap.set(cat, { category: cat, sales: 0, qty: 0, orders: 0, latestSales: 0, prevSales: 0 });
    }
    const c = catMap.get(cat);
    c.sales += r.sales;
    c.qty += r.quantity;
    c.orders += r.orders;
    if (r.month === appState.latestMonth) c.latestSales += r.sales;
    if (r.month === appState.previousMonth) c.prevSales += r.sales;
  });

  const catArray = Array.from(catMap.values());
  catArray.sort((a, b) => b.sales - a.sales);

  const tbodyCat = document.getElementById('tbodyCategoryAnalysis');
  if (tbodyCat) {
    tbodyCat.innerHTML = '';
    if (catArray.length === 0) {
      tbodyCat.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 1.5rem; color: #94a3b8; text-align: center;">No category data available.</td></tr>';
    } else {
      catArray.forEach((c) => {
        const share = totalSales > 0 ? (c.sales / totalSales) * 100 : 0;
        let momGrowth = 0;
        if (c.prevSales > 0) momGrowth = ((c.latestSales - c.prevSales) / c.prevSales) * 100;
        const gClass = momGrowth > 0 ? 'positive' : momGrowth < 0 ? 'negative' : 'stable';

        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.title = 'Click to filter dashboard by this category';
        tr.innerHTML = `
          <td><strong>${escapeHtml(c.category)}</strong></td>
          <td class="num bold-num">${sym}${formatMoney(c.sales)}</td>
          <td class="num">${c.qty.toLocaleString()}</td>
          <td class="num">${c.orders.toLocaleString()}</td>
          <td class="num">${share.toFixed(1)}%</td>
          <td class="num"><span class="growth-pill ${gClass}">${momGrowth >= 0 ? '+' : ''}${momGrowth.toFixed(1)}%</span></td>
        `;
        tr.addEventListener('click', () => {
          const catSelect = document.getElementById('filterCategory');
          if (catSelect) {
            catSelect.value = c.category;
            appState.filters.category = c.category;
            applyFiltersAndRender();
          }
        });
        tbodyCat.appendChild(tr);
      });
    }
  }

  // Render Category Doughnut Chart
  renderCategoryDoughnutChart(catArray);

  // 2. Brand / Outlet
  const brandMap = new Map();
  records.forEach((r) => {
    const key = `${r.brand}__${r.outlet}`;
    if (!brandMap.has(key)) {
      brandMap.set(key, {
        brand: r.brand || 'Main Brand',
        outlet: r.outlet || r.brand,
        city: r.city || '',
        sales: 0,
        qty: 0,
        orders: 0,
        latestSales: 0,
        prevSales: 0
      });
    }
    const b = brandMap.get(key);
    b.sales += r.sales;
    b.qty += r.quantity;
    b.orders += r.orders;
    if (r.month === appState.latestMonth) b.latestSales += r.sales;
    if (r.month === appState.previousMonth) b.prevSales += r.sales;
  });

  const brandArray = Array.from(brandMap.values());
  brandArray.sort((a, b) => b.sales - a.sales);

  const tbodyBrand = document.getElementById('tbodyBrandAnalysis');
  if (tbodyBrand) {
    tbodyBrand.innerHTML = '';
    if (brandArray.length === 0) {
      tbodyBrand.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 1.5rem; color: #94a3b8; text-align: center;">No brand/outlet data available.</td></tr>';
    } else {
      brandArray.forEach((b) => {
        const share = totalSales > 0 ? (b.sales / totalSales) * 100 : 0;
        let momGrowth = 0;
        if (b.prevSales > 0) momGrowth = ((b.latestSales - b.prevSales) / b.prevSales) * 100;
        const gClass = momGrowth > 0 ? 'positive' : momGrowth < 0 ? 'negative' : 'stable';

        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.title = 'Click to filter dashboard by this brand';
        tr.innerHTML = `
          <td><strong>${escapeHtml(b.brand)}</strong></td>
          <td>${escapeHtml(b.outlet)}</td>
          <td>${escapeHtml(b.city || 'Delhi NCR')}</td>
          <td class="num bold-num">${sym}${formatMoney(b.sales)}</td>
          <td class="num">${b.qty.toLocaleString()}</td>
          <td class="num">${b.orders.toLocaleString()}</td>
          <td class="num">${share.toFixed(1)}%</td>
          <td class="num"><span class="growth-pill ${gClass}">${momGrowth >= 0 ? '+' : ''}${momGrowth.toFixed(1)}%</span></td>
        `;
        tr.addEventListener('click', () => {
          const brandSel = document.getElementById('filterBrand');
          if (brandSel) {
            brandSel.value = b.brand;
            appState.filters.brand = b.brand;
            applyFiltersAndRender();
          }
        });
        tbodyBrand.appendChild(tr);
      });
    }
  }
}

function renderCategoryDoughnutChart(catArray) {
  const canvas = document.getElementById('chartCategoryShare');
  if (!canvas) return;

  if (!catArray || catArray.length === 0) {
    if (appState.charts.categoryShare) {
      appState.charts.categoryShare.destroy();
      appState.charts.categoryShare = null;
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const topCats = catArray.slice(0, 6);
  const labels = topCats.map((c) => c.category);
  const data = topCats.map((c) => Math.round(c.sales));
  const sym = appState.currencySymbol;

  const palette = ['#2563eb', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

  if (appState.charts.categoryShare) {
    appState.charts.categoryShare.destroy();
  }

  const ctx = canvas.getContext('2d');
  appState.charts.categoryShare = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: palette.slice(0, data.length),
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { boxWidth: 12, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${sym}${ctx.parsed.toLocaleString()}`
          }
        }
      },
      cutout: '65%'
    }
  });
}

/* ==========================================================================
   RAW DATA EXPLORER & PAGINATION
   ========================================================================== */
function renderRawDataExplorer() {
  const thead = document.getElementById('theadRawData');
  const tbody = document.getElementById('tbodyRawData');
  if (!thead || !tbody) return;

  const records = appState.filteredRecords;
  const sym = appState.currencySymbol;

  thead.innerHTML = `
    <tr>
      <th>Month</th>
      <th>Item Name</th>
      <th>Category</th>
      <th>Brand</th>
      <th>Outlet</th>
      <th class="num">Quantity</th>
      <th class="num">Unit Price</th>
      <th class="num">Sales</th>
      <th class="num">Orders</th>
    </tr>
  `;

  const { page, perPage } = appState.pagination.rawData;
  const total = records.length;

  if (total === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center" style="padding: 2.5rem 1rem; color: #94a3b8; text-align: center;">
          <div style="font-size: 1rem; font-weight: 600; margin-bottom: 0.25rem;">No Raw Records Available</div>
          <div style="font-size: 0.82rem;">Upload a sales CSV file or adjust filter parameters.</div>
        </td>
      </tr>
    `;
    document.getElementById('paginationRawInfoText').textContent = 'Showing 0 records';
    document.getElementById('txtRawPageIndicator').textContent = 'Page 1 of 1';
    const prevBtn = document.getElementById('btnRawPrev');
    const nextBtn = document.getElementById('btnRawNext');
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  const totalPages = Math.ceil(total / perPage) || 1;
  const start = (page - 1) * perPage;
  const end = Math.min(start + perPage, total);
  const pageData = records.slice(start, end);

  tbody.innerHTML = '';
  pageData.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(r.month)}</strong></td>
      <td>${escapeHtml(r.item)}</td>
      <td>${escapeHtml(r.category)}</td>
      <td>${escapeHtml(r.brand)}</td>
      <td>${escapeHtml(r.outlet)}</td>
      <td class="num">${r.quantity}</td>
      <td class="num">${sym}${formatMoney(r.unitPrice)}</td>
      <td class="num bold-num">${sym}${formatMoney(r.sales)}</td>
      <td class="num">${r.orders}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('paginationRawInfoText').textContent = `Showing records ${total > 0 ? start + 1 : 0} to ${end} of ${total}`;
  document.getElementById('txtRawPageIndicator').textContent = `Page ${page} of ${totalPages}`;

  const prevBtn = document.getElementById('btnRawPrev');
  const nextBtn = document.getElementById('btnRawNext');
  if (prevBtn) {
    prevBtn.disabled = page <= 1;
    prevBtn.onclick = () => {
      if (appState.pagination.rawData.page > 1) {
        appState.pagination.rawData.page--;
        renderRawDataExplorer();
      }
    };
  }
  if (nextBtn) {
    nextBtn.disabled = page >= totalPages;
    nextBtn.onclick = () => {
      if (appState.pagination.rawData.page < totalPages) {
        appState.pagination.rawData.page++;
        renderRawDataExplorer();
      }
    };
  }
}

/* ==========================================================================
   ITEM DETAIL MODAL & TRAJECTORY LINE CHART
   ========================================================================== */
function openItemDetailModal(itemName) {
  if (!itemName) return;
  appState.selectedItemForModal = itemName;

  const itemRecords = appState.normalizedRecords.filter((r) => r.item === itemName);
  if (itemRecords.length === 0) return;

  const modal = document.getElementById('itemDetailModal');
  const sym = appState.currencySymbol;

  const sample = itemRecords[0];
  document.getElementById('modalItemTitle').textContent = itemName;
  document.getElementById('modalItemCategoryBrand').textContent = `${sample.category} • ${sample.brand} ${sample.outlet ? `(${sample.outlet})` : ''}`;

  let totalSales = 0;
  let totalQty = 0;
  let totalOrders = 0;
  const monthlyData = {};

  appState.last6Months.forEach((m) => {
    monthlyData[m] = { month: m, qty: 0, sales: 0, unitPrice: 0, orders: 0 };
  });

  itemRecords.forEach((r) => {
    totalSales += r.sales;
    totalQty += r.quantity;
    totalOrders += r.orders;
    if (monthlyData[r.month]) {
      monthlyData[r.month].qty += r.quantity;
      monthlyData[r.month].sales += r.sales;
      monthlyData[r.month].unitPrice = r.unitPrice || monthlyData[r.month].unitPrice;
      monthlyData[r.month].orders += r.orders;
    }
  });

  const avgPrice = totalQty > 0 ? (totalSales / totalQty) : 0;

  // Catalog total for contribution
  let catalogTotal = 0;
  appState.filteredRecords.forEach((r) => { catalogTotal += r.sales; });
  const contribution = catalogTotal > 0 ? ((totalSales / catalogTotal) * 100) : 0;

  // Best & Worst month
  let bestM = 'N/A';
  let bestVal = -1;
  let worstM = 'N/A';
  let worstVal = Infinity;

  Object.values(monthlyData).forEach((md) => {
    if (md.sales > bestVal) { bestVal = md.sales; bestM = md.month; }
    if (md.sales < worstVal && md.sales > 0) { worstVal = md.sales; worstM = md.month; }
  });
  if (worstM === 'N/A') worstM = bestM;

  document.getElementById('modalValSales').textContent = `${sym}${formatMoney(totalSales)}`;
  document.getElementById('modalValQty').textContent = totalQty.toLocaleString();
  document.getElementById('modalValAvgPrice').textContent = `${sym}${formatMoney(avgPrice)}`;
  document.getElementById('modalValContribution').textContent = `${contribution.toFixed(2)}%`;
  document.getElementById('modalValBestMonth').textContent = bestM;
  document.getElementById('modalValWorstMonth').textContent = worstM;

  // Render Modal Monthly Table
  const tbody = document.getElementById('tbodyModalItemMonthly');
  tbody.innerHTML = '';
  const monthsArray = Object.values(monthlyData);

  for (let i = 0; i < monthsArray.length; i++) {
    const cur = monthsArray[i];
    const prev = i > 0 ? monthsArray[i - 1] : null;
    let growthText = 'Baseline';
    let gClass = 'stable';

    if (prev && prev.sales > 0) {
      const g = ((cur.sales - prev.sales) / prev.sales) * 100;
      growthText = `${g >= 0 ? '+' : ''}${g.toFixed(1)}%`;
      gClass = g > 0 ? 'positive' : g < 0 ? 'negative' : 'stable';
    } else if (prev && prev.sales === 0 && cur.sales > 0) {
      growthText = '+100%';
      gClass = 'positive';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${cur.month}</strong></td>
      <td class="num">${cur.qty.toLocaleString()}</td>
      <td class="num bold-num">${sym}${formatMoney(cur.sales)}</td>
      <td class="num">${sym}${formatMoney(cur.unitPrice)}</td>
      <td class="num">${cur.orders}</td>
      <td class="num"><span class="growth-pill ${gClass}">${growthText}</span></td>
    `;
    tbody.appendChild(tr);
  }

  // Render Modal Trajectory Line Chart
  renderItemModalTrajectoryChart(monthsArray);

  modal.classList.add('show');
  initIcons();
}

function renderItemModalTrajectoryChart(monthlyDataArray) {
  const canvas = document.getElementById('chartItemModalTrajectory');
  if (!canvas) return;

  const labels = monthlyDataArray.map((m) => m.month);
  const salesData = monthlyDataArray.map((m) => Math.round(m.sales));
  const qtyData = monthlyDataArray.map((m) => m.qty);
  const sym = appState.currencySymbol;

  if (appState.charts.modalTrajectory) {
    appState.charts.modalTrajectory.destroy();
  }

  const ctx = canvas.getContext('2d');
  appState.charts.modalTrajectory = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: `Sales (${sym})`,
          data: salesData,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          fill: true,
          tension: 0.3,
          yAxisID: 'y'
        },
        {
          label: 'Quantity Sold',
          data: qtyData,
          borderColor: '#10b981',
          borderDash: [4, 4],
          fill: false,
          tension: 0.3,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          grid: { color: '#f1f5f9' },
          ticks: { callback: (v) => `${sym}${formatCompact(v)}` }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          grid: { drawOnChartArea: false }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

/* ==========================================================================
   REPORT GENERATION MODAL & PDF / PRINT
   ========================================================================== */
function openReportModal() {
  const modal = document.getElementById('reportGenerationModal');
  if (!modal) return;

  const sym = appState.currencySymbol;
  const items = getItemAggregates();
  let totalSales = 0;
  let totalQty = 0;
  let totalOrders = 0;

  appState.filteredRecords.forEach((r) => {
    totalSales += r.sales;
    totalQty += r.quantity;
    totalOrders += r.orders;
  });

  const aov = totalOrders > 0 ? (totalSales / totalOrders) : 0;
  document.getElementById('rptKpiSales').textContent = `${sym}${formatMoney(totalSales)}`;
  document.getElementById('rptKpiQty').textContent = totalQty.toLocaleString();
  document.getElementById('rptKpiOrders').textContent = totalOrders.toLocaleString();
  document.getElementById('rptKpiAov').textContent = `${sym}${formatMoney(aov)}`;
  document.getElementById('rptGeneratedDate').textContent = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Monthly Table
  const rptMonthly = document.getElementById('rptTbodyMonthly');
  rptMonthly.innerHTML = '';
  let prevS = null;
  appState.last6Months.forEach((m) => {
    let s = 0, q = 0, o = 0;
    appState.filteredRecords.forEach((r) => {
      if (r.month === m) { s += r.sales; q += r.quantity; o += r.orders; }
    });
    let gStr = 'Baseline';
    if (prevS !== null && prevS > 0) {
      const g = ((s - prevS) / prevS) * 100;
      gStr = `${g >= 0 ? '+' : ''}${g.toFixed(1)}%`;
    }
    prevS = s;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${m}</strong></td>
      <td class="num">${sym}${formatMoney(s)}</td>
      <td class="num">${q.toLocaleString()}</td>
      <td class="num">${o.toLocaleString()}</td>
      <td class="num">${gStr}</td>
    `;
    rptMonthly.appendChild(tr);
  });

  // Top Items Table
  const rptTop = document.getElementById('rptTbodyTopItems');
  rptTop.innerHTML = '';
  items.sort((a, b) => b.sales - a.sales);
  items.slice(0, 10).forEach((it, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><strong>${escapeHtml(it.item)}</strong></td>
      <td>${escapeHtml(it.category)}</td>
      <td class="num">${it.quantity.toLocaleString()}</td>
      <td class="num">${sym}${formatMoney(it.sales)}</td>
      <td class="num">${it.contribution.toFixed(1)}%</td>
    `;
    rptTop.appendChild(tr);
  });

  // Highlights
  const growList = document.getElementById('rptGrowingList');
  const decList = document.getElementById('rptDecliningList');
  const growing = items.filter(it => it.growth > 0).sort((a, b) => b.growth - a.growth).slice(0, 5);
  const declining = items.filter(it => it.growth < 0).sort((a, b) => a.growth - b.growth).slice(0, 5);

  growList.innerHTML = growing.map(g => `<div>• <strong>${escapeHtml(g.item)}</strong>: +${g.growth.toFixed(1)}% (Sales: ${sym}${formatMoney(g.sales)})</div>`).join('') || 'None detected.';
  decList.innerHTML = declining.map(d => `<div>• <strong>${escapeHtml(d.item)}</strong>: ${d.growth.toFixed(1)}% (Sales: ${sym}${formatMoney(d.sales)})</div>`).join('') || 'None detected.';

  // Categories
  const rptCat = document.getElementById('rptTbodyCategory');
  rptCat.innerHTML = '';
  const catMap = new Map();
  appState.filteredRecords.forEach((r) => {
    catMap.set(r.category, (catMap.get(r.category) || { sales: 0, qty: 0 }));
    catMap.get(r.category).sales += r.sales;
    catMap.get(r.category).qty += r.quantity;
  });
  Array.from(catMap.entries()).sort((a, b) => b[1].sales - a[1].sales).forEach(([cat, data]) => {
    const share = totalSales > 0 ? (data.sales / totalSales) * 100 : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(cat)}</td>
      <td class="num">${sym}${formatMoney(data.sales)}</td>
      <td class="num">${data.qty.toLocaleString()}</td>
      <td class="num">${share.toFixed(1)}%</td>
    `;
    rptCat.appendChild(tr);
  });

  modal.classList.add('show');
}

function exportReportToPdf() {
  if (!window.jspdf) {
    window.print();
    return;
  }
  showToast('Generating PDF Report...', true);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'pt', 'a4');
  const element = document.getElementById('printableReportContent');

  doc.html(element, {
    callback: function (pdf) {
      pdf.save('Sales_Analytics_Executive_Report.pdf');
      hideToast();
      showToast('PDF downloaded successfully.');
    },
    x: 20,
    y: 20,
    width: 555,
    windowWidth: 900
  });
}

/* ==========================================================================
   CSV EXPORT GENERATOR (All 8 User-Requested Reports)
   ========================================================================== */
function handleCsvExport(type) {
  let filename = 'Report.csv';
  let headers = [];
  let rows = [];
  const items = getItemAggregates();
  const sym = appState.currencySymbol;

  switch (type) {
    case 'filtered':
      filename = 'Sales_Filtered_Data.csv';
      headers = ['Month', 'Item Name', 'Category', 'Subcategory', 'Brand', 'Outlet', 'City', 'Quantity', 'Unit Price', 'Sales', 'Orders'];
      rows = appState.filteredRecords.map((r) => [
        r.month, r.item, r.category, r.subcategory, r.brand, r.outlet, r.city, r.quantity, r.unitPrice, r.sales, r.orders
      ]);
      break;

    case 'top-items':
      filename = 'Top_Selling_Items.csv';
      headers = ['Rank', 'Item Name', 'Category', 'Quantity Sold', 'Sales Revenue', 'Avg Selling Price', 'Contribution %', 'MoM Growth %'];
      items.sort((a, b) => b.sales - a.sales);
      rows = items.map((it, idx) => [
        idx + 1, it.item, it.category, it.quantity, it.sales.toFixed(2), it.avgPrice.toFixed(2), it.contribution.toFixed(2), it.growth.toFixed(2)
      ]);
      break;

    case 'monthly':
      filename = 'Monthly_Sales_Report.csv';
      headers = ['Month', 'Sales Revenue', 'Quantity Sold', 'Orders / Invoices', 'Avg Order Value', 'MoM Growth %'];
      let prevS = null;
      appState.last6Months.forEach((m) => {
        let s = 0, q = 0, o = 0;
        appState.filteredRecords.forEach((r) => {
          if (r.month === m) { s += r.sales; q += r.quantity; o += r.orders; }
        });
        let g = 0;
        if (prevS !== null && prevS > 0) g = ((s - prevS) / prevS) * 100;
        prevS = s;
        rows.push([m, s.toFixed(2), q, o, o > 0 ? (s / o).toFixed(2) : 0, g.toFixed(2)]);
      });
      break;

    case 'performance':
      filename = 'Item_Performance_Report.csv';
      headers = ['Item Name', 'Category', 'Brand', 'Total Quantity', 'Total Sales', 'Avg Price', 'Months Sold', 'Best Month', 'Worst Month', 'MoM Growth %', 'Contribution %', 'Classification'];
      rows = items.map((it) => [
        it.item, it.category, it.brand, it.quantity, it.sales.toFixed(2), it.avgPrice.toFixed(2), it.monthsSoldCount, it.bestMonth, it.worstMonth, it.growth.toFixed(2), it.contribution.toFixed(2), it.classification
      ]);
      break;

    case 'brand':
      filename = 'Brand_Report.csv';
      headers = ['Brand / Restaurant', 'Outlet / Subzone', 'City', 'Sales Revenue', 'Quantity Sold', 'Orders', 'Contribution %'];
      const bMap = new Map();
      let bTotal = 0;
      appState.filteredRecords.forEach((r) => {
        bTotal += r.sales;
        const key = `${r.brand}__${r.outlet}`;
        if (!bMap.has(key)) bMap.set(key, { brand: r.brand, outlet: r.outlet, city: r.city, sales: 0, qty: 0, orders: 0 });
        const b = bMap.get(key);
        b.sales += r.sales;
        b.qty += r.quantity;
        b.orders += r.orders;
      });
      rows = Array.from(bMap.values()).map((b) => [
        b.brand, b.outlet, b.city, b.sales.toFixed(2), b.qty, b.orders, bTotal > 0 ? ((b.sales / bTotal) * 100).toFixed(2) : 0
      ]);
      break;

    case 'category':
      filename = 'Category_Report.csv';
      headers = ['Category', 'Sales Revenue', 'Quantity Sold', 'Orders', 'Contribution %'];
      const cMap = new Map();
      let cTotal = 0;
      appState.filteredRecords.forEach((r) => {
        cTotal += r.sales;
        if (!cMap.has(r.category)) cMap.set(r.category, { cat: r.category, sales: 0, qty: 0, orders: 0 });
        const c = cMap.get(r.category);
        c.sales += r.sales;
        c.qty += r.quantity;
        c.orders += r.orders;
      });
      rows = Array.from(cMap.values()).map((c) => [
        c.cat, c.sales.toFixed(2), c.qty, c.orders, cTotal > 0 ? ((c.sales / cTotal) * 100).toFixed(2) : 0
      ]);
      break;

    case 'growth':
      filename = 'Growth_Report.csv';
      headers = ['Item Name', 'Category', 'Previous Month Sales', 'Current Month Sales', 'Growth / Decline Amount', 'Growth %', 'Trend'];
      rows = items.map((it) => {
        const diff = it.latestSales - it.prevSales;
        return [
          it.item, it.category, it.prevSales.toFixed(2), it.latestSales.toFixed(2), diff.toFixed(2), it.growth.toFixed(2), diff >= 0 ? 'Growing' : 'Declining'
        ];
      });
      break;

    case 'month-wise-top':
      filename = 'Month_Wise_Top_Items.csv';
      headers = ['Month', 'Rank', 'Item Name', 'Category', 'Quantity Sold', 'Sales Revenue', 'Orders'];
      appState.last6Months.forEach((m) => {
        const mapM = new Map();
        appState.filteredRecords.forEach((r) => {
          if (r.month === m) {
            if (!mapM.has(r.item)) mapM.set(r.item, { item: r.item, cat: r.category, qty: 0, sales: 0, orders: 0 });
            const x = mapM.get(r.item);
            x.qty += r.quantity;
            x.sales += r.sales;
            x.orders += r.orders;
          }
        });
        const arr = Array.from(mapM.values()).sort((a, b) => b.sales - a.sales).slice(0, 10);
        arr.forEach((it, idx) => {
          rows.push([m, idx + 1, it.item, it.cat, it.qty, it.sales.toFixed(2), it.orders]);
        });
      });
      break;

    default:
      return;
  }

  downloadCsv(filename, headers, rows);
}

function downloadCsv(filename, headers, rows) {
  let csvContent = '\uFEFF'; // UTF-8 BOM
  csvContent += headers.map(escapeCsvCell).join(',') + '\r\n';

  rows.forEach((row) => {
    csvContent += row.map(escapeCsvCell).join(',') + '\r\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Exported ${filename}`);
}

function escapeCsvCell(cell) {
  if (cell === null || cell === undefined) return '""';
  const str = String(cell).replace(/"/g, '""');
  return `"${str}"`;
}

/* ==========================================================================
   SORT LISTENERS FOR ALL TABLES
   ========================================================================== */
function setupTableSortListeners() {
  document.querySelectorAll('.data-table th.sortable').forEach((th) => {
    th.addEventListener('click', (e) => {
      const table = e.currentTarget.closest('table');
      const tableId = table.getAttribute('id');
      const key = e.currentTarget.getAttribute('data-sort-key');
      if (!tableId || !key) return;

      if (tableId === 'tableTopSellingItems') {
        const cur = appState.sort.topItems;
        appState.sort.topItems = { key, dir: cur.key === key && cur.dir === 'desc' ? 'asc' : 'desc' };
        renderTopSellingItemsSection();
      } else if (tableId === 'tableItemPerformance') {
        const cur = appState.sort.itemDirectory;
        appState.sort.itemDirectory = { key, dir: cur.key === key && cur.dir === 'desc' ? 'asc' : 'desc' };
        renderItemDirectoryTable();
      }
    });
  });
}

/* ==========================================================================
   FORMATTING UTILITIES
   ========================================================================== */
function formatMoney(num) {
  if (!num || isNaN(num)) return '0.00';
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCompact(num) {
  if (!num || isNaN(num)) return '0';
  if (Math.abs(num) >= 10000000) return (num / 10000000).toFixed(1) + 'Cr';
  if (Math.abs(num) >= 100000) return (num / 100000).toFixed(1) + 'L';
  if (Math.abs(num) >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
