#!/bin/bash
# =============================================================
#  Instalador del BACKEND v2 (AWS EC2 - Ubuntu)
#  Apache + PHP + PostgreSQL + API REST + HTTPS (Let's Encrypt)
#
#  Uso (dentro de la carpeta backend, en el servidor):
#     sudo bash instalar_backend.sh  CLAVE_BD  API_KEY  IP_PUBLICA_AWS
#
#  HTTPS: usa el dominio gratuito  <ip-con-guiones>.sslip.io
#  (si el certificado falla, queda funcionando por HTTP y lo avisa)
# =============================================================
set -e

DB_PASSWORD="$1"
API_KEY="$2"
IP_PUBLICA="$3"
if [ -z "$DB_PASSWORD" ] || [ -z "$API_KEY" ] || [ -z "$IP_PUBLICA" ]; then
  echo "Uso: sudo bash instalar_backend.sh CLAVE_BD API_KEY IP_PUBLICA_AWS"
  exit 1
fi
CARPETA="$(cd "$(dirname "$0")" && pwd)"
DOMINIO="$(echo "$IP_PUBLICA" | tr '.' '-').sslip.io"
DESTINO=/opt/asistencia

echo "==> 1/6 Instalando paquetes..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
systemctl disable --now nginx 2>/dev/null || true
apt-get install -y apache2 php libapache2-mod-php php-pgsql php-mbstring postgresql \
                   certbot python3-certbot-apache

echo "==> 2/6 Base de datos..."
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
  PGOPTIONS="-c client_min_messages=warning" PGPASSWORD="$DB_PASSWORD" psql -h localhost -U asistencia_local -d asistenciau \
    -q -f "$CARPETA/bd_asistencia.sql" 2>&1 | grep -v "already exists" || true
else
  echo "    La base asistenciau ya existe: no se borra ningun dato."
fi
echo "    Aplicando migraciones (sin borrar datos)..."
for m in migracion_cu8_finalizar.sql migracion_hora_asistencia.sql; do
  PGOPTIONS="-c client_min_messages=warning" PGPASSWORD="$DB_PASSWORD" psql -h localhost -U asistencia_local -d asistenciau \
    -q -f "$CARPETA/$m"
done

echo "==> 3/6 Copiando el codigo (fuera de la carpeta publica)..."
rm -rf "$DESTINO"
mkdir -p "$DESTINO"
cp -r "$CARPETA/api" "$CARPETA/capa_negocio" "$CARPETA/capa_datos" "$DESTINO/"
chown -R root:www-data "$DESTINO"
chmod -R u=rwX,g=rX,o= "$DESTINO"
# Limpiar la version anterior (v1) y la pagina de prueba
rm -rf /var/www/html/*

echo "==> 4/6 Configurando Apache (rutas /api/...)..."
cat > /etc/apache2/conf-available/asistencia-env.conf <<CONF
SetEnv DB_HOST localhost
SetEnv DB_NAME asistenciau
SetEnv DB_USER asistencia_local
SetEnv DB_PASSWORD ${DB_PASSWORD}
SetEnv API_KEY ${API_KEY}
SetEnv APP_TIMEZONE America/La_Paz
CONF
chmod 640 /etc/apache2/conf-available/asistencia-env.conf
a2disconf asistencia >/dev/null 2>&1 || true
rm -f /etc/apache2/conf-available/asistencia.conf
a2enconf asistencia-env >/dev/null

cat > /etc/apache2/sites-available/asistencia.conf <<CONF
<VirtualHost *:80>
    ServerName ${DOMINIO}
    ServerAlias ${IP_PUBLICA}
    DocumentRoot /var/www/html
    ErrorLog \${APACHE_LOG_DIR}/error.log
    CustomLog \${APACHE_LOG_DIR}/access.log combined

    Alias /api ${DESTINO}/api
    <Directory ${DESTINO}/api>
        Require all granted
        DirectoryIndex index.php
        FallbackResource /api/index.php
    </Directory>
    # Las capas de negocio y datos NO son accesibles desde la web
</VirtualHost>
CONF
a2dissite 000-default >/dev/null 2>&1 || true
a2ensite asistencia >/dev/null
systemctl enable apache2
systemctl restart apache2

echo "==> 5/6 HTTPS con Let's Encrypt para ${DOMINIO}..."
if certbot --apache -d "$DOMINIO" --non-interactive --agree-tos \
           --register-unsafely-without-email --redirect; then
  URL="https://${DOMINIO}"
  echo "    HTTPS activo."
else
  URL="http://${IP_PUBLICA}"
  echo "    (!) No se pudo obtener el certificado. El backend queda por HTTP."
fi
systemctl reload apache2

echo "==> 6/6 Probando la API..."
sleep 1
curl -s -H "X-API-KEY: ${API_KEY}" "${URL}/api/health" || true
echo ""
echo ""
echo "LISTO. Backend: ${URL}/api"
echo "Sin la API_KEY responde 'No autorizado' (prueba: curl ${URL}/api/health)"
