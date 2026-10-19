locals {
  tags = {
    proyecto = var.proyecto
    ambiente = var.ambiente
  }
}

resource "azurerm_resource_group" "rg" {
  name     = "rg-${var.proyecto}-${var.ambiente}-frontend"
  location = var.location
  tags     = local.tags
}