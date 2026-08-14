/**
 * EdgeOne Makers Edge Function — IP 查询服务（通配路径）
 *
 * 本文件匹配除 "/" 之外的所有路径（[[default]] 不匹配根路径，根路径由 index.js 处理）。
 * 提供路径式端点，便于本地调试（edgeone makers dev）与习惯用法：
 *   /4  /api/4  /api/v4  → 返回访问者 IPv4（纯文本）
 *   /6  /api/6  /api/v6  → 返回访问者 IPv6（纯文本）
 *   /test /api/test       → 返回本次连接实际使用的 IP（IPv6 即 IPv6 访问优先）
 *   /api/self             → 返回本次请求的 IP 与协议族（JSON）
 *
 * 注意：curl 4.ip.<domain> / test.ip.<domain>（根路径）由 index.js 按 Host 分发；不再提供 6. 子域。
 * 为保证边缘构建器兼容性，本文件与 index.js 各自内联了相同的工具函数，不跨文件 import。
 */

function isIpv4(ip) {
  return typeof ip === 'string' && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
}

function isIpv6(ip) {
  return typeof ip === 'string' && ip.indexOf(':') !== -1;
}

/**
 * 获取客户端真实 IP。
 * 生产环境（EdgeOne 边缘节点注入 request.eo）：只信 eo.clientIp，忽略可伪造的代理头；
 * 本地调试环境（edgeone makers dev，无 eo 对象）才回退到常见代理头。
 */
function getClientIp(request) {
  try {
    const eo = request.eo;
    if (eo && typeof eo === 'object') {
      // 生产环境：即使 eo.clientIp 缺失也不再回退代理头（防伪造），宁可返回空
      return typeof eo.clientIp === 'string' ? eo.clientIp : '';
    }
  } catch (_) { /* ignore */ }
  const h = request.headers;
  for (const name of ['x-forwarded-for', 'x-real-ip', 'true-client-ip', 'eo-client-ip', 'cf-connecting-ip']) {
    const v = h.get(name);
    if (!v) continue;
    const first = String(v).split(',')[0].trim();
    if (isIpv4(first) || isIpv6(first)) return first;
  }
  return '';
}

function baseHeaders(extra) {
  return Object.assign({
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store, no-cache, must-revalidate',
    'cdn-cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'x-powered-by': 'EdgeOne Makers',
  }, extra || {});
}

function textResponse(body, status, extra) {
  return new Response(body, { status: status || 200, headers: baseHeaders(extra) });
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj, null, 2) + '\n', {
    status: status || 200,
    headers: baseHeaders({ 'content-type': 'application/json; charset=utf-8' }),
  });
}

function wantsJson(request) {
  let u = null;
  try { u = new URL(request.url); } catch (_) { /* ignore */ }
  if (u && u.searchParams.get('format') === 'json') return true;
  const acc = request.headers.get('accept') || '';
  return acc.indexOf('application/json') !== -1;
}

function handleV4(request, ip) {
  if (!ip) return textResponse('无法获取客户端 IP 地址。\n', 400);
  if (isIpv6(ip)) {
    return textResponse('当前通过 IPv6 连接，无法获取您的 IPv4 地址（请在 4.<domain> 站点关闭 IPv6 访问，或使用 test 端点）。\n', 400);
  }
  if (wantsJson(request)) return jsonResponse({ ip, family: 'IPv4', service: 'edgeone-ip' });
  return textResponse(ip + '\n', 200, { 'x-ip-family': 'IPv4' });
}

function handleV6(request, ip) {
  if (!ip) return textResponse('无法获取客户端 IP 地址。\n', 400);
  if (isIpv4(ip)) {
    return textResponse('当前通过 IPv4 连接，无法获取您的 IPv6 地址（请通过支持 IPv6 的网络访问 6.<domain>，或使用 test 端点）。\n', 400);
  }
  if (wantsJson(request)) return jsonResponse({ ip, family: 'IPv6', service: 'edgeone-ip' });
  return textResponse(ip + '\n', 200, { 'x-ip-family': 'IPv6' });
}

function handleTest(request, ip) {
  if (!ip) return textResponse('无法获取客户端 IP 地址。\n', 400);
  const family = isIpv6(ip) ? 'IPv6' : 'IPv4';
  if (wantsJson(request)) {
    // 语义严谨：仅当本次连接确为 IPv6 时输出 ipv6Preferred；
    // IPv4 连接无法判定“IPv6 是否存在/是否优先”，故不输出该字段
    const payload = { ip, family, service: 'edgeone-ip' };
    if (family === 'IPv6') payload.ipv6Preferred = true;
    return jsonResponse(payload);
  }
  return textResponse(ip + '\n', 200, { 'x-ip-family': family, 'x-ip-preferred': family });
}

/** WebRTC 检查页：纯浏览器端检测（RTCPeerConnection + ICE candidates），结果不发送到服务器 */
function renderWebrtcPage(base) {
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
  // 内嵌浏览器 JS 的正则不使用反斜杠转义（\d、\. 会被外层字符串消化），统一用字符类 [0-9]、[.]
  rows.push('function $(id){return document.getElementById(id)}');
  rows.push('function addIp(arr, ip){ if(ip && arr.indexOf(ip) < 0) arr.push(ip); }');
  rows.push('function isPublicIp(ip){ return /^([0-9]{1,3}[.]){3}[0-9]{1,3}$/.test(ip) ? !/^(10[.]|127[.]|169[.]254[.]|192[.]168[.]|172[.](1[6-9]|2[0-9]|3[01])[.])/.test(ip) : !/^f[cd][0-9a-f]{2}:|^fe80:/.test(ip); }');
  rows.push('function extractIp(line){ var m = line.match(/([0-9]{1,3}[.]){3}[0-9]{1,3}|[0-9a-f:]+:[0-9a-f:]+/i); return m ? m[0] : null; }');
  rows.push('function detect(timeout){ return new Promise(function(resolve){');
  rows.push('  var out = { pub: [], loc: [], err: null };');
  rows.push('  var done = false;');
  rows.push('  var pc = null;');
  rows.push('  function finish(){ if(done) return; done = true; try{ pc.close(); }catch(_){} resolve(out); }');
  rows.push('  try { pc = new RTCPeerConnection({ iceServers: [{ urls: [\'stun:stun.miwifi.com:3478\'] }] }); } catch(e){ out.err = \'浏览器不支持 WebRTC\'; finish(); return; }');
  rows.push('  try { pc.createDataChannel(\'probe\'); } catch(_){}');
  rows.push('  pc.onicecandidate = function(e){');
  rows.push('    if(!e.candidate){ finish(); return; }');
  rows.push('    var ip = extractIp(e.candidate.candidate);');
  rows.push('    if(!ip || ip.indexOf(\'.local\') !== -1) return;');
  rows.push('    if(e.candidate.type === \'srflx\') addIp(out.pub, ip);');
  rows.push('    else if(e.candidate.type === \'host\') addIp(out.loc, ip);');
  rows.push('  };');
  rows.push('  pc.createOffer().then(function(o){ return pc.setLocalDescription(o); }).catch(function(e){ out.err = e && e.message ? e.message : String(e); finish(); });');
  rows.push('  setTimeout(finish, timeout);');
  rows.push('});}');
  rows.push('async function fetchIp(path){ try{ var r = await fetch(path, { cache: \'no-store\' }); var t = (await r.text()).trim(); if(r.ok && t && t.length <= 64 && t.indexOf(\'<\') === -1) return t; }catch(_){} return null; }');
  rows.push('async function run(){');
  rows.push('  var btn = $(\'run\'); btn.disabled = true; btn.textContent = \'检测中…\';');
  rows.push('  var r = await detect(4000);');
  rows.push('  $(\'pub\').textContent = r.pub.length ? r.pub.join(\'\\n\') : (r.err ? \'—（\' + r.err + \'）\' : \'—（未获取到公网映射）\');');
  rows.push('  $(\'loc\').textContent = r.loc.length ? r.loc.join(\'\\n\') : \'—（未发现或已被 mDNS 隐藏）\';');
  rows.push('  var ext = await fetchIp(\'/test\');');
  rows.push('  $(\'ext\').textContent = ext || \'—\';');
  rows.push('  var verdict = $(\'verdict\');');
  rows.push('  var pubOnly = r.pub.filter(isPublicIp);');
  rows.push('  if(ext && pubOnly.length){');
  rows.push('    if(pubOnly.indexOf(ext) !== -1){ verdict.className = \'verdict ok\'; verdict.textContent = \'WebRTC 公网 IP 与当前出口 IP 一致，未发现 WebRTC 泄漏。\'; }');
  rows.push('    else { verdict.className = \'verdict warn\'; verdict.textContent = \'WebRTC 暴露了不同的公网 IP（\' + pubOnly.join(\', \') + \'），与当前出口（\' + ext + \'）不一致，可能存在 WebRTC 泄漏（如 VPN/代理未覆盖）。\'; }');
  rows.push('  } else if(ext){ verdict.className = \'verdict warn\'; verdict.textContent = \'未获取到 WebRTC 公网映射（STUN 不可达或网络限制），无法对比；已显示的局域网 IP 属于本机网卡。\'; }');
  rows.push('  else { verdict.className = \'verdict err\'; verdict.textContent = \'无法获取当前出口 IP，请返回主页重试。\'; }');
  rows.push('  btn.disabled = false; btn.textContent = \'重新检测\';');
  rows.push('}');
  rows.push('$(\'run\').addEventListener(\'click\', run);');
  rows.push('</script>');
  rows.push('</body></html>');
  return rows.join('\n');
}

export async function onRequest(context) {
  const { request } = context;
  let path = '/';
  try {
    const u = new URL(request.url);
    path = u.pathname.replace(/\/+$/, '') || '/';
  } catch (_) { /* ignore */ }
  const ip = getClientIp(request);

  switch (path) {
    case '/4':
    case '/api/4':
    case '/api/v4':
      return handleV4(request, ip);
    case '/6':
    case '/api/6':
    case '/api/v6':
      return handleV6(request, ip);
    case '/test':
    case '/api/test':
      return handleTest(request, ip);
    case '/webrtc':
      {
        const u = new URL(request.url);
        const base = u.hostname;
        return new Response(renderWebrtcPage(base), {
          status: 200,
          headers: baseHeaders({ 'content-type': 'text/html; charset=utf-8' }),
        });
      }
    case '/api/self':
      return jsonResponse({
        ip: ip || null,
        family: ip ? (isIpv6(ip) ? 'IPv6' : 'IPv4') : 'unknown',
        service: 'edgeone-ip',
      });
    case '/favicon.ico':
      return new Response(null, { status: 204, headers: baseHeaders() });
    default:
      return jsonResponse({ error: 'not found', hint: '可用端点: /4 /6 /test /api/self' }, 404);
  }
}