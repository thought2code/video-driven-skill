ARG NODE_IMAGE=node:20-alpine
ARG CADDY_IMAGE=caddy:2-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM ${CADDY_IMAGE}
RUN apk add --no-cache curl
COPY --from=build /app/dist /srv
COPY Caddyfile.template /etc/caddy/Caddyfile.template
COPY email.caddy /etc/caddy/email.caddy
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 80 443 443/udp
ENTRYPOINT ["docker-entrypoint.sh"]
