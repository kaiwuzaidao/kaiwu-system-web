#!/usr/bin/env node
/**
 * 校验「权限三端同码」：后端 @RequirePermission、前端权限码、菜单 seed 用同一个
 * `{module}:{resource}:{action}`。
 *
 * 存在的意义：三端不一致在运行时几乎看不出来。
 *   - 前端写错权限码 → 按钮对所有人隐藏，看起来像「没权限」而不是「写错了」。
 *   - 后端注解没有对应菜单 seed → 全新库里管理员根本无法把该权限授予任何角色，
 *     功能等于不可用；而开发库通常手工加过菜单，所以本地一切正常。
 * 这个脚本把这两类沉默失败变成可检测的。
 *
 * 关于 seed 的判定：只认「代码能自举出来的」——增量 SQL 与 SystemProjectBootstrap。
 * 运行库里手工建的菜单不算数，因为全新安装复现不出来。
 *
 * 退出码：0 全部通过或无法比对（后端仓库不在旁边）；1 发现不一致。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// 默认按四仓平级工作区定位后端；KAIWU_SERVICE_DIR 可覆盖（CI 或非标准布局）。
const serviceDir = process.env.KAIWU_SERVICE_DIR
  ? resolve(process.env.KAIWU_SERVICE_DIR)
  : resolve(webRoot, '../kaiwu-system-service');
const frontendSrc = join(webRoot, 'src');
const backendSrc = join(serviceDir, 'kaiwu-system-domain/src/main/java');
const sqlDir = join(serviceDir, 'sql/increment');
const bootstrapFile = join(backendSrc, 'com/kaiwu/module/project/SystemProjectBootstrap.java');

/** 权限码形状：三段，全小写，中间用冒号。 */
const CODE = /^[a-z][a-z0-9-]*:[a-z0-9-]+:[a-z0-9_-]+$/;

/**
 * 豁免清单保持为空：任何「后端有注解却没有菜单 seed」的权限都必须被报出来。
 *
 * 这里曾长期豁免 `system:role:*`、`system:menu:*`、`system:user:assign-role`，
 * 理由是「平台级角色/菜单管理不作为 system 项目的可授权按钮」。那其实是在给一组
 * **不可能生效**的接口打掩护：它们写 `sys_role/sys_user_role`，而
 * `AuthMapper.findPermissionCodes` 只查 `sys_project_*`，授权出去对谁都不生效。
 * 2026-08-10 连同 Controller 与 verify 脚本一起退役，豁免随之取消。
 *
 * 后续若再想加豁免，先确认要豁免的不是「一条已经断掉的链路」。
 */
const INTENTIONALLY_UNSEEDED = [];

let failed = false;

function fail(title, items, hint) {
  failed = true;
  console.error(`[check:perm] ${title}`);
  items.forEach((item) => console.error(`  - ${item}`));
  if (hint) console.error(`  ${hint}`);
}

function walk(dir, test, visit) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.umi')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, test, visit);
    } else if (test(entry)) {
      visit(full, readFileSync(full, 'utf8'));
    }
  }
}

/**
 * 前端权限码：覆盖 AuthButton 的 permission 属性、usePermission(...) 与
 * permissions.includes(...) 三种用法，统一记录出现位置便于定位。
 */
function readFrontendCodes() {
  const found = new Map();
  const patterns = [
    /permission=["']([^"']+)["']/g,
    /usePermission\(\s*["']([^"']+)["']/g,
    /permissions\.includes\(\s*["']([^"']+)["']/g,
  ];
  walk(
    frontendSrc,
    (name) => /\.tsx?$/.test(name),
    (file, source) => {
      for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
          const where = `${relative(webRoot, file)}`;
          if (!found.has(match[1])) found.set(match[1], where);
        }
      }
    },
  );
  return found;
}

/** 后端权限码：@RequirePermission("...")。 */
function readBackendCodes() {
  const found = new Map();
  walk(
    backendSrc,
    (name) => name.endsWith('.java'),
    (file, source) => {
      for (const match of source.matchAll(/@RequirePermission\(\s*"([^"]+)"/g)) {
        if (!found.has(match[1])) found.set(match[1], relative(serviceDir, file));
      }
    },
  );
  return found;
}

/**
 * 代码可自举的 seed 集合：增量 SQL 里的权限码字面量，加上 Bootstrap 里 upsert 的。
 * 按「三段冒号字面量」提取而不是绑定某种 INSERT 写法——seed 语句的列顺序和换行
 * 方式在不同迁移里并不一致，绑死写法会漏。
 */
function readSeededCodes() {
  const codes = new Set();
  const collect = (source) => {
    for (const match of source.matchAll(/['"]([a-z][a-z0-9-]*:[a-z0-9-]+:[a-z0-9_-]+)['"]/g)) {
      codes.add(match[1]);
    }
  };
  if (existsSync(sqlDir)) {
    for (const name of readdirSync(sqlDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      collect(readFileSync(join(sqlDir, name), 'utf8'));
    }
  }
  if (existsSync(bootstrapFile)) collect(readFileSync(bootstrapFile, 'utf8'));
  return codes;
}

const frontend = readFrontendCodes();

// 检查一：权限码格式。写错格式的码永远匹配不上，且不会有任何报错。
const malformed = [...frontend]
  .filter(([code]) => !CODE.test(code))
  .map(([code, where]) => `${code}  (${where})`);
if (malformed.length > 0) {
  fail('前端权限码不符合 {module}:{resource}:{action} 格式：', malformed);
}

if (!existsSync(backendSrc)) {
  // 四个仓库各自独立，单独 clone 前端时后端不在旁边，此时跳过跨仓比对。
  console.log(`[check:perm] 跳过跨仓比对：未找到后端源码目录 ${backendSrc}`);
  process.exit(failed ? 1 : 0);
}

const backend = readBackendCodes();
const seeded = readSeededCodes();

// 检查二：前端用的权限码，后端必须真的在校验。
// 否则前端以为自己在做权限控制，后端其实对所有人放行。
const notEnforced = [...frontend]
  .filter(([code]) => CODE.test(code) && !backend.has(code))
  .map(([code, where]) => `${code}  (前端 ${where})`);
if (notEnforced.length > 0) {
  fail(
    '前端在用、后端无 @RequirePermission（前端管了个后端不校验的权限）：',
    notEnforced,
    '改法：给对应 Controller 方法加注解，或修正前端权限码拼写。',
  );
}

// 检查三：后端注解的权限码，代码必须能自举出对应菜单 seed。
// 缺 seed 时管理员在「项目菜单」里看不到这个按钮，无法授权给任何角色。
const unseeded = [...backend]
  .filter(([code]) => !seeded.has(code))
  .filter(([code]) => !INTENTIONALLY_UNSEEDED.some((rule) => rule.test(code)))
  .map(([code, where]) => `${code}  (后端 ${where})`);
if (unseeded.length > 0) {
  fail(
    '后端有注解、代码里没有菜单 seed（全新库无法授权，功能不可用）：',
    unseeded,
    '改法：在新增量 SQL 或 SystemProjectBootstrap 里补 BUTTON 节点；' +
      '本地库有记录不算数，全新安装复现不出来。',
  );
}

if (!failed) {
  console.log(
    `[check:perm] 权限三端一致：前端 ${frontend.size} 个、后端 ${backend.size} 个权限码对齐，` +
      `seed 覆盖完整。`,
  );
}
process.exit(failed ? 1 : 0);
