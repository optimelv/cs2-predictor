#!/bin/bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl docker.io docker-compose-v2 git python3
systemctl enable --now docker

install -d -m 0755 /opt/strikesignal
if [ ! -d /opt/strikesignal/repo/.git ]; then
  git clone --depth 1 https://github.com/optimelv/cs2-predictor.git /opt/strikesignal/repo
else
  git -C /opt/strikesignal/repo pull --ff-only origin main
fi

PUBLIC_IP=""
for _ in $(seq 1 60); do
  PUBLIC_IP=$(curl -fsS -H 'Authorization: Bearer Oracle' http://169.254.169.254/opc/v2/vnics/ \
    | python3 -c 'import json,sys; rows=json.load(sys.stdin); print(next((row.get("publicIp", "") for row in rows if row.get("publicIp")), ""))' \
    || true)
  [ -n "$PUBLIC_IP" ] && break
  sleep 5
done

if [ -z "$PUBLIC_IP" ]; then
  echo "Unable to discover the instance public IP from OCI metadata." >&2
  exit 1
fi

WORKER_HOST="${PUBLIC_IP//./-}.nip.io"
cat > /opt/strikesignal/repo/infra/oracle/.env <<EOF
WORKER_HOST=$WORKER_HOST
EOF

docker compose \
  --env-file /opt/strikesignal/repo/infra/oracle/.env \
  -f /opt/strikesignal/repo/infra/oracle/docker-compose.yml \
  up -d --build
