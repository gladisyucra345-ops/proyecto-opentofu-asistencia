# BOOTSTRAP AWS: crea el bucket S3 donde se guardara el tfstate de v3
# (este proyecto se ejecuta UNA sola vez; su propio state queda local)
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

# Sufijo aleatorio: el nombre del bucket debe ser unico en todo AWS
resource "random_string" "sufijo" {
  length  = 8
  upper   = false
  special = false
}

resource "aws_s3_bucket" "tfstate" {
  bucket = "asistencia-tfstate-${random_string.sufijo.result}"

  tags = {
    Proyecto = "asistencia"
    Uso      = "terraform-state"
  }
}

# Versionado: guarda cada version del state (permite volver atras)
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Cifrado: el state contiene datos sensibles
resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Bloquea cualquier acceso publico
resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Copia estos valores en v3/aws-backend/backend.tf
output "bucket_name" {
  value = aws_s3_bucket.tfstate.bucket
}

output "region" {
  value = "us-east-1"
}
