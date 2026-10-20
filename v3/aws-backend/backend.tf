# El state de este proyecto se guarda en S3 (creado en v3/bootstrap/aws)
# Ojo: dentro de un bloque backend NO se pueden usar variables.
terraform {
  backend "s3" {
    bucket       = "asistencia-tfstate-md4x4hwz"
    key          = "asistencia/dev/aws-backend.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
