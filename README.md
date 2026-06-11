# 🗺️ TerraScrap

> Sube tu mundo de Terraria, explóralo sin niebla de guerra y localiza cualquier ítem al instante.

**TerraScrap** es una aplicación web que permite a los jugadores de Terraria subir un fichero `.wld`, visualizar el mundo completo revelado en un canvas interactivo (pan + zoom) y buscar cualquier ítem por nombre o ID, resaltando su ubicación exacta — ya sea como bloque, pared, objeto del mundo o dentro de un cofre.

---

## ✨ Características principales

- **Upload de mundos** — Carga ficheros `.wld` (hasta 200 MB) con validación de cabecera.
- **Mapa revelado** — Visualización completa del mundo sin niebla de guerra en un canvas 2D navegable.
- **Pan & Zoom** — Navegación fluida por el mapa con drag y rueda/pinch.
- **Búsqueda de ítems** — Autocompletado por nombre o ID con catálogo extraído de la [Terraria Wiki](https://terraria.wiki.gg/).
- **Localización precisa** — Encuentra ítems como bloques, paredes, objetos del mundo o dentro de cofres/contenedores.
- **Resaltado visual** — Marcadores animados sobre cada coincidencia para localización inmediata.
- **Panel de resultados** — Lista de coincidencias con botón "centrar" para saltar a cada una.

---

## 🛠️ Stack tecnológico

| Capa | Tecnología |
|------|------------|
| **Backend** | Python 3.12 · FastAPI · Uvicorn |
| **Frontend** | React 19 · TypeScript · Vite |
| **Render** | Canvas 2D API nativa |
| **Tests backend** | pytest · pytest-asyncio · hypothesis |
| **Tests frontend** | Vitest · React Testing Library |
| **Lint / Types** | ruff · mypy (strict) · ESLint · Prettier |
| **Contenedores** | Docker · docker-compose · nginx |

---

## 📁 Estructura del proyecto

```
TerraScrap/
├── PROJECT.md                  # Documento principal del proyecto (SDD)
├── docs/
│   ├── contracts/              # Contrato de API (OpenAPI)
│   └── modules/                # Especificaciones por módulo
│       ├── backend/
│       ├── frontend/
│       └── platform/
├── backend/
│   ├── pyproject.toml
│   ├── src/twi/                # Código fuente del backend
│   │   ├── wld_parser/         # Parseo binario de ficheros .wld
│   │   ├── world_repository/   # Almacén de mundos en memoria (sesión)
│   │   ├── item_catalog/       # Catálogo de ítems (scraping + caché)
│   │   ├── tile_search/        # Motor de búsqueda sobre el mundo
│   │   ├── api_rest/           # Endpoints FastAPI
│   │   └── app.py              # Bootstrap de la aplicación
│   └── tests/
│       ├── unit/
│       └── integration/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/                    # Código fuente del frontend
│   │   ├── api-client/         # Cliente HTTP tipado (OpenAPI)
│   │   ├── ui-upload/          # Componente de upload
│   │   ├── world-canvas/       # Render del mundo en canvas
│   │   ├── search-panel/       # Panel de búsqueda
│   │   ├── highlight-overlay/  # Resaltado de coincidencias
│   │   └── app-shell/          # Layout, routing, pegamento
│   └── tests/
└── docker/
    ├── backend.Dockerfile
    ├── frontend.Dockerfile
    ├── nginx.conf
    └── docker-compose.yml
```

---

## 🚀 Inicio rápido

### Requisitos previos

- [Docker](https://www.docker.com/) y [Docker Compose](https://docs.docker.com/compose/)
- *(Desarrollo)* Python 3.12+, Node.js 18+

### Con Docker (recomendado)

```bash
docker compose -f docker/docker-compose.yml up --build
```

La aplicación estará disponible en `http://localhost`.

### Desarrollo local

#### Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows
# source .venv/bin/activate   # Linux/macOS
pip install -e ".[dev]"
uvicorn twi.app:app --reload --port 8000
```

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## 🧪 Tests

El proyecto sigue una metodología **TDD** estricta. Cada módulo tiene su propio plan de tests documentado en `docs/modules/`.

### Backend

```bash
cd backend
pytest                         # Tests unitarios + integración
pytest --cov=twi               # Con cobertura
mypy src/twi --strict          # Verificación de tipos
ruff check src/ tests/         # Linter
```

### Frontend

```bash
cd frontend
npm run test                   # Vitest
npm run lint                   # ESLint + Prettier
npx tsc --noEmit               # Verificación de tipos
```

---

## 📐 Metodología

El desarrollo sigue **SDD + TDD** con un enfoque de iteraciones por módulo:

1. **SDD** — Se acuerda el contrato del módulo antes de escribir código.
2. **TDD Rojo** — Se escriben los tests que deben fallar.
3. **TDD Verde** — Se implementa lo mínimo para que pasen.
4. **TDD Refactor** — Se limpia sin romper tests.

Cada módulo tiene su especificación en `docs/modules/` con contrato público, plan de tests y estado actual. Ver [`PROJECT.md`](PROJECT.md) para el detalle completo de la metodología.

---

## 🔌 API REST (resumen)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/worlds` | Sube un fichero `.wld` (multipart) |
| `GET` | `/api/worlds/{world_id}` | Metadatos del mundo cargado |
| `GET` | `/api/worlds/{world_id}/tiles` | Matriz de tiles para el canvas |
| `GET` | `/api/items?q=<query>` | Autocompletado de ítems |
| `GET` | `/api/worlds/{world_id}/search?item_id=<id>` | Buscar ítem en el mundo |
| `DELETE` | `/api/worlds/{world_id}` | Liberar memoria de sesión |

Contrato completo en [`docs/contracts/api-contract.md`](docs/contracts/api-contract.md).

---

## 📄 Licencia

*Por definir.*
