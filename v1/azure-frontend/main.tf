terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

# Usa la sesion de "az login" (no se ponen llaves aqui)
provider "azurerm" {
  features {}
  subscription_id = "a86ab939-846e-4acb-b2aa-5dc6003c9a8a"
}

# Grupo de recursos
resource "azurerm_resource_group" "rg" {
  name     = "rg-frontend-asistencia"
  location = "westus2"
}

# Red virtual y subred
resource "azurerm_virtual_network" "vnet" {
  name                = "vnet-frontend"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
}

resource "azurerm_subnet" "subnet" {
  name                 = "snet-frontend"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.0.1.0/24"]
}

# IP publica
resource "azurerm_public_ip" "ip" {
  name                = "pip-frontend"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  allocation_method   = "Static"
  sku                 = "Standard"
}

# Firewall: SSH (22) y Web (80, 443)
resource "azurerm_network_security_group" "nsg" {
  name                = "nsg-frontend"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name

  security_rule {
    name                       = "permitir-ssh"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "permitir-http"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "80"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "permitir-https"
    priority                   = 120
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}

# Tarjeta de red
resource "azurerm_network_interface" "nic" {
  name                = "nic-frontend"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name

  ip_configuration {
    name                          = "interna"
    subnet_id                     = azurerm_subnet.subnet.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.ip.id
  }
}

resource "azurerm_network_interface_security_group_association" "nic_nsg" {
  network_interface_id      = azurerm_network_interface.nic.id
  network_security_group_id = azurerm_network_security_group.nsg.id
}

# Servidor Frontend (Ubuntu 24.04)
resource "azurerm_linux_virtual_machine" "vm" {
  name                  = "vm-frontend"
  location              = azurerm_resource_group.rg.location
  resource_group_name   = azurerm_resource_group.rg.name
  size                  = "Standard_B2s_v2"
  admin_username        = "azureuser"
  network_interface_ids = [azurerm_network_interface.nic.id]

  admin_ssh_key {
    username   = "azureuser"
    public_key = file(pathexpand("~/.ssh/azure-frontend.pub"))
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

  # App de prueba: Nginx con una pagina simple
  custom_data = base64encode(<<-EOF
    #!/bin/bash
    apt-get update -y
    apt-get install -y nginx
    echo "<h1>Frontend OK - Azure</h1>" > /var/www/html/index.html
    systemctl enable --now nginx
  EOF
  )

  tags = {
    proyecto = "control-asistencia"
  }
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
