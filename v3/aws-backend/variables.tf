variable "proyecto" {
  description = "Nombre del proyecto"
  type        = string
  default     = "asistencia"
}

variable "ambiente" {
  description = "Ambiente a desplegar"
  type        = string
  default     = "dev"
}

variable "region" {
  description = "Region de AWS"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "Tamano de la VM"
  type        = string
  default     = "t3.micro"
}

variable "llave_publica" {
  description = "Ruta de la llave SSH publica"
  type        = string
  default     = "~/.ssh/aws-backend.pub"
}
