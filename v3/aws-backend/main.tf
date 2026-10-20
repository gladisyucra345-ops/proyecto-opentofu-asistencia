locals {
  tags = {
    Proyecto = var.proyecto
    Ambiente = var.ambiente
  }
}

# Imagen Ubuntu 24.04 oficial de Canonical
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
}

# Llave SSH para entrar al servidor
resource "aws_key_pair" "backend" {
  key_name   = "${var.proyecto}-${var.ambiente}-backend-key"
  public_key = file(pathexpand(var.llave_publica))
}