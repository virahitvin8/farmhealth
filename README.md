<div align="center">

# 🛰️ FarmHealth — Satellite Crop Monitor

### *Advanced Satellite Vision for Precision Agriculture*

**Real-time, pixel-level crop health monitoring and analytics — straight from space to your pocket 🛰️🌾**

<br>

![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=for-the-badge&logo=leaflet&logoColor=white)
![Sentinel Hub](https://img.shields.io/badge/Sentinel_Hub-004488?style=for-the-badge&logo=esa&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)

</div>

---

## 📋 Table of Contents

- [✨ Features](#-features)
- [🛰️ How It Works](#️-how-it-works)
- [🚀 Quick Start](#-quick-start)
- [🔐 Authentication](#-authentication)
- [📡 Satellite Data Sources](#-satellite-data-sources)
- [🗺️ Map Layers & Indices](#️-map-layers--indices)
- [🌍 Deployment](#-deployment)
- [📁 Project Structure](#-project-structure)
- [🔧 Troubleshooting](#-troubleshooting)
- [📜 License](#-license)

---

## ✨ Features

FarmHealth brings the power of multi-spectral satellites directly to farmers and researchers with:

| | Feature | Description | Powered By |
|---|---|---|---|
| 🛰️ | **Multi-Satellite Analysis** | Sentinel-2, Sentinel-1 SAR, and Landsat-8 Thermal | ESA + NASA |
| 🌿 | **7 Crop Health Indices** | NDVI, EVI, NDWI, GNDVI, NDRE, SAVI, NDMI | Sentinel Hub API |
| 🌾 | **Yield Prediction** | Real-time yield projection per hectare | JS Algorithm |
| 🐛 | **Pest Risk Anomaly** | Flagging sudden Red-Edge/NIR drops | Evalscript |
| 🌡️ | **Thermal Stress (TVDI)** | Land Surface Temperature via Landsat-8 | Landsat L1C |
| 💧 | **Field Moisture (SAR)** | Soil moisture index via radar backscatter (works through clouds!) | Sentinel-1 GRD |
| 🤖 | **AI Agronomist** | Gemini-powered AI field advice | Google Gemini API |
| 🌤️ | **Live Weather** | 7-day forecast, soil temp/moisture, evapotranspiration | Open-Meteo |
| ⛰️ | **Terrain Analysis** | Elevation, slope, drainage class | Open-Meteo |
| 🌱 | **Soil Properties** | pH, organic carbon, texture, nitrogen | SoilGrids |
| 📱 | **Progressive Web App** | Installs as native app on mobile | PWA + Capacitor |
| 🔐 | **Role-based Access** | Admin & User roles to protect API credentials | Secure UI |
| 📊 | **Time Series & Change Detection** | Track NDVI changes over time | Sentinel Hub Stats |
| 🚇 | **Guided Onboarding** | Step-by-step tour for new users | Interactive UI |

---

## 🛰️ How It Works

```
📍 Draw/Select Field → 🛰️ Fetch Satellite Data → 📊 Compute Indices
                                                         ↓
                               ┌──────────────────────────┐
                               │  • NDVI (Vegetation)     │
                               │  • NDMI (Moisture)       │
                               │  • EVI (Dense Canopy)    │
                               │  • SAR (Soil Moisture)   │
                               │  • TVDI (Thermal Stress) │
                               └──────────────────────────┘
                                                         ↓
                               🌤️ Weather + ⛰️ Terrain + 🌱 Soil
                                                         ↓
                               🤖 AI Advice → 📱 Dashboard
```

### Data Pipeline

1. **Field Selection** — Enter coordinates, click on map, upload KML/GeoJSON, or walk with GPS
2. **Scene Discovery** — Searches Sentinel-2 archives via STAC API for recent cloud-free scenes
3. **Satellite Processing** — Computes vegetation indices using Sentinel Hub Process API or Google Earth Engine
4. **Weather & Soil** — Fetches live weather (7-day forecast), terrain elevation, and soil properties
5. **AI Analysis** — Gemini-powered personalized agronomic advice based on your specific field data
6. **Reporting** — Generates health report with yield projection, pest risk, alerts, and change detection

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18 or later
- **npm** (comes with Node.js)
- A modern web browser (Chrome, Firefox, Edge)

### Local Setup

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/farmhealth.git
cd farmhealth

# 2. Install frontend dependencies (for Capacitor/PWA)
npm install

# 3. Install server dependencies
cd server
npm install
cd ..

# 4. Start the server
node server/server.js
```

The server will start at **http://localhost:3001**. Open this URL in your browser.

### Using the App

1. **Select your field** — Enter GPS coordinates, click on the map, upload a KML/GeoJSON file, or use GPS walk mode
2. **Choose your crop** — Select from 12 crop types and growth stage
3. **Run Analysis** — Click "Run Full Analysis" to fetch real satellite data
4. **View Reports** — Check health scores, maps, weather data, and AI advice
5. **Get AI Insights** — Add your Gemini API key in Settings, then click "Get AI Analysis"
6. **Export Data** — Download CSV time series, GeoJSON boundary, or copy report

### Build for Production

```bash
# Run the Linux/Mac build script
./build.sh

# Or for Windows
# .\build-web.ps1

# The built files will be in the www/ directory
```

---

## 🔐 Authentication

FarmHealth includes a dual-role mock authentication system:

| Role | Username | Password | Privileges |
|------|----------|----------|------------|
| **Admin** | `admin` | `admin` | Full access. Can view & edit API keys in Settings. |
| **User** | `user` | `user` | Full platform features, but API keys are hidden. |

### API Keys Setup

For full functionality, configure these in Settings after logging in as Admin:

1. **Gemini API Key** — Get from [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Used for AI-powered field advice
   - Paste in Settings → Gemini API Key

2. **Sentinel Hub Credentials** (optional override)
   - Default credentials are pre-configured
   - Override in Settings if needed

---

## 📡 Satellite Data Sources

| Source | Satellite | Type | Resolution | Revisit | Bands Used |
|--------|-----------|------|-----------|---------|------------|
| **Sentinel Hub** | Sentinel-2 (ESA) | Multispectral | 10m (visible), 20m (red edge/SWIR) | 5 days | B2, B3, B4, B5, B8, B11 |
| **Sentinel Hub** | Landsat-8 (NASA) | Thermal | 30m (thermal 100m) | 16 days | B4, B5, B10 (TIRS) |
| **Sentinel Hub** | Sentinel-1 (ESA) | SAR Radar | 10m | 6-12 days | VV, VH polarization |
| **Google Earth Engine** | Sentinel-2 L2A | Multispectral | 10m | 5 days | B2-B8, B11, B12 |
| **STAC API** | Sentinel-2 L2A | Scene Catalog | — | — | Metadata search |
| **Open-Meteo** | — | Weather | 1km | Hourly | Temperature, precip, wind, humidity |

---

## 🗺️ Map Layers & Indices

### Vegetation Health
- **NDVI** — General vegetation greenness (Red + NIR)
- **EVI** — Enhanced for dense canopies (corrects for atmosphere)
- **SAVI** — Soil-adjusted for sparse vegetation
- **GNDVI** — Chlorophyll/nitrogen assessment (Green + NIR)
- **NDRE** — Red Edge for mid-to-late season monitoring

### Moisture & Water Stress
- **NDMI** — Leaf water content (NIR + SWIR)
- **NDWI** — Open water detection (Green + NIR)
- **SMMI** — Soil moisture via SAR radar (works through clouds!)

### Advanced Analytics
- **Pest/Disease Anomaly** — Red-Edge/NIR drop detection
- **TVDI** — Thermal Vegetation Dryness Index (Landsat thermal)

---

## 🌍 Deployment

### Docker (Google Cloud Run Ready)

```bash
# Build the Docker image
docker build -t farmhealth .

# Run locally
docker run -p 8080:8080 farmhealth

# Deploy to Google Cloud Run
gcloud run deploy farmhealth \
  --image gcr.io/your-project/farmhealth \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

### Deploy Script (Windows PowerShell)

```powershell
.\deploy.ps1 -ProjectId "your-project-id" -Region "us-central1"
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3001) | No |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to GCloud service account JSON | For GEE proxy |
| `NODE_ENV` | `production` or `development` | No |

---

## 📁 Project Structure

```
farmhealth/
├── index.html           # Main application page
├── manifest.json        # PWA manifest
├── sw.js                # Service worker (offline support)
├── Dockerfile           # Docker configuration
├── build.sh             # Linux/Mac build script
├── build-web.ps1        # Windows build script (PowerShell)
├── deploy.ps1           # Google Cloud Run deploy script
├── .env.example         # Example environment variables
├── .gitignore           # Git ignore rules
├── package.json         # Frontend dependencies (Capacitor)
├── css/
│   └── style.css        # Complete design system (700+ lines)
├── js/
│   ├── config.js        # Configuration, credentials, constants
│   ├── utils.js         # Shared utilities (DOM, geometry, fetch)
│   ├── api.js           # External API integration module
│   ├── map.js           # Leaflet map operations module
│   ├── ui.js            # UI rendering module
│   ├── analysis.js      # Analysis pipeline module
│   └── app.js           # Orchestrator (exposes FH global API)
└── server/
    ├── server.js        # GEE proxy server (Express)
    └── package.json     # Server dependencies
```

### Architecture

The frontend follows a **modular architecture** with clear separation of concerns:

| Module | Responsibility |
|--------|---------------|
| `config.js` | Constants, API endpoints, crop profiles, thresholds |
| `utils.js` | DOM helpers, geometry functions, fetch wrapper |
| `api.js` | All external API calls (Sentinel Hub, GEE, Weather, Soil, AI) |
| `map.js` | Leaflet map, drawing, GPS, KML import |
| `ui.js` | All rendering, modals, learning module, onboarding |
| `analysis.js` | Analysis pipeline orchestration, yield, alerts, reports |
| `app.js` | Initialization, state management, public FH API |

---

## 🔧 Troubleshooting

### Common Issues

**🚫 "Sentinel Hub credentials missing"**
- Default credentials should work. If they don't, log in as Admin (admin/admin) and override in Settings.

**🚫 "No scenes found"**
- Try increasing the cloud cover threshold (Settings → Cloud Cover Threshold — up to 50%)
- Increase search months (Settings → Search Months — up to 6)
- Ensure your coordinates are in a region with Sentinel-2 coverage

**🚫 Server won't start**
- Check Node.js version: `node --version` (requires v18+)
- Run `cd server && npm install` to install dependencies
- Ensure port 3001 is not in use: `lsof -i :3001`

**🚫 AI advice not working**
- Add your Gemini API key in Settings (gear icon)
- Get a free key at https://aistudio.google.com/app/apikey

**🚫 Map not loading**
- Check internet connection
- Clear browser cache and reload
- Leaflet CDN might be blocked — check browser console

**🚫 GPS not working**
- Enable location services in your browser settings
- Use HTTPS or localhost (GPS requires secure context)
- Try "Click Map" mode instead

**🚫 Analysis hangs on "Fetching satellite data"**
- Check internet connection
- The Sentinel Hub API might be rate-limited — wait 1 minute and retry
- Try a different field location

---

## 📜 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Made with ❤️ for Global Agriculture** 🌾🛰️

**FarmHealth v2.0** — *Satellite Vision for Every Field*

[⬆ Back to Top](#-farmhealth--satellite-crop-monitor)

</div>
