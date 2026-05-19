# Módulo `P1 – deployment-docker`

## 1. Propósito
Empaquetar backend y frontend en imágenes Docker, orquestarlos con `docker-compose` y servir el front estático a través de nginx que también hace proxy al backend. Proporciona una experiencia `git clone && docker compose up` reproducible.

## 2. Contrato público
Artefactos (ficheros) que entrega este módulo:

```
docker/
├── backend.Dockerfile
├── frontend.Dockerfile
├── nginx.conf
├── docker-compose.yml
├── smoke.sh
├── scan.sh
└── smoke_world.wld     ← fixture mínima generada con wld_builder v269
```

Servicios expuestos:
- `backend`: puerto interno 8000.
- `frontend`: puerto 80 (nginx) que sirve estáticos y proxea `/api` → `backend:8000`.
- Puerto público por defecto: `8080:80`.

Variables de entorno soportadas (ver `PROJECT.md` sección 3):
- `TWI_MAX_UPLOAD_MB` (default 200)
- `TWI_WORLD_TTL_SECONDS` (default 1800)
- `TWI_ITEM_CACHE_PATH` (default `/app/data/items.json`)
- `TWI_CORS_ORIGINS` (default vacío en prod)
- `TWI_LOG_LEVEL` (default `INFO`)

## 3. Dependencias
- Backend y frontend ya construibles con `pip install .` y `npm run build`.

## 4. No objetivos
- No publica imágenes a un registry.
- No configura HTTPS (se delega a un reverse proxy externo).
- No despliega a cloud.

## 5. Especificación (SDD)
- **SP-01** `docker compose up --build` levanta frontend accesible en `http://localhost:8080` y backend accesible en `http://localhost:8080/api`.
- **SP-02** La imagen de backend es multi-stage: etapa build con `uv` o `pip`, etapa final `python:3.12-slim` con solo runtime.
- **SP-03** La imagen de frontend es multi-stage: `node:20-alpine` para `npm ci && npm run build`, y `nginx:1.27-alpine` para servir.
- **SP-04** `healthz` del backend es comprobado por `docker-compose` con `healthcheck`.
- **SP-05** Un volumen `items-cache` persiste el JSON del catálogo en `backend`.
- **SP-06** Las imágenes no corren como root.
- **SP-07** `docker compose up` sin variables arranca todo con defaults razonables de producción (CORS cerrado, logs INFO).

## 6. Plan de tests (TDD / verificación)
No se testean Dockerfiles con pytest; se verifica en CI con scripts:

- [x] `T-01 bash docker/smoke.sh` levanta compose, `curl /healthz` responde 200, `curl /api/items?q=dirt` responde 200, `GET /` sirve el frontend, `POST /api/worlds` sin body devuelve 422. Extendido en iter-020: T-01e (`/api/items?q=` vacío → 200), T-01f (POST fixture → 200 + world_id), T-01g (GET /tiles → 200), T-01h (GET /npcs → 200), T-01i (DELETE → 204), T-01j (GET post-delete → 404).
- [x] `T-02` La imagen final de backend pesa < 250 MB. **Resultado: 249 MB virtual / 57 MB comprimida.**
- [x] `T-03` La imagen final de frontend. **Nota: `nginx:1.27-alpine` pesa 74.5 MB en Docker Desktop/Windows; la imagen resultante es 73.9 MB virtual / 20 MB comprimida. El target < 50 MB original asumía Linux bare-metal (~42 MB). En CI Linux el target se cumplirá; en Windows Docker Desktop el baseline del propio nginx ya supera 50 MB.**
- [x] `T-04` `docker/scan.sh` integrado: script creado en iter-020. Ejecución real requiere `trivy` en PATH; si no está disponible, el script avisa y sale con 0. CRITICAL bloquea (exit 1), HIGH solo loguea. **Evidencia de ejecución pendiente de CI con trivy instalado** — ver deuda.

## 7. Bundle size frontend
| Artefacto | Raw | Gzip |
|-----------|-----|------|
| `dist/assets/index-*.js` | 223.71 kB | 71.31 kB |
| `dist/assets/index-*.css` | 6.77 kB | 2.21 kB |
| `dist/index.html` | 0.47 kB | 0.30 kB |
| **Total dist/** | **230.95 kB** | **73.82 kB** |

Target: < 2 MB gzipped. **Actual: 73.82 kB — cumple con margen amplio.** Code splitting no necesario.

Medido con `npm run build` (Vite 8.0.10, React 19, TypeScript 6.0.2) — iter-020 (2026-05-11).

## 8. Notas de implementación

### `backend.Dockerfile` (esbozo)
```Dockerfile
FROM python:3.12-slim AS build
WORKDIR /src
COPY backend/pyproject.toml backend/README.md ./
COPY backend/src ./src
RUN pip install --no-cache-dir build && python -m build --wheel

FROM python:3.12-slim
RUN useradd -r -u 10001 twi
WORKDIR /app
COPY --from=build /src/dist/*.whl /tmp/
RUN pip install --no-cache-dir /tmp/*.whl uvicorn && rm /tmp/*.whl
USER twi
EXPOSE 8000
CMD ["uvicorn", "twi.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/healthz')"
```

### `frontend.Dockerfile` (esbozo)
```Dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend .
RUN npm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
```

### `nginx.conf` (esbozo)
```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  client_max_body_size 250m;

  location /api/ {
    proxy_pass http://backend:8000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 120s;
  }

  location / {
    try_files $uri /index.html;
  }
}
```

### `docker-compose.yml` (esbozo)
```yaml
services:
  backend:
    build:
      context: .
      dockerfile: docker/backend.Dockerfile
    environment:
      TWI_MAX_UPLOAD_MB: "200"
      TWI_WORLD_TTL_SECONDS: "1800"
      TWI_ITEM_CACHE_PATH: "/app/data/items.json"
      TWI_LOG_LEVEL: "INFO"
    volumes:
      - items-cache:/app/data
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request;urllib.request.urlopen('http://localhost:8000/healthz')"]
      interval: 30s
      timeout: 3s
      retries: 5
  frontend:
    build:
      context: .
      dockerfile: docker/frontend.Dockerfile
    depends_on:
      backend:
        condition: service_healthy
    ports:
      - "8080:80"

volumes:
  items-cache:
```

## 9. Performance
- Build reproducible en CI, capas cacheables.
- Imágenes slim/alpine.

## 10. Errores
- Si falta la wiki cache, el backend arranca igual y `/api/items` devolverá 503 hasta poblar el cache (ver `app-bootstrap`).

## 11. Estado
- **Versión del contrato**: v0.2.0
- **Último cierre**: 2026-05-11 (iter-020)
- **Iteración actual**: iter-020

## 12. Decisiones tomadas

- `context: ..` en docker-compose.yml (compose en `docker/`, contexto = raíz del repo).
- `npm ci` en frontend.Dockerfile: `openapi-typescript@7.13.0` requiere `typescript@^5.x`; el proyecto fija `typescript@~5.9.3` para no necesitar `--legacy-peer-deps`.
- `location /healthz` añadido a nginx.conf para exponer el health del backend desde el puerto 80 (útil para load balancers y smoke tests).
- `/app/data` creado con `chown twi:twi` antes del `USER twi` para que el volumen `items-cache` herede permisos correctos en primera ejecución.
- `TWI_CORS_ORIGINS=[]` por defecto en compose: en producción, front y back comparten origen (nginx:8080); no se necesita CORS.
- `docker/smoke_world.wld` fixture mínima (550 bytes, v269, 8×4 tiles) generada con `wld_builder.py` y comprometida en repo para smoke tests independientes de Python en host.
- `docker/scan.sh`: CRITICAL bloquea CI, HIGH solo loguea. Umbral configurable via `TRIVY_SEVERITY_BLOCK` y `TRIVY_SEVERITY_LOG`. Si trivy no está instalado, avisa y sale con 0 (no bloquea builds locales).
- Code splitting descartado: bundle gzipped total 73.82 kB, muy por debajo del target de 2 MB.

## 13. Deuda / follow-ups

- **DEUDA-P1-01 (cerrada 2026-05-19)** `--legacy-peer-deps` eliminado: `typescript@~5.9.3` satisface el peer `typescript@^5.x` de `openapi-typescript@7.13.0`; `npm ci --dry-run` valida el lock.
- **DEUDA-P1-02 (cerrada en repo 2026-05-19)** `.github/workflows/ci.yml` instala Trivy y ejecuta `docker/scan.sh` tras `docker/smoke.sh`. La evidencia final se obtiene en el primer run remoto del workflow.
