import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * 在后端源码根目录下按类名定位 Java 源文件，不绑定包路径。
 *
 * 存在的意义：门禁脚本曾写死 `com/kaiwu/module/project/SystemProjectBootstrap.java`，
 * 后端把类挪到 `module/project/lifecycle/` 后，check:perm 读不到 seed 而误报、
 * check:i18n 直接跳过了内置菜单覆盖校验。按文件名查找后包再怎么移都不会坏。
 *
 * 结果必须唯一：找不到或找到多个都返回 error，由调用方直接判失败——
 * 跨仓校验依赖的输入缺失时宁可报错，也不能悄悄跳过。
 *
 * @param {string} sourceRoot 例如 `<service>/kaiwu-system-domain/src/main/java`
 * @param {string} className 简单类名，如 `SystemProjectBootstrap`
 * @returns {{ file: string } | { error: string }}
 */
export function locateJavaClass(sourceRoot, className) {
  if (!existsSync(sourceRoot)) {
    return { error: `未找到后端源码目录 ${sourceRoot}，无法定位 ${className}` };
  }
  const target = `${className}.java`;
  const matches = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === target) matches.push(full);
    }
  };
  walk(sourceRoot);
  if (matches.length === 1) return { file: matches[0] };
  if (matches.length === 0) {
    return { error: `在 ${sourceRoot} 下未找到 ${target}` };
  }
  const where = matches.map((file) => relative(sourceRoot, file)).join('、');
  return { error: `${target} 不唯一（${where}），无法判断该读哪一个` };
}
