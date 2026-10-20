# El state de este proyecto se guarda en Azure Blob (creado en v3/bootstrap/azure)
# Ojo: dentro de un bloque backend NO se pueden usar variables.
terraform {
  backend "azurerm" {
    resource_group_name  = "rg-asistencia-tfstate"
    storage_account_name = "sttfstateprw11mmg"
    container_name       = "tfstate"
    key                  = "asistencia/dev/azure-frontend.tfstate"
  }
}
