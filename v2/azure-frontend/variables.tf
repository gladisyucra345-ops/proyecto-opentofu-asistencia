variable "subscription_id" {
  description = "ID de la suscripcion de Azure (se pasa con TF_VAR_subscription_id)"
  type        = string
}

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

variable "location" {
  description = "Region de Azure"
  type        = string
  default     = "westus2"
}

variable "vm_size" {
  description = "Tamano de la VM"
  type        = string
  default     = "Standard_B2s_v2"
}

variable "llave_publica" {
  description = "Ruta de la llave SSH publica"
  type        = string
  default     = "~/.ssh/azure-frontend.pub"
}