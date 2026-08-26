/**
 * 双文件内联一致性校验（无需 EdgeOne 环境，Node 18+ 随 npm test 运行）。
 * 背景：index.js 与 [[default]].js 各自内联同一组工具函数（边缘构建器兼容性约束，不跨文件 import，
 * 见 .agents/notes/implemented/architecture/2026-08-14-client-ip-acquisition-contract.md）。
 * 本脚本提取两文件中同名函数的源码并逐字比对，把『改一必改二』从人工约定变为机械门禁。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const FILES = ['index.js', '[[default]].js'];
const SHARED = ['isIpv4', 'isIpv6', 'getClientIp', 'baseHeaders', 'textResponse', 'jsonResponse', 'wantsJson', 'handleV4', 'handleTest'];

let passed = 0, failed = 0;
const check = (name, cond, detail) => {
  if (cond) { passed++; console.log('  \u2714 ' + name); }
  else { failed++; console.log('  \u2718 ' + name + (detail ? ' — ' + detail : '')); }
};

// 提取 function <name>(...) { ... } 的完整源码（按花括号配对；
// 约束：被比对函数体内字符串/正则中的花括号必须成对出现，当前共享函数均满足）
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start === -1) return null;
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

for (const name of SHARED) {
  const a = extractFn(srcs[0], name);
  const b = extractFn(srcs[1], name);
  check(name + ' 双文件均存在', !!a && !!b);
  if (a && b) check(name + ' 双文件源码一致', norm(a) === norm(b), 'index.js 与 [[default]].js 实现漂移');
}

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed === 0 ? 0 : 1);
