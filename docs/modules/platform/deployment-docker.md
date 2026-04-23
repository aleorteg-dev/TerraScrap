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
└── docker-compose.yml
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

- [ ] `T-01 bash docker/smoke.sh` levanta compose, `curl /healthz` responde 200, `curl /api/items?q=dirt` responde 200, y derriba todo.
- [ ] `T-02` La imagen final de backend pesa < 250 MB.
- [ ] `T-03` La imagen final de frontend pesa < 50 MB.
- [ ] `T-04` `docker scout` / `trivy` sobre las imágenes sin vulnerabilidades críticas.

## 7. Notas de implementación

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

## 8. Performance
- Build reproducible en CI, capas cacheables.
- Imágenes slim/alpine.

## 9. Errores
- Si falta la wiki cache, el backend arranca igual y `/api/items` devolverá 503 hasta poblar el cache (ver `app-bootstrap`).

## 10. Estado
- **Versión del contrato**: v0
- **Último cierre**: —
- **Iteración actual**: —
- **Deuda / follow-ups**: —