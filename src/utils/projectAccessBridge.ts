import { currentAccessTokenSnapshot, subscribeSessionChange } from '@/services/auth';

const ACCESS_REQUEST = 'KAIWU_ACCESS_REQUEST';
const ACCESS_RESPONSE = 'KAIWU_ACCESS_RESPONSE';
const NONCE_PATTERN = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;

type RegisteredClient = {
  source: Window;
  origin: string;
  nonce: string;
};

const clients = new Set<RegisteredClient>();
/** 同时在册的子应用窗口上限；超出即拒绝注册，避免无限增长。 */
const MAX_CLIENTS = 32;
let installed = false;

function respond(client: RegisteredClient) {
  if (client.source.closed) {
    clients.delete(client);
    return;
  }
  client.source.postMessage(
    {
      type: ACCESS_RESPONSE,
      nonce: client.nonce,
      accessToken: currentAccessTokenSnapshot(),
    },
    client.origin,
  );
}

/**
 * Installs the host half of the generated-project access protocol.
 * Only a same-origin opener/parent relation can register, and each reply is bound to its nonce.
 */
export function installProjectAccessBridge() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // The first branch below enforces an exact same-origin match before reading message data.
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    // nosemgrep: javascript.browser.security.insufficient-postmessage-origin-validation.insufficient-postmessage-origin-validation
    if (event.origin !== window.location.origin || !event.source) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    const request = data as { type?: unknown; nonce?: unknown };
    if (
      request.type !== ACCESS_REQUEST ||
      typeof request.nonce !== 'string' ||
      !NONCE_PATTERN.test(request.nonce)
    ) {
      return;
    }

    const source = event.source as Window;
    if (source.opener !== window && source.parent !== window) return;
    // 先清掉已关闭的窗口，再判上限。
    //
    // 原来只在注册瞬间和会话变化时才经 respond() 顺带剔除 closed 条目，平台标签页
    // 长期不动时它们永远留着；累计到 32 个之后新的子应用会被静默拒绝——不报错、
    // 不打日志，表现只是子应用永远拿不到令牌、直接弹「会话已失效」，只能刷新平台页。
    clients.forEach((registered) => {
      if (registered.source === source || registered.source.closed) {
        clients.delete(registered);
      }
    });
    if (clients.size >= MAX_CLIENTS) return;
    const client = {
      source,
      origin: event.origin,
      nonce: request.nonce,
    };
    clients.add(client);
    respond(client);
  });

  subscribeSessionChange(() => {
    clients.forEach(respond);
  });
}
