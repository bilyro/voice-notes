#!/usr/bin/env bash
# scripts/backup.sh — run daily from cron on the server: dump Postgres, gzip it, copy it OFF the server (R2).
# A backup on the same VM is not a backup. Cron example (3:00 every night):
#   0 3 * * * /home/ubuntu/voice-notes/scripts/backup.sh >> /home/ubuntu/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a                      # S3_* and BACKUP_BUCKET from the production .env
: "${BACKUP_BUCKET:?set BACKUP_BUCKET in .env}"

file="voice_notes-$(date -u +%Y-%m-%dT%H%MZ).sql.gz"
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U app voice_notes | gzip > "/tmp/$file"
# the aws-cli image avoids installing anything on the server; R2 speaks the S3 API
docker run --rm -v /tmp:/backup \
  -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" -e AWS_DEFAULT_REGION="$S3_REGION" \
  amazon/aws-cli --endpoint-url "$S3_ENDPOINT" s3 cp "/backup/$file" "s3://$BACKUP_BUCKET/$file"
rm "/tmp/$file"
echo "backup uploaded: s3://$BACKUP_BUCKET/$file"
