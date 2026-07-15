#!/usr/bin/env node
// 把 tools/routes.json 的轨迹与统计注入 index.html,整行替换两个常量
// 用法: node tools/fetch_routes.mjs && node tools/inject_routes.mjs
import fs from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const htmlPath = new URL('index.html', root);
const { tracks, stats } = JSON.parse(await fs.readFile(new URL('routes.json', new URL('.', import.meta.url)), 'utf8'));

let html = await fs.readFile(htmlPath, 'utf8');
const lines = html.split('\n');
const replaceLine = (marker, value) => {
  const i = lines.findIndex((l) => l.trimStart().startsWith(marker));
  if (i === -1) throw new Error(`index.html 中找不到 ${marker}`);
  lines[i] = `    ${marker}${JSON.stringify(value)};`;
};
replaceLine('const roadTracksByPlan=', tracks);
replaceLine('const routeStatsByPlan=', stats);
await fs.writeFile(htmlPath, lines.join('\n'));
console.log('已注入 roadTracksByPlan 与 routeStatsByPlan');
