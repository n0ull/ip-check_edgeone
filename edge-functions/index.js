/**
 * EdgeOne Makers Edge Function — IP 查询服务（根路径 "/"）
 *
 * 路由规则：本文件仅匹配 "/"（根路径），按请求 Host 分发：
 *   ip.<domain>      → 返回查询网页（UI）
 *   4.ip.<domain>    → 直接返回访问者 IPv4（纯文本；站点关闭 IPv6 后仅 IPv4 可达）
 *   test.ip.<domain> → 返回本次连接实际使用的 IP：IPv6 即 IPv6 访问优先，且该地址即访问者的 IPv6
 *
 * 其余路径由 [[default]].js 处理（/4 /6 /test 等路径式端点）。
 * 注：不再提供 6.ip.<domain>（平台无法强制仅 IPv6，与 test. 语义重复）；Host 分发中 case '6' 仅为兼容保留。
 */

const SUBDOMAINS = ['4', '6', 'test'];

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

/** 解析请求 Host，识别子域名（4 / 6 / test）与基础域名 */
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
    return textResponse(
      '当前通过 IPv6 连接，无法获取您的 IPv4 地址。\n' +
      '请在 4.<domain> 的站点设置中关闭 IPv6 访问（强制仅 IPv4 可达），或改用 test 端点。\n',
      400
    );
  }
  if (wantsJson(request)) return jsonResponse({ ip, family: 'IPv4', service: 'edgeone-ip' });
  return textResponse(ip + '\n', 200, { 'x-ip-family': 'IPv4' });
}

function handleV6(request, ip) {
  if (!ip) return textResponse('无法获取客户端 IP 地址。\n', 400);
  if (isIpv4(ip)) {
    return textResponse(
      '当前通过 IPv4 连接，无法获取您的 IPv6 地址。\n' +
      '请通过支持 IPv6 的网络访问 6.<domain>（该域名为双栈，IPv6 客户端自动优先走 IPv6），或改用 test 端点。\n',
      400
    );
  }
  if (wantsJson(request)) return jsonResponse({ ip, family: 'IPv6', service: 'edgeone-ip' });
  return textResponse(ip + '\n', 200, { 'x-ip-family': 'IPv6' });
}

function handleTest(request, ip) {
  if (!ip) return textResponse('无法获取客户端 IP 地址。\n', 400);
  const family = isIpv6(ip) ? 'IPv6' : 'IPv4';
  const preferred = family; // 本次双栈连接实际使用的协议族即为访问优先的协议族
  if (wantsJson(request)) {
    // 语义严谨：仅当本次连接确为 IPv6 时输出 ipv6Preferred；
    // IPv4 连接无法判定“IPv6 是否存在/是否优先”，故不输出该字段
    const payload = { ip, family, service: 'edgeone-ip' };
    if (family === 'IPv6') payload.ipv6Preferred = true;
    return jsonResponse(payload);
  }
  return textResponse(ip + '\n', 200, { 'x-ip-family': family, 'x-ip-preferred': preferred });
}

function renderUi(family, base) {
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
  rows.push('@media (max-width:520px){.ip{font-size:17px}}');
  rows.push('</style>');
  rows.push('</head>');
  rows.push('<body>');
  rows.push('<div class="wrap">');
  rows.push('<header><h1>IP 查询</h1><span id="verdict" class="badge __VERDICT_CLS__">__VERDICT__</span></header>');
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
  rows.push('<div class="foot">Powered by EdgeOne</div>');
  rows.push('</div>');
  rows.push('<script>');
  rows.push("  var BASE = '__BASE__';");
  rows.push("  function setStatus(id, text, cls) {");
  rows.push("    var el = document.getElementById(id);");
  rows.push("    el.textContent = text;");
  rows.push("    el.className = 'status ' + (cls || '');");
  rows.push("  }");
  rows.push("  function showHint() {");
  rows.push("    var h = document.getElementById('hint');");
  rows.push("    if (h) h.style.display = 'block';");
  rows.push("  }");
  rows.push("  function looksLikeIp(t) {");
  rows.push("    return t && t.length <= 64 && !/[一-龥]/.test(t) && (t.indexOf('.') !== -1 || t.indexOf(':') !== -1);");
  rows.push("  }");
  rows.push("  async function grab(sub, label) {");
  rows.push("    var text = null;");
  rows.push("    var viaFallback = false;");
  rows.push("    try {");
  rows.push("      var res = await fetch('https://' + sub + '.' + BASE + '/', { cache: 'no-store' });");
  rows.push("      var t = (await res.text()).trim();");
  rows.push("      if (res.ok && looksLikeIp(t)) text = t;");
  rows.push("    } catch (e) { /* 子域不可达（未绑定自定义域名 / DNS 未配置），走同源回退 */ }");
  rows.push("    if (!text) {");
  rows.push("      try {");
  rows.push("        var res2 = await fetch('/' + sub, { cache: 'no-store' });");
  rows.push("        var t2 = (await res2.text()).trim();");
  rows.push("        if (res2.ok && looksLikeIp(t2)) { text = t2; viaFallback = true; }");
  rows.push("        else if (t2 && /[一-龥]/.test(t2)) {");
  rows.push("          var reason = t2.split('，')[0] || '不可用';");
  rows.push("          setStatus(label + '-status', reason, 'err');");
  rows.push("          return null;");
  rows.push("        }");
  rows.push("      } catch (e2) { /* ignore */ }");
  rows.push("    }");
  rows.push("    if (!text) {");
  rows.push("      setStatus(label + '-status', '请求失败', 'err');");
  rows.push("      return null;");
  rows.push("    }");
  rows.push("    document.getElementById(label).textContent = text;");
  rows.push("    setStatus(label + '-status', viaFallback ? 'OK（同源回退）' : 'OK', viaFallback ? 'warn' : 'ok');");
  rows.push("    if (viaFallback) showHint();");
  rows.push("    return text;");
  rows.push("  }");
  rows.push("  async function init() {");
  rows.push("    var results = await Promise.all([");
  rows.push("      grab('4', 'v4'),");
  rows.push("      grab('test', 'test')");
  rows.push("    ]);");
  rows.push("    var verdict = document.getElementById('verdict');");
  rows.push("    var t = results[1];");
  rows.push("    if (t && t.indexOf(':') !== -1) { verdict.textContent = 'IPv6 访问优先'; verdict.className = 'badge ipv6'; }");
  rows.push("    else if (t) { verdict.textContent = 'IPv4 连接'; verdict.className = 'badge ipv4'; setStatus('test-status', '本次连接为 IPv4，无法判定 IPv6 是否存在', 'warn'); }");
  rows.push("    else { verdict.textContent = '无法判定'; verdict.className = 'badge unknown'; }");
  rows.push("    // IPv6 卡片：由双栈测试结果派生（IPv6 连接时 test 返回的地址即你的 IPv6）");
  rows.push("    if (t && t.indexOf(':') !== -1) {");
  rows.push("      document.getElementById('v6').textContent = t;");
  rows.push("      setStatus('v6-status', 'OK', 'ok');");
  rows.push("    } else if (t) {");
  rows.push("      setStatus('v6-status', '当前连接为 IPv4，未获取到 IPv6', 'err');");
  rows.push("    } else {");
  rows.push("      setStatus('v6-status', '不可用', 'err');");
  rows.push("    }");
  rows.push("  }");
  rows.push("  init();");
  rows.push("  </script>");
  rows.push('</body></html>');
  let html = rows.join('\n');
  // 占位符替换（徽章判定与 BASE），并做基础转义避免注入
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeBase = String(base).replace(/[^a-zA-Z0-9.-]/g, '');
  html = html.split('__VERDICT_CLS__').join(family === 'IPv6' ? 'ipv6' : (family === 'IPv4' ? 'ipv4' : 'unknown'));
  html = html.split('__VERDICT__').join(family === 'IPv6' ? 'IPv6 访问优先' : (family === 'IPv4' ? 'IPv4 连接' : '检测中…'));
  html = html.split('__BASE__').join(esc(safeBase));
  return html;
}

export async function onRequest(context) {
  const { request } = context;
  const info = hostInfo(request);
  const ip = getClientIp(request);
  const family = ip ? (isIpv6(ip) ? 'IPv6' : 'IPv4') : '未知';

  switch (info.sub) {
    case '4':
      return handleV4(request, ip);
    case '6':
      // 兼容保留：平台站点开关无法强制“仅 IPv6”，6. 与 test. 语义重复，建议不再绑定该子域
      return handleV6(request, ip);
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