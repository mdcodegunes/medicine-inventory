class MedicineInventory {
    constructor() {
        this.inventory = JSON.parse(localStorage.getItem('medicineInventory')) || [];
        this.locations = JSON.parse(localStorage.getItem('locations')) || ['store', 'car1', 'car2', 'home'];
        this.transfers = JSON.parse(localStorage.getItem('transfers')) || [];
        this.settings = JSON.parse(localStorage.getItem('settings')) || {
            expirationAlert: 30
        };

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
        this.showSection('inventory');
        this.updateInventoryDisplay();
        this.updateStats();
        this.populateLocationSelects();
        this.populateTransferItems();
        this.displayTransferHistory();
        this.displayLocations();
        this.updateDataStatus();
        // Auto-backup removed

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

        // Start cloud sync automatically when config+workspace are present
        this.maybeStartCloudSync(true);
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
        // Navigation (Scan removed)
        document.getElementById('inventoryBtn').addEventListener('click', () => this.showSection('inventory'));
        document.getElementById('transferBtn').addEventListener('click', () => this.showSection('transfer'));
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

        // Transfer
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
        console.log('Fetching medicine info for barcode:', barcode);
        
        // Show the barcode was processed
        this.showNotification(`🔍 Processing barcode: ${barcode}`, 'info');
        
        // This is where you could integrate with medicine databases
        // For now, we'll just show the barcode and provide basic info
        
        // You could integrate with APIs like:
        // - FDA NDC Database
        // - Open Food Facts (for some medicines)
        // - Custom medicine database
        
        try {
            // Placeholder logic - in real implementation, you'd make API calls
            if (barcode.length > 0) {
                console.log('Barcode processed successfully:', barcode);
                
                // Auto-focus on medicine name field for user to enter
                setTimeout(() => {
                    const medicineNameField = document.getElementById('medicineName');
                    if (medicineNameField) {
                        medicineNameField.focus();
                        console.log('Medicine name field focused');
                    }
                }, 100);
                
                // Show success message
                setTimeout(() => {
                    this.showNotification(`✅ Ready to add medicine with code: ${barcode}`, 'success');
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
                this.showNotification(`Updated ${medicineData.name}`, 'success');
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
            
            this.showNotification(`Added ${medicine.name} to ${medicine.location}`, 'success');
        }

        this.saveData();
        this.clearForm();
        this.updateInventoryDisplay();
        this.updateStats();
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
            inventoryList.innerHTML = '<div class="no-items">No medicines found. Use the ➕ Add Item button to add your first one.</div>';
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
                <p><strong>Code:</strong> ${item.code}</p>
                ${item.expirationDate ? `<p><strong>Expires:</strong> ${this.formatDate(item.expirationDate)} ${this.getExpirationStatus(daysUntilExpiration)}</p>` : ''}
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
            return `<span style="color: #ee5a24; font-weight: bold;">(Expired ${Math.abs(days)} days ago)</span>`;
        } else if (days <= this.settings.expirationAlert) {
            return `<span style="color: #f5576c; font-weight: bold;">(Expires in ${days} days)</span>`;
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
        const quantity = parseInt(document.getElementById('transferQuantity').value);

        if (fromLocation === toLocation) {
            alert('Source and destination locations cannot be the same.');
            return;
        }

        const sourceItem = this.inventory.find(item => 
            item.id === itemId && item.location === fromLocation
        );

        if (!sourceItem || sourceItem.quantity < quantity) {
            alert('Insufficient quantity at source location.');
            return;
        }

        // Reduce quantity at source
        sourceItem.quantity -= quantity;

        // Check if there's already an item with same details at destination
        const destItem = this.inventory.find(item =>
            item.code === sourceItem.code &&
            item.location === toLocation &&
            item.expirationDate === sourceItem.expirationDate
        );

        if (destItem) {
            destItem.quantity += quantity;
        } else {
            // Create new item at destination
            const newItem = { ...sourceItem };
            newItem.id = Date.now().toString();
            newItem.location = toLocation;
            newItem.quantity = quantity;
            this.inventory.push(newItem);
        }

        // Remove source item if quantity is 0
        if (sourceItem.quantity === 0) {
            this.inventory = this.inventory.filter(item => item.id !== sourceItem.id);
        }

        // Record transfer
        const transfer = {
            id: Date.now().toString(),
            medicineName: sourceItem.name,
            medicineCode: sourceItem.code,
            quantity: quantity,
            fromLocation: fromLocation,
            toLocation: toLocation,
            date: new Date().toISOString()
        };
        this.transfers.unshift(transfer);

        this.saveData();
        this.clearTransferForm();
        this.populateTransferItems();
        this.displayTransferHistory();
        this.updateInventoryDisplay();
        this.updateStats();

        this.showNotification(`Transferred ${quantity} ${sourceItem.name} from ${fromLocation} to ${toLocation}`, 'success');
    }

    populateTransferItems() {
        const select = document.getElementById('transferItem');
        select.innerHTML = '<option value="">Select Medicine to Transfer</option>';

        const uniqueItems = new Map();
        this.inventory.forEach(item => {
            const key = `${item.code}-${item.location}-${item.expirationDate}`;
            if (!uniqueItems.has(key)) {
                uniqueItems.set(key, item);
            }
        });

        uniqueItems.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = `${item.name} (${this.getLocationDisplayName(item.location)}) - Qty: ${item.quantity}`;
            select.appendChild(option);
        });
    }

    populateLocationSelects() {
        const selects = ['location', 'locationFilter', 'fromLocation', 'toLocation'];
        
        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (!select) return;
            
            const currentValue = select.value;
            const isFilter = selectId === 'locationFilter';
            
            select.innerHTML = isFilter ? '<option value="">All Locations</option>' : '<option value="">Select Location</option>';
            
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
            'store': 'Store',
            'car1': 'Car 1',
            'car2': 'Car 2',
            'home': 'Home'
        };
        return displayNames[location] || location.charAt(0).toUpperCase() + location.slice(1);
    }

    addLocation() {
        const input = document.getElementById('newLocationName');
        const locationName = input.value.trim().toLowerCase().replace(/\s+/g, '_');
        
        if (!locationName) {
            alert('Please enter a location name.');
            return;
        }
        
        if (this.locations.includes(locationName)) {
            alert('Location already exists.');
            return;
        }
        
        this.locations.push(locationName);
        this.saveData();
        this.populateLocationSelects();
        this.displayLocations();
        input.value = '';
        
        this.showNotification(`Added location: ${this.getLocationDisplayName(locationName)}`, 'success');
    }

    displayLocations() {
        const container = document.getElementById('locationsList');
        container.innerHTML = '';
        
        this.locations.forEach(location => {
            const div = document.createElement('div');
            div.className = 'location-item';
            div.innerHTML = `
                <span>${this.getLocationDisplayName(location)}</span>
                <button class="remove-location" onclick="medicineApp.removeLocation('${location}')">Remove</button>
            `;
            container.appendChild(div);
        });
    }

    removeLocation(location) {
        if (this.inventory.some(item => item.location === location)) {
            alert('Cannot remove location that contains inventory items. Transfer or remove items first.');
            return;
        }
        
        this.locations = this.locations.filter(loc => loc !== location);
        this.saveData();
        this.populateLocationSelects();
        this.displayLocations();
        
        this.showNotification(`Removed location: ${this.getLocationDisplayName(location)}`, 'success');
    }

    displayTransferHistory() {
        const container = document.getElementById('transferList');
        container.innerHTML = '';
        
        if (this.transfers.length === 0) {
            container.innerHTML = '<p>No transfers recorded yet.</p>';
            return;
        }
        
        this.transfers.slice(0, 10).forEach(transfer => {
            const div = document.createElement('div');
            div.className = 'transfer-item';
            div.innerHTML = `
                <div class="transfer-info">
                    <strong>${transfer.medicineName}</strong> (${transfer.quantity})
                    <br>
                    <small>${this.getLocationDisplayName(transfer.fromLocation)} → ${this.getLocationDisplayName(transfer.toLocation)}</small>
                </div>
                <div class="transfer-date">${this.formatDate(transfer.date)}</div>
            `;
            container.appendChild(div);
        });
    }

    showItemDetails(item) {
        const panel = document.getElementById('itemDetailsPanel');
        const details = document.getElementById('itemDetails');
        
        const daysUntilExpiration = this.getDaysUntilExpiration(item.expirationDate);
        
        details.innerHTML = `
            <h3>${item.name}</h3>
            <p><strong>Code:</strong> ${item.code}</p>
            <p><strong>Quantity:</strong> ${item.quantity}</p>
            <p><strong>Location:</strong> ${this.getLocationDisplayName(item.location)}</p>
            ${item.expirationDate ? `<p><strong>Expiration Date:</strong> ${this.formatDate(item.expirationDate)} ${this.getExpirationStatus(daysUntilExpiration)}</p>` : ''}
            <p><strong>Added:</strong> ${this.formatDate(item.addedDate)}</p>
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

    // Stay on inventory section and populate form
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
        submitBtn.textContent = 'Update Medicine';
        submitBtn.style.background = '#f5576c';
        
        this.showNotification('Edit mode: Update the details and click "Update Medicine"', 'info');
    }

    deleteItem(itemId) {
        if (confirm('Are you sure you want to delete this item?')) {
            // Track deletion so remote snapshot won't re-add it before our push
            this.pendingDeletions.add(itemId);
            this.inventory = this.inventory.filter(item => item.id !== itemId);
            this.saveData();
            this.updateInventoryDisplay();
            this.updateStats();
            this.closeModal();
            this.showNotification('Item deleted successfully', 'success');
        }
    }



    importData(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                
                if (confirm('This will replace all existing data. Are you sure?')) {
                    this.inventory = data.inventory || [];
                    this.locations = data.locations || ['store', 'car1', 'car2', 'home'];
                    this.transfers = data.transfers || [];
                    this.settings = data.settings || { expirationAlert: 30 };
                    
                    this.saveData();
                    this.updateInventoryDisplay();
                    this.updateStats();
                    this.populateLocationSelects();
                    this.populateTransferItems();
                    this.displayTransferHistory();
                    this.displayLocations();
                    
                    this.showNotification('Data imported successfully', 'success');
                }
            } catch (error) {
                alert('Invalid file format. Please select a valid JSON file.');
            }
        };
        reader.readAsText(file);
        
        e.target.value = ''; // Reset file input
    }

    clearAllData() {
        if (confirm('This will delete ALL data permanently. Are you sure?')) {
            if (confirm('This action cannot be undone. Confirm deletion?')) {
                localStorage.removeItem('medicineInventory');
                localStorage.removeItem('locations');
                localStorage.removeItem('transfers');
                localStorage.removeItem('settings');
                
                this.inventory = [];
                this.locations = ['store', 'car1', 'car2', 'home'];
                this.transfers = [];
                this.settings = { expirationAlert: 30 };
                
                this.updateInventoryDisplay();
                this.updateStats();
                this.populateLocationSelects();
                this.populateTransferItems();
                this.displayTransferHistory();
                this.displayLocations();
                
                this.showNotification('All data cleared successfully', 'success');
            }
        }
    }

    updateSettings(e) {
        this.settings.expirationAlert = parseInt(e.target.value);
        this.saveData();
        this.updateInventoryDisplay();
        this.updateStats();
        this.showNotification('Settings updated', 'success');
    }

    saveData() {
        localStorage.setItem('medicineInventory', JSON.stringify(this.inventory));
        localStorage.setItem('locations', JSON.stringify(this.locations));
        localStorage.setItem('transfers', JSON.stringify(this.transfers));
        localStorage.setItem('settings', JSON.stringify(this.settings));
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
        submitBtn.textContent = 'Add to Inventory';
        submitBtn.style.background = '#667eea';
    }

    clearTransferForm() {
        document.getElementById('transferForm').reset();
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString();
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
            ? '📊 No medicines stored'
            : `📊 ${itemCount} medicines (${totalQuantity} total)`;
        const color = type === 'success' ? 'rgba(40,167,69,0.8)'
                    : type === 'error' ? 'rgba(220,53,69,0.85)'
                    : 'rgba(40,167,69,0.8)';
        statusElement.textContent = `${base} • Cloud: ${text}`;
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
            this.setCloudStatus('connecting…', 'info');
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
                this.showNotification(`Auth failed: ${authErr?.message || authErr}. Enable Anonymous auth in Firebase.`, 'error');
                this.setCloudStatus('auth failed', 'error');
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
                    // If nothing local yet, hydrate immediately from cloud
                    if (!(this.inventory?.length) && Array.isArray(data.inventory)) this.inventory = data.inventory;
                    if (!(this.locations?.length) && Array.isArray(data.locations)) this.locations = data.locations;
                    if (!(this.transfers?.length) && Array.isArray(data.transfers)) this.transfers = data.transfers;
                    // Reflect UI early
                    this.updateInventoryDisplay();
                    this.updateStats();
                    this.populateLocationSelects();
                    this.populateTransferItems();
                    this.displayTransferHistory();
                    this.displayLocations();
                    this.saveData();
                }
            } catch (preErr) {
                console.warn('Cloud preflight read failed:', preErr);
                this.showNotification(`Cloud read failed: ${preErr?.message || preErr}`, 'error');
                this.setCloudStatus('read failed', 'error');
            }

            // Real-time listener
            this.cloud.unsub = docRef.onSnapshot(async (snap) => {
                if (!snap.exists) {
                    // Seed Firestore with local data if we have any; otherwise create an empty doc so it's visible
                    const seedPayload = (this.inventory?.length || this.locations?.length || this.transfers?.length)
                        ? {
                            inventory: this.inventory,
                            locations: this.locations,
                            transfers: this.transfers,
                            __lastWriter: this.cloud.clientId,
                            __updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                          }
                        : {
                            inventory: [],
                            locations: this.locations || ['store','car1','car2','home'],
                            transfers: [],
                            __lastWriter: this.cloud.clientId,
                            __updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                          };
                    try {
                        await docRef.set(seedPayload, { merge: true });
                        console.log('Cloud sync: seeded workspace');
                        this.setCloudStatus('connected (seeded)', 'success');
                    } catch (e) {
                        console.warn('Seeding workspace failed:', e);
                        this.showNotification(`Cloud write failed (seed): ${e?.message || e}`, 'error');
                        this.setCloudStatus('write failed', 'error');
                    }
                    return;
                }
                const data = snap.data();
                // Avoid applying changes we just wrote
                if (data.__lastWriter === this.cloud.clientId) return;
                this.cloud.lastRemoteUpdate = Date.now();
                // Merge remote state with local to prevent overwriting fresh local changes
                this.applyingRemote = true;
                try {
                    if (Array.isArray(data.inventory)) {
                        // If local is empty, prefer remote wholesale to avoid showing empty after refresh
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
                } finally {
                    this.applyingRemote = false;
                }
                // Keep local settings, but update lastBackupReminder opt.
                this.updateInventoryDisplay();
                this.updateStats();
                this.populateLocationSelects();
                this.populateTransferItems();
                this.displayTransferHistory();
                this.displayLocations();
                this.saveData(); // persists and triggers UI status
                this.showNotification('☁️ Changes synced from cloud', 'info');
                this.setCloudStatus('connected', 'success');
            }, (err) => {
                console.warn('Cloud sync listener error:', err);
                this.showNotification(`Cloud listener error: ${err?.message || err}`, 'error');
                this.setCloudStatus('listener error', 'error');
            });

            // Prepare debounced save
            this.debouncedCloudSave = this.debounce(async () => {
                try {
                    // Ensure signed-in when rules require auth
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
                        __lastWriter: this.cloud.clientId,
                        __updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    await docRef.set(payload, { merge: true });
                    console.log('Cloud sync: state pushed');
                    this.setCloudStatus('connected', 'success');
                    this.pendingLocalChange = false;
                    // Clear any tracked deletions now that remote reflects our state
                    this.pendingDeletions.clear();
                } catch (e) {
                    console.warn('Cloud push failed:', e);
                    this.showNotification(`Cloud push failed: ${e?.message || e}`, 'error');
                    this.setCloudStatus('push failed', 'error');
                }
            }, 800);

            this.showNotification('☁️ Cloud sync connected', 'success');
            this.setCloudStatus('connected', 'success');
        } catch (e) {
            console.warn('Cloud sync failed to start:', e);
            this.showNotification(`Cloud sync failed to start. ${e?.message || 'Check Firebase config.'}`, 'error');
            this.setCloudStatus('failed to start', 'error');
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
            if (l && l.id != null) {
                if (this.pendingLocalChange) {
                    // Prefer local when there's a pending local change
                    map.set(l.id, l);
                } else if (!map.has(l.id)) {
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
            this.showNotification('Failed to load Firebase SDK. Check network and CSP.', 'error');
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
            settings: this.settings,
            exportDate: new Date().toISOString(),
            appVersion: '1.0.0'
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `medicine-inventory-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
    this.showNotification('✅ Data exported successfully! Store this file safely.', 'success');
    }

    updateDataStatus() {
        const statusElement = document.getElementById('dataStatus');
        if (!statusElement) return;
        
        const itemCount = this.inventory.length;
        const totalQuantity = this.inventory.reduce((sum, item) => sum + item.quantity, 0);
        if (itemCount === 0) {
            statusElement.textContent = '📊 No medicines stored';
            statusElement.style.background = 'rgba(255,255,255,0.2)';
        } else {
            statusElement.textContent = `📊 ${itemCount} medicines (${totalQuantity} total)`;
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
