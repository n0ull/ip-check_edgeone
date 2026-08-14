/**
 * 轻量版 Agent Note 校验门。用法：node scripts/verify-agent-notes.mjs（或 npm run verify:notes）
 * 校验项：
 *   1. 生命周期/分类目录属于封闭集合（proposed|implemented|rejected|archived × 6 类）；
 *   2. 笔记文件名符合 yyyy-mm-dd-topic-title.md；
 *   3. 头部块：# Agent Note: <标题> + Status: <状态>，状态与所在目录一致；
 *   4. ## Problem 与 ## Alternatives considered 必选；
 *   5. implemented 必须含 ## Decision、## Consequences，禁止提案期章节；
 *   6. proposed 必须含 ## Proposal、## Acceptance criteria、## Risks；
 *   7. archived 必须含 Archived: 行（Status: implemented 之后）。
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const notesDir = path.join(root, '.agents', 'notes');
const LIFECYCLES = ['proposed', 'implemented', 'rejected', 'archived'];
const CLASSES = ['architecture', 'feature', 'bug-fix', 'simplification', 'process', 'testing'];
const IMPLEMENTED_BANNED = ['## Proposal', '## Plan', '## Migration plan', '## Acceptance criteria'];

let failures = 0;
const fail = (rel, msg) => { failures++; console.log('✘ ' + rel + ': ' + msg); };
const ok = (rel) => console.log('✔ ' + rel);

function walk(dir, rel, cb) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    const r = rel ? rel + '/' + entry.name : entry.name;
    if (entry.isDirectory()) walk(p, r, cb);
    else if (entry.isFile() && entry.name.endsWith('.md')) cb(p, r);
  }
}

// AGENTS.md / CLAUDE.md / README.md 是规则文件，跳过；.gitkeep 跳过
const skip = (name) => /^(AGENTS|CLAUDE|README)(\..+)?\.md$/.test(name) || name === '.gitkeep';

walk(notesDir, '', (p, rel) => {
  const parts = rel.split('/');
  if (skip(parts[parts.length - 1])) return;
  if (parts.length !== 3) { fail(rel, '路径层级不符 {lifecycle}/{class}/yyyy-mm-dd-topic.md'); return; }
  const [life, cls, file] = parts;
  if (!LIFECYCLES.includes(life)) { fail(rel, '未知生命周期目录: ' + life); return; }
  if (!CLASSES.includes(cls)) { fail(rel, '未知分类目录: ' + cls); return; }
  if (!/^\d{4}-\d{2}-\d{2}-.+\.md$/.test(file)) { fail(rel, '文件名不符合 yyyy-mm-dd-topic-title.md'); return; }
  const text = readFileSync(p, 'utf8');
  const lines = text.split(/\r?\n/);
  // 头部块：前 3 行内应有 # Agent Note: 与 Status:
  const head = lines.slice(0, 3);
  const h1 = head.find((l) => l.startsWith('# Agent Note: '));
  const st = head.find((l) => l.startsWith('Status: '));
  if (!h1) { fail(rel, '缺少 # Agent Note: 头'); return; }
  if (!st) { fail(rel, '缺少 Status: 行'); return; }
  const status = st.slice(8);
  if (life === 'implemented' && status !== 'implemented') fail(rel, 'Status 与目录不符: 期望 implemented');
  if (life === 'proposed' && status !== 'proposed') fail(rel, 'Status 与目录不符: 期望 proposed');
  if (life === 'rejected' && !status.startsWith('rejected')) fail(rel, 'Status 与目录不符: 期望 rejected — <原因>');
  if (life === 'archived' && status !== 'implemented') fail(rel, '归档笔记 Status 必须为 implemented');
  if (!text.includes('## Problem')) { fail(rel, '缺少 ## Problem'); return; }
  if (!text.includes('## Alternatives considered')) { fail(rel, '缺少 ## Alternatives considered'); return; }
  if (life === 'implemented' || life === 'archived') {
    if (!text.includes('## Decision')) { fail(rel, '缺少 ## Decision'); return; }
    if (!text.includes('## Consequences')) { fail(rel, '缺少 ## Consequences'); return; }
    for (const b of IMPLEMENTED_BANNED) {
      if (text.includes(b)) { fail(rel, 'implemented 禁止提案期章节: ' + b); return; }
    }
  }
  if (life === 'proposed') {
    if (!text.includes('## Proposal')) { fail(rel, '缺少 ## Proposal'); return; }
    if (!text.includes('## Acceptance criteria')) { fail(rel, '缺少 ## Acceptance criteria'); return; }
    if (!text.includes('## Risks')) { fail(rel, '缺少 ## Risks'); return; }
  }
  if (life === 'archived') {
    if (!/^Archived: \d{4}-\d{2}-\d{2}$/m.test(text)) fail(rel, '归档笔记缺少 Archived: YYYY-MM-DD 行');
  }
  ok(rel);
});

console.log(failures === 0 ? '\nAgent Note 校验通过。' : '\n' + failures + ' 处失败。');
process.exit(failures === 0 ? 0 : 1);