FROM python:3.12-slim AS build
WORKDIR /src
COPY backend/pyproject.toml ./
COPY backend/src ./src
RUN pip install --no-cache-dir build && python -m build --wheel

FROM python:3.12-slim
RUN useradd -r -u 10001 twi
WORKDIR /app
RUN mkdir -p /app/data && chown twi:twi /app/data
COPY --from=build /src/dist/*.whl /tmp/
RUN pip install --no-cache-dir /tmp/*.whl && rm /tmp/*.whl
USER twi
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=5 --start-period=10s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/healthz')"
CMD ["uvicorn", "twi.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
