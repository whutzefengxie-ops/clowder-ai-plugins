import { fail } from './config.mjs';

export function gitlabApi(config) {
  const settings = config.issues,
    token = process.env[settings.tokenEnv];
  if (!token) fail('ISSUE_AUTH_REQUIRED', `请在启动服务的环境中设置 ${settings.tokenEnv}，只在网页填写变量名称`);
  const base = `${settings.apiUrl.replace(/\/$/, '')}/projects/${encodeURIComponent(settings.projectId)}`;
  async function request(path, method = 'GET', payload) {
    let response;
    try {
      response = await fetch(`${base}/${path}`, {
        method,
        redirect: 'error',
        headers: { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
        signal: AbortSignal.timeout(settings.timeoutMs ?? 30000),
      });
    } catch {
      fail('ISSUE_API_UNAVAILABLE', '内部 Issue API 连接失败或超时；请核对网络、证书与服务，不重复创建');
    }
    if (!response.ok) {
      await response.body?.cancel();
      fail('ISSUE_API_REJECTED', `内部 Issue API 拒绝请求（HTTP ${response.status}）；请核对权限与配置后回读原对象`);
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 2 * 1024 * 1024) fail('ISSUE_RESPONSE_INVALID', '内部 Issue API 响应过大，未采用');
      chunks.push(chunk);
    }
    try {
      return { value: JSON.parse(Buffer.concat(chunks).toString('utf8')), next: response.headers.get('x-next-page') };
    } catch {
      fail('ISSUE_RESPONSE_INVALID', '内部 Issue API 未返回有效 JSON，未采用');
    }
  }
  return {
    request: async (...args) => (await request(...args)).value,
    list: async (path) => {
      const result = [];
      let page = '1';
      for (let count = 0; count < 100; count++) {
        const response = await request(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
        if (!Array.isArray(response.value)) fail('ISSUE_RESPONSE_INVALID', '内部 Issue 列表格式无效');
        result.push(...response.value);
        if (!nextPage(response, page)) return result;
        page = response.next;
      }
      fail('ISSUE_RESPONSE_LIMIT', 'Issue 查询范围超过分页上限，未静默截断，请收窄范围');
    },
  };
}

function nextPage(response, page) {
  if (!response.next) {
    if (response.next === null && response.value.length === 100)
      fail('ISSUE_RESPONSE_INVALID', '完整页缺少分页回执，无法证明查询完整，未静默截断');
    return false;
  }
  if (!/^\d+$/.test(response.next) || Number(response.next) <= Number(page))
    fail('ISSUE_RESPONSE_INVALID', '内部 Issue API 分页未前进，停止而非截断');
  return true;
}
