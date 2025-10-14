class MedicineInventory {
    constructor() {
        this.inventory = JSON.parse(localStorage.getItem('medicineInventory')) || [];
        this.locations = JSON.parse(localStorage.getItem('locations')) || ['store', 'car1', 'car2', 'home'];
        this.transfers = JSON.parse(localStorage.getItem('transfers')) || [];
        this.settings = JSON.parse(localStorage.getItem('settings')) || {
            expirationAlert: 30,
            lastBackupReminder: null,
            backupReminderInterval: 7 // days
        };
        
        this.scanner = null;
        this.currentSection = 'inventory';
        
        this.init();
        this.checkBackupReminder();
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
    }

    setupEventListeners() {
        // Navigation
        document.getElementById('scanBtn').addEventListener('click', () => this.showSection('scanner'));
        document.getElementById('inventoryBtn').addEventListener('click', () => this.showSection('inventory'));
        document.getElementById('transferBtn').addEventListener('click', () => this.showSection('transfer'));
        document.getElementById('settingsBtn').addEventListener('click', () => this.showSection('settings'));

        // Scanner
        document.getElementById('startScan').addEventListener('click', () => this.startScanner());
        document.getElementById('stopScan').addEventListener('click', () => this.stopScanner());

        // Manual entry
        document.getElementById('manualEntryForm').addEventListener('submit', (e) => this.handleManualEntry(e));

        // Inventory filters
        document.getElementById('locationFilter').addEventListener('change', () => this.updateInventoryDisplay());
        document.getElementById('searchBox').addEventListener('input', () => this.updateInventoryDisplay());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportData());

        // Transfer
        document.getElementById('transferForm').addEventListener('submit', (e) => this.handleTransfer(e));

        // Settings
        document.getElementById('addLocationBtn').addEventListener('click', () => this.addLocation());
        document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
        document.getElementById('importFile').addEventListener('change', (e) => this.importData(e));
        document.getElementById('clearDataBtn').addEventListener('click', () => this.clearAllData());
        document.getElementById('expirationAlert').addEventListener('change', (e) => this.updateSettings(e));

        // Details Panel
        document.getElementById('closeDetailsBtn').addEventListener('click', () => {
            this.closeDetailsPanel();
        });
        
        document.getElementById('deleteItemBtn').addEventListener('click', () => {
            this.deleteItem(this.currentItemId);
        });
        
        document.getElementById('editItemBtn').addEventListener('click', () => {
            this.editItem(this.currentItemId);
        });

        // Close details panel with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !document.getElementById('itemDetailsPanel').classList.contains('hidden')) {
                this.closeDetailsPanel();
            }
        });
    }

    showSection(sectionName) {
        // Hide all sections
        document.querySelectorAll('.section').forEach(section => {
            section.classList.add('hidden');
        });

        // Remove active class from all nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Show selected section
        document.getElementById(sectionName + 'Section').classList.remove('hidden');
        document.getElementById(sectionName + 'Btn').classList.add('active');

        this.currentSection = sectionName;

        // Update displays when switching sections
        if (sectionName === 'inventory') {
            this.updateInventoryDisplay();
            this.updateStats();
        } else if (sectionName === 'transfer') {
            this.populateTransferItems();
        }
    }

    async checkCameraPermission() {
        try {
            if (navigator.permissions) {
                const permission = await navigator.permissions.query({ name: 'camera' });
                return permission.state !== 'denied';
            }
            return true; // Assume allowed if permissions API not available
        } catch (error) {
            console.warn('Could not check camera permission:', error);
            return true;
        }
    }

    async startScanner() {
        try {
            // Check camera permission first
            const hasPermission = await this.checkCameraPermission();
            if (!hasPermission) {
                alert('Camera access is required for scanning. Please enable camera access in your browser settings.');
                return;
            }

            // Clear any existing scanner
            if (this.scanner) {
                await this.scanner.clear();
                this.scanner = null;
            }

            this.scanner = new Html5QrcodeScanner("reader", {
                fps: 5,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0,
                rememberLastUsedCamera: true,
                showTorchButtonIfSupported: false,
                showZoomSliderIfSupported: false,
                supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.QR_CODE,
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.UPC_A
                ],
                experimentalFeatures: {
                    useBarCodeDetectorIfSupported: false
                },
                videoConstraints: {
                    width: { min: 320, ideal: 640, max: 800 },
                    height: { min: 240, ideal: 480, max: 600 },
                    frameRate: { ideal: 15, max: 30 },
                    facingMode: { ideal: "environment" } // Use back camera for scanning
                    // Remove advanced focus settings for older webcams
                }
            });

            this.scanner.render(
                (decodedText, decodedResult) => {
                    console.log('Successfully scanned:', decodedText);
                    this.handleScanResult(decodedText);
                    this.stopScanner();
                },
                (error) => {
                    // Only log errors that aren't just "no QR code found"
                    if (!error.includes('NotFoundException') && !error.includes('No MultiFormat Readers')) {
                        console.warn('QR Scanner error:', error);
                    }
                }
            );

            // Add manual focus functionality
            setTimeout(() => {
                const video = document.querySelector('#reader video');
                if (video) {
                    video.addEventListener('click', () => {
                        this.triggerManualFocus(video);
                    });
                    
                    // Add visual indicator for tap-to-focus
                    video.style.cursor = 'pointer';
                    video.title = 'Tap to focus';
                }
            }, 1000);

            document.getElementById('startScan').classList.add('hidden');
            document.getElementById('stopScan').classList.remove('hidden');
            document.getElementById('manualFocusBtn').classList.remove('hidden');
            document.getElementById('restartScannerBtn').classList.remove('hidden');
            document.getElementById('scannerStatus').classList.remove('hidden');
            
            // Show helpful message
            this.showNotification('Point camera at QR code or barcode to scan. Tap video or use Focus button if blurry.', 'info');
            
        } catch (error) {
            console.error('Scanner initialization error:', error);
            
            // More specific error messages
            if (error.name === 'NotAllowedError') {
                alert('Camera access denied. Please allow camera access and try again.');
            } else if (error.name === 'NotFoundError') {
                alert('No camera found. Please use manual entry.');
            } else if (error.name === 'NotSupportedError') {
                alert('Camera not supported on this device. Please use manual entry.');
            } else {
                alert('Camera error: ' + error.message + '. Please use manual entry.');
            }
            
            // Reset buttons
            document.getElementById('startScan').classList.remove('hidden');
            document.getElementById('stopScan').classList.add('hidden');
        }
    }

    async triggerManualFocus(video) {
        // For older webcams like A4Tech, manual focus often doesn't work
        // Instead, provide helpful guidance
        this.showNotification('For A4Tech webcams: Move barcode slowly closer/farther until clear', 'info');
        
        // Try basic constraint reset which sometimes helps
        try {
            const video = document.querySelector('#reader video');
            if (video && video.srcObject) {
                const stream = video.srcObject;
                const track = stream.getVideoTracks()[0];
                
                // Reset basic constraints
                await track.applyConstraints({
                    width: 640,
                    height: 480,
                    frameRate: 15
                });
                
                console.log('Camera constraints reset');
            }
        } catch (error) {
            console.warn('Could not reset camera constraints:', error);
        }
    }

    async restartScanner() {
        this.showNotification('Restarting camera...', 'info');
        await this.stopScanner();
        
        // Wait a moment before restarting
        setTimeout(() => {
            this.startScanner();
        }, 1000);
    }

    async stopScanner() {
        if (this.scanner) {
            try {
                await this.scanner.clear();
                console.log('Scanner cleared successfully');
            } catch (error) {
                console.warn('Error clearing scanner:', error);
            }
            this.scanner = null;
        }
        document.getElementById('startScan').classList.remove('hidden');
        document.getElementById('stopScan').classList.add('hidden');
        document.getElementById('manualFocusBtn').classList.add('hidden');
        document.getElementById('restartScannerBtn').classList.add('hidden');
        document.getElementById('scannerStatus').classList.add('hidden');
    }

    handleScanResult(decodedText) {
        // Pre-fill the manual entry form with scanned data
        document.getElementById('medicineCode').value = decodedText;
        
        // Try to fetch medicine info from barcode (you can integrate with medicine APIs)
        this.fetchMedicineInfo(decodedText);
        
        // Scroll to manual entry form
        document.querySelector('.manual-entry').scrollIntoView({ behavior: 'smooth' });
    }

    async fetchMedicineInfo(barcode) {
        // This is where you could integrate with medicine databases
        // For now, we'll just show the barcode
        console.log('Scanned barcode:', barcode);
        
        // You could integrate with APIs like:
        // - FDA NDC Database
        // - Open Food Facts (for some medicines)
        // - Custom medicine database
        
        // Placeholder logic - in real implementation, you'd make API calls
        if (barcode.length > 0) {
            // Auto-focus on medicine name field for user to enter
            document.getElementById('medicineName').focus();
        }
    }

    handleManualEntry(e) {
        e.preventDefault();
        
        const editingId = e.target.dataset.editingId;
        const formData = new FormData(e.target);
        const medicineData = {
            code: formData.get('medicineCode') || document.getElementById('medicineCode').value,
            name: formData.get('medicineName') || document.getElementById('medicineName').value,
            manufacturer: formData.get('manufacturer') || document.getElementById('manufacturer').value,
            quantity: parseInt(formData.get('quantity') || document.getElementById('quantity').value),
            expirationDate: formData.get('expirationDate') || document.getElementById('expirationDate').value,
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
                item.expirationDate === medicine.expirationDate
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
                item.manufacturer.toLowerCase().includes(searchTerm) ||
                item.code.toLowerCase().includes(searchTerm)
            );
        }

        const inventoryList = document.getElementById('inventoryList');
        inventoryList.innerHTML = '';

        if (filteredInventory.length === 0) {
            inventoryList.innerHTML = '<div class="no-items">No medicines found. Add some using the scanner or manual entry.</div>';
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
        
        const daysUntilExpiration = this.getDaysUntilExpiration(item.expirationDate);
        
        if (daysUntilExpiration < 0) {
            div.classList.add('expired');
        } else if (daysUntilExpiration <= this.settings.expirationAlert) {
            div.classList.add('expiring');
        }

        div.innerHTML = `
            <div class="item-info">
                <h4>${item.name}</h4>
                <p><strong>Code:</strong> ${item.code}</p>
                <p><strong>Manufacturer:</strong> ${item.manufacturer || 'Unknown'}</p>
                <p><strong>Expires:</strong> ${this.formatDate(item.expirationDate)} ${this.getExpirationStatus(daysUntilExpiration)}</p>
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
            const days = this.getDaysUntilExpiration(item.expirationDate);
            return days > 0 && days <= this.settings.expirationAlert;
        }).reduce((sum, item) => sum + item.quantity, 0);
        
        const expired = this.inventory.filter(item => {
            return this.getDaysUntilExpiration(item.expirationDate) < 0;
        }).reduce((sum, item) => sum + item.quantity, 0);

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
            <p><strong>Manufacturer:</strong> ${item.manufacturer || 'Unknown'}</p>
            <p><strong>Quantity:</strong> ${item.quantity}</p>
            <p><strong>Location:</strong> ${this.getLocationDisplayName(item.location)}</p>
            <p><strong>Expiration Date:</strong> ${this.formatDate(item.expirationDate)} ${this.getExpirationStatus(daysUntilExpiration)}</p>
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

        // Switch to scanner section and populate form
        this.showSection('scanner');
        
        // Populate the manual entry form with current item data
        document.getElementById('medicineCode').value = item.code;
        document.getElementById('medicineName').value = item.name;
        document.getElementById('manufacturer').value = item.manufacturer || '';
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

    checkBackupReminder() {
        const now = new Date();
        const lastReminder = this.settings.lastBackupReminder ? new Date(this.settings.lastBackupReminder) : null;
        const daysSinceReminder = lastReminder ? Math.floor((now - lastReminder) / (1000 * 60 * 60 * 24)) : 999;
        
        if (daysSinceReminder >= this.settings.backupReminderInterval && this.inventory.length > 0) {
            setTimeout(() => {
                if (confirm('📋 Backup Reminder: It\'s been a while since your last backup. Would you like to export your inventory data now?')) {
                    this.showSection('settings');
                    document.getElementById('exportBtn').style.animation = 'pulse 2s infinite';
                    this.showNotification('Click the Export button to backup your data', 'info');
                }
                this.settings.lastBackupReminder = now.toISOString();
                this.saveData();
            }, 2000); // Show after 2 seconds
        }
    }

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
        
        // Update last backup time
        this.settings.lastBackupReminder = new Date().toISOString();
        this.saveData();
        
        this.showNotification('✅ Data exported successfully! Store this file safely.', 'success');
        
        // Remove pulse animation
        document.getElementById('exportBtn').style.animation = '';
    }

    updateDataStatus() {
        const statusElement = document.getElementById('dataStatus');
        if (!statusElement) return;
        
        const itemCount = this.inventory.length;
        const totalQuantity = this.inventory.reduce((sum, item) => sum + item.quantity, 0);
        const lastBackup = this.settings.lastBackupReminder ? new Date(this.settings.lastBackupReminder) : null;
        
        if (itemCount === 0) {
            statusElement.textContent = '📊 No medicines stored';
            statusElement.style.background = 'rgba(255,255,255,0.2)';
        } else {
            const daysSinceBackup = lastBackup ? Math.floor((new Date() - lastBackup) / (1000 * 60 * 60 * 24)) : 999;
            
            if (daysSinceBackup > 7) {
                statusElement.textContent = `📊 ${itemCount} medicines (${totalQuantity} total) - ⚠️ Backup needed`;
                statusElement.style.background = 'rgba(255,193,7,0.8)';
            } else {
                statusElement.textContent = `📊 ${itemCount} medicines (${totalQuantity} total) - ✅ Recently backed up`;
                statusElement.style.background = 'rgba(40,167,69,0.8)';
            }
        }
    }
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
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('SW registered: ', registration);
            })
            .catch((registrationError) => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}
