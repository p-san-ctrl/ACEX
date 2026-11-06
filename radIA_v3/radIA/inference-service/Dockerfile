# syntax=docker/dockerfile:1
FROM python:3.12.14-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MODEL_PATH=/models/best.pt

RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then \
      apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca update \
      && apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca install --no-install-recommends -y curl libgl1 libglib2.0-0; \
    else \
      apt-get update \
      && apt-get install --no-install-recommends -y curl libgl1 libglib2.0-0; \
    fi \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export PIP_CERT=/run/secrets/proxy_ca; fi \
    && pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu \
      torch==2.15.0+cpu torchvision==0.29.2+cpu
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export PIP_CERT=/run/secrets/proxy_ca; fi \
    && pip install --no-cache-dir --requirement requirements.txt

RUN --mount=type=secret,id=proxy_ca \
    mkdir -p /models \
    && if [ -f /run/secrets/proxy_ca ]; then curl_ca="--cacert /run/secrets/proxy_ca"; else curl_ca=""; fi \
    && curl --fail --location --retry 3 $curl_ca \
      https://github.com/RuiyangJu/Bone_Fracture_Detection_YOLOv8/releases/download/Trained_model/best.pt \
      --output /models/best.pt \
    && echo "301abc1774c28dd7c5adbcf1e8a79ed6771273615238b62dd179b622292b3a81  /models/best.pt" | sha256sum --check -

COPY app ./app

RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app /models
USER appuser

EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
