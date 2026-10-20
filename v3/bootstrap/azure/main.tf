# BOOTSTRAP AZURE: crea el Storage Account + contenedor donde se guardara el tfstate de v3
# (este proyecto se ejecuta UNA sola vez; su propio state queda local)
terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

variable "subscription_id" {
  type        = string
  description = "ID de la suscripcion (se pasa con TF_VAR_subscription_id)"
}

provider "azurerm" {
  features {}
  subscription_id                 = var.subscription_id
  resource_provider_registrations = "core"
}

# Sufijo aleatorio: el nombre del Storage Account debe ser unico en todo Azure
resource "random_string" "sufijo" {
  length  = 8
  upper   = false
  special = false
}

resource "azurerm_resource_group" "tfstate" {
  name     = "rg-asistencia-tfstate"
  location = "eastus"

  tags = {
    proyecto = "asistencia"
    uso      = "terraform-state"
  }
}

resource "azurerm_storage_account" "tfstate" {
  name                            = "sttfstate${random_string.sufijo.result}"
  resource_group_name             = azurerm_resource_group.tfstate.name
  location                        = azurerm_resource_group.tfstate.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false

  # Versionado: guarda cada version del state (permite volver atras)
  blob_properties {
    versioning_enabled = true
  }

  tags = azurerm_resource_group.tfstate.tags
}

resource "azurerm_storage_container" "tfstate" {
  name                  = "tfstate"
  storage_account_id    = azurerm_storage_account.tfstate.id
  container_access_type = "private"
}

# Copia estos valores en v3/azure-frontend/backend.tf
output "resource_group_name" {
  value = azurerm_resource_group.tfstate.name
}

output "storage_account_name" {
  value = azurerm_storage_account.tfstate.name
}

output "container_name" {
  value = azurerm_storage_container.tfstate.name
}