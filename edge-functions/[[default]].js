/**
 * EdgeOne Makers Edge Function — IP 查询服务（通配路径）
 *
 * 本文件匹配除 "/" 之外的所有路径（[[default]] 不匹配根路径，根路径由 index.js 处理）。
 * 提供路径式端点，便于本地调试（edgeone makers dev）与习惯用法：
 *   /4  /api/4  /api/v4  → 返回访问者 IPv4（纯文本）
 *   /test /api/test       → 返回本次连接实际使用的 IP（IPv6 即 IPv6 访问优先）
 *   /api/self             → 返回本次请求的 IP 与协议族（JSON）
 *
 * 共享工具函数（getClientIp / familyOf / methodGuard / handleV4 / handleTest 等）
 * 由 ./_shared.js 统一提供，本文件 import 所需符号，不再内联副本。
 *
 * 注意：curl 4.ip.<domain> / test.ip.<domain>（根路径）由 index.js 按 Host 分发；不再提供 6. 子域。
 */

// isIpv4 服务端虽不直接调用，但 webrtcScriptScope 的页面局部函数以其为自由标识符，
// 靠 browserScript 从 shared 命名空间按名字注入：import 声明该依赖使 esbuild 在打包时
// 保留原符号名（缺失时 esbuild 为避免捕获自由标识符会把共享符号改名，页面脚本断裂，
// 2026-08-29 线上事故；打包门禁 test/bundle-gate.mjs 把守）
import { browserScript, getClientIp, methodGuard, handleV4, handleTest, familyOf, jsonResponse, baseHeaders, isIpv4, subdomainPath } from './_shared.js';
import * as shared from './_shared.js';

/* ——— /webrtc 页内嵌浏览器脚本（服务端不执行）：以下为浏览器端代码，以真实函数书写，———
   ——— 全部嵌套在 webrtcScriptScope 作用域内：页面局部函数的闭包由词法作用域结构性保证（无手工清单），———
   ——— 跨模块共享助手由 browserScript 从 shared 命名空间按名字自动拣选；语法由 node --check 直接把关。——— */
function webrtcScriptScope() {
  function $(id) { return document.getElementById(id); }

  function addIp(arr, ip) { if (ip && arr.indexOf(ip) < 0) arr.push(ip); }

  function isPublicIp(ip) {
    return isIpv4(ip)
      ? !/^(10\.|127\.|169\.254\.|192.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(ip)
      : !/^f[cd][0-9a-f]{2}:|^fe80:/.test(ip);
  }

  function extractIp(line) {
    var toks = line.split(' ');
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (!t || t === '0.0.0.0' || t === '::') continue;
      if (isIpv4(t)) return t;
      if (t.indexOf(':') !== -1 && /^[0-9a-f:.]+$/i.test(t) && (t.indexOf('::') !== -1 || t.split(':').length >= 4)) return t;
    }
    return null;
  }

  function detect(timeout) {
    return new Promise(function (resolve) {
      var out = { pub: [], loc: [], err: null };
      var done = false;
      var pc = null;
      function finish() { if (done) return; done = true; try { pc.close(); } catch (_) { /* ignore */ } resolve(out); }
      try { pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun.miwifi.com:3478'] }] }); } catch (e) { out.err = '浏览器不支持 WebRTC'; finish(); return; }
      try { pc.createDataChannel('probe'); } catch (_) { /* ignore */ }
      pc.onicecandidate = function (e) {
        if (!e.candidate) { finish(); return; }
        var ip = extractIp(e.candidate.candidate);
        if (!ip || ip.indexOf('.local') !== -1) return;
        if (e.candidate.type === 'srflx') addIp(out.pub, ip);
        else if (e.candidate.type === 'host') addIp(out.loc, ip);
      };
      pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).catch(function (e) { out.err = e && e.message ? e.message : String(e); finish(); });
      setTimeout(finish, timeout);
    });
  }

  async function fetchIp(path) { try { var r = await fetch(path, { cache: 'no-store' }); var t = (await r.text()).trim(); if (r.ok && t && t.length <= 64 && t.indexOf('<') === -1) return t; } catch (_) { /* ignore */ } return null; }

  async function run() {
    var btn = $('run'); btn.disabled = true; btn.textContent = '检测中…';
    var r = await detect(4000);
    $('pub').textContent = r.pub.length ? r.pub.join('\n') : (r.err ? '—（' + r.err + '）' : '—（未获取到公网映射）');
    $('loc').textContent = r.loc.length ? r.loc.join('\n') : '—（未发现或已被 mDNS 隐藏）';
    var ext = await fetchIp('/test');
    $('ext').textContent = ext || '—';
    var verdict = $('verdict');
    var pubOnly = r.pub.filter(isPublicIp);
    if (ext && pubOnly.length) {
      if (pubOnly.indexOf(ext) !== -1) { verdict.className = 'verdict ok'; verdict.textContent = 'WebRTC 公网 IP 与当前出口 IP 一致，未发现 WebRTC 泄漏。'; }
      else { verdict.className = 'verdict warn'; verdict.textContent = 'WebRTC 暴露了不同的公网 IP（' + pubOnly.join(', ') + '），与当前出口（' + ext + '）不一致，可能存在 WebRTC 泄漏（如 VPN/代理未覆盖）。'; }
    } else if (ext) { verdict.className = 'verdict warn'; verdict.textContent = '未获取到 WebRTC 公网映射（STUN 不可达或网络限制），无法对比；已显示的局域网 IP 属于本机网卡。'; }
    else { verdict.className = 'verdict err'; verdict.textContent = '无法获取当前出口 IP，请返回主页重试。'; }
    btn.disabled = false; btn.textContent = '重新检测';
  }

  $('run').addEventListener('click', run);
}

/** /webrtc 页脚本值：webrtcScriptScope 作用域经 browserScript 序列化（局部闭包由词法作用域保证，共享助手自动拣选）；页面无占位符 */
export const WEBRTC_SCRIPT = browserScript(webrtcScriptScope, shared);

/** WebRTC 检查页：纯浏览器端检测（RTCPeerConnection + ICE candidates），结果不发送到服务器；页面无动态占位符，模块加载时构建一次 */
const WEBRTC_HTML = (() => {
  const rows = [];
  rows.push('<!doctype html>');
  rows.push('<html lang="zh-CN">');
  rows.push('<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">');
  rows.push('<title>WebRTC 检查 - IP 查询</title>');
  rows.push('<style>');
  rows.push('*{margin:0;padding:0;box-sizing:border-box}');
  rows.push('body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:#0f1420;color:#e8edf7;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}');
  rows.push('.wrap{width:100%;max-width:560px}');
  rows.push('header{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px}');
  rows.push('h1{font-size:20px;font-weight:600}');
  rows.push('a{color:#7aa5ff;text-decoration:none}');
  rows.push('.sub{color:#8fa0bd;font-size:13px;margin-bottom:22px;line-height:1.7}');
  rows.push('button{background:#2a3a5c;color:#e8edf7;border:1px solid #3a4d75;border-radius:8px;padding:10px 22px;font-size:14px;cursor:pointer}');
  rows.push('button:disabled{opacity:.5;cursor:default}');
  rows.push('.field{margin-top:20px}');
  rows.push('.lbl{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;color:#8fa0bd;margin-bottom:6px}');
  rows.push('.ip{font-family:"SFMono-Regular",Consolas,"Liberation Mono",monospace;font-size:16px;word-break:break-all;line-height:1.6}');
  rows.push('.verdict{margin-top:20px;padding:12px 14px;border-radius:8px;font-size:13.5px;line-height:1.8}');
  rows.push('.ok{background:rgba(74,222,128,.12);color:#4ade80}');
  rows.push('.warn{background:rgba(251,191,36,.1);color:#fbbf24}');
  rows.push('.err{background:rgba(248,113,113,.12);color:#f87171}');
  rows.push('.note{margin-top:16px;font-size:12px;color:#5b6b8c;line-height:1.7}');
  rows.push('@media (max-width:520px){.ip{font-size:14px}}');
  rows.push('</style></head><body>');
  rows.push('<div class="wrap">');
  rows.push('<header><h1>WebRTC 检查</h1><a href="/">← 返回</a></header>');
  rows.push('<div class="sub">检测浏览器 WebRTC 暴露的网络地址：公网 IP（经 STUN 反射）与本机局域网 IP。结果仅在本机浏览器内计算，不会发送到服务器。</div>');
  rows.push('<button id="run">开始检测</button>');
  rows.push('<div class="field"><div class="lbl"><span>公网 IP（WebRTC）</span><span class="st" id="pub-st"></span></div><div class="ip" id="pub">—</div></div>');
  rows.push('<div class="field"><div class="lbl"><span>局域网 IP</span><span class="st" id="loc-st"></span></div><div class="ip" id="loc">—</div></div>');
  rows.push('<div class="field"><div class="lbl"><span>当前出口 IP</span><span class="st" id="ext-st"></span></div><div class="ip" id="ext">—</div></div>');
  rows.push('<div class="verdict" id="verdict"></div>');
  rows.push('<div class="note">说明：检测依赖 STUN 服务器（stun.miwifi.com），个别网络不可达时仅显示局域网 IP。浏览器以 mDNS 隐藏局域网地址时显示为 .local。WebRTC 泄露指浏览器绕过 VPN/代理暴露真实公网 IP，本页可帮助判断当前浏览器是否如此。</div>');
  rows.push('</div>');
  rows.push('<script>');
  rows.push(WEBRTC_SCRIPT);
  rows.push('</script>');
  rows.push('</body></html>');
  return rows.join('\n');
})();

export async function onRequest(context) {
  const { request } = context;
  const blocked = methodGuard(request);
  if (blocked) return blocked;
  let path = '/';
  try {
    const u = new URL(request.url);
    path = u.pathname.replace(/\/+$/, '') || '/';
  } catch (_) { /* ignore */ }
  const ip = getClientIp(request);

  // 页面侧路径以 case 标签消费端点路径 fact（subdomainPath，见 _shared.js）：grab 同源回退与
  // 服务端路由共用同一实现，两侧漂移在构造上不可能；/api/* 别名是纯服务端同义词，保持字面量
  switch (path) {
    case subdomainPath('4'):
    case '/api/4':
    case '/api/v4':
      return handleV4(request, ip);
    case subdomainPath('test'):
    case '/api/test':
      return handleTest(request, ip);
    case '/webrtc':
      return new Response(WEBRTC_HTML, {
        status: 200,
        headers: baseHeaders({ 'content-type': 'text/html; charset=utf-8' }),
      });
    case '/api/self':
      return jsonResponse({
        ip: ip || null,
        family: familyOf(ip) || 'unknown',
        service: 'edgeone-ip',
      });
    case '/favicon.ico':
      return new Response(null, { status: 204, headers: baseHeaders() });
    default:
      return jsonResponse({ error: 'not found', hint: '可用端点: ' + subdomainPath('4') + ' ' + subdomainPath('test') + ' /api/self' }, 404);
  }
}
