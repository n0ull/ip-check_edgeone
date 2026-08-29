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

/** 徽章判定表（family → 文案/样式 的唯一来源）：服务端 renderUi 首屏注入与浏览器 init 校准共用同一实现（经 browserScript 序列化注入页面）。
    未知态不归此管——服务端『检测中…』（尚未发生）与浏览器『无法判定』（已失败）语义不同，各留调用点。 */
export function verdictFor(family) {
  if (family === 'IPv6') return { text: 'IPv6 访问优先', cls: 'badge ipv6' };
  if (family === 'IPv4') return { text: 'IPv4 连接', cls: 'badge ipv4' };
  return null;
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

/** 子域路径 fact：「子域 X 的路径端点是 /X」的唯一来源。页面侧 grab 同源回退经 browserScript 按名拣选消费，
    [[default]].js 路由 switch 以 case 标签结构性消费——两侧漂移在构造上不可能；404 hint 的子域段同源。
    未知子域返回 null：服务端 case 永不匹配落 404；页面侧响应判非 IP、卡片不填充，方向保守
    （生产不可达：grab 仅以 '4'/'test' 调用）。 */
export function subdomainPath(sub) {
  if (sub === '4') return '/4';
  if (sub === 'test') return '/test';
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

/**
 * 页面脚本序列化器：把「页面脚本作用域」函数变成浏览器可执行的脚本文本。
 *
 * scope 是一个真实函数：页面局部函数全部嵌套声明在其体内，末行为胶水语句（如 init('__BASE__')）。
 * 局部函数闭包由词法作用域结构性保证——函数体文本本身就携带全部嵌套声明，不存在可漏登记的清单；
 * 跨模块共享助手从 shared 命名空间按名字（\b 词边界）自动拣选，含传递闭包
 * （init 引用 familyOf → familyOf 的源码引用 isIpv6 → isIpv6 一并前置）。
 *
 * 剥壳不变式：scope.toString() 的首个 '{' 为函数体起始、末个 '}' 为函数体结束。
 * 参数解构（签名含 '{'）会破坏该不变式，作用域函数不得使用解构参数；
 * 本地 node 直跑与 esbuild 重印（函数名保留、结构不变）均满足。误拣（名字出现在字符串/正则中）
 * 只会让页面多一个无害函数；非函数导出跳过不序列化，引用它的页面在测试期 ReferenceError——方向保守安全。
 */
export function browserScript(scope, shared) {
  const src = scope.toString();
  const body = src.slice(src.indexOf('{') + 1, src.lastIndexOf('}'));
  const emitted = [];
  const seen = {};
  let frontier = body;
  for (;;) {
    let grew = false;
    for (const name of Object.keys(shared)) {
      if (seen[name] || !new RegExp('\\b' + name + '\\b').test(frontier)) continue;
      seen[name] = true;
      const fn = shared[name];
      if (typeof fn !== 'function') continue;
      const fnSrc = fn.toString();
      emitted.push(fnSrc);
      frontier += '\n' + fnSrc;
      grew = true;
    }
    if (!grew) break;
  }
  return emitted.join('\n') + '\n' + body.trim() + '\n';
}
