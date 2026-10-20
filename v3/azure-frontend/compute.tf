resource "azurerm_linux_virtual_machine" "vm" {
  name                  = "vm-${var.proyecto}-${var.ambiente}-frontend"
  location              = azurerm_resource_group.rg.location
  resource_group_name   = azurerm_resource_group.rg.name
  size                  = var.vm_size
  admin_username        = "azureuser"
  network_interface_ids = [azurerm_network_interface.nic.id]
  tags                  = local.tags

  admin_ssh_key {
    username   = "azureuser"
    public_key = file(pathexpand(var.llave_publica))
  }

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "ubuntu-24_04-lts"
    sku       = "server"
    version   = "latest"
  }
}