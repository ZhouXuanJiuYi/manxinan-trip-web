#!/usr/bin/env node
// 抓取方案 A/B/C 每个驾车日的 OSRM 真实道路轨迹 + 里程/时长,输出 tools/routes.json
// 用法: node tools/fetch_routes.mjs          # 全量刷新
//       node tools/fetch_routes.mjs A20 B20  # 只刷新指定方案/日期
// 之后运行 node tools/inject_routes.mjs 注入 index.html
import fs from 'node:fs/promises';

const requestedDays = new Set(process.argv.slice(2).map((value) => value.toUpperCase()));

const places = {
  太原: [37.8706, 112.5489], 襄阳: [32.009, 112.122], 宜昌: [30.6919, 111.2865],
  三峡大坝: [30.8232, 111.0077], 恩施: [30.295, 109.4868], 清江: [30.451, 109.74],
  恩施大峡谷: [30.448, 109.202], 咸丰: [29.665, 109.14], 黔江: [29.48188, 108.794448], 来凤: [29.5069, 109.4083],
  龙山: [29.46, 109.4393], 湘鄂边界: [29.46, 109.4393], 镇远: [27.05, 108.41],
  高过河漂流: [27.21598, 108.315262],
  千户苗寨: [26.492, 108.315], 平塘: [25.829, 107.324],
  中国天眼: [25.654, 106.857], 马岭河: [25.13, 104.945],
  贵阳: [26.647, 106.63], 安顺: [26.253, 105.948],
  黄果树瀑布: [25.9917, 105.6667], 万峰林: [25.0867, 104.9316], 兴义: [25.091, 104.895],
  抚仙湖: [24.673, 102.904], 昆明: [25.039, 102.718],
  大理: [25.606, 100.267], 大理古城: [25.695, 100.156], 丽江: [26.872, 100.229],
  攀枝花: [26.582, 101.718], 昭通: [27.338, 103.716], 巴中: [31.868, 106.753],
  渭南: [34.5, 109.51], 临沧: [23.8878, 100.0926], 普洱: [22.788, 100.981], 腾冲: [25.021, 98.491],
  西双版纳: [22.008, 100.798],
  襄阳酒店: [32.0148169224, 112.1521515326],
  宜昌酒店: [30.6919, 111.2865],
  恩施酒店: [30.3229464531, 109.4740578538],
  黔江酒店: [29.48188, 108.794448],
  镇远民宿: [27.0519431858, 108.413343371],
  贵阳民宿: [26.5673918709, 106.6903241185],
  镇宁酒店: [26.0558, 105.7691],
  兴义民宿: [25.1278630241, 104.9291804352],
  抚仙湖民宿: [24.6285590204, 102.9618867676],
  昆明龙湖酒店: [24.9908, 102.7336],
  昆明花间驿: [25.0192762327, 102.6473080266],
  大理民宿: [25.63690915, 100.2923866759],
  腾冲酒店: [24.9485588875, 98.4457228315],
  临沧酒店: [23.8884523693, 100.089338574],
  西双版纳酒店: [22.0033635127, 100.8048935007],
  黔灵山公园: [26.5957, 106.6921],
  贵州省博物馆: [26.6462, 106.6132],
  青云市集: [26.5687, 106.7216],
  滴水滩瀑布: [25.980556, 105.613889],
  澄江化石地博物馆: [24.63453, 102.96744],
  广龙抚海湾湿地公园: [24.6345578, 102.8776355],
  云南野生动物园: [25.1297, 102.7555],
  斗南花市: [24.9069, 102.7948],
  海埂公园: [24.9563, 102.6578],
  西山: [24.9592, 102.6258],
  腾冲火山地质公园: [25.2267, 98.5156],
  滇西抗战纪念馆: [25.0167, 98.4864],
  热带植物园: [21.9277, 101.2515],
  傣族园: [21.8454, 100.9426],
};

// 方案 A 使用已确认酒店作为每天的真实起终点；当地游也按计划景点顺序计算。
const planA = [
  ['太原', [], '襄阳酒店'],
  ['襄阳酒店', ['三峡大坝'], '宜昌酒店'],
  ['宜昌酒店', [], '恩施酒店'],
  ['恩施酒店', ['恩施大峡谷'], '黔江酒店'],
  ['黔江酒店', ['高过河漂流'], '镇远民宿'],
  ['镇远民宿', [], '贵阳民宿'],
  ['贵阳民宿', ['黔灵山公园', '贵州省博物馆', '青云市集'], '贵阳民宿'],
  ['贵阳民宿', ['镇宁酒店', '滴水滩瀑布', '黄果树瀑布'], '镇宁酒店'],
  ['镇宁酒店', ['黄果树瀑布'], '兴义民宿'],
  ['兴义民宿', ['万峰林'], '抚仙湖民宿'],
  ['抚仙湖民宿', ['澄江化石地博物馆', '广龙抚海湾湿地公园'], '抚仙湖民宿'],
  ['抚仙湖民宿', [], '昆明龙湖酒店'],
  ['昆明龙湖酒店', ['云南野生动物园', '斗南花市'], '昆明龙湖酒店'],
  ['昆明龙湖酒店', ['海埂公园', '西山'], '昆明花间驿'],
  ['昆明花间驿', [], '大理民宿'],
  ['大理民宿', ['大理古城'], '大理民宿'],
  ['大理民宿', [], '腾冲酒店'],
  ['腾冲酒店', ['腾冲火山地质公园', '滇西抗战纪念馆'], '腾冲酒店'],
  ['腾冲酒店', [], '临沧酒店'],
  ['临沧酒店', ['普洱'], '西双版纳酒店'],
  ['西双版纳酒店', ['热带植物园', '傣族园'], '西双版纳酒店'],
  ['西双版纳酒店', [], '太原', 'fly'],
];

const planB = [
  ['太原', [], '襄阳'],
  ['襄阳', ['三峡大坝'], '宜昌'],
  ['宜昌', [], '恩施'],
  ['恩施', ['恩施大峡谷'], '黔江'],
  ['黔江', ['高过河漂流'], '镇远'],
  ['镇远', [], '贵阳'],
  ['贵阳', [], '贵阳'],
  ['贵阳', ['黄果树瀑布'], '安顺'],
  ['安顺', ['马岭河'], '兴义'],
  ['兴义', ['万峰林'], '抚仙湖'],
  ['抚仙湖', ['澄江化石地博物馆', '广龙抚海湾湿地公园'], '抚仙湖'],
  ['抚仙湖', [], '昆明'],
  ['昆明', [], '昆明'],
  ['昆明', [], '昆明'],
  ['昆明', [], '大理'],
  ['大理', ['大理古城'], '大理'],
  ['大理', [], '腾冲'],
  ['腾冲', [], '腾冲'],
  ['腾冲', [], '临沧'],
  ['临沧', ['普洱'], '西双版纳'],
  ['西双版纳', [], '西双版纳'],
  ['西双版纳', [], '太原', 'fly'],
];

const planC = [
  ['太原', [], '襄阳'],
  ['襄阳', ['三峡大坝'], '宜昌'],
  ['宜昌', ['清江'], '恩施'],
  ['恩施', ['恩施大峡谷'], '恩施'],
  ['恩施', [], '千户苗寨'],
  ['千户苗寨', [], '贵阳'],
  ['贵阳', [], '贵阳'],
  ['贵阳', [], '贵阳'],
  ['贵阳', [], '安顺'],
  ['安顺', ['黄果树瀑布', '万峰林'], '兴义'],
  ['兴义', [], '抚仙湖'],
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

async function buildPlanTracks(rows, label, previous) {
  const tracks = [], stats = [];
  for (let i = 0; i < rows.length; i++) {
    const [from, via, to, mode] = rows[i];
    if (requestedDays.size && !requestedDays.has(`${label}${i + 1}`)) {
      if (!previous || i >= previous.tracks.length || i >= previous.stats.length) throw new Error(`缺少 ${label}${i + 1} 的既有路线数据`);
      tracks.push(previous.tracks[i]);
      stats.push(previous.stats[i]);
      continue;
    }
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

const outPath = new URL('./routes.json', import.meta.url);
const previous = requestedDays.size ? JSON.parse(await fs.readFile(outPath, 'utf8')) : null;
const a = await buildPlanTracks(planA, 'A', previous && { tracks: previous.tracks.a, stats: previous.stats.a });
const b = await buildPlanTracks(planB, 'B', previous && { tracks: previous.tracks.b, stats: previous.stats.b });
const c = await buildPlanTracks(planC, 'C', previous && { tracks: previous.tracks.c, stats: previous.stats.c });
const output = { tracks: { a: a.tracks, b: b.tracks, c: c.tracks }, stats: { a: a.stats, b: b.stats, c: c.stats } };
await fs.writeFile(outPath, JSON.stringify(output));
const size = JSON.stringify(output.tracks).length;
console.log(`\n完成:tracks 体积 ≈ ${(size / 1024).toFixed(1)} KB,已写入 tools/routes.json`);
