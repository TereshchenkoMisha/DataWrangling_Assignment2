import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const GLOBE_RADIUS = 5;
const MAX_POINTS = 2000;
const POLL_INTERVAL = 400;
const API_BASE = '';

const COLOR_COAST = new THREE.Color(0xffffff);
const COLOR_BORDER = new THREE.Color(0x888888);
const COLOR_GRID = new THREE.Color(0x1a1a1a);
const COLOR_ATMO = new THREE.Color(0x6688aa);

let lastTimestamp = 0;
let totalPackets = 0;
let suspiciousPackets = 0;
let currentFilter = 0;
const clusters = new Map();
let clusterCount = 0;
const activityBuckets = [];
const CHART_HISTORY_LENGTH = 30;

const container = document.getElementById('globe-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b14);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 14);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;
controls.minDistance = 7;
controls.maxDistance = 30;
controls.enablePan = false;

function latLngToVec3(lat, lng, r) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
    );
}

function formatCoord(lat, lng) {
    const la = Math.abs(lat).toFixed(1) + '°' + (lat >= 0 ? 'N' : 'S');
    const lo = Math.abs(lng).toFixed(1) + '°' + (lng >= 0 ? 'E' : 'W');
    return la + ', ' + lo;
}

function createStars() {
    const count = 3000;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const r = 80 + Math.random() * 120;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, transparent: true, opacity: 0.5 });
    scene.add(new THREE.Points(geom, mat));
}
createStars();

function buildLineSegments(coordsArray, radius) {
    const pos = [];
    for (const line of coordsArray) {
        for (let i = 0; i < line.length - 1; i++) {
            const a = latLngToVec3(line[i][1], line[i][0], radius);
            const b = latLngToVec3(line[i + 1][1], line[i + 1][0], radius);
            pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return geom;
}

async function buildGlobe() {
    const resp = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
    if (!resp.ok) throw new Error('Failed to load world data');
    const topology = await resp.json();

    const internalMesh = topojson.mesh(topology, topology.objects.countries, (a, b) => a !== b);
    const internalGeom = buildLineSegments(internalMesh.coordinates, GLOBE_RADIUS);
    const internalMat = new THREE.LineBasicMaterial({ color: COLOR_BORDER, transparent: true, opacity: 0.45 });
    scene.add(new THREE.LineSegments(internalGeom, internalMat));

    const coastMesh = topojson.mesh(topology, topology.objects.countries, (a, b) => a === b);
    const coastGeom = buildLineSegments(coastMesh.coordinates, GLOBE_RADIUS);
    const coastMat = new THREE.LineBasicMaterial({ color: COLOR_COAST, transparent: true, opacity: 0.7 });
    scene.add(new THREE.LineSegments(coastGeom, coastMat));

    const gridPos = [];
    for (let lat = -75; lat <= 75; lat += 15) {
        for (let lng = -180; lng < 180; lng += 3) {
            const a = latLngToVec3(lat, lng, GLOBE_RADIUS);
            const b = latLngToVec3(lat, lng + 3, GLOBE_RADIUS);
            gridPos.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
    }
    for (let lng = -180; lng < 180; lng += 15) {
        for (let lat = -90; lat < 90; lat += 3) {
            const a = latLngToVec3(lat, lng, GLOBE_RADIUS);
            const b = latLngToVec3(lat + 3, lng, GLOBE_RADIUS);
            gridPos.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
    }
    const gridGeom = new THREE.BufferGeometry();
    gridGeom.setAttribute('position', new THREE.Float32BufferAttribute(gridPos, 3));
    const gridMat = new THREE.LineBasicMaterial({ color: COLOR_GRID, transparent: true, opacity: 0.25 });
    scene.add(new THREE.LineSegments(gridGeom, gridMat));

    const atmoGeom = new THREE.SphereGeometry(GLOBE_RADIUS * 1.18, 64, 64);
    const atmoMat = new THREE.ShaderMaterial({
        vertexShader: `
            varying vec3 vWorldNormal;
            varying vec3 vWorldPos;
            void main() {
                vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
                vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            varying vec3 vWorldNormal;
            varying vec3 vWorldPos;
            void main() {
                vec3 viewDir = normalize(cameraPosition - vWorldPos);
                float rim = abs(dot(vWorldNormal, viewDir));
                float intensity = pow(0.82 - rim * 0.82, 2.5);
                gl_FragColor = vec4(uColor, intensity * 0.45);
            }
        `,
        uniforms: { uColor: { value: COLOR_ATMO } },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    scene.add(new THREE.Mesh(atmoGeom, atmoMat));
}

const ptPositions = new Float32Array(MAX_POINTS * 3);
const ptBirthTimes = new Float32Array(MAX_POINTS);
const ptSuspicious = new Float32Array(MAX_POINTS);
const ptSizes = new Float32Array(MAX_POINTS);

const ptGeom = new THREE.BufferGeometry();
ptGeom.setAttribute('position', new THREE.BufferAttribute(ptPositions, 3));
ptGeom.setAttribute('aBirthTime', new THREE.BufferAttribute(ptBirthTimes, 1));
ptGeom.setAttribute('aIsSuspicious', new THREE.BufferAttribute(ptSuspicious, 1));
ptGeom.setAttribute('aSize', new THREE.BufferAttribute(ptSizes, 1));
ptGeom.setDrawRange(0, 0);

const ptMat = new THREE.ShaderMaterial({
    vertexShader: `
        attribute float aBirthTime;
        attribute float aIsSuspicious;
        attribute float aSize;
        uniform float uTime;
        uniform int uFilter;
        varying float vOpacity;
        varying float vSusp;

        void main() {
            vSusp = aIsSuspicious;
            if (uFilter == 1 && aIsSuspicious > 0.5) vOpacity = 0.0;
            else if (uFilter == 2 && aIsSuspicious < 0.5) vOpacity = 0.0;
            else {
                float age = uTime - aBirthTime;
                float fadeIn = smoothstep(0.0, 0.6, age);
                float stay = smoothstep(18.0, 12.0, age);
                float pulse = aIsSuspicious > 0.5 ? (0.7 + 0.3 * sin(age * 5.0)) : 1.0;
                vOpacity = fadeIn * max(stay, 0.25) * pulse;
            }

            float sz = aSize;
            if (aIsSuspicious > 0.5) sz *= 1.0 + 0.25 * sin(uTime * 5.0 - aBirthTime);

            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = max(sz * (220.0 / -mv.z), 1.0);
            gl_Position = projectionMatrix * mv;
        }
    `,
    fragmentShader: `
        varying float vOpacity;
        varying float vSusp;
        void main() {
            if (vOpacity < 0.01) discard;
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;
            float glow = 1.0 - smoothstep(0.0, 0.5, d);
            glow = pow(glow, 1.4);

            vec3 norm = vec3(0.0, 1.0, 0.53);
            vec3 susp = vec3(1.0, 0.2, 0.27);
            vec3 col = mix(norm, susp, vSusp);
            float core = smoothstep(0.25, 0.0, d);
            col += core * 0.4;

            gl_FragColor = vec4(col * glow, glow * vOpacity);
        }
    `,
    uniforms: { uTime: { value: 0 }, uFilter: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
});

const pointsMesh = new THREE.Points(ptGeom, ptMat);
scene.add(pointsMesh);

const pulseRings = [];
function spawnPulse(pos, isSusp) {
    const geom = new THREE.RingGeometry(0.02, 0.04, 32);
    const mat = new THREE.MeshBasicMaterial({
        color: isSusp ? 0xff3344 : 0x00ff88,
        transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(pos);
    mesh.lookAt(0, 0, 0);
    mesh.userData.birth = performance.now() / 1000;
    mesh.userData.life = 1.5;
    scene.add(mesh);
    pulseRings.push(mesh);
}

function updatePulses(now) {
    for (let i = pulseRings.length - 1; i >= 0; i--) {
        const ring = pulseRings[i];
        const age = now - ring.userData.birth;
        const t = age / ring.userData.life;
        if (t >= 1) {
            scene.remove(ring); ring.geometry.dispose(); ring.material.dispose();
            pulseRings.splice(i, 1);
        } else {
            const scale = 1 + t * 8;
            ring.scale.set(scale, scale, scale);
            ring.material.opacity = 0.8 * (1 - t);
        }
    }
}

function addPacket(p) {
    totalPackets++;
    if (p.suspicious) suspiciousPackets++;

    const key = `${Math.round(p.latitude)},${Math.round(p.longitude)}`;
    let cluster = clusters.get(key);

    if (cluster) {
        cluster.count++;
        if (p.suspicious) cluster.suspicious = true;
        ptSizes[cluster.bufferIndex] = Math.min(4 + Math.sqrt(cluster.count) * 1.8, 14);
        ptGeom.attributes.aSize.needsUpdate = true;
        if (p.suspicious && !cluster.wasSuspicious) {
            ptSuspicious[cluster.bufferIndex] = 1.0;
            ptGeom.attributes.aIsSuspicious.needsUpdate = true;
            cluster.wasSuspicious = true;
        }
    } else {
        if (clusterCount >= MAX_POINTS) return;
        const idx = clusterCount;
        const v = latLngToVec3(p.latitude, p.longitude, GLOBE_RADIUS * 1.005);
        ptPositions[idx * 3] = v.x;
        ptPositions[idx * 3 + 1] = v.y;
        ptPositions[idx * 3 + 2] = v.z;
        ptBirthTimes[idx] = performance.now() / 1000;
        ptSuspicious[idx] = p.suspicious ? 1.0 : 0.0;
        ptSizes[idx] = 4;
        clusterCount++;
        ptGeom.setDrawRange(0, clusterCount);
        ptGeom.attributes.position.needsUpdate = true;
        ptGeom.attributes.aBirthTime.needsUpdate = true;
        ptGeom.attributes.aIsSuspicious.needsUpdate = true;
        ptGeom.attributes.aSize.needsUpdate = true;

        cluster = { bufferIndex: idx, count: 1, suspicious: !!p.suspicious, wasSuspicious: !!p.suspicious, lat: p.latitude, lng: p.longitude, ips: [p.ip] };
        clusters.set(key, cluster);
        spawnPulse(v, p.suspicious);
    }

    if (!cluster.ips.includes(p.ip)) cluster.ips.push(p.ip);

    let bucket = activityBuckets.find(b => b.time === p.timestamp);
    if (!bucket) {
        activityBuckets.push({ time: p.timestamp, total: 0, suspicious: 0 });
        bucket = activityBuckets[activityBuckets.length - 1];
    }
    bucket.total++;
    if (p.suspicious) bucket.suspicious++;

    if (activityBuckets.length > CHART_HISTORY_LENGTH * 2) {
        activityBuckets.splice(0, activityBuckets.length - CHART_HISTORY_LENGTH);
    }
}

const statusEl = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const errorToast = document.getElementById('error-toast');
let errorTimeout = null;

function showError(msg) {
    errorToast.textContent = msg;
    errorToast.classList.add('show');
    if (errorTimeout) clearTimeout(errorTimeout);
    errorTimeout = setTimeout(() => errorToast.classList.remove('show'), 4000);
}

async function fetchPackets() {
    try {
        const url = `${API_BASE}/packets?since=${lastTimestamp}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        if (data.length > 0) {
            for (const p of data) {
                addPacket(p);
                if (p.timestamp > lastTimestamp) lastTimestamp = p.timestamp;
            }
            updateCounters();
            updateTopLocations();
            updateSuspiciousList();

            drawChart();
        }
        statusEl.className = 'connected';
        statusText.textContent = 'Live';
    } catch (e) {
        statusEl.className = 'error';
        statusText.textContent = 'Offline';
        showError('Cannot reach server — is Flask running?');
    }
}

async function pollLoop() {
    await fetchPackets();
    setTimeout(pollLoop, POLL_INTERVAL);
}

function updateCounters() {
    document.getElementById('total-count').textContent = totalPackets;
    document.getElementById('suspicious-count').textContent = suspiciousPackets;
}

function updateTopLocations() {
    const sorted = [...clusters.values()].sort((a, b) => b.count - a.count).slice(0, 10);
    document.getElementById('top-locations').innerHTML = sorted.map(c => `
        <div class="location-item ${c.suspicious ? 'suspicious-item' : ''}">
            <div class="loc-color" style="background:${c.suspicious ? 'var(--danger)' : 'var(--accent)'}"></div>
            <div class="loc-info"><div class="loc-coords">${formatCoord(c.lat, c.lng)}</div></div>
            ${c.suspicious ? '<span class="suspicious-tag">ALERT</span>' : ''}
            <span class="loc-count">${c.count}</span>
        </div>
    `).join('');
}

function updateSuspiciousList() {
    const suspClusters = [...clusters.values()].filter(c => c.suspicious);
    document.getElementById('suspicious-list').innerHTML = suspClusters.slice(0, 8).map(c => `
        <div class="location-item suspicious-item">
            <div class="loc-color" style="background:var(--danger)"></div>
            <div class="loc-info">
                <div style="font-size:10px;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.ips[0]}</div>
                <div class="loc-coords">${formatCoord(c.lat, c.lng)}</div>
            </div>
            <span class="loc-count" style="color:var(--danger)">${c.count}</span>
        </div>
    `).join('');
}

const chartCanvas = document.getElementById('chart-canvas');
const chartCtx = chartCanvas.getContext('2d');

function resizeChart() {
    const wrap = document.getElementById('chart-wrap');
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    chartCanvas.width = rect.width * dpr;
    chartCanvas.height = rect.height * dpr;
    chartCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawChart() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = chartCanvas.width / dpr;
    const h = chartCanvas.height / dpr;

    chartCtx.clearRect(0, 0, w, h);
    chartCtx.fillStyle = 'rgba(6,10,18,0.6)';
    chartCtx.fillRect(0, 0, w, h);

    chartCtx.strokeStyle = 'rgba(255,255,255,0.05)';
    chartCtx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
        const y = (h / 4) * i;
        chartCtx.beginPath(); chartCtx.moveTo(40, y); chartCtx.lineTo(w, y); chartCtx.stroke();
    }

    const data = activityBuckets.slice(-CHART_HISTORY_LENGTH);
    if (data.length < 2) return;

    const maxVal = Math.max(...data.map(b => b.total), 5);
    const pad = { top: 5, bottom: 15, left: 40, right: 10 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    const getX = (i) => pad.left + (i / (data.length - 1)) * chartW;
    const getY = (val) => pad.top + chartH - (val / maxVal) * chartH;

    chartCtx.beginPath();
    chartCtx.strokeStyle = '#00e5c8';
    chartCtx.lineWidth = 1.5;
    data.forEach((b, i) => {
        const x = getX(i); const y = getY(b.total);
        i === 0 ? chartCtx.moveTo(x, y) : chartCtx.lineTo(x, y);
    });
    chartCtx.stroke();
    
    chartCtx.lineTo(getX(data.length - 1), pad.top + chartH);
    chartCtx.lineTo(getX(0), pad.top + chartH);
    chartCtx.closePath();
    const grad = chartCtx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
    grad.addColorStop(0, 'rgba(0,229,200,0.2)');
    grad.addColorStop(1, 'rgba(0,229,200,0.0)');
    chartCtx.fillStyle = grad;
    chartCtx.fill();

    chartCtx.beginPath();
    chartCtx.strokeStyle = '#ff3344';
    chartCtx.lineWidth = 1.5;
    data.forEach((b, i) => {
        const x = getX(i); const y = getY(b.suspicious);
        i === 0 ? chartCtx.moveTo(x, y) : chartCtx.lineTo(x, y);
    });
    chartCtx.stroke();

    chartCtx.fillStyle = 'rgba(255,255,255,0.4)';
    chartCtx.font = '9px JetBrains Mono';
    chartCtx.textAlign = 'right';
    chartCtx.fillText(maxVal, pad.left - 5, getY(maxVal) + 3);
    chartCtx.fillText('0', pad.left - 5, pad.top + chartH + 3);

    chartCtx.textAlign = 'center';
    const formatTime = (ts) => {
        const d = new Date(ts * 1000);
        return d.getMinutes().toString().padStart(2, '0') + ':' + d.getSeconds().toString().padStart(2, '0');
    };
    if (data.length > 1) {
        chartCtx.fillText(formatTime(data[0].time), getX(0), h - 1);
        const midIdx = Math.floor(data.length / 2);
        chartCtx.fillText(formatTime(data[midIdx].time), getX(midIdx), h - 1);
        chartCtx.fillText(formatTime(data[data.length-1].time), getX(data.length-1), h - 1);
    }
}

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const f = btn.dataset.filter;
        currentFilter = f === 'normal' ? 1 : f === 'suspicious' ? 2 : 0;
        ptMat.uniforms.uFilter.value = currentFilter;
    });
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeChart();
});

function animate() {
    requestAnimationFrame(animate);
    const now = performance.now() / 1000;
    ptMat.uniforms.uTime.value = now;
    controls.update();
    updatePulses(now);

    renderer.render(scene, camera);
}

async function init() {
    try {
        await buildGlobe();
    } catch (e) {
        document.querySelector('.loader-text').textContent = 'Error loading globe data';
        document.querySelector('.loader-ring').style.borderTopColor = 'var(--danger)';
        console.error(e);
        return;
    }

    resizeChart();

    const loadingScreen = document.getElementById('loading-screen');
    loadingScreen.classList.add('fade-out');
    setTimeout(() => loadingScreen.style.display = 'none', 700);
    document.getElementById('ui-overlay').classList.add('visible');

    animate();
    pollLoop();
}

init();