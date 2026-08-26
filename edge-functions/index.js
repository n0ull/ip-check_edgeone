/**
 * EdgeOne Makers Edge Function — IP 查询服务（根路径 "/"）
 *
 * 路由规则：本文件仅匹配 "/"（根路径），按请求 Host 分发：
 *   ip.<domain>      → 返回查询网页（UI）
 *   4.ip.<domain>    → 直接返回访问者 IPv4（纯文本；站点关闭 IPv6 后仅 IPv4 可达）
 *   test.ip.<domain> → 返回本次连接实际使用的 IP：IPv6 即 IPv6 访问优先，且该地址即访问者的 IPv6
 *
 * 共享工具函数（getClientIp / familyOf / methodGuard / handleV4 / handleTest 等）
 * 由 ./_shared.js 统一提供，本文件 import 所需符号，不再内联副本。
 *
 * 其余路径由 [[default]].js 处理（/4 /test 等路径式端点）。
 * 注：不提供 6.ip.<domain>（平台无法强制仅 IPv6，与 test. 语义重复，兼容面已移除）。
 */

import { familyOf, getClientIp, methodGuard, handleV4, handleTest, baseHeaders, isIpv6 } from './_shared.js';

const SUBDOMAINS = ['4', 'test'];

function hostInfo(request) {
  let hostname = '';
  try { hostname = new URL(request.url).hostname; } catch (_) { /* ignore */ }
  if (!hostname) {
    const host = request.headers.get('host') || '';
    hostname = host.split(':')[0];
  }
  const labels = hostname.split('.');
  let sub = '';
  if (labels.length >= 3 && SUBDOMAINS.indexOf(labels[0]) !== -1) sub = labels[0];
  return {
    hostname,
    sub,
    base: sub ? labels.slice(1).join('.') : hostname,
  };
}

/* ——— 主页内嵌浏览器脚本（服务端不执行）：以下为浏览器端代码，以真实函数书写，———
   ——— 模块加载时经 Function.prototype.toString() 序列化为 UI_SCRIPT 注入页面。———
   ——— 无外层字符串包裹，正则与换行按正常 JS 书写，语法由 node --check 直接把关。——— */
function setStatus(id, text, cls) {
  var el = document.getElementById(id);
  el.textContent = text;
  el.className = 'status ' + (cls || '');
}

function showHint() {
  var h = document.getElementById('hint');
  if (h) h.style.display = 'block';
}

function looksLikeIp(t) {
  return t && t.length <= 64 && !/[一-龥]/.test(t) && (t.indexOf('.') !== -1 || t.indexOf(':') !== -1);
}

async function grab(base, sub, label) {
  var text = null;
  var viaFallback = false;
  try {
    var res = await fetch('https://' + sub + '.' + base + '/', { cache: 'no-store' });
    var t = (await res.text()).trim();
    if (res.ok && looksLikeIp(t)) text = t;
  } catch (e) { /* 子域不可达（未绑定自定义域名 / DNS 未配置），走同源回退 */ }
  if (!text) {
    try {
      var res2 = await fetch('/' + sub, { cache: 'no-store' });
      var t2 = (await res2.text()).trim();
      if (res2.ok && looksLikeIp(t2)) { text = t2; viaFallback = true; }
      else if (t2 && /[一-龥]/.test(t2)) {
        var reason = t2.split('，')[0] || '不可用';
        setStatus(label + '-status', reason, 'err');
        return null;
      }
    } catch (e2) { /* ignore */ }
  }
  if (!text) {
    setStatus(label + '-status', '请求失败', 'err');
    return null;
  }
  document.getElementById(label).textContent = text;
  setStatus(label + '-status', viaFallback ? 'OK（同源回退）' : 'OK', viaFallback ? 'warn' : 'ok');
  if (viaFallback) showHint();
  return text;
}

async function init(base) {
  var results = await Promise.all([
    grab(base, '4', 'v4'),
    grab(base, 'test', 'test')
  ]);
  var verdict = document.getElementById('verdict');
  var t = results[1];
  var f = t ? familyOf(t) : null;
  var v = f ? verdictFor(f) : null;
  if (v) { verdict.textContent = v.text; verdict.className = v.cls; }
  else { verdict.textContent = '无法判定'; verdict.className = 'badge unknown'; }
  if (f === 'IPv4') { setStatus('test-status', '本次连接为 IPv4，无法判定 IPv6 是否存在', 'warn'); }
  // IPv6 卡片：由双栈测试结果派生（IPv6 连接时 test 返回的地址即你的 IPv6）
  if (f === 'IPv6') {
    document.getElementById('v6').textContent = t;
    setStatus('v6-status', 'OK', 'ok');
  } else if (f) {
    setStatus('v6-status', '当前连接为 IPv4，未获取到 IPv6', 'err');
  } else {
    setStatus('v6-status', '不可用', 'err');
  }
}

/** 徽章判定表（family → 文案/样式 的唯一来源）：服务端 renderUi 首屏注入与浏览器 init 校准共用同一实现（经 UI_SCRIPT 序列化注入页面）。
    未知态不归此管——服务端『检测中…』（尚未发生）与浏览器『无法判定』（已失败）语义不同，各留调用点。 */
export function verdictFor(family) {
  if (family === 'IPv6') return { text: 'IPv6 访问优先', cls: 'badge ipv6' };
  if (family === 'IPv4') return { text: 'IPv4 连接', cls: 'badge ipv4' };
  return null;
}

/** 主页脚本值：浏览器函数序列化拼接（isIpv6 / familyOf 由 _shared.js 提供，一并序列化）；__BASE__ 占位符由 renderUi 在渲染时替换 */
export const UI_SCRIPT = [setStatus, showHint, looksLikeIp, grab, init, isIpv6, familyOf, verdictFor].map((f) => f.toString()).join('\n') + "\ninit('__BASE__');";

/** 查询网页模板：仅 __VERDICT_CLS__/__VERDICT__/__BASE__ 三处占位符，模块加载时构建一次，请求时只做替换 */
const UI_TEMPLATE = (() => {
  const rows = [];
  rows.push('<!doctype html>');
  rows.push('<html lang="zh-CN">');
  rows.push('<head>');
  rows.push('<meta charset="utf-8">');
  rows.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  rows.push('<title>IP 查询 - EdgeOne Makers</title>');
  rows.push('<style>');
  rows.push('*{margin:0;padding:0;box-sizing:border-box}');
  rows.push('body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:#0f1420;color:#e8edf7;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}');
  rows.push('.wrap{width:100%;max-width:520px}');
  rows.push('header{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px}');
  rows.push('h1{font-size:20px;font-weight:600}');
  rows.push('.sub{color:#8fa0bd;font-size:13px;margin-bottom:26px}');
  rows.push('.field{margin-bottom:22px}');
  rows.push('.field:last-of-type{margin-bottom:30px}');
  rows.push('.lbl{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;color:#8fa0bd;margin-bottom:6px}');
  rows.push('.ip{font-family:"SFMono-Regular",Consolas,"Liberation Mono",monospace;font-size:22px;word-break:break-all;line-height:1.45}');
  rows.push('.status{font-size:12px;color:#5b6b8c}');
  rows.push('.ok{color:#4ade80}.err{color:#f87171}.warn{color:#fbbf24}');
  rows.push('.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12.5px;font-weight:600}');
  rows.push('.badge.ipv6{background:rgba(74,222,128,.15);color:#4ade80}');
  rows.push('.badge.ipv4{background:rgba(96,165,250,.15);color:#60a5fa}');
  rows.push('.badge.unknown{background:rgba(251,191,36,.12);color:#fbbf24}');
  rows.push('.curl{background:#0d1220;border:1px solid #26324a;border-radius:8px;padding:12px 14px;font-family:Consolas,Menlo,monospace;font-size:12.5px;line-height:1.9;color:#9fb2d1;overflow-x:auto}');
  rows.push('.curl b{color:#c9d6f0;font-weight:600}');
  rows.push('.hint{display:none;margin-top:14px;padding:10px 12px;border-radius:8px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.25);color:#fbbf24;font-size:12.5px;line-height:1.7}');
  rows.push('.foot{margin-top:18px;font-size:12px;color:#5b6b8c;text-align:center}');
  rows.push('.foot a{color:#7aa5ff;text-decoration:none}');
  rows.push('@media (max-width:520px){.ip{font-size:17px}}');
  rows.push('</style>');
  rows.push('</head>');
  rows.push('<body>');
  rows.push('<div class="wrap">');
  rows.push('<header><h1>IP 查询</h1><span id="verdict" class="__VERDICT_CLS__">__VERDICT__</span></header>');
  rows.push('<div class="sub">返回你的公网 IP 地址，不含属地、ASN 信息</div>');
  rows.push('<div class="field"><div class="lbl"><span>IPv4 地址</span><span class="status" id="v4-status">加载中…</span></div><div class="ip" id="v4">—</div></div>');
  rows.push('<div class="field"><div class="lbl"><span>IPv6 地址</span><span class="status" id="v6-status">加载中…</span></div><div class="ip" id="v6">—</div></div>');
  rows.push('<div class="field"><div class="lbl"><span>双栈测试</span><span class="status" id="test-status">加载中…</span></div><div class="ip" id="test">—</div></div>');
  rows.push('<div class="curl">');
  rows.push('  # 命令行用法<br>');
  rows.push('  curl <b>4.__BASE__</b> → 返回你的 IPv4<br>');
  rows.push('  curl <b>test.__BASE__</b> → 返回本次连接 IP（IPv6 即 IPv6 访问优先）');
  rows.push('  </div>');
  rows.push('<div class="hint" id="hint">提示：当前为同源回退结果（未绑定自定义域名）。绑定自定义域名（全 CNAME，4. 站点关闭 IPv6 访问）后，4. 必返 IPv4，test. 返回本次连接 IP。</div>');
  rows.push('<div class="foot"><a href="/webrtc">WebRTC 检查</a> · Powered by EdgeOne</div>');
  rows.push('</div>');
  rows.push('<script>');
  rows.push(UI_SCRIPT);
  rows.push('</script>');
  rows.push('</body></html>');
  return rows.join('\n');
})();

function renderUi(family, base) {
  let html = UI_TEMPLATE;
  // 占位符替换（徽章判定与 BASE），并做基础转义避免注入
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeBase = String(base).replace(/[^a-zA-Z0-9.-]/g, '');
  // 徽章判定收敛于 verdictFor（与浏览器 init 共用同一实现）；未知态为服务端专属『检测中…』（JS 加载后校准）
  const v = verdictFor(family) || { text: '检测中…', cls: 'badge unknown' };
  html = html.split('__VERDICT_CLS__').join(v.cls);
  html = html.split('__VERDICT__').join(v.text);
  html = html.split('__BASE__').join(esc(safeBase));
  return html;
}

export async function onRequest(context) {
  const { request } = context;
  const blocked = methodGuard(request);
  if (blocked) return blocked;
  const info = hostInfo(request);
  const ip = getClientIp(request);
  const family = familyOf(ip) || '未知';

  switch (info.sub) {
    case '4':
      return handleV4(request, ip);
    case 'test':
      return handleTest(request, ip);
    default:
      // 根域名 / ip. 前缀 / Makers 默认域名 → 返回查询网页
      return new Response(renderUi(family, info.base), {
        status: 200,
        headers: baseHeaders({ 'content-type': 'text/html; charset=utf-8' }),
      });
  }
}
