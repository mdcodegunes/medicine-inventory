class MedicineInventory {
    constructor() {
        this.inventory = JSON.parse(localStorage.getItem('medicineInventory')) || [];
        this.locations = JSON.parse(localStorage.getItem('locations')) || ['oda', 'arac', 'nakil'];
    this.transfers = JSON.parse(localStorage.getItem('transfers')) || [];
    this.activityLog = JSON.parse(localStorage.getItem('activityLog')) || [];
        this.settings = JSON.parse(localStorage.getItem('settings')) || {
            expirationAlert: 30
        };
        this.appVersion = '1.0.4';

    this.defaultMedicineCatalog = [
            'Aspirasyon Sondası 14',
            'Aspirasyon Sondası 16',
            'Aspirasyon Sondası 18',
            'Aspirasyon Sondası 20',
            'Aspirasyon Sondası 22',
            'Adrenalin amp 1 mg',
            'Ampisilin + Sulbaktam amp',
            'Asetilsalisilik asit 100 mg',
            'Atropin amp 0,5 mg',
            'Basitrasin / Neomisin sülfat krem',
            'Butilskopolaminiyum bromür (hiyosin) amp',
            'Dekstroz %3.33 + Sodyum klorür %0.3 250 ml ve 500 ml solüsyon',
            'Deksametazon 4 mg',
            'Deksametazon 8 mg',
            'Deksketoprofen trometamol amp',
            'Diazepam amp',
            'Diklofenak sodyum 75 mg / 3 ml ampul',
            'Dopamin ampul',
            'Feniramin hidrojen maleat amp',
            'Flumazenil 0,5 mg amp',
            'Foley Sonda 14',
            'Foley Sonda 16',
            'Foley Sonda 18',
            'Foley Sonda 20',
            'Foley Sonda 22',
            'Furosemid 20 mg / 2 ml IM/IV ampul',
            'Gümüş sülfadiazin krem',
            'Haloperidol amp',
            'Heparin sodyum 25.000 IU / 5 ml flakon',
            'İzososorbid dinitrat 5 mg sublingual tablet',
            'İzotonik 100 cc',
            'İzotonik 250 cc',
            'İzotonik 500 cc',
            'Kalsiyum amp',
            'Kaptopril tablet 25 mg',
            'Lavman',
            'Lidokain %2 amp',
            'Lidokain %5 pomad',
            'Magnezyum sülfat amp',
            'Mannitol %20 100 ml',
            'Metilprednizolon 20 mg amp',
            'Metilprednizolon 40 mg amp',
            'Metoklopramid HCl',
            'Midazolam 5 mg amp',
            'Nalokson amp',
            'Nazogastrik Sonda 14',
            'Nazogastrik Sonda 16',
            'Nazogastrik Sonda 18',
            'Nazogastrik Sonda 20',
            'Nazogastrik Sonda 22',
            'Nebul (salbutamol + ipratropium bromür)',
            'Nitrofurazon %0.2 merhem',
            'Ondansetron hidroklorür 4 mg / 2 ml',
            'Pantoprazol 40 mg flakon',
            'Parasetamol flakon',
            'Prilokain HCl 20 mg/ml 20 ml flakon',
            'Rifamisin ampul',
            'Ringer laktat 500 cc',
            'Seftriakson amp',
            'Sodyum bikarbonat (NaHCO₃) amp',
            'Teofilin 100 ml infüzyon torba',
            'Tiyokolsikosid ampul',
            '%10 dekstroz 250 cc',
            '%20 dekstroz 150 cc',
            '%5 dekstroz 150 cc',
            '%5 dekstroz 500 cc'
        ];
        let storedCustom = [];
        try {
            storedCustom = JSON.parse(localStorage.getItem('medicineCatalogCustom')) || [];
        } catch {}
        let legacyCustom = [];
        if (!localStorage.getItem('medicineCatalogCustom')) {
            try {
                const legacyCatalog = JSON.parse(localStorage.getItem('medicineCatalog')) || [];
                legacyCustom = (legacyCatalog || []).filter((name) => {
                    if (typeof name !== 'string') return false;
                    const normalized = name.trim().toLowerCase();
                    if (!normalized) return false;
                    if (this.defaultMedicineCatalog.some((def) => def.toLowerCase() === normalized)) return false;
                    return (this.inventory || []).some((item) => item?.name && item.name.toLowerCase() === normalized);
                });
            } catch {}
        }
        this.customCatalog = this.sanitizeCustomCatalog(storedCustom.length ? storedCustom : legacyCustom);
        this.medicineCatalog = this.buildMedicineCatalog(this.customCatalog);
        const storedUsage = JSON.parse(localStorage.getItem('medicineCatalogUsage')) || {};
        this.catalogUsage = this.normalizeCatalogUsage(storedUsage);

        this.locationAliases = {
            'store': 'oda',
            'car1': 'arac',
            'car2': 'nakil',
        };
        this.normalizeLocalData();
    this.refreshCatalogFromInventory();
        this.saveCatalogState();
    this.persistCatalogUsage();

    this.expirationFilter = null;

    this.cleanActivityLog();

        // Optional: embed default Firebase Cloud Sync here so the app connects without manual input
        // Replace the firebaseConfig object below with your own, or comment this block to disable auto-embed.
        if (!this.settings.cloudSync || !this.settings.cloudSync.firebaseConfig) {
            this.settings.cloudSync = this.settings.cloudSync || {};
            // BEGIN EMBEDDED FIREBASE CONFIG (provided by user)
            this.settings.cloudSync.firebaseConfig = {
                apiKey: "AIzaSyAY0ikBaJ8RDv7xDp-M67q1GBh4LxyyL2o",
                authDomain: "medicine-inventory-612e9.firebaseapp.com",
                projectId: "medicine-inventory-612e9",
                storageBucket: "medicine-inventory-612e9.firebasestorage.app",
                messagingSenderId: "201612203287",
                appId: "1:201612203287:web:781ca8d46585724a4d9352",
                measurementId: "G-P5BR4KJMZ3"
            };
            // END EMBEDDED FIREBASE CONFIG
            // Default workspace id (can be overridden via ?ws=… in URL or Settings → Cloud Sync)
            if (!this.settings.cloudSync.workspaceId) this.settings.cloudSync.workspaceId = 'default';
            // Auto-enable cloud sync by default when embedded config is present
            this.settings.cloudSync.enabled = true;
            // Persist for next loads
            try { localStorage.setItem('settings', JSON.stringify(this.settings)); } catch {}
        }
        
        this.scanner = null;
        this.currentSection = 'inventory';
        this.lastMultiFormatError = 0; // Track error timing
        this.scannerRetryCount = 0; // Track retry attempts
        this.multiFormatErrorCount = 0; // Count consecutive decode failures

        // Native BarcodeDetector fallback state
        this.nativeDetector = null;
        this.nativeVideo = null;
        this.nativeStream = null;
        this.nativeScanRAF = null;

        // Cloud sync state
        this.cloud = {
            app: null,
            db: null,
            auth: null,
            unsub: null,
            saveTimer: null,
            clientId: Math.random().toString(36).slice(2),
            lastRemoteUpdate: null,
            status: 'init',
            statusType: 'info'
        };
        this.cloudStatusMeta = { text: 'pasif', type: 'info' };
        // Concurrency flags
        this.applyingRemote = false;
        this.pendingLocalChange = false;
        this.pendingDeletions = new Set();
        // Ensure debouncedCloudSave is a no-op before Cloud Sync initializes
        this.debouncedCloudSave = () => {};
        this.localChangeTracker = new Map();
        this.lastSyncStatus = {
            lastPush: null,
            lastPull: null,
            lastError: null,
            lastConflict: null
        };
        this.transferFilter = '';
        this.manualFormFeedbackTimer = null;
        this.lastConflictNotifiedAt = 0;
        
        this.init();
    // Backup reminders removed; Cloud Sync handles autosave when enabled
    }

    init() {
        this.setupEventListeners();
        // Parse workspace id from URL (?ws=XXXX)
        try {
            const params = new URLSearchParams(window.location.search);
            const ws = params.get('ws');
            if (ws) {
                if (!this.settings.cloudSync) this.settings.cloudSync = {};
                this.settings.cloudSync.workspaceId = ws;
                this.settings.cloudSync.enabled = true;
                this.saveData();
            } else if (this.settings.cloudSync?.workspaceId) {
                // Ensure URL reflects the saved workspace so refreshes keep it
                this.ensureWorkspaceInUrl(this.settings.cloudSync.workspaceId);
            }
        } catch {}

        // Start cloud sync automatically when config+workspace are present ASAP
        this.maybeStartCloudSync(true);

        // Initial UI render
        this.showSection('inventory');
        this.updateInventoryDisplay();
        this.updateStats();
        this.populateLocationSelects();
        this.populateTransferItems();
        this.displayTransferHistory();
        this.displayLocations();
    this.displayActivityLog();
        this.updateDataStatus();
        this.renderAppVersion();
        this.populateMedicineSuggestions();
        this.renderCatalogList();
        // Auto-backup removed
    }

    ensureWorkspaceInUrl(ws) {
        try {
            const url = new URL(window.location.href);
            if (!url.searchParams.get('ws')) {
                url.searchParams.set('ws', ws);
                history.replaceState(null, '', url.toString());
            }
        } catch {}
    }

    setupEventListeners() {
    // Navigasyon butonları
    document.getElementById('inventoryBtn').addEventListener('click', () => this.showSection('inventory'));
    const transferBtn = document.getElementById('transferBtn');
    if (transferBtn) transferBtn.addEventListener('click', () => this.showSection('transfer'));
    const activityBtn = document.getElementById('activityBtn');
    if (activityBtn) activityBtn.addEventListener('click', () => this.showSection('activity'));
    document.getElementById('settingsBtn').addEventListener('click', () => this.showSection('settings'));
        const addItemBtn = document.getElementById('addItemBtn');
        if (addItemBtn) addItemBtn.addEventListener('click', () => this.quickAddItem());

        // Manual entry
        const manualForm = document.getElementById('manualEntryForm');
        if (manualForm) {
            manualForm.addEventListener('submit', (e) => this.handleManualEntry(e));
            manualForm.addEventListener('input', () => this.clearManualFormFeedback());
        }
        const catalogSelect = document.getElementById('catalogSelect');
        if (catalogSelect) {
            catalogSelect.addEventListener('change', (e) => {
                const target = e.target;
                const value = target ? target.value : '';
                const nameInput = document.getElementById('medicineName');
                if (nameInput) {
                    nameInput.value = value;
                    if (value) nameInput.dispatchEvent(new Event('input', { bubbles: true }));
                    nameInput.focus();
                }
            });
        }
        const medicineNameInput = document.getElementById('medicineName');
        if (medicineNameInput) {
            medicineNameInput.addEventListener('input', () => {
                const selectEl = document.getElementById('catalogSelect');
                if (!selectEl) return;
                const current = (medicineNameInput.value || '').trim().toLowerCase();
                if (!current) {
                    selectEl.value = '';
                    return;
                }
                const match = Array.from(selectEl.options).find((opt) => opt.value && opt.value.toLowerCase() === current);
                selectEl.value = match ? match.value : '';
            });
            if (typeof medicineNameInput.showPicker === 'function') {
                medicineNameInput.addEventListener('focus', () => {
                    if (!medicineNameInput.value) {
                        medicineNameInput.showPicker();
                    }
                });
            }
        }

        // Inventory filters
        const locFilter = document.getElementById('locationFilter');
        if (locFilter) locFilter.addEventListener('change', () => this.updateInventoryDisplay());
        const searchBox = document.getElementById('searchBox');
        if (searchBox) searchBox.addEventListener('input', () => this.updateInventoryDisplay());
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportData());
        const exportExcelBtn = document.getElementById('exportExcelBtn');
        if (exportExcelBtn) exportExcelBtn.addEventListener('click', () => this.exportToExcel());
        const expirationButtons = document.querySelectorAll('.exp-filter-btn');
        expirationButtons.forEach((btn) => {
            btn.addEventListener('click', () => this.handleExpirationFilterClick(btn.dataset.filter || null));
        });

    // Transfer formu
    const transferForm = document.getElementById('transferForm');
    if (transferForm) transferForm.addEventListener('submit', (e) => this.handleTransfer(e));
        const transferSearch = document.getElementById('transferSearch');
        if (transferSearch) transferSearch.addEventListener('input', (e) => this.setTransferFilter(e.target.value));
        const transferSelect = document.getElementById('transferItem');
        if (transferSelect) transferSelect.addEventListener('change', () => this.updateTransferPreview());
        const fromLocationSelect = document.getElementById('fromLocation');
        if (fromLocationSelect) fromLocationSelect.addEventListener('change', () => {
            this.populateTransferItems();
            this.updateTransferPreview();
        });
        const toLocationSelect = document.getElementById('toLocation');
        if (toLocationSelect) toLocationSelect.addEventListener('change', () => this.updateTransferPreview());
        const transferQuantityInput = document.getElementById('transferQuantity');
        if (transferQuantityInput) transferQuantityInput.addEventListener('input', () => this.updateTransferPreview());

        // Settings
        const addLocBtn = document.getElementById('addLocationBtn');
        if (addLocBtn) addLocBtn.addEventListener('click', () => this.addLocation());
        const importBtn = document.getElementById('importBtn');
        if (importBtn) importBtn.addEventListener('click', () => document.getElementById('importFile').click());
        const importFile = document.getElementById('importFile');
        if (importFile) importFile.addEventListener('change', (e) => this.importData(e));
        const clearBtn = document.getElementById('clearDataBtn');
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearAllData());
        const expAlert = document.getElementById('expirationAlert');
        if (expAlert) expAlert.addEventListener('change', (e) => this.updateSettings(e));
        const catalogAddBtn = document.getElementById('addCatalogEntryBtn');
        if (catalogAddBtn) catalogAddBtn.addEventListener('click', () => this.handleCatalogAdd());
        const catalogInput = document.getElementById('newCatalogEntry');
        if (catalogInput) catalogInput.addEventListener('keydown', (evt) => {
            if (evt.key === 'Enter') {
                evt.preventDefault();
                this.handleCatalogAdd();
            }
        });
        const catalogList = document.getElementById('catalogList');
        if (catalogList) catalogList.addEventListener('click', (evt) => {
            const button = evt.target.closest('.remove-catalog-entry');
            if (button && button.dataset.name) {
                this.removeCatalogEntry(button.dataset.name);
            }
        });

        // Details panel buttons
        const closeDetailsBtn = document.getElementById('closeDetailsBtn');
        if (closeDetailsBtn) closeDetailsBtn.addEventListener('click', () => this.closeDetailsPanel());
        const editDetailsBtn = document.getElementById('editItemBtn');
        if (editDetailsBtn) editDetailsBtn.addEventListener('click', () => {
            if (this.currentItemId) this.editItem(this.currentItemId);
        });
        const deleteDetailsBtn = document.getElementById('deleteItemBtn');
        if (deleteDetailsBtn) deleteDetailsBtn.addEventListener('click', () => {
            if (this.currentItemId) this.deleteItem(this.currentItemId);
        });
        const consumeBtn = document.getElementById('consumeItemBtn');
        if (consumeBtn) consumeBtn.addEventListener('click', () => this.showConsumeForm());
        const consumeForm = document.getElementById('consumeForm');
        if (consumeForm) consumeForm.addEventListener('submit', (evt) => this.handleConsumeSubmit(evt));
        const cancelConsumeBtn = document.getElementById('cancelConsumeBtn');
        if (cancelConsumeBtn) cancelConsumeBtn.addEventListener('click', () => this.hideConsumeForm());
    }

    // Scanner-related functions removed

    buildMedicineCatalog(extra = []) {
        const uniqueMap = new Map();
        const source = [...(this.defaultMedicineCatalog || []), ...(extra || [])];
        source.forEach((entry) => {
            let candidate = '';
            if (typeof entry === 'string') {
                candidate = entry;
            } else if (entry && typeof entry.name === 'string') {
                candidate = entry.name;
            }
            const trimmed = candidate.trim();
            if (!trimmed) return;
            const key = trimmed.toLowerCase();
            if (!uniqueMap.has(key)) uniqueMap.set(key, trimmed);
        });
        return Array.from(uniqueMap.values()).sort((a, b) => a.localeCompare(b, 'tr', { sensitivity: 'base' }));
    }

    isDefaultCatalogName(name) {
        const trimmed = (name || '').trim();
        if (!trimmed) return false;
        return (this.defaultMedicineCatalog || []).some((def) => def.toLowerCase() === trimmed.toLowerCase());
    }

    sanitizeCustomCatalog(entries = []) {
        const unique = new Map();
        (entries || []).forEach((entry) => {
            if (typeof entry !== 'string') return;
            const trimmed = entry.trim();
            if (!trimmed || this.isDefaultCatalogName(trimmed)) return;
            const key = trimmed.toLowerCase();
            if (!unique.has(key)) unique.set(key, trimmed);
        });
        return Array.from(unique.values()).sort((a, b) => a.localeCompare(b, 'tr', { sensitivity: 'base' }));
    }

    persistCustomCatalog() {
        try {
            localStorage.setItem('medicineCatalogCustom', JSON.stringify(this.customCatalog || []));
        } catch {}
    }

    saveCatalogState() {
        this.customCatalog = this.sanitizeCustomCatalog(this.customCatalog || []);
        this.medicineCatalog = this.buildMedicineCatalog(this.customCatalog);
        this.persistCustomCatalog();
        this.persistMedicineCatalog();
    }

    refreshCatalogFromInventory() {
        this.renderCatalogList();
        this.populateMedicineSuggestions();
    }

    persistMedicineCatalog() {
        try {
            localStorage.setItem('medicineCatalog', JSON.stringify(this.medicineCatalog || []));
        } catch {}
    }

    persistCatalogUsage() {
        try {
            localStorage.setItem('medicineCatalogUsage', JSON.stringify(this.catalogUsage || {}));
        } catch {}
    }

    persistActivityLog() {
        try {
            localStorage.setItem('activityLog', JSON.stringify(this.activityLog || []));
        } catch {}
    }

    cleanActivityLog(limit = 500) {
        if (!Array.isArray(this.activityLog)) {
            this.activityLog = [];
        }
        if (this.activityLog.length > limit) {
            this.activityLog = this.activityLog.slice(0, limit);
        }
    }

    normalizeCatalogUsage(raw = {}) {
        const normalized = {};
        Object.entries(raw || {}).forEach(([key, value]) => {
            if (!key) return;
            const lower = key.toLowerCase();
            const record = {
                name: (value && value.name) ? value.name : key,
                count: Number.isFinite(Number(value?.count)) ? Number(value.count) : 0,
                lastUsed: value?.lastUsed || null
            };
            normalized[lower] = record;
        });
        return normalized;
    }

    mergeCatalogUsage(remote = {}, local = {}) {
        const remoteNorm = this.normalizeCatalogUsage(remote);
        const localNorm = this.normalizeCatalogUsage(local);
        const merged = { ...localNorm };
        Object.entries(remoteNorm).forEach(([key, remoteEntry]) => {
            const existing = merged[key];
            if (!existing) {
                merged[key] = { ...remoteEntry };
                return;
            }
            const result = { ...existing };
            const remoteCount = Number.isFinite(remoteEntry.count) ? remoteEntry.count : 0;
            const localCount = Number.isFinite(existing.count) ? existing.count : 0;
            if (remoteCount > localCount) {
                result.count = remoteCount;
            }
            const remoteDate = remoteEntry.lastUsed ? new Date(remoteEntry.lastUsed).getTime() : 0;
            const localDate = existing.lastUsed ? new Date(existing.lastUsed).getTime() : 0;
            if (remoteDate > localDate) {
                result.lastUsed = remoteEntry.lastUsed;
                if (remoteEntry.name) result.name = remoteEntry.name;
            }
            merged[key] = result;
        });
        return merged;
    }

    touchCatalogEntry(name) {
        const trimmed = (name || '').trim();
        if (!trimmed) return;
        if (!this.catalogUsage) this.catalogUsage = {};
        const key = trimmed.toLowerCase();
        const now = new Date().toISOString();
        const existing = this.catalogUsage[key] || { name: trimmed, count: 0, lastUsed: null };
        existing.name = trimmed;
        existing.count = (existing.count || 0) + 1;
        existing.lastUsed = now;
        this.catalogUsage[key] = existing;
        this.persistCatalogUsage();
    }

    getSortedCatalog() {
        const list = [...(this.medicineCatalog || [])];
        const usageMap = this.catalogUsage || {};
        return list.sort((a, b) => {
            const ua = usageMap[a.toLowerCase()] || {};
            const ub = usageMap[b.toLowerCase()] || {};
            const timeA = ua.lastUsed ? new Date(ua.lastUsed).getTime() : 0;
            const timeB = ub.lastUsed ? new Date(ub.lastUsed).getTime() : 0;
            if (timeA !== timeB) return timeB - timeA;
            const countA = ua.count || 0;
            const countB = ub.count || 0;
            if (countA !== countB) return countB - countA;
            return a.localeCompare(b, 'tr', { sensitivity: 'base' });
        });
    }

    renderCatalogList() {
        const listEl = document.getElementById('catalogList');
        if (!listEl) return;
        listEl.innerHTML = '';
        const catalog = this.getSortedCatalog();
        if (!catalog.length) {
            listEl.innerHTML = '<p class="catalog-empty">Katalogta listelenen ilaç yok.</p>';
            return;
        }
        catalog.forEach((name) => {
            const usage = this.catalogUsage[name.toLowerCase()] || {};
            const metaParts = [];
            if (usage.count) metaParts.push(`kullanım: ${usage.count}`);
            if (usage.lastUsed) metaParts.push(`son: ${this.formatRelativeTime(usage.lastUsed)}`);
            const metaText = metaParts.length ? metaParts.join(' • ') : 'henüz kullanılmadı';

            const item = document.createElement('div');
            item.className = 'catalog-item';

            const textWrap = document.createElement('div');
            textWrap.className = 'catalog-text';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = name;

            const metaSpan = document.createElement('span');
            metaSpan.className = 'catalog-meta';
            metaSpan.textContent = metaText;

            textWrap.appendChild(nameSpan);
            textWrap.appendChild(metaSpan);

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'remove-catalog-entry';
            removeBtn.dataset.name = name;
            removeBtn.textContent = 'Sil';

            item.appendChild(textWrap);
            item.appendChild(removeBtn);
            listEl.appendChild(item);
        });
    }

    populateMedicineSuggestions() {
        const datalist = document.getElementById('medicineNameSuggestions');
        const select = document.getElementById('catalogSelect');
        const catalog = this.getSortedCatalog();
        if (datalist) {
            datalist.innerHTML = '';
            catalog.forEach((name) => {
                const option = document.createElement('option');
                option.value = name;
                option.label = name;
                option.textContent = name;
                datalist.appendChild(option);
            });
        }
        if (select) {
            const previous = select.value;
            select.innerHTML = '<option value="">Katalogdan ilaç seçin</option>';
            catalog.forEach((name) => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                select.appendChild(option);
            });
            if (previous) {
                const match = catalog.find((name) => name.toLowerCase() === previous.toLowerCase());
                select.value = match || '';
            } else {
                select.value = '';
            }
        }
    }

    ensureMedicineInCatalog(name) {
        const trimmed = (name || '').trim();
        if (!trimmed) return;
        const exists = (this.medicineCatalog || []).some(item => item.toLowerCase() === trimmed.toLowerCase());
        this.touchCatalogEntry(trimmed);
        if (!exists) {
            if (!this.isDefaultCatalogName(trimmed)) {
                this.customCatalog = this.sanitizeCustomCatalog([...(this.customCatalog || []), trimmed]);
            }
            this.saveCatalogState();
        } else {
            this.persistCatalogUsage();
        }
        this.populateMedicineSuggestions();
        this.renderCatalogList();
    }

    handleCatalogAdd() {
        const input = document.getElementById('newCatalogEntry');
        if (!input) return;
        const value = (input.value || '').trim();
        if (!value) {
            this.showNotification('Lütfen kataloğa eklemek için bir ilaç adı girin.', 'error');
            return;
        }
        const already = (this.medicineCatalog || []).some(item => item.toLowerCase() === value.toLowerCase());
        this.ensureMedicineInCatalog(value);
        input.value = '';
        this.showNotification(already ? `${value} kataloğu güncellendi` : `${value} kataloğa eklendi`, 'success');
    }

    removeCatalogEntry(name) {
        const trimmed = (name || '').trim();
        if (!trimmed) return;
        if (this.isDefaultCatalogName(trimmed)) {
            this.showNotification('Varsayılan katalog öğeleri kaldırılamaz.', 'error');
            return;
        }
        const inInventory = (this.inventory || []).some(item => item.name && item.name.toLowerCase() === trimmed.toLowerCase());
        if (inInventory) {
            this.showNotification('Bu ilaç hali hazırda envanterde bulunduğu için katalogdan kaldırılamaz.', 'error');
            return;
        }
        const beforeLength = (this.customCatalog || []).length;
        this.customCatalog = (this.customCatalog || []).filter(item => item.toLowerCase() !== trimmed.toLowerCase());
        if (beforeLength === this.customCatalog.length) {
            this.showNotification(`${trimmed} zaten katalogda bulunmuyor.`, 'info');
            return;
        }
        if (this.catalogUsage && this.catalogUsage[trimmed.toLowerCase()]) {
            delete this.catalogUsage[trimmed.toLowerCase()];
        }
        this.saveCatalogState();
        this.persistCatalogUsage();
        this.populateMedicineSuggestions();
        this.renderCatalogList();
        this.showNotification(`${trimmed} kataloğundan kaldırıldı`, 'success');
    }

    showManualFormFeedback(message, type = 'error') {
        const el = document.getElementById('manualFormFeedback');
        if (!el) return;
        if (this.manualFormFeedbackTimer) {
            clearTimeout(this.manualFormFeedbackTimer);
            this.manualFormFeedbackTimer = null;
        }
        if (!message) {
            el.classList.add('hidden');
            el.classList.remove('error', 'success');
            el.textContent = '';
            return;
        }
        el.textContent = message;
        el.classList.remove('hidden', 'error', 'success');
        el.classList.add(type === 'success' ? 'success' : 'error');
        if (type === 'success') {
            this.manualFormFeedbackTimer = setTimeout(() => this.clearManualFormFeedback(), 3500);
        }
    }

    clearManualFormFeedback() {
        this.showManualFormFeedback('');
    }

    getCurrentInventoryItem() {
        if (!this.currentItemId) return null;
        return this.inventory.find(item => item.id === this.currentItemId) || null;
    }

    showConsumeForm() {
        const wrapper = document.getElementById('consumeFormWrapper');
        if (!wrapper) return;
        const item = this.getCurrentInventoryItem();
        if (!item) {
            this.showNotification('İlaç seçimi bulunamadı.', 'error');
            return;
        }
        const quantityInput = document.getElementById('consumeQuantity');
        const noteInput = document.getElementById('consumeNote');
        if (quantityInput) {
            quantityInput.value = '1';
            quantityInput.max = Math.max(item.quantity, 1);
            quantityInput.focus();
        }
        if (noteInput) {
            noteInput.value = '';
        }
        wrapper.classList.remove('hidden');
    }

    hideConsumeForm() {
        const wrapper = document.getElementById('consumeFormWrapper');
        if (wrapper) wrapper.classList.add('hidden');
        const form = document.getElementById('consumeForm');
        if (form) form.reset();
    }

    handleConsumeSubmit(evt) {
        evt.preventDefault();
        const item = this.getCurrentInventoryItem();
        if (!item) {
            this.showNotification('Geçerli bir ilaç seçimi bulunamadı.', 'error');
            return;
        }
        const originalLocation = item.location;
        const originalName = item.name;
        const quantityInput = document.getElementById('consumeQuantity');
        const noteInput = document.getElementById('consumeNote');
        const rawQty = quantityInput ? parseInt(quantityInput.value || '0', 10) : 0;
        if (!Number.isInteger(rawQty) || rawQty <= 0) {
            this.showNotification('Kullanılan miktar en az 1 olmalıdır.', 'error');
            return;
        }
        if (rawQty > item.quantity) {
            this.showNotification('Stokta yeterli ilaç bulunmuyor.', 'error');
            return;
        }

        item.quantity -= rawQty;
        const note = noteInput ? (noteInput.value || '').trim() : '';

        if (item.quantity === 0) {
            this.recordLocalChange('inventory', item.id, { name: item.name, removed: true });
            this.inventory = this.inventory.filter(inv => inv.id !== item.id);
            this.currentItemId = null;
        } else {
            this.markItemUpdated(item);
        }

        this.touchCatalogEntry(item.name);

        this.saveData();
        this.updateInventoryDisplay();
        this.updateStats();
        this.populateTransferItems();
        this.hideConsumeForm();

        this.recordActivity({
            type: 'consumption',
            medicineName: originalName,
            quantity: rawQty,
            location: originalLocation,
            note,
            createdAt: new Date().toISOString()
        });

        if (this.currentItemId) {
            // Refresh details with updated values
            const fresh = this.getCurrentInventoryItem();
            if (fresh) {
                this.showItemDetails(fresh);
            } else {
                this.closeDetailsPanel();
            }
        } else {
            this.closeDetailsPanel();
        }

        const message = note
            ? `${rawQty} adet ${item.name} düştünüz. Açıklama: ${note}`
            : `${rawQty} adet ${item.name} düştünüz.`;
        this.showNotification(message, 'success');
    }

    handleExpirationFilterClick(filter) {
        const normalized = (filter === 'expired') ? 'expired' : (filter ? String(filter) : null);
        this.expirationFilter = (this.expirationFilter === normalized) ? null : normalized;
        this.updateExpirationFilterButtons();
        this.updateInventoryDisplay();
    }

    updateExpirationFilterButtons() {
        const buttons = document.querySelectorAll('.exp-filter-btn');
        buttons.forEach((btn) => {
            const filter = btn.dataset.filter || null;
            const normalized = (filter === 'expired') ? 'expired' : (filter ? String(filter) : null);
            const isActive = this.expirationFilter === normalized;
            btn.classList.toggle('active', isActive);
        });
    }

    setTransferFilter(value) {
        this.transferFilter = (value || '').toLowerCase();
        this.populateTransferItems();
    }

    hideTransferPreview() {
        const preview = document.getElementById('transferPreview');
        if (!preview) return;
        preview.textContent = '';
        preview.classList.add('hidden');
        preview.classList.remove('error');
    }

    updateTransferPreview() {
        const preview = document.getElementById('transferPreview');
        const select = document.getElementById('transferItem');
        const fromSelect = document.getElementById('fromLocation');
        const toSelect = document.getElementById('toLocation');
        const quantityInput = document.getElementById('transferQuantity');
        if (!preview || !select) return;

        const itemId = select.value;
        if (!itemId) {
            this.hideTransferPreview();
            return;
        }

        const sourceItem = this.inventory.find(item => item.id === itemId);
        if (!sourceItem) {
            this.hideTransferPreview();
            return;
        }

        if (fromSelect && (!fromSelect.value || fromSelect.value !== sourceItem.location)) {
            fromSelect.value = sourceItem.location;
        }

        const fromLocation = fromSelect ? fromSelect.value : sourceItem.location;
        const toLocation = toSelect ? toSelect.value : '';
        const quantity = parseInt(quantityInput?.value || '0', 10);
        const validQuantity = Number.isInteger(quantity) ? quantity : 0;
        const stock = sourceItem.quantity || 0;

        if (quantityInput) {
            quantityInput.max = Math.max(stock, 0);
        }

        const destinationItem = (toLocation)
            ? this.inventory.find(item =>
                item.name.toLowerCase() === sourceItem.name.toLowerCase() &&
                item.location === toLocation &&
                (item.expirationDate || null) === (sourceItem.expirationDate || null))
            : null;

        const destinationStock = destinationItem ? destinationItem.quantity : 0;
        const sourceName = this.getLocationDisplayName(fromLocation);
        const destinationName = toLocation ? this.getLocationDisplayName(toLocation) : null;

        const lines = [];
        const sourceAfter = Math.max(stock - validQuantity, 0);
        lines.push(`<div><strong>Kaynak ${sourceName}</strong>: ${stock} → ${sourceAfter}</div>`);

        if (destinationName) {
            const destAfter = destinationStock + (validQuantity > 0 ? validQuantity : 0);
            lines.push(`<div><strong>Hedef ${destinationName}</strong>: ${destinationStock}${validQuantity > 0 ? ` → ${destAfter}` : ''}</div>`);
        } else {
            lines.push('<div>Hedef konumu seçilmedi.</div>');
        }

        if (sourceItem.expirationDate) {
            lines.push(`<div>Son Kullanma: ${this.formatDate(sourceItem.expirationDate)}</div>`);
        }

        preview.innerHTML = lines.join('');
        preview.classList.remove('hidden', 'error');

        if (validQuantity > stock) {
            preview.classList.add('error');
            lines.push('<div>⚠️ Aktarım adedi stoktan fazla.</div>');
            preview.innerHTML = lines.join('');
        }
    }

    normalizeLocalData() {
        const map = this.locationAliases || {};
        this.locations = Array.from(new Set((this.locations || []).map(loc => map[loc] || loc)));
        this.inventory = (this.inventory || []).map(item => ({
            ...item,
            location: map[item.location] || item.location
        }));
        this.transfers = (this.transfers || []).map(transfer => ({
            ...transfer,
            fromLocation: map[transfer.fromLocation] || transfer.fromLocation,
            toLocation: map[transfer.toLocation] || transfer.toLocation
        }));
    }

    // Simple section switcher for nav
    showSection(section) {
        this.currentSection = section;
    const sections = ['inventory', 'transfer', 'activity', 'settings'];
        sections.forEach((sec) => {
            const el = document.getElementById(`${sec}Section`);
            const btn = document.getElementById(`${sec}Btn`);
            if (el) el.classList.toggle('hidden', sec !== section);
            if (btn) btn.classList.toggle('active', sec === section);
        });
    }

    // Jumps to manual form and focuses first field
    quickAddItem() {
        this.showSection('inventory');
        const formWrap = document.querySelector('.manual-entry');
        if (formWrap) formWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const nameInput = document.getElementById('medicineName');
        if (nameInput) setTimeout(() => nameInput.focus(), 250);
    }

    // Parse common GS1 Data (supports (01)GTIN and (21)Serial; also FNC1-separated)
    parseGs1(text) {
        try {
            // Replace ASCII Group Separator with a marker to ease parsing
            const GS = String.fromCharCode(29);
            let t = text.replace(/\s+/g, '');
            // Normalize brackets-less GS1 like 0108699...21... by inserting markers
            // First, try bracketed format
            let gtin = null, serial = null;
            let m;
            m = t.match(/\(01\)(\d{14})/);
            if (m) gtin = m[1];
            m = t.match(/\(21\)([^()]+?)(?:\(|$)/);
            if (m) serial = m[1];

            if (!gtin) {
                // Try GS separator based: 01{14}GS?21{var}
                // Replace GS with a separator
                const norm = t.replace(new RegExp(GS, 'g'), '|');
                let m2 = norm.match(/01(\d{14})/);
                if (m2) gtin = m2[1];
                // Serial is everything after AI 21 until next AI or end
                m2 = norm.match(/21([0-9A-Za-z\-_.]{1,50})/);
                if (m2) serial = m2[1];
            }

            if (!gtin) {
                // Plain concatenated without GS: 01(14)21(var)
                const m3 = t.match(/01(\d{14})21([0-9A-Za-z\-_.]{1,50})/);
                if (m3) {
                    gtin = m3[1];
                    serial = m3[2];
                }
            }

            if (gtin || serial) {
                return { gtin, serial, raw: text };
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    async fetchMedicineInfo(barcode) {
        console.log('Barkod için ilaç bilgisi getiriliyor:', barcode);
        
        // Barkod işlendi bilgisini göster
        this.showNotification(`🔍 Barkod işleniyor: ${barcode}`, 'info');
        
        // This is where you could integrate with medicine databases
        // For now, we'll just show the barcode and provide basic info
        
        // You could integrate with APIs like:
        // - FDA NDC Database
        // - Open Food Facts (for some medicines)
        // - Custom medicine database
        
        try {
            // Placeholder logic - in real implementation, you'd make API calls
            if (barcode.length > 0) {
                console.log('Barkod başarıyla işlendi:', barcode);
                
                // Auto-focus on medicine name field for user to enter
                setTimeout(() => {
                    const medicineNameField = document.getElementById('medicineName');
                    if (medicineNameField) {
                        medicineNameField.focus();
                        console.log('Medicine name field focused');
                    }
                }, 100);
                
                // Başarı mesajı göster
                setTimeout(() => {
                    this.showNotification(`✅ ${barcode} kodu işlendi, ilaç adını seçebilirsiniz`, 'success');
                }, 1500);
            }
        } catch (error) {
            console.error('Error fetching medicine info:', error);
        }
    }

    handleManualEntry(e) {
        e.preventDefault();
        const form = e.target;
        const editingId = form.dataset.editingId;
        const formData = new FormData(form);
        const nameRaw = (formData.get('medicineName') || '').trim();
        const quantityRaw = formData.get('quantity');
        const expirationRaw = (formData.get('expirationDate') || '').trim();
        const location = (formData.get('location') || '').trim();

        const medicineData = {
            name: nameRaw,
            quantity: Number.parseInt(quantityRaw, 10),
            expirationDate: expirationRaw || null,
            location
        };

        const validation = this.validateManualEntryData(medicineData);
        if (!validation.valid) {
            this.showManualFormFeedback(validation.message, 'error');
            return;
        }

        this.clearManualFormFeedback();

        if (editingId) {
            const itemIndex = this.inventory.findIndex(item => item.id === editingId);
            if (itemIndex !== -1) {
                Object.assign(this.inventory[itemIndex], medicineData);
                this.markItemUpdated(this.inventory[itemIndex]);
                this.showNotification(`${medicineData.name} güncellendi`, 'success');
            }
        } else {
            const medicine = {
                ...medicineData,
                id: Date.now().toString(),
                addedDate: new Date().toISOString()
            };

            const existingIndex = this.inventory.findIndex(item =>
                item.name.toLowerCase() === medicine.name.toLowerCase() &&
                item.location === medicine.location &&
                (item.expirationDate || null) === (medicine.expirationDate || null)
            );

            if (existingIndex !== -1) {
                this.inventory[existingIndex].quantity += medicine.quantity;
                this.markItemUpdated(this.inventory[existingIndex]);
            } else {
                this.markItemUpdated(medicine);
                this.inventory.push(medicine);
            }

            this.showNotification(`${medicine.name} ${this.getLocationDisplayName(medicine.location)} konumuna eklendi`, 'success');
        }

        this.ensureMedicineInCatalog(medicineData.name);
        this.refreshCatalogFromInventory();
        this.saveData();
        this.clearForm();
        this.updateInventoryDisplay();
        this.updateStats();
        this.populateTransferItems();
        this.updateTransferPreview();
    }

    validateManualEntryData(data) {
        const errors = [];
        const name = (data?.name || '').trim();
        const quantity = Number.isFinite(data?.quantity) ? data.quantity : Number.NaN;
        if (!name) errors.push('İlaç adı gerekli.');
        if (!Number.isInteger(quantity) || quantity <= 0) errors.push('Adet alanı en az 1 olmalıdır.');
        if (!data?.location) errors.push('Lütfen bir konum seçin.');
        if (data?.expirationDate) {
            const parsed = Date.parse(data.expirationDate);
            if (Number.isNaN(parsed)) {
                errors.push('Son kullanma tarihi geçerli değil.');
            }
        }
        return {
            valid: errors.length === 0,
            message: errors.join(' ')
        };
    }

    updateInventoryDisplay() {
        this.updateExpirationFilterButtons();
        const locationFilterEl = document.getElementById('locationFilter');
        const searchBoxEl = document.getElementById('searchBox');
        const locationFilter = locationFilterEl ? locationFilterEl.value : '';
        const searchTerm = searchBoxEl ? (searchBoxEl.value || '').toLowerCase() : '';

        let filteredInventory = this.inventory;

        if (locationFilter) {
            filteredInventory = filteredInventory.filter(item => item.location === locationFilter);
        }

        if (searchTerm) {
            filteredInventory = filteredInventory.filter(item =>
                item.name.toLowerCase().includes(searchTerm)
            );
        }

        if (this.expirationFilter) {
            if (this.expirationFilter === 'expired') {
                filteredInventory = filteredInventory.filter(item => item.expirationDate && this.getDaysUntilExpiration(item.expirationDate) < 0);
            } else {
                const limit = parseInt(this.expirationFilter, 10);
                filteredInventory = filteredInventory.filter(item => {
                    if (!item.expirationDate) return false;
                    const days = this.getDaysUntilExpiration(item.expirationDate);
                    return days >= 0 && days <= limit;
                });
            }
        }

        const inventoryList = document.getElementById('inventoryList');
        inventoryList.innerHTML = '';

        if (filteredInventory.length === 0) {
            inventoryList.innerHTML = '<div class="no-items">Henüz kayıtlı ilaç yok. ➕ İlaç Ekle butonuyla listenizi oluşturun.</div>';
            this.renderMissingDefaultsNotice();
            return;
        }

        filteredInventory.forEach(item => {
            const itemElement = this.createInventoryItemElement(item);
            inventoryList.appendChild(itemElement);
        });

        this.renderMissingDefaultsNotice();
    }

    createInventoryItemElement(item) {
        const div = document.createElement('div');
        div.className = 'inventory-item';
        
    const daysUntilExpiration = item.expirationDate ? this.getDaysUntilExpiration(item.expirationDate) : Infinity;
        
        if (daysUntilExpiration < 0) {
            div.classList.add('expired');
        } else if (daysUntilExpiration <= this.settings.expirationAlert) {
            div.classList.add('expiring');
        }

        div.innerHTML = `
            <div class="item-info">
                <h4>${item.name}</h4>
                ${item.expirationDate ? `<p><strong>Son Kullanma:</strong> ${this.formatDate(item.expirationDate)} ${this.getExpirationStatus(daysUntilExpiration)}</p>` : ''}
            </div>
            <div class="item-location">${this.getLocationDisplayName(item.location)}</div>
            <div class="item-quantity">${item.quantity}</div>
        `;

        div.addEventListener('click', () => this.showItemDetails(item));
        
        return div;
    }

    getDaysUntilExpiration(expirationDate) {
        const today = new Date();
    const expDate = new Date(expirationDate);
        const diffTime = expDate - today;
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    getExpirationStatus(days) {
        if (days < 0) {
            return `<span style="color: #ee5a24; font-weight: bold;">(${Math.abs(days)} gün önce süresi doldu)</span>`;
        } else if (days <= this.settings.expirationAlert) {
            return `<span style="color: #f5576c; font-weight: bold;">(${days} gün içinde süresi dolacak)</span>`;
        }
        return '';
    }

    updateStats() {
        const calcWindow = (limit) => this.inventory.reduce((sum, item) => {
            if (!item.expirationDate) return sum;
            const days = this.getDaysUntilExpiration(item.expirationDate);
            if (!Number.isFinite(days)) return sum;
            if (limit === 'expired') {
                return days < 0 ? sum + item.quantity : sum;
            }
            return (days >= 0 && days <= limit) ? sum + item.quantity : sum;
        }, 0);

        const expiring30 = calcWindow(30);
        const expiring90 = calcWindow(90);
        const expired = calcWindow('expired');

        const exp30El = document.getElementById('expiring30Count');
        if (exp30El) exp30El.textContent = expiring30;
        const exp90El = document.getElementById('expiring90Count');
        if (exp90El) exp90El.textContent = expiring90;
        const expiredEl = document.getElementById('expiredCount');
        if (expiredEl) expiredEl.textContent = expired;

        this.updateExpirationFilterButtons();
    }

    getMissingDefaultMedicines() {
        const inventoryNames = new Set((this.inventory || []).map((item) => {
            if (!item?.name) return null;
            return item.name.trim().toLowerCase();
        }).filter(Boolean));
        return (this.defaultMedicineCatalog || []).filter((name) => {
            const normalized = (name || '').trim().toLowerCase();
            if (!normalized) return false;
            return !inventoryNames.has(normalized);
        });
    }

    renderMissingDefaultsNotice() {
        const notice = document.getElementById('missingDefaultsNotice');
        if (!notice) return;
        const missing = this.getMissingDefaultMedicines();
        if (!missing.length) {
            notice.classList.add('hidden');
            notice.textContent = '';
            return;
        }
        const display = missing.slice(0, 6);
        const extraCount = missing.length - display.length;
        let summary = display.join(', ');
        if (extraCount > 0) {
            summary += ` ve ${extraCount} diğer ilaç`;
        }
        notice.textContent = `⚠️ Stokta olmayan varsayılan ilaçlar (${missing.length}): ${summary}`;
        notice.classList.remove('hidden');
    }

    markItemUpdated(item) {
        if (!item) return;
        item.updatedAt = new Date().toISOString();
        item.updatedBy = this.cloud?.clientId || 'local';
        this.recordLocalChange('inventory', item.id, { name: item.name });
    }

    recordLocalChange(type, id, meta = {}) {
        if (!id) return;
        this.localChangeTracker.set(id, {
            type,
            time: Date.now(),
            meta
        });
        this.cleanupLocalChangeTracker();
    }

    cleanupLocalChangeTracker(maxAgeMs = 60 * 60 * 1000) {
        const threshold = Date.now() - maxAgeMs;
        for (const [id, info] of this.localChangeTracker.entries()) {
            if (!info?.time || info.time < threshold) {
                this.localChangeTracker.delete(id);
            }
        }
    }

    detectInventoryConflicts(remoteInventory = []) {
        const conflicts = [];
        remoteInventory.forEach((remoteItem) => {
            if (!remoteItem || !remoteItem.id) return;
            const tracked = this.localChangeTracker.get(remoteItem.id);
            if (!tracked) return;
            const remoteUpdatedAt = remoteItem.updatedAt ? new Date(remoteItem.updatedAt).getTime() : 0;
            if (!remoteUpdatedAt || !tracked.time) {
                this.localChangeTracker.delete(remoteItem.id);
                return;
            }
            const delta = remoteUpdatedAt - tracked.time;
            const isForeignUpdate = remoteItem.updatedBy && remoteItem.updatedBy !== this.cloud?.clientId;
            if ((isForeignUpdate && delta > 1500) || delta > 5000) {
                conflicts.push({ remote: remoteItem, local: tracked.meta });
                this.localChangeTracker.delete(remoteItem.id);
            } else if (Math.abs(delta) < 1500) {
                // treat as resolved (likely our own push echo)
                this.localChangeTracker.delete(remoteItem.id);
            }
        });
        return conflicts;
    }

    handleSyncConflicts(conflicts = []) {
        if (!conflicts.length) return;
        const names = [];
        conflicts.forEach((conflict) => {
            const remoteName = conflict?.remote?.name;
            const localName = conflict?.local?.name;
            if (remoteName) names.push(remoteName);
            else if (localName) names.push(localName);
        });
        const uniqueNames = Array.from(new Set(names.filter(Boolean)));
        const preview = uniqueNames.slice(0, 3).join(', ');
        const extra = uniqueNames.length > 3 ? ` ve ${uniqueNames.length - 3} kayıt` : '';
        const summary = uniqueNames.length ? `${preview}${extra}`.trim() : `${conflicts.length} kayıt`;
        this.lastSyncStatus.lastConflict = {
            time: Date.now(),
            details: uniqueNames
        };
        this.updateDataStatus();
        if (Date.now() - this.lastConflictNotifiedAt > 5000) {
            this.lastConflictNotifiedAt = Date.now();
            this.showNotification(`⚠️ ${conflicts.length} kayıt başka bir cihazda güncellendi: ${summary}`, 'error');
        }
    }

    handleTransfer(e) {
        e.preventDefault();

        const itemSelect = document.getElementById('transferItem');
        const fromSelect = document.getElementById('fromLocation');
        const toSelect = document.getElementById('toLocation');
        const quantityInput = document.getElementById('transferQuantity');

        const itemId = itemSelect ? itemSelect.value : '';
        if (!itemId) {
            this.showNotification('Lütfen taşınacak ilacı seçin.', 'error');
            return;
        }

        const sourceItem = this.inventory.find(item => item.id === itemId);
        if (!sourceItem) {
            this.showNotification('Seçilen ilaç envanterde bulunamadı.', 'error');
            return;
        }

        if (fromSelect) fromSelect.value = sourceItem.location;
        const fromLocation = sourceItem.location;
        const toLocation = toSelect ? toSelect.value : '';
        if (!toLocation) {
            this.showNotification('Hedef konumu seçin.', 'error');
            return;
        }

        if (fromLocation === toLocation) {
            this.showNotification('Kaynak ve hedef konumlar farklı olmalıdır.', 'error');
            return;
        }

        const quantity = parseInt(quantityInput?.value || '0', 10);
        if (!Number.isInteger(quantity) || quantity <= 0) {
            this.showNotification('Aktarım için geçerli bir adet girin.', 'error');
            return;
        }

        if (sourceItem.quantity < quantity) {
            this.showNotification('Kaynak konumda yeterli stok bulunmuyor.', 'error');
            this.updateTransferPreview();
            return;
        }

        const sourceItemId = sourceItem.id;
        const expirationSnapshot = sourceItem.expirationDate || null;

        sourceItem.quantity -= quantity;
        this.markItemUpdated(sourceItem);

        const destItem = this.inventory.find(item =>
            item.name.toLowerCase() === sourceItem.name.toLowerCase() &&
            item.location === toLocation &&
            (item.expirationDate || null) === (sourceItem.expirationDate || null)
        );

        let destinationItemId = null;
        if (destItem) {
            destItem.quantity += quantity;
            this.markItemUpdated(destItem);
            destinationItemId = destItem.id;
        } else {
            const newItem = { ...sourceItem };
            newItem.id = Date.now().toString();
            newItem.location = toLocation;
            newItem.quantity = quantity;
            this.markItemUpdated(newItem);
            this.inventory.push(newItem);
            destinationItemId = newItem.id;
        }

        if (sourceItem.quantity === 0) {
            this.recordLocalChange('inventory', sourceItem.id, { name: sourceItem.name, removed: true });
            this.inventory = this.inventory.filter(item => item.id !== sourceItem.id);
        }

        const transfer = {
            id: Date.now().toString(),
            medicineName: sourceItem.name,
            quantity,
            fromLocation,
            toLocation,
            date: new Date().toISOString(),
            expirationDate: expirationSnapshot,
            sourceItemId,
            destinationItemId,
            cancelled: false
        };
        this.transfers.unshift(transfer);
        this.touchCatalogEntry(sourceItem.name);
        this.populateMedicineSuggestions();
        this.renderCatalogList();

        this.saveData();
        this.clearTransferForm();
        this.populateTransferItems();
        this.displayTransferHistory();
        this.updateInventoryDisplay();
        this.updateStats();

        const sourceName = this.getLocationDisplayName(fromLocation);
        const targetName = this.getLocationDisplayName(toLocation);
        this.showNotification(`${transfer.medicineName} ilacından ${quantity} adet ${sourceName} konumundan ${targetName} konumuna aktarıldı`, 'success');
        this.recordActivity({
            type: 'transfer',
            medicineName: transfer.medicineName,
            quantity,
            fromLocation,
            toLocation,
            createdAt: transfer.date
        });
    }

    cancelTransfer(transferId) {
        const transfer = this.transfers.find((t) => t.id === transferId);
        if (!transfer) {
            this.showNotification('Transfer kaydı bulunamadı.', 'error');
            return;
        }
        if (transfer.cancelled) {
            this.showNotification('Transfer zaten geri alınmış.', 'info');
            return;
        }
        const qty = Number(transfer.quantity) || 0;
        if (qty <= 0) {
            this.showNotification('Geçerli transfer miktarı bulunamadı.', 'error');
            return;
        }
        const fromLocation = transfer.fromLocation;
        const toLocation = transfer.toLocation;
        const expiration = transfer.expirationDate || null;

        let destinationItem = null;
        if (transfer.destinationItemId) {
            destinationItem = this.inventory.find(item => item.id === transfer.destinationItemId);
        }
        if (!destinationItem) {
            destinationItem = this.inventory.find(item =>
                item.name && item.name.toLowerCase() === (transfer.medicineName || '').toLowerCase() &&
                item.location === toLocation &&
                (item.expirationDate || null) === (expiration || null)
            );
        }
        if (destinationItem) {
            const newQty = (destinationItem.quantity || 0) - qty;
            if (newQty <= 0) {
                this.recordLocalChange('inventory', destinationItem.id, { name: destinationItem.name, removed: true });
                this.inventory = this.inventory.filter(item => item.id !== destinationItem.id);
            } else {
                destinationItem.quantity = newQty;
                this.markItemUpdated(destinationItem);
            }
        }

        let sourceItem = null;
        if (transfer.sourceItemId) {
            sourceItem = this.inventory.find(item => item.id === transfer.sourceItemId);
        }
        if (!sourceItem) {
            sourceItem = this.inventory.find(item =>
                item.name && item.name.toLowerCase() === (transfer.medicineName || '').toLowerCase() &&
                item.location === fromLocation &&
                (item.expirationDate || null) === (expiration || null)
            );
        }
        if (sourceItem) {
            sourceItem.quantity = (sourceItem.quantity || 0) + qty;
            this.markItemUpdated(sourceItem);
        } else {
            const restored = {
                id: transfer.sourceItemId || Date.now().toString(),
                name: transfer.medicineName,
                quantity: qty,
                location: fromLocation,
                expirationDate: expiration,
                addedDate: new Date().toISOString()
            };
            this.inventory.push(restored);
            this.markItemUpdated(restored);
        }

        transfer.cancelled = true;
        transfer.cancelledAt = new Date().toISOString();
        this.recordActivity({
            type: 'transfer_cancel',
            medicineName: transfer.medicineName,
            quantity: qty,
            fromLocation,
            toLocation,
            createdAt: transfer.cancelledAt
        });

        this.saveData();
        this.populateTransferItems();
        this.displayTransferHistory();
        this.updateInventoryDisplay();
        this.updateStats();
        this.showNotification(`${transfer.medicineName} transferi geri alındı.`, 'success');
    }

    populateTransferItems() {
        const select = document.getElementById('transferItem');
        if (!select) return;

        const currentValue = select.value;
        select.innerHTML = '<option value="">Taşınacak ilacı seçin</option>';

        const uniqueItems = new Map();
        this.inventory.forEach(item => {
            if (!item || !item.id || item.quantity <= 0) return;
            const key = `${item.name.toLowerCase()}-${item.location}-${item.expirationDate || 'none'}`;
            if (!uniqueItems.has(key)) uniqueItems.set(key, item);
        });

        const filter = (this.transferFilter || '').trim();
        const fromSelect = document.getElementById('fromLocation');
        const selectedLocation = fromSelect ? fromSelect.value : '';
        const items = Array.from(uniqueItems.values()).filter((item) => {
            if (selectedLocation && item.location !== selectedLocation) return false;
            if (!filter) return true;
            const normalizedFilter = filter.toLowerCase();
            return item.name.toLowerCase().includes(normalizedFilter) ||
                this.getLocationDisplayName(item.location).toLowerCase().includes(normalizedFilter);
        }).sort((a, b) => {
            const nameCompare = a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' });
            if (nameCompare !== 0) return nameCompare;
            return this.getLocationDisplayName(a.location).localeCompare(this.getLocationDisplayName(b.location), 'tr', { sensitivity: 'base' });
        });

        if (!items.length) {
            const option = document.createElement('option');
            option.value = '';
            option.disabled = true;
            option.textContent = selectedLocation ? 'Bu konumda envanter bulunamadı' : 'Eşleşen ilaç bulunamadı';
            select.appendChild(option);
            select.value = '';
            select.disabled = true;
            this.hideTransferPreview();
            return;
        }

        select.disabled = false;
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = `${item.name} (${this.getLocationDisplayName(item.location)}) • Adet: ${item.quantity}`;
            select.appendChild(option);
        });

        if (currentValue) {
            const stillExists = Array.from(select.options).some(opt => opt.value === currentValue);
            select.value = stillExists ? currentValue : '';
        }
        this.updateTransferPreview();
    }

    displayTransferHistory() {
        const container = document.getElementById('transferList');
        if (!container) return;

        container.innerHTML = '';

        if (!this.transfers.length) {
            container.innerHTML = '<p>Henüz transfer kaydı yok.</p>';
            return;
        }

        this.transfers.slice(0, 10).forEach(transfer => {
            const div = document.createElement('div');
            div.className = 'transfer-item';
            div.innerHTML = `
                <div class="transfer-info">
                    <strong>${transfer.medicineName}</strong> (${transfer.quantity})<br>
                    <small>${this.getLocationDisplayName(transfer.fromLocation)} → ${this.getLocationDisplayName(transfer.toLocation)}</small>
                </div>
                <div class="transfer-date">
                    ${this.formatDate(transfer.date)}
                    ${transfer.cancelled ? '<span class="transfer-status cancelled">İptal Edildi</span>' : `<button class="transfer-cancel" data-id="${transfer.id}">Geri Al</button>`}
                </div>
            `;
            container.appendChild(div);
        });

        container.querySelectorAll('.transfer-cancel').forEach((btn) => {
            btn.addEventListener('click', (evt) => {
                const id = evt.currentTarget.dataset.id;
                if (id) this.cancelTransfer(id);
            });
        });
    }

    displayActivityLog(limit = 50) {
        const container = document.getElementById('activityList');
        if (!container) return;
        container.innerHTML = '';
        if (!Array.isArray(this.activityLog) || !this.activityLog.length) {
            container.innerHTML = '<p>Henüz hareket kaydı yok.</p>';
            return;
        }
        this.activityLog.slice(0, limit).forEach((activity) => {
            const item = document.createElement('div');
            item.className = 'activity-item';
            const desc = this.formatActivityDescription(activity);
            item.innerHTML = `
                <div class="activity-main">
                    <strong>${desc.title}</strong>
                    <span class="activity-time">${this.formatRelativeTime(activity.createdAt)}</span>
                </div>
                <div class="activity-meta">${desc.detail}</div>
            `;
            container.appendChild(item);
        });
    }

    formatActivityDescription(activity) {
        const base = {
            title: activity.type || 'Hareket',
            detail: ''
        };
        switch (activity.type) {
            case 'transfer':
                base.title = `${activity.medicineName || 'İlaç'} transfer edildi`;
                base.detail = `${activity.quantity || 0} adet ${this.getLocationDisplayName(activity.fromLocation)} → ${this.getLocationDisplayName(activity.toLocation)}`;
                break;
            case 'transfer_cancel':
                base.title = `${activity.medicineName || 'İlaç'} transferi geri alındı`;
                base.detail = `${activity.quantity || 0} adet ${this.getLocationDisplayName(activity.toLocation)} → ${this.getLocationDisplayName(activity.fromLocation)}`;
                break;
            case 'consumption':
                base.title = `${activity.medicineName || 'İlaç'} kullanıldı`;
                base.detail = `${activity.quantity || 0} adet ${this.getLocationDisplayName(activity.location)}${activity.note ? ` • ${activity.note}` : ''}`;
                break;
            default:
                base.title = activity.title || 'Hareket';
                base.detail = activity.detail || '';
        }
        return base;
    }

    clearTransferForm() {
        const form = document.getElementById('transferForm');
        if (form) form.reset();
        const search = document.getElementById('transferSearch');
        if (search) search.value = '';
        this.transferFilter = '';
        this.hideTransferPreview();
    }

    populateLocationSelects() {
        const selects = ['location', 'locationFilter', 'fromLocation', 'toLocation'];

        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (!select) return;

            const currentValue = select.value;
            const placeholders = {
                location: 'Konum Seçin',
                locationFilter: 'Tüm Konumlar',
                fromLocation: 'Kaynak Konumu Seçin',
                toLocation: 'Hedef Konumu Seçin'
            };

            select.innerHTML = `<option value="">${placeholders[selectId] || 'Konum Seçin'}</option>`;

            this.locations.forEach(location => {
                const option = document.createElement('option');
                option.value = location;
                option.textContent = this.getLocationDisplayName(location);
                select.appendChild(option);
            });

            select.value = currentValue;
        });
    }

    getLocationDisplayName(location) {
        const displayNames = {
            'oda': 'Oda',
            'arac': 'Araç',
            'nakil': 'Nakil Ambulansı',
            'store': 'Oda',
            'car1': 'Araç',
            'car2': 'Nakil Ambulansı',
            'home': 'Oda'
        };
        return displayNames[location] || location;
    }

    addLocation() {
        const input = document.getElementById('newLocationName');
        const locationName = input.value.trim().toLowerCase().replace(/\s+/g, '_');
        
        if (!locationName) {
            this.showNotification('Lütfen bir konum adı girin.', 'error');
            input.focus();
            return;
        }
        
        if (this.locations.includes(locationName)) {
            this.showNotification('Bu konum zaten mevcut.', 'error');
            input.focus();
            return;
        }
        
        this.locations.push(locationName);
        this.saveData();
        this.populateLocationSelects();
        this.displayLocations();
        input.value = '';
        
        this.showNotification(`Konum eklendi: ${this.getLocationDisplayName(locationName)}`, 'success');
    }

    displayLocations() {
        const container = document.getElementById('locationsList');
        container.innerHTML = '';
        
        this.locations.forEach(location => {
            const div = document.createElement('div');
            div.className = 'location-item';
            div.innerHTML = `
                <span>${this.getLocationDisplayName(location)}</span>
                <button class="remove-location" onclick="medicineApp.removeLocation('${location}')">Kaldır</button>
            `;
            container.appendChild(div);
        });
    }

    removeLocation(location) {
        if (this.inventory.some(item => item.location === location)) {
            this.showNotification('Bu konumda envanter bulunduğu için kaldırılamaz. Önce ürünleri taşıyın veya silin.', 'error');
            return;
        }
        
        this.locations = this.locations.filter(loc => loc !== location);
        this.saveData();
        this.populateLocationSelects();
        this.displayLocations();
        
        this.showNotification(`Konum kaldırıldı: ${this.getLocationDisplayName(location)}`, 'success');
    }

    showItemDetails(item) {
        const panel = document.getElementById('itemDetailsPanel');
        const details = document.getElementById('itemDetails');
        this.hideConsumeForm();
        
        const daysUntilExpiration = this.getDaysUntilExpiration(item.expirationDate);
        
        details.innerHTML = `
            <h3>${item.name}</h3>
            <p><strong>Adet:</strong> ${item.quantity}</p>
            <p><strong>Konum:</strong> ${this.getLocationDisplayName(item.location)}</p>
            ${item.expirationDate ? `<p><strong>Son Kullanma:</strong> ${this.formatDate(item.expirationDate)} ${this.getExpirationStatus(daysUntilExpiration)}</p>` : ''}
            <p><strong>Eklenme Tarihi:</strong> ${this.formatDate(item.addedDate)}</p>
        `;
        
        panel.classList.remove('hidden');
        this.currentItemId = item.id;
    }

    closeDetailsPanel() {
        const panel = document.getElementById('itemDetailsPanel');
        if (panel) {
            panel.classList.add('hidden');
        }
        this.hideConsumeForm();
        this.currentItemId = null;
    }

    // Keep closeModal for backward compatibility
    closeModal() {
        this.closeDetailsPanel();
    }

    editItem(itemId) {
        const item = this.inventory.find(item => item.id === itemId);
        if (!item) return;

    // Envanter bölümünde kal ve formu doldur
    this.showSection('inventory');
        
        // Populate the manual entry form with current item data
        const medicineNameInput = document.getElementById('medicineName');
        if (medicineNameInput) {
            medicineNameInput.value = item.name;
            medicineNameInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        document.getElementById('quantity').value = item.quantity;
        document.getElementById('expirationDate').value = item.expirationDate;
        document.getElementById('location').value = item.location;
        
        // Store the item ID for updating
        document.getElementById('manualEntryForm').dataset.editingId = itemId;
        
        // Close the modal
        this.closeModal();
        
        // Scroll to the form
        document.querySelector('.manual-entry').scrollIntoView({ behavior: 'smooth' });
        
        // Change the submit button text
        const submitBtn = document.querySelector('#manualEntryForm button[type="submit"]');
    submitBtn.textContent = 'İlacı Güncelle';
        submitBtn.style.background = '#f5576c';
        
    this.showNotification('Düzenleme modu: Bilgileri güncelleyip "İlacı Güncelle" butonuna basın', 'info');
    }

    deleteItem(itemId) {
        if (confirm('Bu ürünü silmek istediğinize emin misiniz?')) {
            // Track deletion so remote snapshot won't re-add it before our push
            this.pendingDeletions.add(itemId);
            this.inventory = this.inventory.filter(item => item.id !== itemId);
            this.saveData();
            this.updateInventoryDisplay();
            this.updateStats();
            this.populateTransferItems();
            this.closeModal();
            this.showNotification('İlaç başarıyla silindi', 'success');
        }
    }



    importData(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                
                if (confirm('Bu işlem mevcut tüm verilerin üzerine yazacak. Emin misiniz?')) {
                    this.inventory = data.inventory || [];
                    this.locations = data.locations || ['oda', 'arac', 'nakil'];
                    this.transfers = data.transfers || [];
                    this.settings = data.settings || { expirationAlert: 30 };
                    const importedCustom = Array.isArray(data.medicineCatalogCustom)
                        ? data.medicineCatalogCustom
                        : Array.isArray(data.medicineCatalog)
                            ? data.medicineCatalog
                            : [];
                    this.customCatalog = this.sanitizeCustomCatalog(importedCustom);
                    this.saveCatalogState();
                    this.catalogUsage = this.normalizeCatalogUsage(data.medicineCatalogUsage || this.catalogUsage || {});
                    this.normalizeLocalData();
                    this.refreshCatalogFromInventory();
                    this.persistCatalogUsage();
                    
                    this.saveData();
                    this.updateInventoryDisplay();
                    this.updateStats();
                    this.populateLocationSelects();
                    this.populateTransferItems();
                    this.displayTransferHistory();
                    this.populateMedicineSuggestions();
                    this.renderCatalogList();
                    this.displayLocations();
                    this.localChangeTracker.clear();
                    this.pendingDeletions.clear();
                    this.updateDataStatus();
                    
                    this.showNotification('Veriler başarıyla içe aktarıldı', 'success');
                }
            } catch (error) {
                this.showNotification('Geçersiz dosya formatı. Lütfen geçerli bir JSON dosyası seçin.', 'error');
            }
        };
        reader.readAsText(file);
        
        e.target.value = ''; // Reset file input
    }

    clearAllData() {
        if (confirm('Bu işlem TÜM verileri kalıcı olarak silecek. Emin misiniz?')) {
            if (confirm('Bu işlem geri alınamaz. Silmeyi onaylıyor musunuz?')) {
                localStorage.removeItem('medicineInventory');
                localStorage.removeItem('locations');
                localStorage.removeItem('transfers');
                localStorage.removeItem('settings');
                localStorage.removeItem('medicineCatalog');
                localStorage.removeItem('medicineCatalogUsage');
                localStorage.removeItem('medicineCatalogCustom');
                
                this.inventory = [];
                this.locations = ['oda', 'arac', 'nakil'];
                this.transfers = [];
                this.settings = { expirationAlert: 30 };
                this.customCatalog = [];
                this.medicineCatalog = [...this.defaultMedicineCatalog];
                this.catalogUsage = {};
                this.normalizeLocalData();
                this.saveCatalogState();
                this.persistCatalogUsage();
                
                this.updateInventoryDisplay();
                this.updateStats();
                this.populateLocationSelects();
                this.populateTransferItems();
                this.displayTransferHistory();
                this.populateMedicineSuggestions();
                this.renderCatalogList();
                this.displayLocations();
                this.clearTransferForm();
                this.localChangeTracker.clear();
                this.pendingDeletions.clear();
                this.lastSyncStatus = {
                    lastPush: null,
                    lastPull: null,
                    lastError: null,
                    lastConflict: null
                };
                this.updateDataStatus();
                this.saveData();
                
                this.showNotification('Tüm veriler başarıyla silindi', 'success');
            }
        }
    }

    updateSettings(e) {
        this.settings.expirationAlert = parseInt(e.target.value);
        this.saveData();
        this.updateInventoryDisplay();
        this.updateStats();
        this.showNotification('Ayarlar güncellendi', 'success');
    }

    saveData() {
        localStorage.setItem('medicineInventory', JSON.stringify(this.inventory));
        localStorage.setItem('locations', JSON.stringify(this.locations));
        localStorage.setItem('transfers', JSON.stringify(this.transfers));
        localStorage.setItem('settings', JSON.stringify(this.settings));
    this.saveCatalogState();
        this.persistCatalogUsage();
        this.updateDataStatus();
        // Push to cloud (debounced) if enabled
        if (!this.applyingRemote && this.settings.cloudSync?.enabled && typeof this.debouncedCloudSave === 'function') {
            this.pendingLocalChange = true;
            this.debouncedCloudSave();
        }
    }

    clearForm() {
        const form = document.getElementById('manualEntryForm');
        if (!form) return;
        form.reset();
        
        // Reset edit mode
        delete form.dataset.editingId;
        
        // Reset submit button
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.textContent = 'Envantere Ekle';
            submitBtn.style.background = '#667eea';
        }
        const catalogSelect = document.getElementById('catalogSelect');
        if (catalogSelect) catalogSelect.value = '';
        this.clearManualFormFeedback();
    }

    formatRelativeTime(dateInput) {
        if (!dateInput) return '';
        const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
        if (Number.isNaN(date.getTime())) return '';
        const diffMs = Date.now() - date.getTime();
        if (diffMs < 0) return 'az önce';
        const minutes = Math.floor(diffMs / 60000);
        if (minutes < 1) return 'az önce';
        if (minutes < 60) return `${minutes} dk önce`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} sa önce`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days} gün önce`;
        return date.toLocaleDateString('tr-TR');
    }

    formatStatusClock(dateInput) {
        if (!dateInput) return '';
        const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }

    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#667eea'};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            z-index: 1001;
            animation: slideIn 0.3s ease-out;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    recordActivity(entry = {}) {
        const normalized = {
            id: entry.id || Date.now().toString(36),
            type: entry.type || 'bilinmiyor',
            createdAt: entry.createdAt || new Date().toISOString(),
            ...entry
        };
        this.activityLog = [normalized, ...(this.activityLog || [])];
        this.cleanActivityLog();
        this.persistActivityLog();
        this.displayActivityLog();
    }

    // ===== Cloud Sync (Beta) via Firebase Firestore (client-only) =====
    updateCloudUI() {}

    setCloudStatus(text, type = 'info') {
        this.cloud.status = text;
        this.cloud.statusType = type;
        this.cloudStatusMeta = { text, type };
        this.updateDataStatus();
    }

    randomId(n = 8) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let s = '';
        for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
        return s;
    }

    async maybeStartCloudSync(restart = false) {
        const cs = this.settings.cloudSync || {};
        if (!cs.workspaceId || !cs.firebaseConfig) {
            await this.stopCloudSync();
            return;
        }
        if (restart) await this.stopCloudSync();
        if (this.cloud.unsub) return; // already running
        try {
            this.setCloudStatus('bağlanıyor…', 'info');
            await this.ensureFirebaseLoaded();
            // init app with a stable name to avoid collisions with other Firebase apps on the page
            try {
                this.cloud.app = firebase.app('medicine-inventory');
            } catch (_) {
                this.cloud.app = firebase.initializeApp(cs.firebaseConfig, 'medicine-inventory');
            }
            // Initialize Auth (used for rules requiring authentication)
            try {
                this.cloud.auth = this.cloud.app.auth();
                await this.ensureAuthSignedIn();
            } catch (authErr) {
                console.warn('Auth init/sign-in failed:', authErr);
                this.showNotification(`Kimlik doğrulama başarısız: ${authErr?.message || authErr}. Firebase Anonymous Auth'u etkinleştirin.`, 'error');
                this.setCloudStatus('kimlik doğrulama hatası', 'error');
                // Continue without auth; Firestore may still allow if rules are open
            }
            // Use the named app instance to get Firestore (avoids missing [DEFAULT] app error)
            this.cloud.db = this.cloud.app.firestore();
            const docRef = this.cloud.db.collection('workspaces').doc(cs.workspaceId);

            // Basic connectivity read (helps expose permission errors early)
            try {
                const initial = await docRef.get();
                if (initial.exists) {
                    const data = initial.data();
                    if (!(this.inventory?.length) && Array.isArray(data.inventory)) this.inventory = data.inventory;
                    if (!(this.locations?.length) && Array.isArray(data.locations)) this.locations = data.locations;
                    if (!(this.transfers?.length) && Array.isArray(data.transfers)) this.transfers = data.transfers;
                    if (data.medicineCatalogUsage) {
                        this.catalogUsage = this.mergeCatalogUsage(data.medicineCatalogUsage, this.catalogUsage);
                    }
                    this.normalizeLocalData();
                    this.refreshCatalogFromInventory();
                    this.saveCatalogState();
                    this.persistCatalogUsage();
                    this.updateInventoryDisplay();
                    this.updateStats();
                    this.populateLocationSelects();
                    this.populateTransferItems();
                    this.displayTransferHistory();
                    this.populateMedicineSuggestions();
                    this.renderCatalogList();
                    this.displayLocations();
                    this.saveData();
                }
            } catch (preErr) {
                console.warn('Cloud preflight read failed:', preErr);
                this.showNotification(`Bulut okuma hatası: ${preErr?.message || preErr}`, 'error');
                this.setCloudStatus('okuma hatası', 'error');
                this.lastSyncStatus.lastError = {
                    time: Date.now(),
                    message: preErr?.message || 'Bulut okuma hatası'
                };
                this.updateDataStatus();
            }

            // Real-time listener
            this.cloud.unsub = docRef.onSnapshot(async (snap) => {
                if (!snap.exists) {
                    const seedPayload = (this.inventory?.length || this.locations?.length || this.transfers?.length)
                                                ? {
                                                        inventory: this.inventory,
                                                        locations: this.locations,
                                                        transfers: this.transfers,
                                                        medicineCatalog: this.medicineCatalog,
                                                        medicineCatalogCustom: this.customCatalog,
                                                                                                                medicineCatalogUsage: this.catalogUsage,
                            __lastWriter: this.cloud.clientId,
                            __updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                          }
                        : {
                            inventory: [],
                            locations: this.locations || ['oda','arac','nakil'],
                            transfers: [],
                                                        medicineCatalog: this.medicineCatalog,
                                                        medicineCatalogCustom: this.customCatalog,
                                                                                                                medicineCatalogUsage: this.catalogUsage,
                            __lastWriter: this.cloud.clientId,
                            __updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                          };
                    try {
                        await docRef.set(seedPayload, { merge: true });
                        console.log('Cloud sync: seeded workspace');
                        this.setCloudStatus('bağlandı (ilk yükleme)', 'success');
                    } catch (e) {
                        console.warn('Seeding workspace failed:', e);
                        this.showNotification(`Buluta yazma hatası (ilk yükleme): ${e?.message || e}`, 'error');
                        this.setCloudStatus('yazma hatası', 'error');
                        this.lastSyncStatus.lastError = {
                            time: Date.now(),
                            message: e?.message || 'Buluta yazma hatası'
                        };
                        this.updateDataStatus();
                    }
                    return;
                }
                const data = snap.data();
                if (data.__lastWriter === this.cloud.clientId) return;
                this.cloud.lastRemoteUpdate = Date.now();
                this.applyingRemote = true;
                this.pendingLocalChange = false;
                const conflicts = Array.isArray(data.inventory) ? this.detectInventoryConflicts(data.inventory) : [];
                try {
                    if (Array.isArray(data.inventory)) {
                        this.inventory = (this.inventory?.length)
                            ? this.mergeByIdArray(data.inventory, this.inventory)
                            : data.inventory;
                    }
                    if (Array.isArray(data.locations)) {
                        this.locations = (this.locations?.length)
                            ? this.mergeLocationsArray(data.locations, this.locations)
                            : data.locations;
                    }
                    if (Array.isArray(data.transfers)) {
                        this.transfers = (this.transfers?.length)
                            ? this.mergeByIdArray(data.transfers, this.transfers)
                            : data.transfers;
                    }
                    if (data.medicineCatalogUsage) {
                        this.catalogUsage = this.mergeCatalogUsage(data.medicineCatalogUsage, this.catalogUsage);
                    }
                } finally {
                    this.applyingRemote = false;
                }
                this.normalizeLocalData();
                this.refreshCatalogFromInventory();
                this.saveCatalogState();
                this.persistCatalogUsage();
                try {
                    const remoteIds = new Set((data.inventory || []).map(i => i && i.id).filter(Boolean));
                    if (this.pendingDeletions) {
                        for (const id of Array.from(this.pendingDeletions)) {
                            if (!remoteIds.has(id)) this.pendingDeletions.delete(id);
                        }
                    }
                } catch {}
                this.updateInventoryDisplay();
                this.updateStats();
                this.populateLocationSelects();
                this.populateTransferItems();
                this.displayTransferHistory();
                this.populateMedicineSuggestions();
                this.renderCatalogList();
                this.displayLocations();
                this.saveData();
                this.lastSyncStatus.lastPull = new Date();
                this.lastSyncStatus.lastError = null;
                this.handleSyncConflicts(conflicts);
                this.updateDataStatus();
                this.showNotification('☁️ Buluttan senkronize edildi', 'info');
                this.setCloudStatus('bağlandı', 'success');
            }, (err) => {
                console.warn('Cloud sync listener error:', err);
                this.showNotification(`Bulut dinleyici hatası: ${err?.message || err}`, 'error');
                this.setCloudStatus('dinleme hatası', 'error');
                this.lastSyncStatus.lastError = {
                    time: Date.now(),
                    message: err?.message || 'Bulut dinleme hatası'
                };
                this.updateDataStatus();
            });

            // Prepare debounced save
            this.debouncedCloudSave = this.debounce(async () => {
                try {
                    try {
                        if (this.cloud?.app?.auth && !this.cloud.app.auth().currentUser) {
                            await this.ensureAuthSignedIn();
                        }
                    } catch (authRetryErr) {
                        console.warn('Auth retry before push failed:', authRetryErr);
                    }
                    const payload = {
                        inventory: this.inventory,
                        locations: this.locations,
                        transfers: this.transfers,
                        medicineCatalog: this.medicineCatalog,
                        medicineCatalogCustom: this.customCatalog,
                        medicineCatalogUsage: this.catalogUsage,
                        __lastWriter: this.cloud.clientId,
                        __updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    await docRef.set(payload, { merge: true });
                    console.log('Cloud sync: state pushed');
                    this.setCloudStatus('bağlandı', 'success');
                    this.pendingLocalChange = false;
                    this.pendingDeletions.clear();
                    this.lastSyncStatus.lastPush = new Date();
                    this.lastSyncStatus.lastError = null;
                    this.updateDataStatus();
                } catch (e) {
                    console.warn('Cloud push failed:', e);
                    this.showNotification(`Bulut güncellemesi başarısız: ${e?.message || e}`, 'error');
                    this.setCloudStatus('güncelleme hatası', 'error');
                    this.lastSyncStatus.lastError = {
                        time: Date.now(),
                        message: e?.message || 'Bulut güncellemesi başarısız'
                    };
                    this.updateDataStatus();
                }
            }, 800);

            if (this.pendingLocalChange) this.debouncedCloudSave();

            this.showNotification('☁️ Bulut senkronu hazır', 'success');
            this.setCloudStatus('bağlandı', 'success');
        } catch (e) {
            console.warn('Cloud sync failed to start:', e);
            this.showNotification(`Bulut senkronu başlatılamadı. ${e?.message || 'Firebase ayarlarını kontrol edin.'}`, 'error');
            this.setCloudStatus('başlatılamadı', 'error');
            this.lastSyncStatus.lastError = {
                time: Date.now(),
                message: e?.message || 'Bulut senkronu başlatılamadı'
            };
            this.updateDataStatus();
        }
    }

    async stopCloudSync() {
        if (this.cloud.unsub) {
            try { this.cloud.unsub(); } catch {}
            this.cloud.unsub = null;
        }
        this.cloud.app = null;
        this.cloud.db = null;
        this.debouncedCloudSave = () => {};
    }

    debounce(fn, wait) {
        let t = null;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    // Merge arrays of objects by 'id', preferring local items if pendingLocalChange
    mergeByIdArray(remote = [], local = []) {
        const map = new Map();
        for (const r of remote) {
            if (r && r.id != null) {
                // If we have a pending local deletion for this id, skip bringing it from remote
                if (this.pendingDeletions && this.pendingDeletions.has(r.id)) continue;
                map.set(r.id, r);
            }
        }
        for (const l of local) {
            if (!l || l.id == null) continue;
            if (this.pendingDeletions && this.pendingDeletions.has(l.id)) continue;
            const existing = map.get(l.id);
            if (!existing) {
                map.set(l.id, l);
                continue;
            }
            const remoteTimeRaw = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
            const localTimeRaw = l.updatedAt ? new Date(l.updatedAt).getTime() : 0;
            const remoteTime = Number.isFinite(remoteTimeRaw) ? remoteTimeRaw : 0;
            const localTime = Number.isFinite(localTimeRaw) ? localTimeRaw : 0;
            if (localTime > remoteTime) {
                map.set(l.id, l);
            } else if (localTime === remoteTime && l.updatedBy === this.cloud?.clientId) {
                map.set(l.id, l);
            }
        }
        return Array.from(map.values());
    }

    // Merge location arrays (strings) unique
    mergeLocationsArray(remote = [], local = []) {
        const set = new Set(remote);
        for (const l of local) set.add(l);
        return Array.from(set.values());
    }

    async ensureFirebaseLoaded() {
        if (window.firebase?.firestore && window.firebase?.auth) return;
        try {
            await this.loadScript('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
            await this.loadScript('https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js');
            await this.loadScript('https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js');
        } catch (e) {
            console.warn('Failed to load Firebase SDK:', e);
            this.showNotification('Firebase SDK yüklenemedi. Ağ bağlantınızı ve CSP ayarlarınızı kontrol edin.', 'error');
            throw e;
        }
    }

    async ensureAuthSignedIn() {
        try {
            const user = this.cloud.app.auth().currentUser;
            if (user) return user;
            await this.cloud.app.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
            const cred = await this.cloud.app.auth().signInAnonymously();
            console.log('Signed in anonymously:', cred?.user?.uid);
            return cred.user;
        } catch (e) {
            console.warn('Anonymous sign-in failed:', e);
            throw e;
        }
    }

    async loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    // Backup reminders removed

    exportData() {
        const data = {
            inventory: this.inventory,
            locations: this.locations,
            transfers: this.transfers,
            activityLog: this.activityLog,
            medicineCatalog: this.medicineCatalog,
            medicineCatalogCustom: this.customCatalog,
            medicineCatalogUsage: this.catalogUsage,
            settings: this.settings,
            exportDate: new Date().toISOString(),
            appVersion: this.appVersion
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `ilac-envanteri-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showNotification('✅ Veriler başarıyla dışa aktarıldı! Dosyayı güvenli bir yerde saklayın.', 'success');
    }

    exportToExcel() {
        if (!Array.isArray(this.inventory) || !this.inventory.length) {
            this.showNotification('Dışa aktarılacak envanter kaydı bulunamadı.', 'error');
            return;
        }
    const header = ['İlaç', 'Adet', 'Son Kullanma Tarihi', 'Konum'];
        const rows = [header];
        const sorted = [...this.inventory].sort((a, b) => {
            const locCompare = this.getLocationDisplayName(a.location).localeCompare(this.getLocationDisplayName(b.location), 'tr', { sensitivity: 'base' });
            if (locCompare !== 0) return locCompare;
            return (a.name || '').localeCompare(b.name || '', 'tr', { sensitivity: 'base' });
        });
        sorted.forEach((item) => {
            rows.push([
                item.name,
                String(item.quantity),
                item.expirationDate ? this.formatDate(item.expirationDate) : '',
                this.getLocationDisplayName(item.location)
            ]);
        });
        const csvContent = rows.map((row) => row.map((value) => {
            const safe = (value ?? '').toString().replace(/"/g, '""');
            return `"${safe}"`;
        }).join(';')).join('\n');
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ilac-envanteri-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showNotification('📤 Envanter Excel uyumlu formatta dışa aktarıldı.', 'success');
    }

    renderAppVersion() {
        const el = document.getElementById('appVersion');
        if (!el) return;
        el.textContent = `Sürüm ${this.appVersion}`;
    }

    updateDataStatus() {
        const statusElement = document.getElementById('dataStatus');
        if (!statusElement) return;
        const cloudMeta = this.cloudStatusMeta || { text: 'pasif', type: 'info' };
        const itemCount = this.inventory.length;
        const totalQuantity = this.inventory.reduce((sum, item) => sum + item.quantity, 0);
        const base = itemCount === 0
            ? '📊 Kayıtlı ilaç yok'
            : `📊 ${itemCount} ilaç (${totalQuantity} toplam adet)`;

        const infoParts = [];
        const now = Date.now();
        if (this.lastSyncStatus.lastPull) {
            infoParts.push(`son okuma ${this.formatStatusClock(this.lastSyncStatus.lastPull)}`);
        }
        if (this.lastSyncStatus.lastPush) {
            infoParts.push(`son gönderim ${this.formatStatusClock(this.lastSyncStatus.lastPush)}`);
        }
        if (this.pendingLocalChange) {
            infoParts.push('yerel değişiklikler beklemede');
        }
        if (this.lastSyncStatus.lastConflict && (now - this.lastSyncStatus.lastConflict.time) < 24 * 60 * 60 * 1000) {
            infoParts.push(`⚠️ Çakışma ${this.formatRelativeTime(this.lastSyncStatus.lastConflict.time)}`);
        }
        if (this.lastSyncStatus.lastError && (now - this.lastSyncStatus.lastError.time) < 60 * 60 * 1000) {
            infoParts.push(`⚠️ ${this.lastSyncStatus.lastError.message || 'Bulut hatası'}`);
        }

        statusElement.textContent = `${base} • Bulut: ${cloudMeta.text}${infoParts.length ? ' • ' + infoParts.join(' • ') : ''}`;

        let background = 'rgba(255,255,255,0.2)';
        if (itemCount > 0) background = 'rgba(40,167,69,0.8)';
        if (cloudMeta.type === 'success') background = 'rgba(40,167,69,0.8)';
        if (cloudMeta.type === 'error' || (this.lastSyncStatus.lastError && now - this.lastSyncStatus.lastError.time < 15 * 60 * 1000)) {
            background = 'rgba(220,53,69,0.85)';
        } else if (this.lastSyncStatus.lastConflict && now - this.lastSyncStatus.lastConflict.time < 15 * 60 * 1000) {
            background = 'rgba(240,173,78,0.85)';
        }
        statusElement.style.background = background;
        this.renderAppVersion();
    }

    // Auto-backup removed
}

// Add notification animations to CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .no-items {
        text-align: center;
        color: #666;
        font-style: italic;
        padding: 40px 20px;
        background: #f8f9fa;
        border-radius: 10px;
        margin: 20px 0;
    }
`;
document.head.appendChild(style);

// Initialize the application
let medicineApp;
document.addEventListener('DOMContentLoaded', () => {
    medicineApp = new MedicineInventory();
    
    // Make it globally accessible for debugging and inline handlers
    window.medicineApp = medicineApp;
    
    // Add backup functions for details panel
    window.closeDetailsPanel = () => {
        if (medicineApp) {
            medicineApp.closeDetailsPanel();
        }
    };
    
    window.editCurrentItem = () => {
        if (medicineApp && medicineApp.currentItemId) {
            medicineApp.editItem(medicineApp.currentItemId);
        }
    };
    
    window.deleteCurrentItem = () => {
        if (medicineApp && medicineApp.currentItemId) {
            medicineApp.deleteItem(medicineApp.currentItemId);
        }
    };
    
    // Test function to verify details panel works
    window.testDetailsPanel = () => {
        console.log('Test details panel function called');
        const panel = document.getElementById('itemDetailsPanel');
        const details = document.getElementById('itemDetails');
        
        details.innerHTML = `
            <h3>Test Medicine</h3>
            <p><strong>Code:</strong> TEST123</p>
            <p><strong>This is a test details panel</strong></p>
        `;
        
        panel.classList.remove('hidden');
        console.log('Test details panel should be visible now');
    };
});

// Service Worker for offline functionality
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Use relative path so it works on GitHub Pages subpaths (e.g., /medicine-inventory/)
        navigator.serviceWorker.register('sw.js', { scope: './' })
            .then((registration) => {
                console.log('SW registered: ', registration);
            })
            .catch((registrationError) => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}
