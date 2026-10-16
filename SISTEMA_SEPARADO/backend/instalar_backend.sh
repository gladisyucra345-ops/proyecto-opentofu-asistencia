#!/bin/bash
# =============================================================
#  Instalador del BACKEND (AWS EC2 - Ubuntu)
#  Instala: Apache + PHP + PostgreSQL, crea la base de datos
#  y publica la API en  http://IP_BACKEND/api.php
#
#  Uso (dentro de la carpeta backend, en el servidor):
#     sudo bash instalar_backend.sh  CLAVE_BD  API_KEY
# =============================================================
set -e

DB_PASSWORD="$1"
API_KEY="$2"
if [ -z "$DB_PASSWORD" ] || [ -z "$API_KEY" ]; then
  echo "Uso: sudo bash instalar_backend.sh CLAVE_BD API_KEY"
  exit 1
fi
CARPETA="$(cd "$(dirname "$0")" && pwd)"

echo "==> 1/5 Instalando paquetes..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
# Nginx (pagina de prueba) ocupa el puerto 80: se quita
systemctl disable --now nginx 2>/dev/null || true
apt-get install -y apache2 php libapache2-mod-php php-pgsql php-mbstring postgresql

echo "==> 2/5 Creando base de datos..."
systemctl enable --now postgresql
sudo -u postgres psql -v ON_ERROR_STOP=0 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'asistencia_local') THEN
    CREATE ROLE asistencia_local LOGIN PASSWORD '${DB_PASSWORD}';
  ELSE
    ALTER ROLE asistencia_local PASSWORD '${DB_PASSWORD}';
  END IF;
END \$\$;
SQL
if ! sudo -u postgres psql -lqt | cut -d'|' -f1 | grep -qw asistenciau; then
  sudo -u postgres createdb -O asistencia_local asistenciau
  echo "    Cargando tablas y datos iniciales..."
  PGPASSWORD="$DB_PASSWORD" psql -h localhost -U asistencia_local -d asistenciau \
    -q -f "$CARPETA/bd_asistencia.sql" 2>&1 | grep -v "already exists" || true
else
  echo "    La base asistenciau ya existe: no se modifica."
fi

echo "==> 3/5 Copiando el codigo del backend..."
rm -f /var/www/html/index.html /var/www/html/index.nginx-debian.html
cp -r "$CARPETA/api.php" "$CARPETA/capa_negocio" "$CARPETA/capa_datos" /var/www/html/
chown -R www-data:www-data /var/www/html

echo "==> 4/5 Configurando variables (clave BD y API_KEY)..."
cat > /etc/apache2/conf-available/asistencia.conf <<CONF
SetEnv DB_HOST localhost
SetEnv DB_NAME asistenciau
SetEnv DB_USER asistencia_local
SetEnv DB_PASSWORD ${DB_PASSWORD}
SetEnv API_KEY ${API_KEY}
CONF
chmod 640 /etc/apache2/conf-available/asistencia.conf
a2enconf asistencia >/dev/null

echo "==> 5/5 Reiniciando Apache..."
systemctl enable apache2
systemctl restart apache2

echo ""
echo "LISTO. Prueba en el navegador:  http://$(curl -s --max-time 3 http://checkip.amazonaws.com || echo IP_BACKEND)/api.php"
echo "Debe mostrar: {\"ok\":true,\"servicio\":\"backend-control-asistencia\"}"
