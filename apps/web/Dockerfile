FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY apps/web apps/web

# Vite inlina VITE_* no bundle em tempo de BUILD, nao de runtime - por isso
# precisam chegar como build ARG aqui, nao so existir num .env montado no
# container final (que nem existe, e so estatico servido pelo nginx).
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_VAPID_PUBLIC_KEY
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/web

FROM nginx:1.27-alpine AS runtime
COPY --from=base /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
