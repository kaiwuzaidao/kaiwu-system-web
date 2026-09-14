import login from './zh-CN/login';

export default {
  ...login,
  'common.language': '语言',
  'common.language.zhCN': '简体中文',
  'common.language.enUS': 'English',
  'common.language.updated': '语言设置已保存',
  'common.language.updateFailed': '保存语言设置失败',
  'client.connectionFailed': '无法连接服务，请确认 Kaiwu 网关已启动',
  'client.serviceUnavailable': '服务暂时不可用，请稍后重试',
  'client.requestFailed': '请求失败（HTTP {status}）',
  'client.loginFailed': '登录失败（HTTP {status}）',
  'client.sessionExpired': '会话已失效',
  'client.catalogFailed': '语言资源加载失败，已保留当前界面语言',
};
