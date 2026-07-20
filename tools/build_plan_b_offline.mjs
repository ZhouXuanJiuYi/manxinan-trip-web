#!/usr/bin/env node
// 不联网：复用方案 A/C 已保存的 OSRM 轨迹，拼出“荔波天气备选线”。
import fs from 'node:fs/promises';

const routePath = new URL('./routes.json', import.meta.url);
const routes = JSON.parse(await fs.readFile(routePath, 'utf8'));

const points = {
  平塘: [25.829, 107.324],
  安顺: [26.253, 105.948],
  黄果树瀑布: [25.9917, 105.6667],
};

function decodePolyline(str) {
  let i = 0, lat = 0, lng = 0;
  const result = [];
  while (i < str.length) {
    for (const axis of [0, 1]) {
      let shift = 0, value = 0, byte;
      do {
        byte = str.charCodeAt(i++) - 63;
        value |= (byte & 31) << shift;
        shift += 5;
      } while (byte >= 32);
      const delta = value & 1 ? ~(value >> 1) : value >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    result.push([lat / 1e5, lng / 1e5]);
  }
  return result;
}

function encodePolyline(rows) {
  let output = '', previousLat = 0, previousLng = 0;
  const encode = (input) => {
    let value = input < 0 ? ~(input << 1) : input << 1;
    let chunk = '';
    while (value >= 32) {
      chunk += String.fromCharCode((32 | (value & 31)) + 63);
      value >>= 5;
    }
    return chunk + String.fromCharCode(value + 63);
  };
  for (const [lat, lng] of rows) {
    const nextLat = Math.round(lat * 1e5), nextLng = Math.round(lng * 1e5);
    output += encode(nextLat - previousLat) + encode(nextLng - previousLng);
    previousLat = nextLat;
    previousLng = nextLng;
  }
  return output;
}

function distanceKm(a, b) {
  const latKm = (a[0] - b[0]) * 111;
  const lngKm = (a[1] - b[1]) * 111 * Math.cos((a[0] + b[0]) / 2 * Math.PI / 180);
  return Math.hypot(latKm, lngKm);
}

function nearestIndex(track, point, label) {
  let bestIndex = 0, bestDistance = Infinity;
  track.forEach((row, index) => {
    const distance = distanceKm(row, point);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  if (bestDistance > 8) throw new Error(`${label} 最近轨迹仍相距 ${bestDistance.toFixed(1)} km`);
  console.log(`${label}: 最近点相距 ${bestDistance.toFixed(1)} km`);
  return bestIndex;
}

const aD6 = decodePolyline(routes.tracks.a[5]);
const aD9 = decodePolyline(routes.tracks.a[8]);
const cD7 = decodePolyline(routes.tracks.c[6]);
const cD10 = decodePolyline(routes.tracks.c[9]);

const aD6Pingtang = nearestIndex(aD6, points.平塘, 'D6 平塘终点');
const cD7Pingtang = nearestIndex(cD7, points.平塘, 'D7 平塘起点');
const aD9Huangguoshu = nearestIndex(aD9, points.黄果树瀑布, 'D8 黄果树 A 段');
const cD10Huangguoshu = nearestIndex(cD10, points.黄果树瀑布, 'D8 黄果树 C 段');
const aD9Anshun = nearestIndex(aD9, points.安顺, 'D9 安顺起点');

const bD6 = [...aD6.slice(0, aD6Pingtang + 1), points.平塘];
const bD7 = [points.平塘, ...cD7.slice(cD7Pingtang + 1)];
const huangguoshuToAnshun = cD10.slice(0, cD10Huangguoshu + 1).reverse();
const bD8 = [...aD9.slice(0, aD9Huangguoshu + 1), ...huangguoshuToAnshun.slice(1), points.安顺];
const bD9 = [points.安顺, ...aD9.slice(aD9Anshun + 1)];

routes.tracks.b = [...routes.tracks.a];
routes.stats.b = routes.stats.a.map((row) => ({ ...row }));

for (const [index, track, stat] of [
  [5, bD6, { m: 'drive', km: 400, min: 310 }],
  [6, bD7, { m: 'drive', km: 155, min: 115 }],
  [7, bD8, { m: 'drive', km: 180, min: 130 }],
  [8, bD9, { m: 'drive', km: 220, min: 150 }],
]) {
  routes.tracks.b[index] = encodePolyline(track);
  routes.stats.b[index] = stat;
}

await fs.writeFile(routePath, JSON.stringify(routes));
console.log('已离线生成方案二 22 天轨迹与统计');
