/**
 * 打包门禁：以 esbuild 复刻平台构建（bundle + esm，选项与线上产物实测一致），对「打包后」
 * 导出的页面脚本做用户可见契约断言。本地直跑时 browserScript 拿到的函数名与源码一致，
 * 平台构建却会因自由标识符避让而改名（2026-08-29 线上事故：esbuild 将共享符号 isIpv4
 * 改名为 isIpv42，webrtc 页 ReferenceError，公网/局域网提取全废，本地 npm test 全绿测不出）——
 * 本文件堵住「本地绿、线上废」的盲区：页面脚本中任何被调用的共享符号若在打包后失去声明，
 * ICE 处理器/抓取路径立即 ReferenceError，被沙箱 Proxy 陷阱与处理器错误捕获点名。
 * 用法：node test/bundle-gate.mjs
 */
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { makeDom, runScript, checker } from './helpers/dom-sandbox.mjs';

const { check, report } = checker();
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 平台构建复刻：默认选项（platform=browser）+ bundle + esm；产物经实测与线上下发脚本逐字一致
const dir = await mkdtemp(join(tmpdir(), 'ipcheck-bundle-'));
await build({
  entryPoints: [join(root, 'edge-functions/index.js'), join(root, 'edge-functions/[[default]].js')],
  bundle: true,
  format: 'esm',
  outdir: dir,
  outExtension: { '.js': '.mjs' },
  logLevel: 'silent',
});
const webrtcBundle = await import(pathToFileURL(join(dir, '[[default]].mjs')).href);
const uiBundle = await import(pathToFileURL(join(dir, 'index.mjs')).href);

const V4 = '203.0.113.7';
const V6 = '240e:390:abcd:1234::1';

// —— [[default]].js 打包产物：WEBRTC_SCRIPT 四分支关键路径（泄漏一致分支，覆盖
//    extractIp 对 host/srflx 候选的提取与 isPublicIp 过滤回调的实调）——
{
  const HOST_CAND = { candidate: { candidate: 'candidate:1 1 udp 2130706431 192.168.1.5 54321 typ host generation 0', type: 'host' } };
  const SRFLX_CAND = { candidate: { candidate: 'candidate:2 1 udp 1694498815 203.0.113.7 56789 typ srflx raddr 0.0.0.0 rport 0', type: 'srflx' } };
  const handlerErrs = [];
  const { document, els } = makeDom();
  class MockPC {
    createDataChannel() { return {}; }
    createOffer() { return Promise.resolve({}); }
    setLocalDescription() {
      const self = this;
      setTimeout(() => {
        for (const c of [HOST_CAND, SRFLX_CAND]) {
          try { self.onicecandidate && self.onicecandidate(c); }
          catch (e) { handlerErrs.push(e); }
        }
        setTimeout(() => {
          try { self.onicecandidate && self.onicecandidate({ candidate: null }); }
          catch (e) { handlerErrs.push(e); }
        }, 5);
      }, 5);
      return Promise.resolve();
    }
    close() {}
  }
  const fetch = async () => ({ ok: true, text: async () => V4 + '\n' });
  let err = null;
  try { runScript(webrtcBundle.WEBRTC_SCRIPT, { document, RTCPeerConnection: MockPC, fetch }); }
  catch (e) { err = e; }
  const btn = document.getElementById('run');
  const bound = typeof btn.listeners.click === 'function';
  if (bound) {
    await btn.listeners.click();
    await new Promise((r) => setTimeout(r, 50));
  }
  check('打包产物：内嵌 JS 可执行且按钮已绑定', !err && bound, err ? err.message : '');
  check('打包产物：ICE 处理器无未声明标识符错误', handlerErrs.length === 0, handlerErrs.map((e) => e.message).join('; '));
  check('打包产物：公网 IP（srflx）已提取', els['pub'].textContent === '203.0.113.7', 'got: ' + els['pub'].textContent);
  check('打包产物：局域网 IP（host）已提取', els['loc'].textContent === '192.168.1.5', 'got: ' + els['loc'].textContent);
  check('打包产物：出口一致判定未发现泄漏', els['verdict'].className === 'verdict ok' && els['verdict'].textContent.includes('未发现 WebRTC 泄漏'), 'got: ' + els['verdict'].textContent);
  check('打包产物：按钮恢复可点', btn.disabled === false);
}

// —— index.js 打包产物：经 uiScriptFor（与线上一致的 BASE 实例化管线）跑双栈成功路径，
//    覆盖 grab/setStatus/looksLikeIp 页面局部链与 familyOf→verdictFor 共享链 ——
{
  const SCRIPT = uiBundle.uiScriptFor('ip.example.com');
  const calls = [];
  const { document, els } = makeDom();
  const fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    const routes = {
      ['https://4.ip.example.com/']: { body: V4 + '\n' },
      ['https://test.ip.example.com/']: { body: V6 + '\n' },
    };
    const r = routes[u];
    if (!r) throw new Error('network fail: ' + u);
    return { ok: true, text: async () => r.body };
  };
  const { result } = runScript(SCRIPT, { document, fetch });
  await result;
  await new Promise((r) => setTimeout(r, 20));
  check('打包产物：双栈 v4/test 字段填充', els['v4'].textContent === V4 && els['test'].textContent === V6, 'got: ' + els['v4'].textContent + ' / ' + els['test'].textContent);
  check('打包产物：徽章判定 IPv6 访问优先（familyOf→verdictFor 链可用）', els['verdict'].textContent === 'IPv6 访问优先' && els['verdict'].className === 'badge ipv6');
  check('打包产物：IPv6 卡片由 test 派生', els['v6'].textContent === V6 && els['v6-status'].textContent === 'OK');
  check('打包产物：不请求 6. 子域', !calls.some((u) => u.indexOf('://6.') !== -1), 'calls: ' + calls.join(', '));
}

await rm(dir, { recursive: true, force: true });
report();
