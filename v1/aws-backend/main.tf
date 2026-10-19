terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

# Usa las credenciales de "aws configure" (no se ponen llaves aqui)
provider "aws" {
  region = "us-east-1"
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
  key_name   = "aws-backend-key"
  public_key = file(pathexpand("~/.ssh/aws-backend.pub"))
}

# Firewall: SSH (22) y Web (80, 443)
resource "aws_security_group" "backend_sg" {
  name        = "backend-sg"
  description = "Permite SSH y HTTP al backend"

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Salida a Internet"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Proyecto = "control-asistencia"
  }
}

# Servidor Backend
resource "aws_instance" "backend" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = "t3.micro"
  key_name               = aws_key_pair.backend.key_name
  vpc_security_group_ids = [aws_security_group.backend_sg.id]

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }

  # App de prueba: Nginx con una pagina simple
  user_data = <<-EOF
    #!/bin/bash
    apt-get update -y
    apt-get install -y nginx
    echo "<h1>Backend OK - AWS</h1>" > /var/www/html/index.html
    systemctl enable --now nginx
  EOF

  tags = {
    Name     = "backend-control-asistencia"
    Proyecto = "control-asistencia"
  }
}

output "ip_publica" {
  value = aws_instance.backend.public_ip
}

output "url_backend" {
  value = "http://${aws_instance.backend.public_ip}"
}

output "comando_ssh" {
  value = "ssh -i ~/.ssh/aws-backend ubuntu@${aws_instance.backend.public_ip}"
}
