/**
 * 双文件内联一致性校验（无需 EdgeOne 环境，Node 18+ 随 npm test 运行）。
 * 背景：index.js 与 [[default]].js 各自内联同一组工具函数（边缘构建器兼容性约束，不跨文件 import，
 * 见 .agents/notes/implemented/architecture/2026-08-14-client-ip-acquisition-contract.md）。
 * 受检集合自动推导：两文件顶层 function 声明的交集 − EXEMPT，无需手工清单，新增共享函数自动纳入。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const FILES = ['index.js', '[[default]].js'];
// 同名不同体的合法例外：onRequest 是两文件各自的入口（Host 分发 vs 路径端点）。
// 失效方向安全：漏加例外 → 门禁误报（吵）；而非手工清单时代的漏保（静）。
const EXEMPT = new Set(['onRequest']);

let passed = 0, failed = 0;
const check = (name, cond, detail) => {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
};

// 顶层 function 声明扫描：严格行首锚定（嵌套函数有缩进，不匹配）。
// 声明起点（含 export/async 修饰符）即比对起点——修饰符漂移（如一侧 async 另一侧不是）同样判不一致。
function topLevelFns(src) {
  const re = /^(export\s+)?(async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  const map = new Map();
  let m;
  while ((m = re.exec(src)) !== null) map.set(m[3], m.index);
  return map;
}

// 从声明起点截取完整函数源码（按花括号配对；
// 约束：被比对函数体内字符串/正则中的花括号必须成对出现，当前共享函数均满足）
function extractFn(src, start) {
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}

// 仅归一化行尾差异（CRLF/尾随空白），其余逐字比对——字符串内的空白属于响应文案，不可归一化
const norm = (s) => s.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').trim();

const srcs = FILES.map((f) => readFileSync(path.join(root, 'edge-functions', f), 'utf8'));
const fnMaps = srcs.map(topLevelFns);

// 交集推导：同名顶层函数即共享契约。交集打印在日志中供人工扫视（透明化）；
// 盲区：共享函数被单方面改名会从交集消失——函数删除由 simulate.mjs 的运行时引用兜底，改名靠本日志与审查兜底。
const shared = [...fnMaps[0].keys()].filter((n) => fnMaps[1].has(n) && !EXEMPT.has(n));
console.log('受检共享函数（交集推导）：' + (shared.join(', ') || '（空）'));

check('受检集合非空（防空交集静默通过）', shared.length > 0);

for (const name of shared) {
  const a = extractFn(srcs[0], fnMaps[0].get(name));
  const b = extractFn(srcs[1], fnMaps[1].get(name));
  check(name + ' 提取成功', !!a && !!b);
  if (a && b) check(name + ' 双文件源码一致（含声明修饰符）', norm(a) === norm(b), 'index.js 与 [[default]].js 实现漂移');
}

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed === 0 ? 0 : 1);
