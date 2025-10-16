class MedicineInventory {
    constructor() {
        this.inventory = JSON.parse(localStorage.getItem('medicineInventory')) || [];
        this.locations = JSON.parse(localStorage.getItem('locations')) || ['oda', 'arac', 'nakil', 'ev'];
        this.transfers = JSON.parse(localStorage.getItem('transfers')) || [];
        this.settings = JSON.parse(localStorage.getItem('settings')) || {
            expirationAlert: 30
        };

        this.defaultMedicineCatalog = [
            'Adrenalin amp 1 mg',
            'Lidokain %2 amp',
            'Atropin amp 0,5 mg',
            'Antihistaminik amp',
            'Spazmolitik amp',
            'Kalsiyum amp',
            'Kortikosteroid amp (deksametazon) (8mg)',
            'Kortikosteroid amp (metilprednizolon) (40mg)',
            'Diazepam amp',
            'Midazolam 5 mg amp',
            'Antiemetik amp',
            'Analjezik amp (im/iv)',
            'Sodyum Bikarbonat (NaHCo3) amp',
            'Nalokson amp',
            'Nebul (salbutamol+ipratropium bromür)',
            'Anestezik pomad',
            'Antimikrobiyal pomad',
            'Proton pompa inhibitörü flakon',
            'Asetilsalisilik asit tb (kutu)',
            'Kaptopril tb 25 mg (kutu)',
            '%20 Dekstroz 150 cc',
            '%10 dekstroz 250 cc',
            '%5 dekstroz 150 cc',
            'İzotonik 100 cc',
            'İzotonik 250 cc',
            'İzotonik 500 cc',
            'Ringer laktat 500 cc',
            'Magnezyum sülfat amp',
            'Flumazenil 0,5 mg amp'
        ];
        const storedCatalog = JSON.parse(localStorage.getItem('medicineCatalog')) || [];
        this.medicineCatalog = this.buildMedicineCatalog(storedCatalog);

        this.locationAliases = {
            'store': 'oda',
            'car1': 'arac',
            'car2': 'nakil',
            'home': 'ev'
        };
        this.normalizeLocalData();
        this.refreshCatalogFromInventory();
        this.persistMedicineCatalog();

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
            status: 'init'
        };
        // Concurrency flags
        this.applyingRemote = false;
        this.pendingLocalChange = false;
    this.pendingDeletions = new Set();
        // Ensure debouncedCloudSave is a no-op before Cloud Sync initializes
        this.debouncedCloudSave = () => {};
        
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
        this.updateDataStatus();
        this.populateMedicineSuggestions();
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
    document.getElementById('settingsBtn').addEventListener('click', () => this.showSection('settings'));
        const addItemBtn = document.getElementById('addItemBtn');
        if (addItemBtn) addItemBtn.addEventListener('click', () => this.quickAddItem());

        // Manual entry
        const manualForm = document.getElementById('manualEntryForm');
        if (manualForm) manualForm.addEventListener('submit', (e) => this.handleManualEntry(e));

        // Inventory filters
        const locFilter = document.getElementById('locationFilter');
        if (locFilter) locFilter.addEventListener('change', () => this.updateInventoryDisplay());
        const searchBox = document.getElementById('searchBox');
        if (searchBox) searchBox.addEventListener('input', () => this.updateInventoryDisplay());
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportData());

    // Transfer formu
    const transferForm = document.getElementById('transferForm');
    if (transferForm) transferForm.addEventListener('submit', (e) => this.handleTransfer(e));

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
    }

    // Scanner-related functions removed

    buildMedicineCatalog(extra = []) {
        const uniqueMap = new Map();
        [...(this.defaultMedicineCatalog || []), ...(extra || [])].forEach((name) => {
            const trimmed = (name || '').trim();
            if (!trimmed) return;
            const key = trimmed.toLowerCase();
            if (!uniqueMap.has(key)) uniqueMap.set(key, trimmed);
        });
        return Array.from(uniqueMap.values()).sort((a, b) => a.localeCompare(b, 'tr', { sensitivity: 'base' }));
    }

    refreshCatalogFromInventory() {
        const inventoryNames = (this.inventory || []).map(item => (item?.name || '').trim()).filter(Boolean);
        this.medicineCatalog = this.buildMedicineCatalog([...(this.medicineCatalog || []), ...inventoryNames]);
    }

    persistMedicineCatalog() {
        try {
            localStorage.setItem('medicineCatalog', JSON.stringify(this.medicineCatalog || []));
        } catch {}
    }

    populateMedicineSuggestions() {
        const datalist = document.getElementById('medicineNameSuggestions');
        if (!datalist) return;
        datalist.innerHTML = '';
        (this.medicineCatalog || []).forEach((name) => {
            const option = document.createElement('option');
            option.value = name;
            datalist.appendChild(option);
        });
    }

    ensureMedicineInCatalog(name) {
        const trimmed = (name || '').trim();
        if (!trimmed) return;
        const exists = (this.medicineCatalog || []).some(item => item.toLowerCase() === trimmed.toLowerCase());
        if (exists) return;
        this.medicineCatalog = this.buildMedicineCatalog([...(this.medicineCatalog || []), trimmed]);
        this.persistMedicineCatalog();
        this.populateMedicineSuggestions();
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
    const sections = ['inventory', 'transfer', 'settings'];
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
        const codeInput = document.getElementById('medicineCode');
        if (codeInput) setTimeout(() => codeInput.focus(), 250);
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
                    this.showNotification(`✅ ${barcode} kodlu ilacı eklemeye hazırsınız`, 'success');
                }, 1500);
            }
        } catch (error) {
            console.error('Error fetching medicine info:', error);
        }
    }

    handleManualEntry(e) {
        e.preventDefault();
        
        const editingId = e.target.dataset.editingId;
        const formData = new FormData(e.target);
        const medicineData = {
            code: formData.get('medicineCode') || document.getElementById('medicineCode').value,
            name: formData.get('medicineName') || document.getElementById('medicineName').value,
            quantity: parseInt(formData.get('quantity') || document.getElementById('quantity').value),
            expirationDate: (formData.get('expirationDate') || document.getElementById('expirationDate').value || '').trim() || null,
            location: formData.get('location') || document.getElementById('location').value
        };

        if (editingId) {
            // Update existing item
            const itemIndex = this.inventory.findIndex(item => item.id === editingId);
            if (itemIndex !== -1) {
                this.inventory[itemIndex] = {
                    ...this.inventory[itemIndex],
                    ...medicineData
                };
                this.showNotification(`${medicineData.name} güncellendi`, 'success');
            }
        } else {
            // Add new item
            const medicine = {
                ...medicineData,
                id: Date.now().toString(),
                addedDate: new Date().toISOString()
            };

            // Check if medicine already exists at this location
            const existingIndex = this.inventory.findIndex(item => 
                item.code === medicine.code && 
                item.location === medicine.location &&
                (item.expirationDate || null) === (medicine.expirationDate || null)
            );

            if (existingIndex !== -1) {
                // Update quantity if exists
                this.inventory[existingIndex].quantity += medicine.quantity;
            } else {
                // Add new entry
                this.inventory.push(medicine);
            }
            
            this.showNotification(`${medicine.name} ${this.getLocationDisplayName(medicine.location)} konumuna eklendi`, 'success');
        }

        this.ensureMedicineInCatalog(medicineData.name);
        this.saveData();
        this.clearForm();
        this.updateInventoryDisplay();
        this.updateStats();
        this.populateTransferItems();
    }

    updateInventoryDisplay() {
        const locationFilter = document.getElementById('locationFilter').value;
    const searchTerm = document.getElementById('searchBox').value.toLowerCase();
        
        let filteredInventory = this.inventory;
        
        if (locationFilter) {
            filteredInventory = filteredInventory.filter(item => item.location === locationFilter);
        }
        
        if (searchTerm) {
            filteredInventory = filteredInventory.filter(item =>
                item.name.toLowerCase().includes(searchTerm) ||
                item.code.toLowerCase().includes(searchTerm)
            );
        }

        const inventoryList = document.getElementById('inventoryList');
        inventoryList.innerHTML = '';

        if (filteredInventory.length === 0) {
            inventoryList.innerHTML = '<div class="no-items">Henüz kayıtlı ilaç yok. ➕ İlaç Ekle butonuyla listenizi oluşturun.</div>';
            return;
        }

        filteredInventory.forEach(item => {
            const itemElement = this.createInventoryItemElement(item);
            inventoryList.appendChild(itemElement);
        });
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
                <p><strong>Kod:</strong> ${item.code}</p>
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
        const total = this.inventory.reduce((sum, item) => sum + item.quantity, 0);
        const expiringSoon = this.inventory.filter(item => {
            if (!item.expirationDate) return false;
            const days = this.getDaysUntilExpiration(item.expirationDate);
            return days > 0 && days <= this.settings.expirationAlert;
        }).reduce((sum, item) => sum + item.quantity, 0);
        
        const expired = this.inventory.filter(item => item.expirationDate && this.getDaysUntilExpiration(item.expirationDate) < 0)
            .reduce((sum, item) => sum + item.quantity, 0);

        document.getElementById('totalItems').textContent = total;
        document.getElementById('expiringSoon').textContent = expiringSoon;
        document.getElementById('expiredItems').textContent = expired;
    }

    handleTransfer(e) {
        e.preventDefault();

        const itemId = document.getElementById('transferItem').value;
        const fromLocation = document.getElementById('fromLocation').value;
        const toLocation = document.getElementById('toLocation').value;
        const quantity = parseInt(document.getElementById('transferQuantity').value, 10);

        if (!itemId || !fromLocation || !toLocation || Number.isNaN(quantity) || quantity <= 0) {
            alert('Lütfen geçerli bir ürün, konum ve adet seçin.');
            return;
        }

        if (fromLocation === toLocation) {
            alert('Kaynak ve hedef konumlar aynı olamaz.');
            return;
        }

        const sourceItem = this.inventory.find(item => item.id === itemId && item.location === fromLocation);
        if (!sourceItem || sourceItem.quantity < quantity) {
            alert('Kaynak konumda yeterli stok bulunmuyor.');
            return;
        }

        sourceItem.quantity -= quantity;

        const destItem = this.inventory.find(item =>
            item.code === sourceItem.code &&
            item.location === toLocation &&
            (item.expirationDate || null) === (sourceItem.expirationDate || null)
        );

        if (destItem) {
            destItem.quantity += quantity;
        } else {
            const newItem = { ...sourceItem };
            newItem.id = Date.now().toString();
            newItem.location = toLocation;
            newItem.quantity = quantity;
            this.inventory.push(newItem);
        }

        if (sourceItem.quantity === 0) {
            this.inventory = this.inventory.filter(item => item.id !== sourceItem.id);
        }

        const transfer = {
            id: Date.now().toString(),
            medicineName: sourceItem.name,
            medicineCode: sourceItem.code,
            quantity,
            fromLocation,
            toLocation,
            date: new Date().toISOString()
        };
        this.transfers.unshift(transfer);

        this.saveData();
        this.clearTransferForm();
        this.populateTransferItems();
        this.displayTransferHistory();
        this.updateInventoryDisplay();
        this.updateStats();

        const sourceName = this.getLocationDisplayName(fromLocation);
        const targetName = this.getLocationDisplayName(toLocation);
        this.showNotification(`${transfer.medicineName} ilacından ${quantity} adet ${sourceName} konumundan ${targetName} konumuna aktarıldı`, 'success');
    }

    populateTransferItems() {
        const select = document.getElementById('transferItem');
        if (!select) return;

        const currentValue = select.value;
        select.innerHTML = '<option value="">Taşınacak ilacı seçin</option>';

        const uniqueItems = new Map();
        this.inventory.forEach(item => {
            const key = `${item.code}-${item.location}-${item.expirationDate || 'none'}`;
            if (!uniqueItems.has(key)) uniqueItems.set(key, item);
        });

        uniqueItems.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = `${item.name} (${this.getLocationDisplayName(item.location)}) • Adet: ${item.quantity}`;
            select.appendChild(option);
        });

        if (currentValue) {
            const stillExists = Array.from(select.options).some(opt => opt.value === currentValue);
            select.value = stillExists ? currentValue : '';
        }
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
                <div class="transfer-date">${this.formatDate(transfer.date)}</div>
            `;
            container.appendChild(div);
        });
    }

    clearTransferForm() {
        const form = document.getElementById('transferForm');
        if (form) form.reset();
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
            'ev': 'Ev',
            'store': 'Oda',
            'car1': 'Araç',
            'car2': 'Nakil Ambulansı',
            'home': 'Ev'
        };
        return displayNames[location] || location;
    }

    addLocation() {
        const input = document.getElementById('newLocationName');
        const locationName = input.value.trim().toLowerCase().replace(/\s+/g, '_');
        
        if (!locationName) {
            alert('Lütfen bir konum adı girin.');
            return;
        }
        
        if (this.locations.includes(locationName)) {
            alert('Bu konum zaten mevcut.');
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
            alert('Bu konumda envanter bulunduğu için kaldırılamaz. Önce ürünleri taşıyın veya silin.');
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
        
        const daysUntilExpiration = this.getDaysUntilExpiration(item.expirationDate);
        
        details.innerHTML = `
            <h3>${item.name}</h3>
            <p><strong>Kod:</strong> ${item.code}</p>
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
        document.getElementById('medicineCode').value = item.code;
        document.getElementById('medicineName').value = item.name;
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
                    this.locations = data.locations || ['oda', 'arac', 'nakil', 'ev'];
                    this.transfers = data.transfers || [];
                    this.settings = data.settings || { expirationAlert: 30 };
                    this.medicineCatalog = this.buildMedicineCatalog(data.medicineCatalog || this.medicineCatalog || []);
                    this.normalizeLocalData();
                    this.refreshCatalogFromInventory();
                    this.persistMedicineCatalog();
                    
                    this.saveData();
                    this.updateInventoryDisplay();
                    this.updateStats();
                    this.populateLocationSelects();
                    this.populateTransferItems();
                    this.displayTransferHistory();
                    this.populateMedicineSuggestions();
                    this.displayLocations();
                    
                    this.showNotification('Veriler başarıyla içe aktarıldı', 'success');
                }
            } catch (error) {
                alert('Geçersiz dosya formatı. Lütfen geçerli bir JSON dosyası seçin.');
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
                
                this.inventory = [];
                this.locations = ['oda', 'arac', 'nakil', 'ev'];
                this.transfers = [];
                this.settings = { expirationAlert: 30 };
                this.medicineCatalog = [...this.defaultMedicineCatalog];
                this.normalizeLocalData();
                this.persistMedicineCatalog();
                
                this.updateInventoryDisplay();
                this.updateStats();
                this.populateLocationSelects();
                this.populateTransferItems();
                this.displayTransferHistory();
                this.populateMedicineSuggestions();
                this.displayLocations();
                this.clearTransferForm();
                
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
    this.persistMedicineCatalog();
        this.updateDataStatus();
        // Push to cloud (debounced) if enabled
        if (!this.applyingRemote && this.settings.cloudSync?.enabled && typeof this.debouncedCloudSave === 'function') {
            this.pendingLocalChange = true;
            this.debouncedCloudSave();
        }
    }

    clearForm() {
        const form = document.getElementById('manualEntryForm');
        form.reset();
        
        // Reset edit mode
        delete form.dataset.editingId;
        
        // Reset submit button
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.textContent = 'Envantere Ekle';
        submitBtn.style.background = '#667eea';
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('tr-TR');
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

    // ===== Cloud Sync (Beta) via Firebase Firestore (client-only) =====
    updateCloudUI() {}

    setCloudStatus(text, type = 'info') {
        this.cloud.status = text;
        const statusElement = document.getElementById('dataStatus');
        if (!statusElement) return;
        const itemCount = this.inventory.length;
        const totalQuantity = this.inventory.reduce((sum, item) => sum + item.quantity, 0);
        const base = itemCount === 0
            ? '📊 Kayıtlı ilaç yok'
            : `📊 ${itemCount} ilaç (${totalQuantity} toplam adet)`;
        const color = type === 'success' ? 'rgba(40,167,69,0.8)'
                    : type === 'error' ? 'rgba(220,53,69,0.85)'
                    : 'rgba(40,167,69,0.8)';
        statusElement.textContent = `${base} • Bulut: ${text}`;
        statusElement.style.background = color;
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
                    if (Array.isArray(data.medicineCatalog)) {
                        this.medicineCatalog = this.buildMedicineCatalog([...(this.medicineCatalog || []), ...data.medicineCatalog]);
                    }
                    this.normalizeLocalData();
                    this.refreshCatalogFromInventory();
                    this.persistMedicineCatalog();
                    this.updateInventoryDisplay();
                    this.updateStats();
                    this.populateLocationSelects();
                    this.populateTransferItems();
                    this.displayTransferHistory();
                    this.populateMedicineSuggestions();
                    this.displayLocations();
                    this.saveData();
                }
            } catch (preErr) {
                console.warn('Cloud preflight read failed:', preErr);
                this.showNotification(`Bulut okuma hatası: ${preErr?.message || preErr}`, 'error');
                this.setCloudStatus('okuma hatası', 'error');
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
                            __lastWriter: this.cloud.clientId,
                            __updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                          }
                        : {
                            inventory: [],
                            locations: this.locations || ['oda','arac','nakil','ev'],
                            transfers: [],
                            medicineCatalog: this.medicineCatalog,
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
                    }
                    return;
                }
                const data = snap.data();
                if (data.__lastWriter === this.cloud.clientId) return;
                this.cloud.lastRemoteUpdate = Date.now();
                this.applyingRemote = true;
                this.pendingLocalChange = false;
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
                    if (Array.isArray(data.medicineCatalog)) {
                        this.medicineCatalog = this.buildMedicineCatalog([...(this.medicineCatalog || []), ...data.medicineCatalog]);
                    }
                } finally {
                    this.applyingRemote = false;
                }
                this.normalizeLocalData();
                this.refreshCatalogFromInventory();
                this.persistMedicineCatalog();
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
                this.displayLocations();
                this.saveData();
                this.showNotification('☁️ Buluttan senkronize edildi', 'info');
                this.setCloudStatus('bağlandı', 'success');
            }, (err) => {
                console.warn('Cloud sync listener error:', err);
                this.showNotification(`Bulut dinleyici hatası: ${err?.message || err}`, 'error');
                this.setCloudStatus('dinleme hatası', 'error');
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
                        __lastWriter: this.cloud.clientId,
                        __updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    await docRef.set(payload, { merge: true });
                    console.log('Cloud sync: state pushed');
                    this.setCloudStatus('bağlandı', 'success');
                    this.pendingLocalChange = false;
                    this.pendingDeletions.clear();
                } catch (e) {
                    console.warn('Cloud push failed:', e);
                    this.showNotification(`Bulut güncellemesi başarısız: ${e?.message || e}`, 'error');
                    this.setCloudStatus('güncelleme hatası', 'error');
                }
            }, 800);

            if (this.pendingLocalChange) this.debouncedCloudSave();

            this.showNotification('☁️ Bulut senkronu hazır', 'success');
            this.setCloudStatus('bağlandı', 'success');
        } catch (e) {
            console.warn('Cloud sync failed to start:', e);
            this.showNotification(`Bulut senkronu başlatılamadı. ${e?.message || 'Firebase ayarlarını kontrol edin.'}`, 'error');
            this.setCloudStatus('başlatılamadı', 'error');
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
        // Only overlay local items when there is a pending local change from this client.
        // Otherwise, respect remote as the source of truth (so deletions propagate).
        if (this.pendingLocalChange) {
            for (const l of local) {
                if (l && l.id != null) {
                    map.set(l.id, l);
                }
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
            medicineCatalog: this.medicineCatalog,
            settings: this.settings,
            exportDate: new Date().toISOString(),
            appVersion: '1.0.0'
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

    updateDataStatus() {
        const statusElement = document.getElementById('dataStatus');
        if (!statusElement) return;
        
        const itemCount = this.inventory.length;
        const totalQuantity = this.inventory.reduce((sum, item) => sum + item.quantity, 0);
        if (itemCount === 0) {
            statusElement.textContent = '📊 Kayıtlı ilaç yok';
            statusElement.style.background = 'rgba(255,255,255,0.2)';
        } else {
            statusElement.textContent = `📊 ${itemCount} ilaç (${totalQuantity} toplam adet)`;
            statusElement.style.background = 'rgba(40,167,69,0.8)';
        }
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
