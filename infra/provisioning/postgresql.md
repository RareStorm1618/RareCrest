# RareCrest PostgreSQL Provisioning

## Local Development

```bash
docker compose -f infra/docker-compose.yml up -d postgres
```

## Cloud Provisioning (Production)

### Requirements (WO-1)

- Managed PostgreSQL with encryption at rest
- Automated backups with point-in-time recovery (PITR)
- Internal-network-only access (no public endpoint)
- Per-service scoped credentials:
  - `rarecrest_api` — API Server read/write
  - `rarecrest_governance` — Governance Engine read/write
  - `rarecrest_intelligence` — Intelligence Services read/write
- Client App has **no direct connection path**

### AWS RDS Example

```hcl
# infra/provisioning/aws-rds.tf (reference)
resource "aws_db_instance" "rarecrest" {
  identifier     = "rarecrest-prod"
  engine         = "postgres"
  engine_version = "16"
  instance_class = "db.r6g.large"
  allocated_storage = 100
  storage_encrypted = true
  backup_retention_period = 35
  publicly_accessible = false
  vpc_security_group_ids = [aws_security_group.rarecrest_internal.id]
}
```

### PITR Verification

```bash
# List recovery points
aws rds describe-db-instance-automated-backups --db-instance-identifier rarecrest-prod

# Restore to point in time
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier rarecrest-prod \
  --target-db-instance-identifier rarecrest-prod-restored \
  --restore-time 2026-07-11T12:00:00Z
```

### Credential Rotation

Service credentials are scoped and rotated independently. Never use shared admin tokens in application services.
