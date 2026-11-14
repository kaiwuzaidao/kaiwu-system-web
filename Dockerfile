# 基础镜像提成 ARG，默认值保持公开可复现的 Docker Hub 引用（含 digest 钉死）。
# 构建机访问不到 Docker Hub 时，私有 CI 用 --build-arg 覆盖成自建镜像仓库里的副本；
# 默认值是仓库对外的契约，不应为某个私有环境改写。
ARG BUILDER_IMAGE=node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2
ARG RUNTIME_IMAGE=nginxinc/nginx-unprivileged:1.31.1-alpine@sha256:cc300bd2e8776708a8c2c8686a74f06eadf221c5ce01e85d0e821955d7a730ab
# 两条 ARG 都必须声明在第一个 FROM 之前：FROM 之后声明的 ARG 属于该 stage 的
# 作用域，对后续 FROM 不可见（buildkit 会直接报 UndefinedArgInFrom）。
FROM ${BUILDER_IMAGE} AS builder
WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmjs.org/
ARG NPM_STRICT_SSL=true
# corepack 首次调用 pnpm 时下载 pnpm 本体；默认官方源，私有 CI 可用 --build-arg 换镜像。
ARG COREPACK_NPM_REGISTRY=https://registry.npmjs.org
RUN corepack enable
COPY package.json pnpm-lock.yaml .npmrc ./
RUN npm_config_registry="${NPM_REGISTRY}" \
    npm_config_strict_ssl="${NPM_STRICT_SSL}" \
    COREPACK_NPM_REGISTRY="${COREPACK_NPM_REGISTRY}" \
    pnpm install --frozen-lockfile
COPY . .
RUN pnpm run setup && pnpm typecheck && pnpm build

FROM ${RUNTIME_IMAGE}
USER root
# 修复镜像门禁发现的Brotli解码器越界写入；固定最低修复版本，不关闭扫描。
RUN apk add --no-cache --upgrade 'brotli-libs>=1.2.1-r0'
ENV KAIWU_GATEWAY_UPSTREAM=gateway-service:8088
ENV NGINX_ENVSUBST_FILTER=KAIWU_GATEWAY_UPSTREAM
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html
USER 101:101
EXPOSE 8080
