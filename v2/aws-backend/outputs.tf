output "ip_publica" {
  value = aws_instance.backend.public_ip
}

output "url_backend" {
  value = "http://${aws_instance.backend.public_ip}"
}

output "comando_ssh" {
  value = "ssh -i ~/.ssh/aws-backend ubuntu@${aws_instance.backend.public_ip}"
}
