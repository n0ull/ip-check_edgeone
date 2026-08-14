/**
 * WebRTC 检查页端到端本地测试：在 vm 沙箱中执行渲染后的内嵌浏览器 JS，
 * 用 mock 的 document / RTCPeerConnection / fetch 模拟点击「开始检测」的完整流程，
 * 断言 DOM 更新与泄漏判定结果。用法：node test/webrtc-dom.mjs
 */
import vm from 'node:vm';
import { onRequest } from '../edge-functions/[[default]].js';

let passed = 0, failed = 0;
const check = (name, cond, detail) => {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (detail ? ' — ' + detail : '')); }
};

// 1. 渲染 /webrtc 页面并提取内嵌 JS
const res = await onRequest({ request: new Request('https://ip.example.com/webrtc'), params: {}, env: {}, waitUntil: () => {} });
const html = await res.text();
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.log('✘ 页面无内嵌脚本'); process.exit(1); }
const js = m[1];

// 2. mock DOM
function makeEl(id) { return { id, textContent: '', className: '', disabled: false, style: {}, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } }; }
const els = {};
const document = { getElementById: (id) => els[id] || (els[id] = makeEl(id)) };

// 3. mock RTCPeerConnection：先发 host + srflx 候选，再发 null 结束收集
class MockPC {
  constructor(config) { this.config = config; }
  createDataChannel() { return {}; }
  createOffer() { return Promise.resolve({}); }
  setLocalDescription() {
    const self = this;
    setTimeout(() => {
      self.onicecandidate && self.onicecandidate({ candidate: { candidate: 'candidate:1 1 udp 2130706431 192.168.1.5 54321 typ host generation 0', type: 'host' } });
      self.onicecandidate && self.onicecandidate({ candidate: { candidate: 'candidate:2 1 udp 1694498815 203.0.113.7 56789 typ srflx raddr 0.0.0.0 rport 0', type: 'srflx' } });
      setTimeout(() => self.onicecandidate && self.onicecandidate({ candidate: null }), 5);
    }, 5);
    return Promise.resolve();
  }
  close() {}
}

// 4. mock fetch：/test 返回与 srflx 相同的公网 IP → 判定应无泄漏
const fetch = async (url) => ({ ok: true, text: async () => '203.0.113.7\n' });

const sandbox = { document, RTCPeerConnection: MockPC, fetch, setTimeout, clearTimeout, Promise, console };
vm.createContext(sandbox);

// 5. 执行内嵌 JS（含按钮绑定），模拟点击
try {
  vm.runInContext(js, sandbox, { timeout: 5000 });
  check('内嵌 JS 在 DOM 沙箱中可执行', true);
} catch (e) {
  check('内嵌 JS 在 DOM 沙箱中可执行', false, e.message);
  process.exit(1);
}

const btn = document.getElementById('run');
check('按钮已绑定点击事件', typeof btn.listeners.click === 'function');

const runPromise = btn.listeners.click();
await runPromise;
await new Promise((r) => setTimeout(r, 50));

const pub = document.getElementById('pub');
const loc = document.getElementById('loc');
const ext = document.getElementById('ext');
const verdict = document.getElementById('verdict');

check('公网 IP（srflx）已显示', pub.textContent === '203.0.113.7', 'got: ' + pub.textContent);
check('局域网 IP（host）已显示', loc.textContent === '192.168.1.5', 'got: ' + loc.textContent);
check('当前出口 IP 已显示', ext.textContent === '203.0.113.7', 'got: ' + ext.textContent);
check('判定为无泄漏', verdict.textContent.includes('未发现 WebRTC 泄漏'), 'got: ' + verdict.textContent);
check('按钮恢复可点', btn.disabled === false);

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed === 0 ? 0 : 1);