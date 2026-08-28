/**
 * EdgeOne Makers Edge Function — 共享工具函数
 *
 * 本文件集中了 index.js 与 [[default]].js 共用的全部工具函数与端点处理器。
 * 两个入口文件各自 import 所需符号，不再内联副本——边缘构建器对每个入口独立执行
 * esbuild bundle: true（无 external），本地相对路径 import 在构建期被解析并内联，
 * 行为与原先双份内联等价，但实现唯一化，消除同步维护负担。
 *
 * 背景与决策依据见 .agents/notes/implemented/simplification/2026-08-27-shared-module-extraction.md
 * 与 .agents/notes/implemented/process/2026-08-27-edgeone-makers-import-support-investigation.md。
 *
 * 本文件不导出 onRequest，构建器的 isPagesFunction 会将其过滤，不会注册为路由。
 */

/** IPv4 严格判定：四段十进制，每段 0-255，无前导垃圾字符。拒绝 256.1.1.1 等越界输入 */
export function isIpv4(ip) {
  if (typeof ip !== 'string') return false;
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (p.length === 0 || p.length > 3) return false;
    for (let i = 0; i < p.length; i++) { if (p[i] < '0' || p[i] > '9') return false; }
    const n = parseInt(p, 10);
    return n >= 0 && n <= 255;
  });
}

export function isIpv6(ip) {
  return typeof ip === 'string' && ip.indexOf(':') !== -1;
}

/** 协议族判定：'IPv6' | 'IPv4'；空/非法输入返回 null——未知标签由调用点按上下文补充（页面『未知』/API『unknown』） */
export function familyOf(ip) {
  if (!ip) return null;
  return isIpv6(ip) ? 'IPv6' : 'IPv4';
}

/**
 * 获取客户端真实 IP。
 * 生产环境（EdgeOne 边缘节点注入 request.eo）：只信 eo.clientIp，忽略可伪造的代理头；
 * 本地调试环境（edgeone makers dev，无 eo 对象）才回退到常见代理头。
 */
export function getClientIp(request) {
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

export function baseHeaders(extra) {
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

export function jsonResponse(obj, status) {
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

/** 方法门禁：本服务只有 IP 回显与页面，非 GET/HEAD 一律 405；放行返回 null */
export function methodGuard(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return textResponse('仅支持 GET/HEAD 请求。\n', 405, { allow: 'GET, HEAD' });
  }
  return null;
}

export function handleV4(request, ip) {
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

export function handleTest(request, ip) {
  if (!ip) return textResponse('无法获取客户端 IP 地址。\n', 400);
  const family = familyOf(ip);
  if (wantsJson(request)) {
    // 语义严谨：仅当本次连接确为 IPv6 时输出 ipv6Preferred；
    // IPv4 连接无法判定"IPv6 是否存在/是否优先"，故不输出该字段
    const payload = { ip, family, service: 'edgeone-ip' };
    if (family === 'IPv6') payload.ipv6Preferred = true;
    return jsonResponse(payload);
  }
  // x-ip-preferred 与 ipv6Preferred 对齐：仅 IPv6 连接时输出；IPv4 连接无法判定『优先』，不输出该头
  const extra = { 'x-ip-family': family };
  if (family === 'IPv6') extra['x-ip-preferred'] = 'IPv6';
  return textResponse(ip + '\n', 200, extra);
}
