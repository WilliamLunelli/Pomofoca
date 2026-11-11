FROM node:20-alpine AS base
WORKDIR /app

# Sem isso o Prisma nao consegue detectar a versao do OpenSSL nem em build nem em
# runtime (node:20-alpine recente nao vem com libssl nenhuma) - ele cai no default
# "openssl-1.1.x" hardcoded, gera o engine errado, e falha em runtime com
# "Error loading shared library libssl.so.1.1: No such file or directory", mesmo
# com o schema/migrations corretos e Postgres saudavel (descoberto medindo RAM de
# producao - o container ficava em crash loop puro nisso).
RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN npm run build --workspace=packages/shared
RUN npm run prisma:generate --workspace=apps/api
RUN npm run build --workspace=apps/api

EXPOSE 3333
CMD ["node", "apps/api/dist/server.js"]
