# Pro 页面外沿留白

用户参考官方监控页：https://preview.pro.ant.design/dashboard/monitor/ 。本机 Chrome 1440×1000 实测 .ant-pro-layout-content 为 padding:32px 40px。

根因：上一版 padding 只落在 PageContainer 的 children；项目成员/角色页面直接返回 Space/Table/Alert，Workflow 组件也不统一使用该容器，因此仍可能贴边。

改为公共 kaiwu-content-frame 承载上下32/左右40，手机上下左右16；面包屑也归入相同外沿。PageContainer header/children 移除重复水平 padding，保持标题和卡片与普通页面同一条对齐线。菜单展开、权限、待办、请求与业务流程不变。

System 与采购 pnpm verify 通过；System 8 项布局/操作检查、采购24项生产构建浏览器测试通过。新增直接测量普通项目成员表格左右坐标差：1440px 两侧各40、390px 两侧各16，且无文档横向溢出。PageContainer内容检查为0 padding，证明没有重复加宽到80。

三处公共CSS字节一致，SHA见shared-style-sha256.json。旧截图保留，新截图独立保存；本地fixture验收，不是test环境发布证据。只建MR，不合入、不部署、不读取Secret。
