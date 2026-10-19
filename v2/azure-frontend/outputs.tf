output "resource_group" {
  value = azurerm_resource_group.rg.name
}

output "ip_publica" {
  value = azurerm_public_ip.ip.ip_address
}

output "url_frontend" {
  value = "http://${azurerm_public_ip.ip.ip_address}"
}

output "comando_ssh" {
  value = "ssh -i ~/.ssh/azure-frontend azureuser@${azurerm_public_ip.ip.ip_address}"
}