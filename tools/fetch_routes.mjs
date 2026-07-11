#!/usr/bin/env node
// 抓取方案 A/B 每个驾车日的 OSRM 真实道路轨迹 + 里程/时长,输出 tools/routes.json
// 用法: node tools/fetch_routes.mjs   (之后运行 node tools/inject_routes.mjs 注入 index.html)

const places = {
  太原: [37.8706, 112.5489], 襄阳: [32.009, 112.122], 宜昌: [30.6919, 111.2865],
  三峡大坝: [30.8232, 111.0077], 恩施: [30.295, 109.4868], 清江: [30.451, 109.74],
  恩施大峡谷: [30.448, 109.202], 咸丰: [29.665, 109.14], 镇远: [27.05, 108.41],
  千户苗寨: [26.492, 108.315], 荔波: [25.413, 107.887], 小七孔: [25.25, 107.733],
  平塘: [25.829, 107.324], 贵阳: [26.647, 106.63], 安顺: [26.253, 105.948],
  黄果树瀑布: [25.9917, 105.6667], 万峰林: [25.0867, 104.9316], 兴义: [25.091, 104.895],
  弥勒: [24.408, 103.306], 抚仙湖: [24.673, 102.904], 昆明: [25.039, 102.718],
  大理: [25.606, 100.267], 大理古城: [25.695, 100.156], 丽江: [26.872, 100.229],
  攀枝花: [26.582, 101.718], 昭通: [27.338, 103.716], 巴中: [31.868, 106.753],
  渭南: [34.5, 109.51], 普洱: [22.788, 100.981], 腾冲: [25.021, 98.491],
  西双版纳: [22.008, 100.798],
};

// 与 index.html 中 planData 的 [from, via[], to] 逐日对应
const planA = [
  ['太原', [], '襄阳'],
  ['襄阳', ['三峡大坝'], '宜昌'],
  ['宜昌', [], '恩施'],
  ['恩施', ['恩施大峡谷'], '咸丰'],
  ['咸丰', [], '镇远'],
  ['镇远', ['小七孔'], '荔波'],
  ['荔波', ['平塘'], '贵阳'],
  ['贵阳', [], '贵阳'],
  ['贵阳', ['黄果树瀑布'], '兴义'],
  ['兴义', ['万峰林', '弥勒'], '抚仙湖'],
  ['抚仙湖', [], '抚仙湖'],
  ['抚仙湖', [], '昆明'],
  ['昆明', [], '昆明'],
  ['昆明', [], '昆明'],
  ['昆明', [], '大理'],
  ['大理', ['大理古城'], '大理'],
  ['大理', [], '腾冲'],
  ['腾冲', [], '腾冲'],
  ['腾冲', [], '普洱'],
  ['普洱', [], '西双版纳'],
  ['西双版纳', [], '西双版纳'],
  ['西双版纳', [], '太原', 'fly'],
];

const planB = [
  ['太原', [], '襄阳'],
  ['襄阳', ['三峡大坝'], '宜昌'],
  ['宜昌', ['清江'], '恩施'],
  ['恩施', ['恩施大峡谷'], '恩施'],
  ['恩施', [], '千户苗寨'],
  ['千户苗寨', ['小七孔'], '荔波'],
  ['荔波', ['平塘'], '贵阳'],
  ['贵阳', [], '贵阳'],
  ['贵阳', [], '安顺'],
  ['安顺', ['黄果树瀑布', '万峰林'], '兴义'],
  ['兴义', ['弥勒'], '抚仙湖'],
  ['抚仙湖', [], '昆明'],
  ['昆明', [], '昆明'],
  ['昆明', [], '昆明'],
  ['昆明', [], '大理'],
  ['大理', ['大理古城'], '大理'],
  ['大理', [], '攀枝花'],
  ['攀枝花', [], '昭通'],
  ['昭通', [], '巴中'],
  ['巴中', [], '渭南'],
  ['渭南', [], '太原'],
];

function decodePolyline(str) {
  let i = 0, lat = 0, lng = 0; const pts = [];
  while (i < str.length) {
    for (const k of [0, 1]) {
      let shift = 0, res = 0, b;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 31) << shift; shift += 5; } while (b >= 32);
      const d = res & 1 ? ~(res >> 1) : res >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    pts.push([lat / 1e5, lng / 1e5]);
  }
  return pts;
}

function encodePolyline(pts) {
  let out = '', plat = 0, plng = 0;
  const enc = (v) => {
    v = v < 0 ? ~(v << 1) : v << 1; let s = '';
    while (v >= 32) { s += String.fromCharCode((32 | (v & 31)) + 63); v >>= 5; }
    return s + String.fromCharCode(v + 63);
  };
  for (const [lat, lng] of pts) {
    const ilat = Math.round(lat * 1e5), ilng = Math.round(lng * 1e5);
    out += enc(ilat - plat) + enc(ilng - plng); plat = ilat; plng = ilng;
  }
  return out;
}

// Douglas-Peucker,容差约 0.0004°(≈40 m),压缩体积同时在日级缩放下仍贴合道路
function simplify(pts, tol = 4e-4) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let worst = -1, wd = tol;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d;
      if (len2 === 0) d = Math.hypot(px - ax, py - ay);
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (d > wd) { wd = d; worst = i; }
    }
    if (worst > 0) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function haversineKm(a, b) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toR, dLng = (b[1] - a[1]) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchDay(anchors, attempt = 1) {
  const coords = anchors.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=polyline&steps=false`;
  const res = await fetch(url);
  if (!res.ok) {
    if (attempt < 4) { await sleep(1500 * attempt); return fetchDay(anchors, attempt + 1); }
    throw new Error(`OSRM ${res.status} for ${coords}`);
  }
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error(`OSRM code=${data.code} for ${coords}`);
  const route = data.routes[0];
  return { geometry: route.geometry, distM: route.distance, durS: route.duration };
}

async function buildPlanTracks(rows, label) {
  const tracks = [], stats = [];
  for (let i = 0; i < rows.length; i++) {
    const [from, via, to, mode] = rows[i];
    if (mode === 'fly') {
      const km = Math.round(haversineKm(places[from], places[to]));
      tracks.push(null);
      stats.push({ m: 'fly', km, min: 195 }); // 景洪—太原直飞约 3h15m
      console.log(`${label} D${i + 1} ${from}✈${to}  直线 ${km} km`);
      continue;
    }
    const anchors = [places[from], ...via.map((v) => places[v]), places[to]];
    if (from === to && via.length === 0) {
      tracks.push(null);
      stats.push({ m: 'local', km: 0, min: 0 });
      console.log(`${label} D${i + 1} ${from} 当地游(无驾车段)`);
      continue;
    }
    const { geometry, distM, durS } = await fetchDay(anchors);
    const full = decodePolyline(geometry);
    const slim = simplify(full);
    tracks.push(encodePolyline(slim));
    const km = Math.round(distM / 1000 / 5) * 5 || Math.round(distM / 1000);
    const min = Math.round(durS / 60 / 5) * 5;
    stats.push({ m: from === to ? 'loop' : 'drive', km, min });
    console.log(`${label} D${i + 1} ${from}→${via.join('/')}${via.length ? '→' : ''}${to}  ${km} km  ${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}m  点数 ${full.length}→${slim.length}`);
    await sleep(900);
  }
  return { tracks, stats };
}

const a = await buildPlanTracks(planA, 'A');
const b = await buildPlanTracks(planB, 'B');
const output = { tracks: { a: a.tracks, b: b.tracks }, stats: { a: a.stats, b: b.stats } };
const outPath = new URL('./routes.json', import.meta.url);
await import('node:fs/promises').then((fs) => fs.writeFile(outPath, JSON.stringify(output)));
const size = JSON.stringify(output.tracks).length;
console.log(`\n完成:tracks 体积 ≈ ${(size / 1024).toFixed(1)} KB,已写入 tools/routes.json`);
