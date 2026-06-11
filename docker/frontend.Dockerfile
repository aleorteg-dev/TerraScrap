FROM node:20-alpine AS build
# Mirror repo layout so gen:api can resolve ../docs/contracts/openapi.json
WORKDIR /workspace
COPY docs/contracts/openapi.json docs/contracts/openapi.json
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci
COPY frontend/ frontend/
WORKDIR /workspace/frontend
RUN npm run gen:api && npm run build

FROM nginx:stable-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=nginx:nginx /workspace/frontend/dist /usr/share/nginx/html
# Run nginx as the non-root `nginx` user (SP-06):
# - pid moved to /tmp (writable for non-root)
# - cache/log dirs chowned to nginx
RUN sed -i 's,pid\s*/.*nginx\.pid;,pid /tmp/nginx.pid;,' /etc/nginx/nginx.conf \
 && chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx/conf.d \
 && touch /tmp/nginx.pid \
 && chown nginx:nginx /tmp/nginx.pid
USER nginx
EXPOSE 8080
