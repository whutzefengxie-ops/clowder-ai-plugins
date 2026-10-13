import { createHash } from 'node:crypto';
import { access, lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readText, writeJson } from './atomic-file.mjs';
import { fail } from './config.mjs';
import { execution } from './execution.mjs';

const installation = fileURLToPath(new URL('../', import.meta.url));
export async function privateLocation(file) {
  if (typeof file !== 'string' || !isAbsolute(file)) fail('PRIVATE_CONFIG_PATH', '私有配置需要绝对路径');
  const path = resolve(file);
  const inside = relative(installation, path);
  if (!inside || (!inside.startsWith(`..${sep}`) && !isAbsolute(inside)))
    fail('PRIVATE_CONFIG_IN_INSTALLATION', '配置不能保存在插件安装目录内');
  try {
    if ((await lstat(path)).isSymbolicLink()) fail('PRIVATE_CONFIG_PATH', '配置文件不能是符号链接');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await outsideRepository(await existingParent(dirname(path)));
  return path;
}
async function existingParent(path) {
  let parent = path;
  while (true) {
    try {
      parent = await realpath(parent);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') fail('PRIVATE_CONFIG_PATH', '配置目录不可访问');
      const next = dirname(parent);
      if (next === parent) fail('PRIVATE_CONFIG_PATH', '配置目录所在磁盘不可访问');
      parent = next;
    }
  }
  return parent;
}
async function outsideRepository(path) {
  let parent = path;
  while (true) {
    if (basename(parent).toLowerCase() === 'node_modules')
      fail('PRIVATE_CONFIG_IN_INSTALLATION', '配置不能放在依赖安装目录');
    try {
      await access(join(parent, '.git'));
    } catch (error) {
      if (error.code === 'ENOENT') {
        const next = dirname(parent);
        if (next === parent) break;
        parent = next;
        continue;
      }
      throw error;
    }
    fail('PRIVATE_CONFIG_IN_REPOSITORY', '配置必须保存在 Git 工作仓之外，避免提交私有数据');
  }
}
export async function readPrivate(file) {
  let text;
  try {
    text = await readText(file);
  } catch (error) {
    if (error.code === 'ENOENT') return { config: null, revision: null };
    fail('CONFIGURATION_UNREADABLE', '私有配置无法读取，暂停；请在本机核对文件');
  }
  try {
    return { config: JSON.parse(text), revision: createHash('sha256').update(text).digest('hex') };
  } catch {
    fail('CONFIGURATION_UNREADABLE', '私有配置 JSON 无效，暂停；原文件保留');
  }
}
export async function configurationLock(file, operation) {
  await privateLocation(file);
  await mkdir(dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  let handle;
  try {
    handle = await open(lock, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST')
      fail('CONFIGURATION_BUSY', '配置或同步正在执行；若进程中断，请在本机确认所有执行器退出后处理配置锁');
    throw error;
  }
  let release = true;
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid }));
    return await operation();
  } catch (error) {
    if (error.code === 'STOP_UNCONFIRMED') release = false;
    throw error;
  } finally {
    await handle.close();
    if (release && !execution()?.stopUnconfirmed) await unlink(lock);
  }
}
export async function writePrivate(file, config) {
  await writeJson(file, config);
}
