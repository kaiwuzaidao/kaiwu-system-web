# 基础镜像提成 ARG，默认值保持公开可复现的 Docker Hub 引用（含 digest 钉死）。
# 内网 CI 用 --build-arg 覆盖成 Harbor 副本——内网 runner 与 dind 都访问不到
# registry-1.docker.io，而默认值是仓库对外的契约，不应为内网环境改写。
ARG BUILDER_IMAGE=node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2
ARG RUNTIME_IMAGE=nginxinc/nginx-unprivileged:1.31.1-alpine@sha256:cc300bd2e8776708a8c2c8686a74f06eadf221c5ce01e85d0e821955d7a730ab
# 两条 ARG 都必须声明在第一个 FROM 之前：FROM 之后声明的 ARG 属于该 stage 的
# 作用域，对后续 FROM 不可见（buildkit 会直接报 UndefinedArgInFrom）。
FROM ${BUILDER_IMAGE} AS builder
WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmjs.org/
ARG NPM_STRICT_SSL=true
RUN corepack enable
COPY package.json pnpm-lock.yaml .npmrc ./
RUN npm_config_registry="${NPM_REGISTRY}" \
    npm_config_strict_ssl="${NPM_STRICT_SSL}" \
    pnpm install --frozen-lockfile
COPY . .
RUN pnpm run setup && pnpm typecheck && pnpm build

FROM ${RUNTIME_IMAGE}
ENV KAIWU_GATEWAY_UPSTREAM=gateway-service:8088
ENV NGINX_ENVSUBST_FILTER=KAIWU_GATEWAY_UPSTREAM
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html
USER 101:101
EXPOSE 8080
