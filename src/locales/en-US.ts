import login from './en-US/login';

export default {
  ...login,
  'common.language': 'Language',
  'common.language.zhCN': '简体中文',
  'common.language.enUS': 'English',
  'common.language.updated': 'Language preference saved',
  'common.language.updateFailed': 'Failed to save language preference',
  'client.connectionFailed': 'Cannot connect to the Kaiwu Gateway',
  'client.serviceUnavailable': 'The service is temporarily unavailable',
  'client.requestFailed': 'Request failed (HTTP {status})',
  'client.loginFailed': 'Sign-in failed (HTTP {status})',
  'client.sessionExpired': 'Your session has expired',
  'client.catalogFailed': 'Language resources failed to load; the current language was kept',
};
