FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /api

COPY requirements.txt .
RUN pip install -r requirements.txt && useradd --system --uid 1000 fitolens

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .

USER fitolens
EXPOSE 8000
# Migra la base de datos y arranca. API_WORKERS: procesos (cada uno carga los modelos, ~0.5 GB).
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${API_WORKERS:-2} --proxy-headers --forwarded-allow-ips='*'"]
