FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /bot

COPY requirements.txt .
RUN pip install -r requirements.txt && useradd --system --uid 1000 fitolens

COPY app ./app

USER fitolens
EXPOSE 8080
CMD ["python", "-m", "app.main"]
