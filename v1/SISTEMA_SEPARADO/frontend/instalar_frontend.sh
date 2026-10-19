#!/bin/bash
# =============================================================
#  Instalador del FRONTEND (Azure VM - Ubuntu)
#  Instala: Apache + PHP y publica el sistema en  http://IP_FRONTEND
#
#  Uso (dentro de la carpeta frontend, en el servidor):
#     sudo bash instalar_frontend.sh  IP_BACKEND  API_KEY
# =============================================================
set -e

IP_BACKEND="$1"
API_KEY="$2"
if [ -z "$IP_BACKEND" ] || [ -z "$API_KEY" ]; then
  echo "Uso: sudo bash instalar_frontend.sh IP_BACKEND API_KEY"
  exit 1
fi
CARPETA="$(cd "$(dirname "$0")" && pwd)"

echo "==> 1/4 Instalando paquetes..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
# Nginx (pagina de prueba) ocupa el puerto 80: se quita
systemctl disable --now nginx 2>/dev/null || true
apt-get install -y apache2 php libapache2-mod-php php-curl php-mbstring

echo "==> 2/4 Copiando el codigo del frontend..."
rm -f /var/www/html/index.html /var/www/html/index.nginx-debian.html
# En la version anterior el puente se llamaba capa_negocio: se borra
rm -rf /var/www/html/capa_negocio
cp -r "$CARPETA/index.php" "$CARPETA/logout.php" "$CARPETA/style.css" \
      "$CARPETA/capa_presentacion" "$CARPETA/cliente_api" /var/www/html/
chown -R www-data:www-data /var/www/html

echo "==> 3/4 Configurando conexion con el backend..."
cat > /etc/apache2/conf-available/asistencia.conf <<CONF
SetEnv BACKEND_URL http://${IP_BACKEND}/api.php
SetEnv API_KEY ${API_KEY}
CONF
chmod 640 /etc/apache2/conf-available/asistencia.conf
a2enconf asistencia >/dev/null

echo "==> 4/4 Reiniciando Apache..."
systemctl enable apache2
systemctl restart apache2

echo ""
echo "Probando conexion con el backend..."
curl -s --max-time 5 "http://${IP_BACKEND}/api.php" || echo "  (!) No responde el backend en http://${IP_BACKEND}/api.php"
echo ""
echo "LISTO. Abre en el navegador:  http://IP_DE_ESTE_SERVIDOR"
