ARG NODE_IMAGE=node:20-alpine
ARG CADDY_IMAGE=caddy:2-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM ${CADDY_IMAGE}
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443 443/udp
