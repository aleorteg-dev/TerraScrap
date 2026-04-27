FROM node:20-alpine AS build
# Mirror repo layout so gen:api can resolve ../docs/contracts/openapi.json
WORKDIR /workspace
COPY docs/contracts/openapi.json docs/contracts/openapi.json
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci --legacy-peer-deps
COPY frontend/ frontend/
WORKDIR /workspace/frontend
RUN npm run gen:api && npm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/frontend/dist /usr/share/nginx/html
