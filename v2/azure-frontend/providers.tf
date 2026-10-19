# Usa la sesion de "az login" (no se ponen llaves aqui)
provider "azurerm" {
  features {}
  subscription_id                 = var.subscription_id
  resource_provider_registrations = "core"
}