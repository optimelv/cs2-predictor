FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY infra/oracle/worker/requirements.txt infra/oracle/worker/requirements-scrapling.txt ./
RUN pip install --no-cache-dir -r requirements-scrapling.txt
COPY infra/oracle/worker/server.py infra/oracle/worker/event_policy.py .
COPY docs/lib/event-policy.json .

EXPOSE 8080
CMD ["python", "server.py"]
