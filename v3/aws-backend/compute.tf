# Servidor Backend
resource "aws_instance" "backend" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.backend.key_name
  vpc_security_group_ids = [aws_security_group.backend_sg.id]

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }

  tags = merge(local.tags, {
    Name = "${var.proyecto}-${var.ambiente}-backend"
  })
}