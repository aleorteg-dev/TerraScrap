FROM node:20-alpine AS build
# Mirror repo layout so gen:api can resolve ../docs/contracts/openapi.json
WORKDIR /workspace
COPY docs/contracts/openapi.json docs/contracts/openapi.json
COPY frontend/package*.json frontend/
# --legacy-peer-deps: openapi-typescript@7 declares peerDep typescript@^5.x (semver <6),
# but this project uses typescript@~6.0.2. npm v10+ (node:20-alpine) rejects the mismatch.
# Resolution: upgrade openapi-typescript to a version that supports typescript@^6 once released,
# or downgrade typescript to ^5.x. Tracked in docs/modules/platform/deployment-docker.md deuda.
RUN cd frontend && npm ci --legacy-peer-deps
COPY frontend/ frontend/
WORKDIR /workspace/frontend
RUN npm run gen:api && npm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/frontend/dist /usr/share/nginx/html
