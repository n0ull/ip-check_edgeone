/**
 * WebRTC 检查页端到端本地测试：直接消费 WEBRTC_SCRIPT 值，vm 沙箱 + mock document /
 * RTCPeerConnection / fetch 模拟点击「开始检测」，覆盖判定四分支：
 * 无泄漏 / 存在泄漏 / 无公网映射（STUN 不可达）/ 无出口 IP。
 * 用法：node test/webrtc-dom.mjs
 */
import { WEBRTC_SCRIPT } from '../edge-functions/[[default]].js';
import { subdomainPath } from '../edge-functions/_shared.js';
import { makeDom, runScript, checker } from './helpers/dom-sandbox.mjs';

const { check, report } = checker();

const HOST_CAND = { candidate: { candidate: 'candidate:1 1 udp 2130706431 192.168.1.5 54321 typ host generation 0', type: 'host' } };
const srflx = (ip) => ({ candidate: { candidate: 'candidate:2 1 udp 1694498815 ' + ip + ' 56789 typ srflx raddr 0.0.0.0 rport 0', type: 'srflx' } });

// candidates：按序投递的 ICE 候选（结尾自动补 null 结束收集）；fetchOk/fetchBody：出口 IP
// 端点（subdomainPath('test')）的响应。fetch 为单键严格路由：脚本只应请求 fact 路径，
// 未命中即网络失败——脚本侧路径漂移时分支 1-3 的判定断言当场红（URL 盲 mock 会把漂移喂成假绿）
async function runWebrtc(candidates, fetchOk, fetchBody) {
  const { document, els } = makeDom();
  class MockPC {
    constructor(config) { this.config = config; }
    createDataChannel() { return {}; }
    createOffer() { return Promise.resolve({}); }
    setLocalDescription() {
      const self = this;
      setTimeout(() => {
        for (const c of candidates) self.onicecandidate && self.onicecandidate(c);
        setTimeout(() => self.onicecandidate && self.onicecandidate({ candidate: null }), 5);
      }, 5);
      return Promise.resolve();
    }
    close() {}
  }
  const fetch = async (u) => {
    if (String(u) !== subdomainPath('test')) throw new Error('network fail: ' + u);
    return { ok: fetchOk, text: async () => fetchBody };
  };
  let err = null;
  try {
    runScript(WEBRTC_SCRIPT, { document, RTCPeerConnection: MockPC, fetch });
  } catch (e) { err = e; }
  const btn = document.getElementById('run');
  const bound = typeof btn.listeners.click === 'function';
  if (bound) {
    await btn.listeners.click();
    await new Promise((r) => setTimeout(r, 50));
  }
  return { els, err, bound, btn };
}

// —— 分支 1：公网映射与出口一致 → 未发现泄漏 ——
{
  const { els, err, bound, btn } = await runWebrtc([HOST_CAND, srflx('203.0.113.7')], true, '203.0.113.7\n');
  check('内嵌 JS 在 DOM 沙箱中可执行且按钮已绑定', !err && bound, err ? err.message : '');
  check('公网 IP（srflx）已显示', els['pub'].textContent === '203.0.113.7', 'got: ' + els['pub'].textContent);
  check('局域网 IP（host）已显示', els['loc'].textContent === '192.168.1.5', 'got: ' + els['loc'].textContent);
  check('当前出口 IP 已显示', els['ext'].textContent === '203.0.113.7', 'got: ' + els['ext'].textContent);
  check('判定：未发现泄漏', els['verdict'].className === 'verdict ok' && els['verdict'].textContent.includes('未发现 WebRTC 泄漏'), 'got: ' + els['verdict'].textContent);
  check('按钮恢复可点', btn.disabled === false);
}

// —— 分支 2：公网映射与出口不一致 → 可能存在泄漏 ——
{
  const { els } = await runWebrtc([HOST_CAND, srflx('198.51.100.23')], true, '203.0.113.7\n');
  check('泄漏：公网映射已显示', els['pub'].textContent === '198.51.100.23', 'got: ' + els['pub'].textContent);
  check('泄漏：出口 IP 不同', els['ext'].textContent === '203.0.113.7', 'got: ' + els['ext'].textContent);
  check('判定：可能存在 WebRTC 泄漏', els['verdict'].className === 'verdict warn' && els['verdict'].textContent.includes('可能存在 WebRTC 泄漏'), 'got: ' + els['verdict'].textContent);
}

// —— 分支 3：无公网映射（STUN 不可达或网络限制）——
{
  const { els } = await runWebrtc([HOST_CAND], true, '203.0.113.7\n');
  check('无映射：公网显示占位说明', els['pub'].textContent === '—（未获取到公网映射）', 'got: ' + els['pub'].textContent);
  check('无映射：局域网仍显示', els['loc'].textContent === '192.168.1.5', 'got: ' + els['loc'].textContent);
  check('判定：无法对比', els['verdict'].className === 'verdict warn' && els['verdict'].textContent.includes('无法对比'), 'got: ' + els['verdict'].textContent);
}

// —— 分支 4：无出口 IP（出口 IP 端点不可达，ok:false 与生产漂移时的 404 同构）——
{
  const { els } = await runWebrtc([HOST_CAND, srflx('203.0.113.7')], false, '');
  check('无出口：出口显示占位', els['ext'].textContent === '—', 'got: ' + els['ext'].textContent);
  check('判定：无法获取当前出口 IP', els['verdict'].className === 'verdict err' && els['verdict'].textContent.includes('无法获取当前出口 IP'), 'got: ' + els['verdict'].textContent);
}

report();
