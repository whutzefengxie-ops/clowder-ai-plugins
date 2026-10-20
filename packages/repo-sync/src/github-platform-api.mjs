import { fail } from './config.mjs';
import { issueToken } from './issue-auth.mjs';
import { projectPath } from './api-configuration.mjs';
import { trustSystemCA } from './system-ca.mjs';

export function githubPlatformApi(config, settings = config.issues, family = 'ISSUE') {
  trustSystemCA();
  const token = issueToken(config, settings);
  const project = projectPath(settings.projectId, 'github'),
    base = `${settings.apiUrl.replace(/\/+$/, '')}/repos/${project}`;
  async function request(path, method = 'GET', payload, meta = false) {
    let response;
    try {
      response = await fetch(`${base}${path ? `/${path}` : ''}`, {
        method,
        redirect: 'error',
        headers: {
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
          Authorization: `Bearer ${token}`,
        },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
        signal: AbortSignal.timeout(settings.timeoutMs ?? 30000),
      });
    } catch (error) {
      unavailable(error, family);
    }
    if (!response.ok) reject(response, family);
    const value = response.status === 204 ? null : await readJson(response, family);
    return meta ? { value, next: response.headers.get('link') } : value;
  }
  async function list(path) {
    const items = [];
    for (let page = 1; page <= 100; page++) {
      const separator = path.includes('?') ? '&' : '?',
        { value, next } = await request(`${path}${separator}per_page=100&page=${page}`, 'GET', undefined, true);
      if (!Array.isArray(value)) fail('ISSUE_RESPONSE_INVALID', 'GitHub 平台列表格式无效；未采用不完整清单');
      items.push(...value);
      if (!next) return items;
      const href = /<([^>]+)>;\s*rel="next"/.exec(next)?.[1];
      if (!href) return items;
      let following;
      try {
        following = new URL(href, settings.apiUrl);
      } catch {
        fail('ISSUE_RESPONSE_INVALID', 'GitHub 平台分页地址无效，停止而非截断');
      }
      if (following.origin !== new URL(settings.apiUrl).origin || Number(following.searchParams.get('page')) !== page + 1)
        fail('ISSUE_RESPONSE_INVALID', 'GitHub 平台分页未连续前进，停止而非截断');
    }
    fail('ISSUE_RESPONSE_LIMIT', 'GitHub 平台查询范围超过分页上限，未静默截断，请收窄范围');
  }
  return { request, list };
}
async function readJson(response, family) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > 8 * 1024 * 1024) fail(`${family}_RESPONSE_LIMIT`, 'GitHub 平台响应超过读取上限，未采用');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    fail(`${family}_RESPONSE_INVALID`, 'GitHub 平台未返回有效 JSON，未采用响应内容');
  }
}
function reject(response, family) {
  const status = response.status,
    sso = response.headers.get('x-github-sso'),
    accepted = response.headers.get('x-accepted-github-permissions'),
    scopes = response.headers.get('x-oauth-scopes'),
    remaining = response.headers.get('x-ratelimit-remaining');
  let message;
  if (status === 401)
    message =
      'GitHub 平台接口认证缺失或已失效；请在当前项目的内部平台认证提供 GitHub Token，Git 代码认证不能替代 API 认证；不写入网页、配置或执行记录。';
  else if (status === 429 || (status === 403 && (remaining === '0' || response.headers.has('retry-after'))))
    message =
      'GitHub 平台接口额度或频率受限。若刚提供 Token 仍出现此提示，说明请求没有以该 Token 身份执行（Token 无效或未被采用）；请重新保存 Token 后再验证，或稍后重试。';
  else if (status === 403 && (sso || /saml/i.test(response.headers.get('x-github-sso') ?? '')))
    message =
      'GitHub 组织启用了 SAML SSO，当前 Token 尚未获该组织授权。请打开 GitHub → Settings → Developer settings → Tokens，为该组织点击 Configure SSO 并授权，然后重新保存 Token 验证。';
  else if (status === 403 && accepted)
    message = `GitHub Token 缺少平台要求的权限（${accepted}）。细粒度 Token 请在仓库权限中开启 Issues、Pull requests 的读写和 Metadata 读取；经典 Token 需要 repo 范围。修改后重新保存 Token 再验证。`;
  else if (status === 403 && scopes !== null && !/(^|,\s*)repo(,|$)/i.test(scopes))
    message = `当前经典 Token 的权限范围是「${scopes || '无'}」，没有 repo（私有仓库必需）。请补上 repo 范围，或改用细粒度 Token 授予该仓库 Issues / Pull requests 读写与 Metadata 读取，然后重新保存 Token 再验证。`;
  else if (status === 405)
    message =
      'GitHub 拒绝合入（HTTP 405）：PR 不满足分支保护、必需检查或冲突等合入条件；请在原 PR 处理后重试，本次未合入。';
  else if (status === 409)
    message =
      'GitHub 拒绝合入（HTTP 409）：PR head 或仓库状态已变化；请核对冻结候选与平台状态后重试，本次未合入。';
  else if (status === 422)
    message =
      'GitHub 拒绝请求（HTTP 422）：标题或正文超过平台长度上限（Issue 正文最多 65,536 字符）或内容不合法。请核对来源对象后恢复原同步；本次未创建新对象。';
  else if (status === 404)
    message =
      'GitHub 平台拒绝请求（HTTP 404）：仓库、Issue 或 PR 不存在，或 Token 无权访问；请核对内部仓库地址、项目路径（owner/repo）与 Token 权限后回读原对象。';
  else if (status === 403)
    message =
      'GitHub 平台拒绝请求（HTTP 403）。常见原因：经典 Token 没有 repo 范围（私有仓库必需）；细粒度 Token 未授权该仓库或缺少 Issues / Pull requests 读写、Metadata 读取；组织 SAML SSO 未授权；请求额度受限。请在 GitHub Token 设置页核对后重新保存并验证。';
  else message = `GitHub 平台拒绝请求（HTTP ${status}）；请核对权限与配置后回读原对象。`;
  try {
    fail(`${family}_API_REJECTED`, message);
  } catch (error) {
    error.httpStatus = status;
    const retry = response.headers.get('retry-after');
    error.retryAfterMs = /^\d+$/.test(retry ?? '') ? Math.min(3600000, Number(retry) * 1000) : 30000;
    throw error;
  }
}
function unavailable(error, family) {
  if (
    ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT'].includes(
      error.cause?.code,
    )
  )
    fail(
      `${family}_API_TLS_UNTRUSTED`,
      'Node 未信任内部平台或 GitHub API 的证书链。将企业 CA 安装到系统受信任证书库并重启；不要关闭证书校验。',
    );
  fail(`${family}_API_UNAVAILABLE`, '内部平台 API 连接失败或超时；请核对网络、证书与服务，不重复创建');
}
