#!/usr/bin/env node
// 把 tools/routes.json 的双方案轨迹/里程注入 index.html,并应用醒目标注 UI 改造。
// 幂等性:脚本假定 index.html 处于"未打补丁"状态;重跑前请先 git checkout index.html。
import fs from 'node:fs';

const htmlPath = new URL('../index.html', import.meta.url);
let src = fs.readFileSync(htmlPath, 'utf8');
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\n$/, '');

let step = '';
const fail = (msg) => { console.error(`✗ [${step}] ${msg}`); process.exit(1); };
const count = (hay, needle) => hay.split(needle).length - 1;

function replaceOnce(find, repl) {
  const n = count(src, find);
  if (n !== 1) fail(`needle 出现 ${n} 次(应为 1):${find.slice(0, 60)}…`);
  src = src.replace(find, () => repl);
  console.log(`✓ ${step}`);
}
function idxOnce(find, from = 0) {
  const i = src.indexOf(find, from);
  if (i < 0) fail(`找不到:${find.slice(0, 60)}…`);
  return i;
}

// R1 移除旧 23 天数据(plans 行、dailyRoutes、roadTracks)
step = 'R1 移除旧23天数据';
{
  const i1 = idxOnce('let plans=[');
  const i2 = idxOnce('const roadTracks=[', i1);
  const i3 = idxOnce('];', i2) + 2;
  src = src.slice(0, i1) + 'let plans=[];' + src.slice(i3);
  console.log(`✓ ${step}`);
}

// R2 gcjTracks/gcjAnchors 初始化改为空,并声明 dayStats
step = 'R2 空初始化+dayStats';
{
  const i1 = idxOnce('let gcjTracks=roadTracks.map');
  const i2 = idxOnce('let gcjAnchors=dailyRoutes.map', i1);
  const i3 = idxOnce('\n', i2);
  src = src.slice(0, i1) + 'let gcjTracks=[],gcjAnchors=[],dayStats=[];' + src.slice(i3);
  console.log(`✓ ${step}`);
}

// R3 planData 重构为独立的 {a, b}(去掉 c 与 planData.b=planData.a 别名)
step = 'R3 planData 重构';
{
  const iStart = idxOnce('const planData={');
  const bMark = 'a:buildPlan([';
  const ibs = idxOnce(bMark, iStart) + bMark.length;
  const ibe = idxOnce('\n      ]),', ibs);
  const bRows = src.slice(ibs, ibe);
  const aMark = 'planData.a=buildPlan([';
  const iA = idxOnce(aMark, ibe);
  const aStart = iA + aMark.length;
  const aEnd = idxOnce('\n    ]);', aStart);
  const aRows = src.slice(aStart, aEnd);
  if (count(aRows, '腾冲') === 0) fail('方案A行里未见腾冲,切分错位');
  if (count(bRows, '攀枝花') === 0) fail('方案B行里未见攀枝花,切分错位');
  src = src.slice(0, iStart)
    + 'const planData={a:buildPlan([' + aRows + '\n    ]),b:buildPlan([' + bRows + '\n    ])};'
    + src.slice(aEnd + '\n    ]);'.length);
  console.log(`✓ ${step}`);
}

// R4 在 planInfo 之后注入轨迹数据 + 统计/格式化/标注辅助函数
step = 'R4 注入轨迹与统计';
{
  const routes = JSON.parse(fs.readFileSync(new URL('./routes.json', import.meta.url), 'utf8'));
  for (const pid of ['a', 'b']) {
    const n = pid === 'a' ? 22 : 21;
    if (routes.tracks[pid].length !== n || routes.stats[pid].length !== n) fail(`routes.json 方案${pid} 天数不是 ${n}`);
  }
  let block = read('./patch/datablock.txt')
    .replace('__TRACKS__', JSON.stringify(routes.tracks))
    .replace('__STATS__', JSON.stringify(routes.stats));
  if (/<\/script/i.test(block)) fail('数据中出现 </script,不能内嵌');
  const i = idxOnce('const planInfo={');
  const j = idxOnce('\n', i) + 1;
  src = src.slice(0, j) + block + '\n' + src.slice(j);
  console.log(`✓ ${step}`);
}

// R5 重写 activateRoutePlan(使用预取轨迹 + 总里程/总时长统计)
step = 'R5 activateRoutePlan';
{
  const i = idxOnce('    function activateRoutePlan(id){');
  const j = idxOnce('\n', i);
  src = src.slice(0, i) + read('./patch/activateRoutePlan.txt') + src.slice(j);
  console.log(`✓ ${step}`);
}

// R6 日卡片加里程行
step = 'R6 renderDays';
{
  const i = idxOnce('    function renderDays(){');
  const j = idxOnce('\n', i);
  src = src.slice(0, i) + read('./patch/renderDays.txt') + src.slice(j);
  console.log(`✓ ${step}`);
}

// R7 详情面板:车程/里程大字 + 自驾累计/全程
step = 'R7 render';
{
  const i = idxOnce('    function render(){const p=plans[selected]');
  const j = idxOnce('\n', i);
  src = src.slice(0, i) + read('./patch/render.txt') + src.slice(j);
  console.log(`✓ ${step}`);
}

// R8 地图信息条:右侧大号里程/时长
step = 'R8 map-info';
{
  const iFn = idxOnce('function updateRouteMap(){');
  const i = idxOnce('info.innerHTML=', iFn);
  const j = idxOnce(';info.classList.add', i);
  src = src.slice(0, i) + read('./patch/mapinfo.txt') + src.slice(j);
  console.log(`✓ ${step}`);
}

// R9 路线中点里程标签 + 飞行日紫色虚线
step = 'R9a drawRoute 中点标签';
replaceOnce('casing.setLatLngs(track);line.setLatLngs(track);',
  'casing.setLatLngs(track);line.setLatLngs(track);addDistLabel(dayLayer,track);');
step = 'R9b drawInstant 中点标签';
replaceOnce('list.forEach(m=>spawnMark(m,dayLayer,true))}',
  'list.forEach(m=>spawnMark(m,dayLayer,true));addDistLabel(dayLayer,track)}');
step = 'R9c drawInstant 飞行日样式';
replaceOnce(`L.polyline(track,{color:'#164a40',weight:4.2`,
  `L.polyline(track,{color:isFlyDay()?'#7a5bd6':'#164a40',dashArray:isFlyDay()?'12 9':null,weight:4.2`);
step = 'R9d drawRoute 飞行日样式';
replaceOnce(`line=L.polyline([track[0]],{color:'#164a40',weight:4.2`,
  `line=L.polyline([track[0]],{color:isFlyDay()?'#7a5bd6':'#164a40',dashArray:isFlyDay()?'12 9':null,weight:4.2`);

// R14 总览图:有飞行段的方案不再把尾段涂成"自驾返程"蓝
step = 'R14 总览返程配色';
replaceOnce('returning=index>=Math.ceil(gcjTracks.length*.72)',
  `returning=!plans.some(p=>p[7]==='飞机')&&index>=Math.ceil(gcjTracks.length*.72)`);

// R10 新样式块
step = 'R10 样式';
replaceOnce('</head>', read('./patch/styles.txt') + '\n</head>');

// R11 hero 增加全程公里数
step = 'R11 hero 公里数';
replaceOnce('<div class="stat"><b>2</b><span>可选路线</span></div>',
  '<div class="stat"><b id="trip-total-km">—</b><span>公里自驾全程</span></div><div class="stat"><b>2</b><span>可选路线</span></div>');

// R13 每日路线简介文案
step = 'R13 简介文案';
replaceOnce('点击任意一天，左侧地图会绘制当天的道路轨迹、起终点与游览锚点。',
  '点击任意一天，左侧地图会绘制当天的道路轨迹、起终点与游览锚点；路线中点的红色标签、日历条与底部信息栏，都会标出当天里程与纯驾车时长。');

fs.writeFileSync(htmlPath, src);
console.log(`\n全部完成,index.html 现为 ${(src.length / 1024).toFixed(1)} KB`);
