/**
 * WebRTC 检查页端到端本地测试：直接消费 WEBRTC_SCRIPT 值（不再从 HTML 正则切除），
 * vm 沙箱 + mock document / RTCPeerConnection / fetch 模拟点击「开始检测」全流程。
 * 用法：node test/webrtc-dom.mjs
 */
import { WEBRTC_SCRIPT } from '../edge-functions/[[default]].js';
import { makeDom, runScript, checker } from './helpers/dom-sandbox.mjs';

const { check, report } = checker();

// mock RTCPeerConnection：先发 host + srflx 候选，再发 null 结束收集
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

// mock fetch：/test 返回与 srflx 相同的公网 IP → 判定应无泄漏
const fetch = async () => ({ ok: true, text: async () => '203.0.113.7\n' });

const { document } = makeDom();
try {
  runScript(WEBRTC_SCRIPT, { document, RTCPeerConnection: MockPC, fetch });
  check('内嵌 JS 在 DOM 沙箱中可执行', true);
} catch (e) {
  check('内嵌 JS 在 DOM 沙箱中可执行', false, e.message);
  report();
}

const btn = document.getElementById('run');
check('按钮已绑定点击事件', typeof btn.listeners.click === 'function');

await btn.listeners.click();
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

report();
