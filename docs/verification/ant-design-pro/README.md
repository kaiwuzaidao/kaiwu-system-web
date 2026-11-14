# Ant Design Pro 风格对齐基线

用户确认范围：System、采购示例、生成模板。菜单原有 group/默认展开策略不变；权限来源、服务端最终授权、令牌桥接、项目上下文和待办行为保持。

参考：官方预览 https://preview.pro.ant.design/dashboard/workplace/ 与官方配置 https://github.com/ant-design/ant-design-pro/blob/master/config/defaultSettings.ts 。2026-11-06 用本机 Chrome 1440×1000 视口读取计算样式，不将原截图浏览器缩放后的像素当 CSS px。

| 项目 | 官方预览实测 | 本批规格 |
|---|---|---|
| 布局 | light / mix / Fluid | 同左，菜单不 split |
| 顶栏高度 | 56px | 56px |
| 侧栏宽度 | 256px | 256px |
| 正文左右留白 | 40px | 40px（手机 16px） |
| 页标题 | 20px / 600 | 20px / 600 |
| 卡片标题 | 16px，head 56px | 同左 |
| 卡片圆角 | 8px | 8px |
| 菜单项 | 40px / 14px / 6px 圆角 | 同左 |
| 选中背景 | rgba(0,0,0,.04) | 同左，无旧蓝色竖条 |
| 主色 | #1677ff | #1677ff |

实施：删除 System 旧 reference.less/v5-align.less 覆盖，子应用清理旧 V5 全局 CSS；采用 ProLayout 原生混合顶栏，正文上方面包屑、标题与卡片留白统一。公共 tokens.ts、antd.ts、layout.ts、ant-pro.less 在 System/采购/模板字节一致（SHA 见 shared-theme-sha256.json）。保留 Kaiwu 品牌和真实业务内容，不复制官方演示统计/图表，不将不同内容页面声称为 PNG 零差异；官方站 AlibabaSans 与本机系统字体的拉丁字形也非完全同一字体文件。

验证：System pnpm verify 通过（显式指向本批 dev 后端与 SQL），13 项布局/操作 + 9 项工作台待办浏览器测试通过；采购 verify 和 18 项生产构建浏览器测试通过。模板 Maven/真实 MySQL/Flyway 与生成后端/前端验证通过；模板最终 Fluid 首页追加定向生成及构建验证。截图均为本地受控 fixture，不是 test 发布证据。

排查记录：最初跨仓脚本读到其他会话未合入后端，切换明确的 KAIWU_SERVICE_DIR/KAIWU_SQL_DIR 后通过；一次静态服务在重建 dist 时返回 404，稳定构建后复测通过。旧向导用例仍点击已移除基础脚手架选项，改为现有自动 BASIC 流程；待办用例把品牌 h1 与正文 h1 同时匹配，改为限定正文。未放宽产品权限或绕过门禁。
