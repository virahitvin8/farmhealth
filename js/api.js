/* ═══════════════════════════════════════════════════════════
   FarmHealth — API Integration Module
   ═══════════════════════════════════════════════════════════ */

const FH_API = (function() {
  'use strict';

  const { $, toast, showLoading, hideLoading, fetchJSON, buildEvalscript, buildNDVIEvalscript, dateStr, polyBBox, polyCenter, areaHa } = FH_UTILS;
  const { SH_CLIENT_ID, SH_CLIENT_SECRET, GEMINI_API_KEY, API, CROPS, HEALTH_CLASSES, WEATHER_CODES } = FH_CONFIG;

  // ─── Data source: 'sentinel-hub' or 'google-earth-engine' ───
  let dataSource = 'sentinel-hub';

  // ─── Shared state reference (set by app module) ───
  let _state = null;

  function setStateRef(state) {
    _state = state;
  }

  // ═══════════ SENTINEL HUB AUTH ═══════════
  async function getSHToken() {
    const now = Date.now();
    if (_state.shToken && _state.shTokenExpiry > now + 60000) return _state.shToken;

    const clientId = _state.settings.shClientId || SH_CLIENT_ID;
    const clientSecret = _state.settings.shClientSecret || SH_CLIENT_SECRET;

    if (!clientId || !clientSecret) throw new Error('Sentinel Hub credentials missing');

    const body = 'grant_type=client_credentials&client_id=' +
      encodeURIComponent(clientId) +
      '&client_secret=' + encodeURIComponent(clientSecret);

    const res = await fetch(API.SH_AUTH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    });

    if (!res.ok) throw new Error('Sentinel Hub auth failed. Check credentials.');
    const data = await res.json();
    _state.shToken = data.access_token;
    _state.shTokenExpiry = now + (data.expires_in * 1000);
    return _state.shToken;
  }

  function getSHGeoJSON() {
    const coords = _state.fieldLL.map(ll => [ll[1], ll[0]]);
    coords.push(coords[0]);
    return { type: "Polygon", coordinates: [coords] };
  }

  // ═══════════ STAC SCENE DISCOVERY ═══════════
  async function fetchScenes() {
    if (!_state.fieldLL.length) return [];
    const bb = polyBBox(_state.fieldLL);
    const months = parseInt($('searchMonths')?.value) || 3;
    const cloudMax = parseInt($('cloudThresh')?.value) || 30;
    const now = new Date();
    const from = new Date(now);
    from.setMonth(from.getMonth() - months);

    const body = {
      collections: ['sentinel-2-l2a'],
      bbox: [bb.west, bb.south, bb.east, bb.north],
      datetime: `${dateStr(from)}/${dateStr(now)}`,
      query: { 'eo:cloud_cover': { lt: cloudMax } },
      sortby: [{ field: 'properties.datetime', direction: 'desc' }],
      limit: 20
    };

    try {
      const data = await fetchJSON(API.STAC_URL + '/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (data && data.features) {
        _state.scenes = data.features.map(f => ({
          id: f.id,
          date: f.properties.datetime?.split('T')[0] || 'Unknown',
          cloud: Math.round(f.properties['eo:cloud_cover'] || 0),
          thumbnail: f.assets?.thumbnail?.href || null
        }));
        return _state.scenes;
      }
    } catch (e) {
      console.warn('STAC API failed, using simulated scenes:', e);
    }

    // Fallback: generate simulated scenes spanning the last N months
    toast('📡 Using simulated satellite scenes (real API unavailable)', 'info');
    const simulated = [];
    const totalDays = months * 30;
    const step = Math.max(7, Math.floor(totalDays / 10));
    for (let d = totalDays; d >= 0; d -= step) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      const cloudPct = Math.round(5 + Math.random() * 25);
      simulated.push({
        id: 'simulated-s2-' + dateStr(date),
        date: dateStr(date),
        cloud: cloudPct,
        thumbnail: null
      });
    }
    _state.scenes = simulated;
    return _state.scenes;
  }

  // ═══════════ SENTINEL HUB STATISTICAL API ═══════════
  async function fetchStatistics(dateStr) {
    const token = await getSHToken();

    const payload = {
      input: {
        bounds: { geometry: getSHGeoJSON(), properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" } },
        data: [{
          type: "sentinel-2-l2a",
          dataFilter: { timeRange: { from: dateStr + "T00:00:00Z", to: dateStr + "T23:59:59Z" } }
        }]
      },
      aggregation: {
        timeRange: { from: dateStr + "T00:00:00Z", to: dateStr + "T23:59:59Z" },
        aggregationInterval: { of: "P1D" },
        evalscript: buildNDVIEvalscript()
      }
    };

    const res = await fetch(API.SH_STATISTICS, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error("Statistics API: " + res.statusText);
    const data = await res.json();
    const stats = data.data[0]?.outputs?.ndvi?.bands?.B0?.stats;
    return stats ? stats.mean : 0.5;
  }

  // ═══════════ GENERATE SIMULATED GRID DATA (fallback when APIs fail) ═══════════
  // Creates a realistic NDVI distribution with some spatial variation
  function generateSimulatedGrid(meanNdvi, cropPeak) {
    const peak = cropPeak || 0.80;
    const mean = meanNdvi || 0.60;
    const vari = 0.12; // natural variation
    
    // Generate 5000 sample points with normal distribution around mean
    const samples = 5000;
    let cc = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < samples; i++) {
      // Box-Muller transform for normal distribution
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      const ndvi = Math.max(-0.1, Math.min(1.0, mean + z * vari));
      
      if (ndvi < 0.15) cc[0]++;
      else if (ndvi / peak < 0.40) cc[1]++;
      else if (ndvi / peak < 0.55) cc[2]++;
      else if (ndvi / peak < 0.72) cc[3]++;
      else if (ndvi / peak < 0.88) cc[4]++;
      else cc[5]++;
    }
    return { cc, cnt: samples };
  }

  // ═══════════ SENTINEL HUB PROCESS API ═══════════
  async function renderGrid(indexType, dateStr, cropPeak, preferMean) {
    // Fallback: if Sentinel Hub calls fail, use simulated data
    try {
      const token = await getSHToken();
      if (_state.ndviLayer) _state.ndviLayer.clearLayers();

      let datasetType = "sentinel-2-l2a";
      if (indexType === 'sar') datasetType = "sentinel-1-grd";
      if (indexType === 'tvdi') datasetType = "landsat-8-l1c";

      const payload = {
        input: {
          bounds: { geometry: getSHGeoJSON(), properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" } },
          data: [{
            type: datasetType,
            dataFilter: { timeRange: { from: dateStr + "T00:00:00Z", to: dateStr + "T23:59:59Z" } }
          }]
        },
        output: { width: 256, height: 256, responses: [{ identifier: "default", format: { type: "image/png" } }] },
        evalscript: buildEvalscript(indexType, cropPeak)
      };

      const res = await fetch(API.SH_PROCESS, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'Accept': 'image/png'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Process API: ' + res.statusText);
      const blob = await res.blob();
      const imageUrl = URL.createObjectURL(blob);
      const bounds = _state.fieldPoly.getBounds();
      L.imageOverlay(imageUrl, bounds).addTo(_state.ndviLayer);

      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

          let cc = [0, 0, 0, 0, 0, 0],
            cnt = 0;
          for (let i = 0; i < imgData.length; i += 4) {
            if (imgData[i + 3] === 0) continue;
            const r = imgData[i],
              g = imgData[i + 1];
            cnt++;
            if (r === 139 && g === 90) cc[0]++;
            else if (r === 231 && g === 76) cc[1]++;
            else if (r === 243 && g === 156) cc[2]++;
            else if (r === 241 && g === 196) cc[3]++;
            else if (r === 122 && g === 201) cc[4]++;
            else if (r === 30 && g === 125) cc[5]++;
            else cc[4]++;
          }
          resolve({ cc, cnt: Math.max(1, cnt) });
        };
        img.src = imageUrl;
      });
    } catch (e) {
      console.warn('Sentinel Hub Process API failed, using simulated data:', e);
      // Only show toast once on first simulated render
      if (!_state.simulatedData) {
        _state.simulatedData = true;
        toast('🔄 Using simulated satellite data (real API unavailable)', 'info');
      }
      // Use the passed preferred mean, or read from existing analysis, or generate a reasonable value
      const fallbackMean = preferMean || _state.analysisData?.meanNdvi || (0.55 + Math.random() * 0.25);
      return generateSimulatedGrid(fallbackMean, cropPeak);
    }
  }

  // ═══════════ SENTINEL HUB TIME SERIES ═══════════
  async function generateTimeSeries() {
    try {
      const token = await getSHToken();
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setMonth(fromDate.getMonth() - 2);

      const payload = {
        input: {
          bounds: { geometry: getSHGeoJSON(), properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" } },
          data: [{
            type: "sentinel-2-l2a",
            dataFilter: { timeRange: { from: dateStr(fromDate) + "T00:00:00Z", to: dateStr(toDate) + "T23:59:59Z" } }
          }]
        },
        aggregation: {
          timeRange: { from: dateStr(fromDate) + "T00:00:00Z", to: dateStr(toDate) + "T23:59:59Z" },
          aggregationInterval: { of: "P5D" },
          evalscript: buildNDVIEvalscript()
        }
      };

      const res = await fetch(API.SH_STATISTICS, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        _state.tsData = [];
        data.data.forEach(int => {
          const stats = int.outputs?.ndvi?.bands?.B0?.stats;
          if (stats && stats.sampleCount > 0) {
            _state.tsData.push({ date: int.interval.from.split('T')[0], ndvi: stats.mean });
          }
        });
        return;
      }
    } catch (e) {
      console.warn('Time Series API failed:', e);
    }

    // Fallback: generate simulated time series
    if (!_state.tsData || _state.tsData.length === 0) {
      _state.tsData = [];
      const baseNdvi = 0.45 + Math.random() * 0.25;
      for (let d = 60; d >= 0; d -= 5) {
        const date = new Date();
        date.setDate(date.getDate() - d);
        _state.tsData.push({
          date: dateStr(date),
          ndvi: Math.max(0.1, Math.min(0.95, baseNdvi + (Math.random() - 0.5) * 0.08 + (60 - d) * 0.003))
        });
      }
    }
  }

  // ═══════════ WEATHER (Open-Meteo) ═══════════
  async function fetchWeather() {
    if (!_state.fieldCenter) return null;
    const [lat, lng] = _state.fieldCenter;

    const fUrl = `${API.METEO_URL}/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code,surface_pressure,et0_fao_evapotranspiration&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,et0_fao_evapotranspiration&hourly=soil_temperature_0cm,soil_moisture_0_to_1cm&timezone=auto&forecast_days=7`;
    const histUrl = `${API.METEO_URL}/forecast?latitude=${lat}&longitude=${lng}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&timezone=auto&past_days=30&forecast_days=0`;

    const [forecast, history] = await Promise.all([fetchJSON(fUrl), fetchJSON(histUrl)]);
    _state.weatherData = { forecast, history, lat, lng };
    return _state.weatherData;
  }

  // ═══════════ TERRAIN (Open-Meteo Elevation) ═══════════
  async function fetchTerrain() {
    if (!_state.fieldLL.length) return null;
    const bb = polyBBox(_state.fieldLL);
    const pad = 0.001,
      N = 9;
    const lats = [],
      lngs = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        lats.push((bb.south - pad + (i + 0.5) * (bb.north - bb.south + 2 * pad) / N).toFixed(5));
        lngs.push((bb.west - pad + (j + 0.5) * (bb.east - bb.west + 2 * pad) / N).toFixed(5));
      }
    }

    const url = `${API.METEO_URL}/elevation?latitude=${lats.join(',')}&longitude=${lngs.join(',')}`;
    const data = await fetchJSON(url);

    if (!data || !data.elevation) return null;

    const elev = data.elevation;
    const eMin = Math.min(...elev),
      eMax = Math.max(...elev),
      eMean = elev.reduce((a, b) => a + b, 0) / elev.length;

    let slopes = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const idx = i * N + j;
        const eC = elev[idx];
        const eN = i > 0 ? elev[(i - 1) * N + j] : eC;
        const eS = i < N - 1 ? elev[(i + 1) * N + j] : eC;
        const eW = j > 0 ? elev[i * N + (j - 1)] : eC;
        const eE = j < N - 1 ? elev[i * N + (j + 1)] : eC;
        const latR = parseFloat(lats[idx]) * Math.PI / 180;
        const dLatM = (bb.north - bb.south + 2 * pad) / N * 111320;
        const dLngM = (bb.east - bb.west + 2 * pad) / N * 111320 * Math.cos(latR);
        const dzdx = (eE - eW) / (2 * dLngM);
        const dzdy = (eN - eS) / (2 * dLatM);
        slopes.push(Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * 180 / Math.PI);
      }
    }

    const avgSlope = slopes.reduce((a, b) => a + b, 0) / slopes.length;
    const maxSlope = Math.max(...slopes);
    const drainClass = avgSlope > 5 ? 'Well-drained' : avgSlope > 2 ? 'Moderate' : 'Poor drainage';

    _state.terrainData = { eMin, eMax, eMean, avgSlope, maxSlope, drainClass };
    return _state.terrainData;
  }

  // ═══════════ SOIL (SoilGrids) ═══════════
  async function fetchSoil() {
    if (!_state.fieldCenter) return null;
    const [lat, lng] = _state.fieldCenter;
    const props = ['phh2o', 'soc', 'clay', 'sand', 'silt', 'nitrogen', 'cec', 'bdod'];
    const url = `${API.SOILGRIDS_URL}?lon=${lng}&lat=${lat}&property=${props.join(',')}&depth=0-5cm&value=mean`;

    const data = await fetchJSON(url);
    if (!data || !data.properties) return null;

    const soil = {};
    data.properties.layers.forEach(layer => {
      soil[layer.name] = layer.depths?.[0]?.values?.mean;
    });

    _state.soilData = soil;
    return soil;
  }

  function setDataSource(source) {
    dataSource = source;
    toast(`📡 Data source: ${source === 'sentinel-hub' ? 'Sentinel Hub' : 'Google Earth Engine'}`);
  }

  // ═══════════ GEE PROXY CALLS ═══════════
  async function fetchGEEStatistics(coords, dateStr, cropPeak, indexType) {
    try {
      const payload = {
        coordinates: coords,
        dateStr: dateStr,
        cropPeak: cropPeak,
        indexType: indexType || 'ndvi'
      };
      const res = await fetch(API.GEE_PROXY + '/ndvi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('GEE proxy error: ' + res.statusText);
      return await res.json();
    } catch (e) {
      console.warn('GEE proxy call failed:', e);
      return null;
    }
  }

  async function fetchGEETimeSeries(coords, monthsBack) {
    try {
      const payload = { coordinates: coords, monthsBack: monthsBack || 2 };
      const res = await fetch(API.GEE_PROXY + '/time-series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('GEE time series error: ' + res.statusText);
      return await res.json();
    } catch (e) {
      console.warn('GEE time series failed:', e);
      return null;
    }
  }

  // ═══════════ SAR SOIL MOISTURE (Sentinel-1 via GEE) ═══════════
  async function fetchSAR() {
    if (!_state.fieldLL.length) return null;
    try {
      const payload = {
        coordinates: _state.fieldLL.map(ll => [ll[0], ll[1]]),
        dateStr: _state.selectedScene ? _state.selectedScene.date : null
      };
      const res = await fetch(API.GEE_PROXY + '/sar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('SAR fetch failed: ' + res.statusText);
      const data = await res.json();
      if (data && data.success) {
        // Normalize VV backscatter to 0-1 moisture index
        const rawVV = data.meanVV || -15;
        // Sentinel-1 VV backscatter roughly -25 to -5 dB range
        const moistureIndex = Math.max(0, Math.min(1, (rawVV + 25) / 20));
        return {
          rawVV,
          moistureIndex,
          date: data.date || 'Unknown',
          source: 'sentinel-1-sar'
        };
      }
      return null;
    } catch (e) {
      console.warn('SAR fetch failed:', e);
      return null;
    }
  }

  // ═══════════ GEMINI AI ADVICE ═══════════
  async function getAIAdvice() {
    const key = $('geminiKey').value || _state.settings.geminiKey || GEMINI_API_KEY;
    if (!key) {
      toast('⚠️ Add Gemini API key in Settings first', 'err');
      return;
    }
    if (!_state.analysisData) {
      toast('⚠️ Run analysis first', 'err');
      return;
    }

    $('aiBtn').disabled = true;
    $('aiBtn').textContent = '⏳ Generating…';

    const ad = _state.analysisData;
    const crop = CROPS[$('cropSelect').value];
    const avg = ad.meanNdvi;
    const prob = (ad.cc[0] + ad.cc[1] + ad.cc[2]) / ad.cnt * 100;

    let context = `You are an agricultural AI advisor. Analyze this field data and give practical recommendations:\n\n`;
    context += `Crop: ${crop.name}\nGrowth Stage: ${$('stageSelect').value}\n`;
    context += `Average NDVI: ${avg.toFixed(3)}\n`;
    context += `Health Score: ${Math.round(Math.min(100, (avg / crop.peak) * 115))}%\n`;
    context += `Problem Area: ${prob.toFixed(1)}%\n`;
    context += `Field Area: ${areaHa(_state.fieldLL).toFixed(2)} ha\n`;

    if (_state.weatherData?.forecast?.current) {
      const c = _state.weatherData.forecast.current;
      context += `\nWeather: ${c.temperature_2m}°C, ${c.relative_humidity_2m}% humidity, Wind ${c.wind_speed_10m} km/h\n`;
    }

    context += `\nProvide 3-5 specific, actionable recommendations. Include timing, quantities where possible.`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: context }] }] })
      });
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      const text = data.candidates[0].content.parts[0].text;
      $('aiContent').innerHTML = text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
      $('aiCard').style.display = '';
      toast('🤖 AI analysis ready!');
    } catch (e) {
      toast('⚠️ AI analysis failed. Check API key.', 'err');
    }

    $('aiBtn').disabled = false;
    $('aiBtn').textContent = '✨ Get AI Analysis';
  }

  // ═══════════ COMBINED STRESS INDEX (CSI / TVDI-like) ═══════════
  // Uses NDVI + NDMI + Weather to detect pre-visual stress
  // This gives thermal-stress-like detection without needing thermal bands
  async function fetchCombinedStress(ndvi, ndmi, temperature, humidity) {
    try {
      const crop = CROPS[$('cropSelect').value] || CROPS.generic;
      
      // 1. NDVI-based stress: how far from crop peak?
      const ndviStress = Math.max(0, 1 - (ndvi / crop.peak));
      
      // 2. NDMI moisture stress: lower = drier (NDMI range -1 to 1, healthy ~0.3-0.8)
      const moistureStress = Math.max(0, 1 - ((ndmi || 0.4) - (-0.2)) / 0.8);
      
      // 3. Temperature stress
      let tempStress = 0;
      if (temperature !== undefined && temperature !== null) {
        if (temperature > 35) tempStress = Math.min(1, (temperature - 35) / 15);
        else if (temperature > 30) tempStress = 0.2;
        else if (temperature < 5) tempStress = Math.min(1, (5 - temperature) / 10);
      }
      
      // 4. Humidity stress modifier (high humidity + warmth = disease risk)
      let humidityStress = 0;
      if (humidity !== undefined && humidity !== null && temperature !== undefined && temperature !== null) {
        if (humidity > 85 && temperature > 22) humidityStress = 0.3;
        else if (humidity > 70 && temperature > 28) humidityStress = 0.2;
      }
      
      // Combined stress index (0-1 scale, higher = more stressed)
      // Weighted: NDVI 40%, Moisture 35%, Temperature 15%, Humidity 10%
      const csi = Math.min(1, ndviStress * 0.40 + moistureStress * 0.35 + tempStress * 0.15 + humidityStress * 0.10);
      
      // TVDI-like: Thermal dryness approximation
      // When NDVI is low AND temperature is high = high thermal stress
      const tvdi = Math.min(1, (ndviStress * 0.6) + (tempStress * 0.4));
      
      return {
        csi,
        tvdi,
        components: {
          ndviStress: parseFloat(ndviStress.toFixed(3)),
          moistureStress: parseFloat(moistureStress.toFixed(3)),
          tempStress: parseFloat(tempStress.toFixed(3)),
          humidityStress: parseFloat(humidityStress.toFixed(3))
        },
        interpretation: csi < 0.25 ? 'Low stress — crop appears healthy' :
                        csi < 0.45 ? 'Mild stress — monitor closely' :
                        csi < 0.65 ? 'Moderate stress — consider irrigation' :
                        'Severe stress — immediate action needed'
      };
    } catch (e) {
      console.warn('Stress index calculation failed:', e);
      return { csi: 0.5, tvdi: 0.5, components: {}, interpretation: 'Unable to calculate' };
    }
  }

  // ═══════════ PEST RISK ASSESSMENT ═══════════
  async function fetchPestRisk(temperature, humidity, cropType) {
    try {
      const { PEST_RISK } = FH_CONFIG;
      if (!temperature || !humidity) return { risks: [], overall: 0 };
      
      const risks = [];
      let maxRisk = 0;
      
      Object.entries(PEST_RISK).forEach(([key, pest]) => {
        // Check if pest affects this crop
        const crops = Array.isArray(pest.crop) ? pest.crop : [pest.crop];
        if (!crops.includes(cropType) && cropType !== 'generic' && !crops.includes('generic') && !crops.includes('generic')) return;
        
        // Check temperature range
        const tempOk = temperature >= pest.tempRange[0] && temperature <= pest.tempRange[1];
        const humidOk = humidity >= pest.humidMin;
        
        if (tempOk && humidOk) {
          // How favorable? Both conditions met = high risk
          const midTemp = (pest.tempRange[0] + pest.tempRange[1]) / 2;
          const tempFit = 1 - Math.abs(temperature - midTemp) / ((pest.tempRange[1] - pest.tempRange[0]) / 2 + 5);
          const humidFit = Math.min(1, (humidity - pest.humidMin) / 15);
          const riskScore = Math.round(Math.min(100, Math.max(0, (tempFit * 0.5 + humidFit * 0.5) * 100)));
          
          maxRisk = Math.max(maxRisk, riskScore);
          risks.push({
            name: pest.name,
            risk: riskScore,
            level: riskScore > 70 ? 'high' : riskScore > 40 ? 'medium' : 'low',
            desc: pest.desc,
            key
          });
        }
      });
      
      // Sort by risk descending
      risks.sort((a, b) => b.risk - a.risk);
      
      return {
        risks,
        overall: maxRisk,
        level: maxRisk > 70 ? 'high' : maxRisk > 40 ? 'medium' : 'low',
        timestamp: new Date().toISOString()
      };
    } catch (e) {
      console.warn('Pest risk calculation failed:', e);
      return { risks: [], overall: 0, level: 'low' };
    }
  }

  // ═══════════ REVERSE GEOCODING (OpenStreetMap Nominatim) ═══════════
  async function reverseGeocode(lat, lng) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      if (!res.ok) throw new Error('Geocoding failed');
      const data = await res.json();
      if (data && data.address) {
        const a = data.address;
        const parts = [];
        if (a.village || a.suburb || a.town || a.city) parts.push(a.village || a.suburb || a.town || a.city);
        if (a.county || a.state_district) parts.push(a.county || a.state_district);
        if (a.state) parts.push(a.state);
        return parts.join(', ');
      }
      return 'Unknown Location';
    } catch (e) {
      console.error('Geocoding error:', e);
      return 'Location Unavailable';
    }
  }

  // ═══════════ EXPORTS ═══════════
  return {
    setStateRef,
    getSHToken,
    getSHGeoJSON,
    fetchScenes,
    fetchStatistics,
    renderGrid,
    generateTimeSeries,
    fetchWeather,
    fetchTerrain,
    fetchSoil,
    fetchSAR,
    fetchCombinedStress,
    fetchPestRisk,
    getAIAdvice,
    reverseGeocode
  };
})();
