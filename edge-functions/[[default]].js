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