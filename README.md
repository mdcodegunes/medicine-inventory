# 🏥 Medicine Inventory Manager

A comprehensive web-based medicine inventory management system with QR/barcode scanning, multi-location tracking, and cloud storage options.

## 🌟 Features

### 📱 **QR/Barcode Scanner**
- Camera-based scanning using HTML5 QR Code library
- Manual entry option for when camera is not available
- Support for multiple barcode formats (QR, UPC, EAN, Code 128, etc.)
- Optimized for various camera types including older webcams

### 📋 **Inventory Management**
- Track medicines across multiple locations (Store, Car 1, Car 2, Home, Custom locations)
- Monitor expiration dates with visual alerts
- Search and filter functionality
- Detailed item information with sliding details panel
- Color-coded expiration warnings

### ⏰ **Expiration Tracking**
- Visual indicators for expired and expiring medicines
- Customizable expiration alert threshold (7, 14, 30, or 60 days)
- Statistics dashboard showing totals and alerts
- Automatic calculations for days until expiration

### 🔄 **Transfer System**
- Move medicines between locations
- Transfer history tracking
- Automatic quantity management
- Prevent transfers to same location

### ⚙️ **Data Management & Cloud Storage**
- Local storage for offline functionality
- Export data as JSON for backup
- Import data from JSON files
- GitHub Pages compatible for cloud access
- Progressive Web App (PWA) support

## 🚀 Quick Start Options

### Option 1: GitHub Pages (Recommended - Cloud Access)
1. **Fork this repository** or create new repo with these files
2. **Enable GitHub Pages** in repository settings (Settings → Pages → Source: Deploy from branch → main)
3. **Access your app** at `https://yourusername.github.io/medicine-inventory`
4. **Install as PWA** on mobile devices (Add to Home Screen)
5. **Data persists** across devices when using same browser

### Option 2: Local Development
```bash
# Clone the repository
git clone https://github.com/yourusername/medicine-inventory.git
cd medicine-inventory

# Start local server (choose one)
python -m http.server 8000
# OR
npx http-server
# OR  
php -S localhost:8000

# Open browser
http://localhost:8000
```

### Option 3: Direct File Access
1. Download all files to a folder
2. Open `index.html` in a modern web browser
3. Allow camera access when prompted

## 💾 Data Storage & Backup

### 🔒 Local Storage (Default)
- All data stored in browser's localStorage
- Persists between sessions
- Works offline after first load
- Device and browser specific

### ☁️ Cloud Backup Strategies

#### Method 1: Manual Export/Import
1. **Settings → Export Data** regularly (weekly recommended)
2. Save JSON file to cloud storage (Google Drive, Dropbox, OneDrive)
3. **Import** on other devices or after browser reset
4. **Best for**: Personal use, data control

#### Method 2: GitHub Pages + Manual Backup
1. Host app on GitHub Pages
2. Create `backups/` folder in your repository
3. Upload exported JSON files to GitHub
4. **Best for**: Access from anywhere, version control

#### Method 3: Browser Sync
1. Enable Chrome/Edge/Firefox sync
2. localStorage may sync across devices
3. **Best for**: Same browser ecosystem users

### 📅 Recommended Backup Schedule
- **Weekly**: Export data as JSON
- **Before major changes**: Browser updates, device changes
- **Monthly**: Clean up old expired medicines

## 🎯 How to Use

### Adding Medicine
1. **📱 Scan Item** → Start Scanner → Point at barcode
2. **OR** use manual entry form
3. Fill in details (name, quantity, expiration, location)
4. **Add to Inventory**

### Managing Inventory
1. **📋 Inventory** section shows all medicines
2. **Filter** by location or search by name
3. **Click item** to view details in sliding panel
4. **Edit/Delete** from details panel
5. **Color codes**: Red=expired, Orange=expiring soon

### Transferring Medicine
1. **🔄 Transfer** section
2. Select medicine and quantities
3. Choose from/to locations
4. View transfer history

### Data Management
1. **⚙️ Settings** section
2. **Export Data** for backup
3. **Import Data** to restore
4. **Add/Remove** locations
5. **Adjust** expiration alerts

## 📱 Mobile Installation (PWA)

1. Open app in mobile browser
2. **Add to Home Screen** when prompted
3. Use like native app
4. Works offline
5. Push notifications for expiring medicines

## 🔧 Camera Compatibility

### ✅ Tested Devices
- iPhone/Android cameras
- Laptop built-in cameras  
- USB webcams (including A4Tech PK-910H)
- External cameras

### 💡 Camera Tips
- **Bright lighting** essential
- **8-12 inches** from barcode
- **Hold steady** for 2-3 seconds
- **Manual entry** always available as backup

## 🌐 Browser Support

| Browser | Camera | PWA | Storage | Rating |
|---------|--------|-----|---------|--------|
| Chrome  | ✅ | ✅ | ✅ | ⭐⭐⭐⭐⭐ |
| Edge    | ✅ | ✅ | ✅ | ⭐⭐⭐⭐⭐ |
| Firefox | ✅ | ✅ | ✅ | ⭐⭐⭐⭐ |
| Safari  | ✅ | ✅ | ✅ | ⭐⭐⭐⭐ |

## 🛠️ Technologies

- **Frontend**: HTML5, CSS3, JavaScript ES6+
- **Scanner**: html5-qrcode library
- **Storage**: localStorage API
- **PWA**: Service Worker, Web App Manifest
- **Hosting**: GitHub Pages compatible

## 🔒 Privacy & Security

- ✅ **Local-first**: All data in your browser
- ✅ **No tracking**: No analytics or external calls
- ✅ **Camera privacy**: Only for scanning, no storage
- ✅ **Your data**: You control exports and backups
- ✅ **Open source**: Fully transparent code

## 📁 Repository Structure

```
medicine-inventory/
├── index.html          # Main application
├── styles.css          # Styling and responsive design
├── app.js             # Core functionality
├── manifest.json      # PWA manifest
├── sw.js             # Service worker
├── README.md         # Documentation
└── .github/
    └── copilot-instructions.md
```

## 🚀 GitHub Setup Guide

### Step 1: Create Repository
```bash
# Create new repository on GitHub
# Name: medicine-inventory
# Public/Private: Your choice
# Initialize with README: No (we have one)
```

### Step 2: Upload Files
```bash
git clone https://github.com/yourusername/medicine-inventory.git
cd medicine-inventory

# Copy all files from your local project
# Then commit
git add .
git commit -m "Initial medicine inventory app"
git push origin main
```

### Step 3: Enable GitHub Pages
1. Go to repository **Settings**
2. Scroll to **Pages** section
3. **Source**: Deploy from a branch
4. **Branch**: main
5. **Save**
6. Wait 2-3 minutes for deployment

### Step 4: Access Your App
- **URL**: `https://yourusername.github.io/medicine-inventory`
- **Bookmark** for easy access
- **Share** with family/colleagues
- **Install** as PWA on mobile

## 🆘 Troubleshooting

### Data Loss Prevention
```javascript
// Backup before clearing browser data
// Export from Settings regularly
// Keep JSON files in multiple locations
```

### Common Issues
- **Camera fails**: Try different browser, check permissions
- **Data missing**: Import from recent backup
- **App won't load**: Clear cache, check internet for first load
- **Scanning issues**: Use bright light, manual entry as backup

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature-name`
3. Make changes and test
4. Commit: `git commit -m "Add feature"`
5. Push: `git push origin feature-name`
6. Create Pull Request

## 📄 License

MIT License - Feel free to use, modify, and distribute.

---

**🏥 Keep your medicines organized, track expiration dates, and never lose inventory data again!**

*Built with modern web technologies for reliability and ease of use.*
