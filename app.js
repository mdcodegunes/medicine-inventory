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
            unsub: null,
            saveTimer: null,
            clientId: Math.random().toString(36).slice(2),
            lastRemoteUpdate: null,
            status: 'init'
        };
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
            }
        } catch {}

        // Start cloud sync automatically when config+workspace are present
        this.maybeStartCloudSync(true);
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
        // Native scanner (ensure button exists even if HTML was cached)
        let nativeBtn = document.getElementById('nativeScanBtn');
        if (!nativeBtn) {
            nativeBtn = this.ensureNativeScanButton();
        }
        if (nativeBtn) {
            nativeBtn.addEventListener('click', () => this.startNativeScanner());
            // Show the button only if supported
            if ('BarcodeDetector' in window) {
                nativeBtn.classList.remove('hidden');
            } else {
                nativeBtn.classList.add('hidden');
            }
        }

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

        // Auto-backup UI removed

        // Cloud Sync UI removed; syncing is automatic. Keep share link helper via console.

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

    // Create Native Scanner button dynamically if missing (handles SW-cached HTML)
    ensureNativeScanButton() {
        try {
            const controls = document.querySelector('.scanner-controls');
            if (!controls) return null;
            const btn = document.createElement('button');
            btn.id = 'nativeScanBtn';
            btn.title = "Uses browser's built‑in barcode detector if available";
            btn.textContent = '🧪 Native Scanner (Beta)';
            btn.classList.add('hidden');
            // Insert before test button if present
            const testBtn = document.getElementById('testScanBtn');
            if (testBtn) {
                controls.insertBefore(btn, testBtn);
            } else {
                controls.appendChild(btn);
            }
            return btn;
        } catch (e) {
            console.warn('Could not inject native scan button:', e);
            return null;
        }
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
            console.log('Starting QR scanner...');
            
            // Check if Html5QrcodeScanner is available
            if (typeof Html5QrcodeScanner === 'undefined') {
                console.error('Html5QrcodeScanner is not loaded');
                alert('QR Scanner library not loaded. Please refresh the page and try again.');
                return;
            }
            
            // Check camera permission first
            const hasPermission = await this.checkCameraPermission();
            if (!hasPermission) {
                alert('Camera access is required for scanning. Please enable camera access in your browser settings.');
                return;
            }

            // Clear any existing scanner
            if (this.scanner) {
                try {
                    await this.scanner.clear();
                } catch (error) {
                    console.warn('Error clearing previous scanner:', error);
                }
                this.scanner = null;
            }
            // Ensure native scanner is stopped
            await this.stopNativeScanner();

            console.log('Initializing Html5QrcodeScanner...');
            
            // Check if required classes are available
            if (typeof Html5QrcodeScanType === 'undefined') {
                console.warn('Html5QrcodeScanType not available, using simple config');
            }
            if (typeof Html5QrcodeSupportedFormats === 'undefined') {
                console.warn('Html5QrcodeSupportedFormats not available, using simple config');
            }
            
            // Optimized configuration for Data Matrix and small QR codes
            const config = {
                fps: 15, // Higher fps for better Data Matrix detection
                qrbox: { width: 350, height: 350 }, // Even larger detection box for small codes
                aspectRatio: 1.0,
                rememberLastUsedCamera: true,
                showTorchButtonIfSupported: true,
                showZoomSliderIfSupported: true,
                verbose: true, // Enable verbose logging
                disableFlip: false // Allow flipped detection
            };
            
            // Add ALL supported scan types for maximum compatibility
            if (typeof Html5QrcodeScanType !== 'undefined') {
                config.supportedScanTypes = [Html5QrcodeScanType.SCAN_TYPE_CAMERA];
            }
            
            // Prioritize Data Matrix and QR codes for medicine packaging
            if (typeof Html5QrcodeSupportedFormats !== 'undefined') {
                config.formatsToSupport = [
                    Html5QrcodeSupportedFormats.DATA_MATRIX, // Your code format - prioritize this!
                    Html5QrcodeSupportedFormats.QR_CODE,
                    Html5QrcodeSupportedFormats.AZTEC,
                    Html5QrcodeSupportedFormats.PDF_417,
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.CODE_39,
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E,
                    Html5QrcodeSupportedFormats.CODABAR,
                    Html5QrcodeSupportedFormats.CODE_93,
                    Html5QrcodeSupportedFormats.MAXICODE,
                    Html5QrcodeSupportedFormats.ITF,
                    Html5QrcodeSupportedFormats.RSS_14,
                    Html5QrcodeSupportedFormats.RSS_EXPANDED,
                    Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION
                ];
                console.log('📱 Scanner configured for Data Matrix codes (like yours!)');
            } else {
                // Fallback: don't specify formats, let the library detect automatically
                console.log('Using automatic format detection for Data Matrix and other codes');
            }
            
            // Optimized video constraints for Data Matrix detection
            config.videoConstraints = {
                width: { min: 640, ideal: 1280, max: 1920 }, // Higher resolution crucial for small Data Matrix
                height: { min: 480, ideal: 720, max: 1080 },
                frameRate: { ideal: 15, max: 20 }, // Good framerate for Data Matrix
                facingMode: { ideal: "environment" }, // Use back camera for scanning
                // Advanced settings for better focus on small codes
                focusMode: { ideal: "continuous" },
                whiteBalanceMode: { ideal: "continuous" }
            };
            
            // Enable experimental features for better Data Matrix detection
            config.experimentalFeatures = {
                useBarCodeDetectorIfSupported: true // Use native barcode detector if available
            };
            
            console.log('Scanner config:', config);
            this.scanner = new Html5QrcodeScanner("reader", config);

            console.log('Rendering scanner...');
            this.scanner.render(
                // Success callback - this should fire when a QR code is detected
                (decodedText, decodedResult) => {
                    console.log('🎉🎉🎉 QR CODE SCAN SUCCESS! 🎉🎉🎉');
                    console.log('Decoded text:', decodedText);
                    console.log('Decoded result object:', decodedResult);
                    console.log('Text length:', decodedText ? decodedText.length : 'undefined');
                    console.log('Text type:', typeof decodedText);
                    
                    // IMPORTANT: Alert to make sure we see this in any case
                    alert(`QR Code Scanned Successfully: ${decodedText}`);
                    
                    // Show immediate feedback
                    this.showNotification(`✅ Scanned: ${decodedText}`, 'success');
                    
                    // Reset error counters
                    this.multiFormatErrorCount = 0;

                    // Handle the scan result
                    this.handleScanResult(decodedText);
                    
                    // Stop scanner after successful scan
                    setTimeout(() => {
                        this.stopScanner();
                    }, 2000); // Brief delay to show the success message
                },
                // Error callback - this fires continuously while scanning
                (error) => {
                    const errorString = error ? error.toString() : 'Unknown error';
                    
                    // Handle specific "No MultiFormat Readers" error
                    if (errorString.includes('No MultiFormat Readers')) {
                        console.log('📱 Scanner detected something but cannot decode format. Try:');
                        console.log('- Better lighting');
                        console.log('- Hold barcode steadier');
                        console.log('- Different angle/distance');
                        console.log('- Make sure barcode is not damaged');
                        
                        // Show user-friendly guidance (but not too frequently)
                        if (!this.lastMultiFormatError || Date.now() - this.lastMultiFormatError > 2000) {
                            this.showNotification('📱 Data Matrix detected! Get closer & hold steady.', 'warning');
                            this.lastMultiFormatError = Date.now();
                            
                            // Show scanning tips
                            const tipsElement = document.getElementById('scannerTips');
                            if (tipsElement) {
                                tipsElement.style.display = 'block';
                                // Hide tips after 10 seconds for Data Matrix (needs more time)
                                setTimeout(() => {
                                    tipsElement.style.display = 'none';
                                }, 10000);
                            }
                        }

                        // Increment error counter and auto-fallback to native after threshold
                        this.multiFormatErrorCount++;
                        if (this.multiFormatErrorCount >= 12 && 'BarcodeDetector' in window) {
                            this.showNotification('🔄 Switching to Native Scanner for Data Matrix…', 'info');
                            // Avoid loop: stop this scanner and start native
                            this.stopScanner().then(() => this.startNativeScanner());
                        }
                        return;
                    }
                    
                    // Only log other errors that aren't just "no QR code found"
                    if (!errorString.includes('NotFoundException') && 
                        !errorString.includes('QR code not found') &&
                        !errorString.includes('No code found') &&
                        !errorString.includes('Code not found')) {
                        console.warn('QR Scanner error:', error);
                    }
                }
            );

            console.log('Scanner rendered successfully');
            
            // Add manual focus functionality
            setTimeout(() => {
                const video = document.querySelector('#reader video');
                if (video) {
                    console.log('Video element found, adding click listener');
                    video.addEventListener('click', () => {
                        this.triggerManualFocus(video);
                    });
                    
                    // Add visual indicator for tap-to-focus
                    video.style.cursor = 'pointer';
                    video.title = 'Tap to focus';
                } else {
                    console.warn('Video element not found in #reader');
                }
            }, 1000);

            // Update UI
            document.getElementById('startScan').classList.add('hidden');
            document.getElementById('stopScan').classList.remove('hidden');
            document.getElementById('manualFocusBtn').classList.remove('hidden');
            document.getElementById('restartScannerBtn').classList.remove('hidden');
            document.getElementById('scannerStatus').classList.remove('hidden');
            
            console.log('Scanner UI updated, scanner is ready');
            
            // Show helpful message
            this.showNotification('🎯 Scanner ready! Point camera at QR code or barcode.', 'info');
            
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
        this.scannerRetryCount = 0; // Reset retry count
        await this.stopScanner();
        
        // Wait a moment before restarting
        setTimeout(() => {
            this.startScanner();
        }, 1000);
    }

    // Test function to simulate a successful scan
    testScanResult() {
        console.log('🧪 Testing scan result processing...');
        const testBarcode = '1234567890123'; // Test EAN-13 barcode
        this.showNotification('🧪 Testing with sample barcode...', 'info');
        
        // Simulate the scan success callback
        setTimeout(() => {
            console.log('🎉🎉🎉 TEST QR CODE SCAN SUCCESS! 🎉🎉🎉');
            console.log('Test decoded text:', testBarcode);
            
            // Show alert like real scan
            alert(`Test QR Code Scanned Successfully: ${testBarcode}`);
            
            // Process like real scan
            this.handleScanResult(testBarcode);
        }, 500);
    }

    // Test function to simulate a successful QR scan
    testScanResult() {
        console.log('🧪 Testing QR scan result processing...');
        const testBarcode = '1234567890123';
        console.log('Simulating scan of test barcode:', testBarcode);
        
        // Simulate the exact same flow as a real scan
        this.showNotification(`🧪 Test scan: ${testBarcode}`, 'info');
        this.handleScanResult(testBarcode);
    }

    async stopScanner() {
        // Stop html5-qrcode scanner
        if (this.scanner) {
            try {
                await this.scanner.clear();
                console.log('Scanner cleared successfully');
            } catch (error) {
                console.warn('Error clearing scanner:', error);
            }
            this.scanner = null;
        }
        // Stop native scanner if running
        await this.stopNativeScanner();
        document.getElementById('startScan').classList.remove('hidden');
        document.getElementById('stopScan').classList.add('hidden');
        document.getElementById('manualFocusBtn').classList.add('hidden');
        document.getElementById('restartScannerBtn').classList.add('hidden');
        document.getElementById('scannerStatus').classList.add('hidden');
    }

    // -------------------------
    // Native BarcodeDetector fallback (great for Data Matrix)
    // -------------------------
    async startNativeScanner() {
        try {
            if (!('BarcodeDetector' in window)) {
                this.showNotification('BarcodeDetector not supported in this browser.', 'error');
                return;
            }

            // Stop other scanners first
            if (this.scanner) {
                try { await this.scanner.clear(); } catch {}
                this.scanner = null;
            }
            await this.stopNativeScanner();

            // Setup UI container
            const reader = document.getElementById('reader');
            reader.innerHTML = '';

            // Create video element
            const video = document.createElement('video');
            video.setAttribute('autoplay', '');
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', '');
            video.style.width = '100%';
            video.style.maxWidth = '480px';
            video.style.borderRadius = '8px';
            reader.appendChild(video);
            this.nativeVideo = video;

            // Start camera
            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 15, max: 20 },
                    facingMode: { ideal: 'environment' }
                },
                audio: false
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.nativeStream = stream;
            video.srcObject = stream;
            await new Promise((res) => video.onloadedmetadata = () => res());
            await video.play();

            // Init detector prioritizing Data Matrix
            const supported = (await window.BarcodeDetector.getSupportedFormats?.()) || [];
            console.log('Native BarcodeDetector supported formats:', supported);
            const wanted = ['data_matrix', 'qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_39'];
            const formats = supported.length ? wanted.filter(f => supported.includes(f)) : wanted;
            this.nativeDetector = new window.BarcodeDetector({ formats });
            this.showNotification('🎯 Native scanner started (optimized for Data Matrix)…', 'info');

            // UI buttons
            document.getElementById('startScan').classList.add('hidden');
            document.getElementById('stopScan').classList.remove('hidden');
            document.getElementById('manualFocusBtn').classList.remove('hidden');
            document.getElementById('restartScannerBtn').classList.remove('hidden');
            document.getElementById('scannerStatus').classList.remove('hidden');

            // Scan loop
            const scan = async () => {
                try {
                    const barcodes = await this.nativeDetector.detect(video);
                    if (barcodes && barcodes.length) {
                        const best = barcodes[0];
                        const value = best.rawValue || '';
                        console.log('Native detected:', best.format, value);
                        alert(`Detected (${best.format}): ${value}`);
                        this.showNotification(`✅ ${best.format.toUpperCase()} scanned`, 'success');
                        this.handleScanResult(value);
                        await this.stopScanner();
                        return;
                    }
                } catch (err) {
                    // Ignore transient detection errors
                }
                this.nativeScanRAF = requestAnimationFrame(scan);
            };
            this.nativeScanRAF = requestAnimationFrame(scan);
        } catch (error) {
            console.error('Native scanner error:', error);
            this.showNotification('Native scanner failed. Falling back to standard scanner.', 'error');
            // Try html5 scanner as fallback
            await this.startScanner();
        }
    }

    async stopNativeScanner() {
        if (this.nativeScanRAF) {
            cancelAnimationFrame(this.nativeScanRAF);
            this.nativeScanRAF = null;
        }
        if (this.nativeVideo) {
            try { this.nativeVideo.pause(); } catch {}
            this.nativeVideo.srcObject = null;
            this.nativeVideo = null;
        }
        if (this.nativeStream) {
            try {
                this.nativeStream.getTracks().forEach(t => t.stop());
            } catch {}
            this.nativeStream = null;
        }
        this.nativeDetector = null;
    }

    handleScanResult(decodedText) {
        console.log('🔄 Processing scan result:', decodedText);
        console.log('Raw scan data type:', typeof decodedText);
        console.log('Raw scan data length:', decodedText ? decodedText.length : 'null/undefined');
        
        // Clean the scanned text (remove any whitespace)
        const cleanedText = decodedText ? decodedText.trim() : '';
        
        if (!cleanedText) {
            console.error('❌ Empty or invalid scan result');
            this.showNotification('❌ Empty scan result. Please try again.', 'error');
            return;
        }
        
        // Try to parse GS1 Data Matrix with AIs like (01)(21)
        const gs1 = this.parseGs1(cleanedText);
        let displayCode = cleanedText;
        if (gs1 && (gs1.gtin || gs1.serial)) {
            displayCode = gs1.gtin ? (gs1.serial ? `${gs1.gtin}-${gs1.serial}` : gs1.gtin) : cleanedText;
            console.log('Parsed GS1:', gs1);
        }
        
        try {
            // Pre-fill the manual entry form with scanned data (prefer GTIN-serial)
            const medicineCodeInput = document.getElementById('medicineCode');
            if (medicineCodeInput) {
                medicineCodeInput.value = displayCode;
                medicineCodeInput.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('Medicine code field updated with:', displayCode);
            } else {
                console.error('Medicine code input field not found');
            }
            
            // Show success notification with the parsed data
            if (gs1 && (gs1.gtin || gs1.serial)) {
                const parts = [`GTIN: ${gs1.gtin || 'n/a'}`];
                if (gs1.serial) parts.push(`Serial: ${gs1.serial}`);
                this.showNotification(`📦 GS1 scanned • ${parts.join(' • ')}`, 'success');
            } else {
                this.showNotification(`📱 Code scanned: ${cleanedText}`, 'success');
            }
            
            // Try to fetch medicine info from barcode
            this.fetchMedicineInfo(displayCode);
            
            // Scroll to manual entry form and focus on medicine name field
            const manualEntry = document.querySelector('.manual-entry');
            if (manualEntry) {
                manualEntry.scrollIntoView({ behavior: 'smooth' });
                
                // Focus on medicine name field after a short delay
                setTimeout(() => {
                    const medicineNameInput = document.getElementById('medicineName');
                    if (medicineNameInput) {
                        medicineNameInput.focus();
                    }
                }, 500);
            }
            
        } catch (error) {
            console.error('Error handling scan result:', error);
            this.showNotification('❌ Error processing scan result. Please try manual entry.', 'error');
        }
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
        // Push to cloud (debounced) if enabled
        if (this.settings.cloudSync?.enabled && typeof this.debouncedCloudSave === 'function') {
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
            // Use the named app instance to get Firestore (avoids missing [DEFAULT] app error)
            this.cloud.db = this.cloud.app.firestore();
            const docRef = this.cloud.db.collection('workspaces').doc(cs.workspaceId);

            // Basic connectivity read (helps expose permission errors early)
            try {
                await docRef.get();
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
                // Merge remote state
                if (Array.isArray(data.inventory)) this.inventory = data.inventory;
                if (Array.isArray(data.locations)) this.locations = data.locations;
                if (Array.isArray(data.transfers)) this.transfers = data.transfers;
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
            }, (err) => console.warn('Cloud sync listener error:', err));

            // Prepare debounced save
            this.debouncedCloudSave = this.debounce(async () => {
                try {
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

    async ensureFirebaseLoaded() {
        if (window.firebase?.firestore) return;
        try {
            await this.loadScript('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
            await this.loadScript('https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js');
        } catch (e) {
            console.warn('Failed to load Firebase SDK:', e);
            this.showNotification('Failed to load Firebase SDK. Check network and CSP.', 'error');
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
