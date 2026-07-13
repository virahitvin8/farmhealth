/* ═══════════════════════════════════════════════════════════
   FarmHealth — Backend Server
   ═══════════════════════════════════════════════════════════
   Serves the static frontend and provides API endpoints.
   Google Earth Engine integration is optional — if the
   native module fails to load, the server still works and
   the frontend falls back to simulated/sentinel-hub data.
   
   Run: node server/server.js
   ═══════════════════════════════════════════════════════════ */

const express = require('express');
const cors = require('cors');
const path = require('path');

// ─── Google Earth Engine (optional) ───
// The @google/earthengine package has native dependencies that may
// fail on cloud platforms. We catch the error so the server still runs.
let geeAvailable = false;
let ee = null;
let geeInit = null;

try {
  const gee = require('@google/earthengine');
  ee = gee.ee;
  geeInit = gee.initialize;
  geeAvailable = true;
  console.log('[GEE] Earth Engine module loaded successfully');
} catch (e) {
  console.warn('[GEE] Earth Engine module not available:', e.message);
  console.warn('[GEE] Server will start without GEE support. Frontend uses Sentinel Hub / simulated data.');
}

// ─── Configuration ───
const PORT = process.env.PORT || 3001;
const GCLOUD_CREDENTIALS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(process.env.HOME || '/root', '.config', 'gcloud', 'application_default_credentials.json');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ─── Serve Static Frontend ───
app.use(express.static(path.join(__dirname, '..')));

// ─── GEE Authentication State ───
let geeInitialized = false;
let geeInitializing = false;

async function initGEE() {
  if (!geeAvailable) return false;
  if (geeInitialized) return true;
  if (geeInitializing) {
    await new Promise(r => setTimeout(r, 2000));
    return geeInitialized;
  }

  geeInitializing = true;
  try {
    console.log(`[GEE] Initializing with credentials from: ${GCLOUD_CREDENTIALS_PATH}`);
    
    const initPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('GEE initialization timed out after 15s'));
      }, 15000);
      
      geeInit(null, null, () => {
        clearTimeout(timeout);
        console.log('[GEE] Initialized successfully!');
        geeInitialized = true;
        geeInitializing = false;
        resolve();
      }, (error) => {
        clearTimeout(timeout);
        console.error('[GEE] Initialization failed:', error);
        geeInitializing = false;
        reject(error);
      });
    });
    
    await initPromise;
    return true;
  } catch (e) {
    console.error('[GEE] Failed to initialize:', e.message);
    geeInitialized = false;
    geeInitializing = false;
    return false;
  }
}

// ─── Health Check ───
app.get('/api/gee/health', (req, res) => {
  if (!geeAvailable) {
    return res.json({ status: 'unavailable', initialized: false, message: 'Earth Engine module not loaded' });
  }
  const status = geeInitialized ? 'connected' : (geeInitializing ? 'initializing' : 'disconnected');
  res.json({ status, initialized: geeInitialized });
});

// ─── Initialize Endpoint ───
app.post('/api/gee/init', async (req, res) => {
  if (!geeAvailable) {
    return res.status(503).json({ success: false, message: 'Earth Engine not available on this server' });
  }
  try {
    const success = await initGEE();
    if (success) {
      res.json({ success: true, message: 'GEE initialized' });
    } else {
      res.status(500).json({ success: false, message: 'GEE initialization failed' });
    }
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── Compute NDVI for a Polygon ───
app.post('/api/gee/ndvi', async (req, res) => {
  if (!geeAvailable) {
    return res.status(503).json({ error: 'Earth Engine not available on this server' });
  }
  try {
    const { coordinates, dateStr, cropPeak, indexType } = req.body;
    
    if (!coordinates || !coordinates.length) {
      return res.status(400).json({ error: 'No coordinates provided' });
    }

    if (!(await initGEE())) {
      return res.status(500).json({ error: 'GEE not initialized' });
    }

    const coords = coordinates.map(c => [c[1], c[0]]);
    coords.push(coords[0]);
    const geometry = ee.Geometry.Polygon([coords]);

    const startDate = dateStr || new Date().toISOString().split('T')[0];
    const endDate = startDate;

    const collection = ee.ImageCollection('COPERNICUS/S2_SR')
      .filterBounds(geometry)
      .filterDate(startDate, endDate)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
      .sort('CLOUDY_PIXEL_PERCENTAGE');

    const image = collection.first();
    
    if (!image) {
      return res.status(404).json({ error: 'No images found for this date/location' });
    }

    let indexImage;
    switch (indexType || 'ndvi') {
      case 'ndvi':
        indexImage = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
        break;
      case 'evi':
        indexImage = image.expression(
          '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))',
          { NIR: image.select('B8'), RED: image.select('B4'), BLUE: image.select('B2') }
        ).rename('EVI');
        break;
      case 'savi':
        indexImage = image.expression(
          '1.5 * ((NIR - RED) / (NIR + RED + 0.5))',
          { NIR: image.select('B8'), RED: image.select('B4') }
        ).rename('SAVI');
        break;
      case 'ndmi':
        indexImage = image.normalizedDifference(['B8', 'B11']).rename('NDMI');
        break;
      case 'ndwi':
        indexImage = image.normalizedDifference(['B3', 'B8']).rename('NDWI');
        break;
      default:
        indexImage = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
    }

    const stats = indexImage.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geometry,
      scale: 10,
      bestEffort: true
    });

    const meanValue = await new Promise((resolve, reject) => {
      stats.evaluate((result, error) => {
        if (error) reject(error);
        else resolve(Object.values(result)[0] || 0);
      });
    });

    const sampled = indexImage.sample({
      region: geometry,
      scale: 10,
      numPixels: 5000,
      geometries: true
    });

    const values = await new Promise((resolve, reject) => {
      sampled.aggregate_array('NDVI').evaluate((result, error) => {
        if (error) reject(error);
        else resolve(result || []);
      });
    });

    const peak = cropPeak || 0.80;
    let cc = [0, 0, 0, 0, 0, 0];
    values.forEach(v => {
      const ndvi = v || 0;
      if (ndvi < 0.15) cc[0]++;
      else if (ndvi / peak < 0.40) cc[1]++;
      else if (ndvi / peak < 0.55) cc[2]++;
      else if (ndvi / peak < 0.72) cc[3]++;
      else if (ndvi / peak < 0.88) cc[4]++;
      else cc[5]++;
    });

    const total = cc.reduce((a, b) => a + b, 0);

    res.json({
      success: true,
      meanNdvi: meanValue,
      sampleCount: values.length,
      cc: cc,
      cnt: Math.max(1, total),
      source: 'google-earth-engine'
    });

  } catch (e) {
    console.error('[GEE] NDVI error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Compute SAR (Soil Moisture) ───
app.post('/api/gee/sar', async (req, res) => {
  if (!geeAvailable) {
    return res.status(503).json({ error: 'Earth Engine not available on this server' });
  }
  try {
    const { coordinates, dateStr } = req.body;
    
    if (!coordinates || !coordinates.length) {
      return res.status(400).json({ error: 'No coordinates provided' });
    }

    if (!(await initGEE())) {
      return res.status(500).json({ error: 'GEE not initialized' });
    }

    const coords = coordinates.map(c => [c[1], c[0]]);
    coords.push(coords[0]);
    const geometry = ee.Geometry.Polygon([coords]);

    const endDate = dateStr ? new Date(dateStr) : new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 15);

    const collection = ee.ImageCollection('COPERNICUS/S1_GRD')
      .filterBounds(geometry)
      .filterDate(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0])
      .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
      .filter(ee.Filter.eq('instrumentMode', 'IW'))
      .sort('system:time_start', false);

    const image = collection.first();
    
    if (!image) {
      return res.status(404).json({ error: 'No SAR images found for this date/location' });
    }

    const vvImage = image.select('VV');

    const stats = vvImage.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geometry,
      scale: 10,
      bestEffort: true
    });

    const meanValue = await new Promise((resolve, reject) => {
      stats.evaluate((result, error) => {
        if (error) reject(error);
        else resolve(Object.values(result)[0] || 0);
      });
    });

    const imageDate = await new Promise((resolve, reject) => {
      image.date().format('YYYY-MM-dd').evaluate((result, error) => {
        if (error) reject(error);
        else resolve(result || 'Unknown');
      });
    });

    res.json({
      success: true,
      meanVV: meanValue,
      date: imageDate,
      source: 'google-earth-engine-sar'
    });

  } catch (e) {
    console.error('[GEE] SAR error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Time Series ───
app.post('/api/gee/time-series', async (req, res) => {
  if (!geeAvailable) {
    return res.status(503).json({ error: 'Earth Engine not available on this server' });
  }
  try {
    const { coordinates, monthsBack } = req.body;

    if (!coordinates || !coordinates.length) {
      return res.status(400).json({ error: 'No coordinates provided' });
    }

    if (!(await initGEE())) {
      return res.status(500).json({ error: 'GEE not initialized' });
    }

    const coords = coordinates.map(c => [c[1], c[0]]);
    coords.push(coords[0]);
    const geometry = ee.Geometry.Polygon([coords]);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - (monthsBack || 2));

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const collection = ee.ImageCollection('COPERNICUS/S2_SR')
      .filterBounds(geometry)
      .filterDate(startStr, endStr)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30));

    const withNdvi = collection.map(img => {
      const ndvi = img.normalizedDifference(['B8', 'B4']).rename('NDVI');
      const meanNdvi = ndvi.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: geometry,
        scale: 10,
        bestEffort: true
      });
      return ee.Feature(null, {
        date: img.date().format('YYYY-MM-dd'),
        ndvi: meanNdvi.get('NDVI')
      });
    });

    const features = await new Promise((resolve, reject) => {
      withNdvi.evaluate((result, error) => {
        if (error) reject(error);
        else resolve(result?.features || []);
      });
    });

    const timeSeries = features
      .map(f => ({
        date: f.properties.date,
        ndvi: f.properties.ndvi || 0
      }))
      .filter(f => f.ndvi !== null && f.ndvi !== undefined)
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      success: true,
      data: timeSeries,
      source: 'google-earth-engine'
    });

  } catch (e) {
    console.error('[GEE] Time series error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Start Server ───
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  🛰️  FarmHealth Server is running!`);
  console.log(`  ─────────────────────────────`);
  console.log(`  🌐  http://0.0.0.0:${PORT}`);
  console.log(`  🔌  Endpoints:`);
  console.log(`       GET  /api/gee/health     — Connection status`);
  console.log(`       POST /api/gee/init       — Initialize GEE`);
  console.log(`       POST /api/gee/ndvi       — Compute NDVI`);
  console.log(`       POST /api/gee/time-series — Time series`);
  console.log(`  📡  GEE module: ${geeAvailable ? 'LOADED' : 'NOT AVAILABLE (optional)'}`);
  console.log(`  📋  Serving frontend from: ${path.join(__dirname, '..')}\n`);
});
