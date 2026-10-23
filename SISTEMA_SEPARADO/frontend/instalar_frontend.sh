#!/bin/bash
# =============================================================
#  Instalador del FRONTEND v2 (Azure VM - Ubuntu)
#  Nginx sirve el frontend estatico (HTML + CSS + JS, sin PHP)
#  y reenvia /api/ al backend en AWS (proxy inverso) + HTTPS.
#
#  Uso (dentro de la carpeta frontend, en el servidor):
#     sudo bash instalar_frontend.sh  IP_BACKEND  API_KEY  IP_PUBLICA_AZURE
# =============================================================
set -e

IP_BACKEND="$1"
API_KEY="$2"
IP_PUBLICA="$3"
if [ -z "$IP_BACKEND" ] || [ -z "$API_KEY" ] || [ -z "$IP_PUBLICA" ]; then
  echo "Uso: sudo bash instalar_frontend.sh IP_BACKEND API_KEY IP_PUBLICA_AZURE"
  exit 1
fi
CARPETA="$(cd "$(dirname "$0")" && pwd)"
DOMINIO="$(echo "$IP_PUBLICA" | tr '.' '-').sslip.io"
DOMINIO_BACK="$(echo "$IP_BACKEND" | tr '.' '-').sslip.io"
DESTINO=/var/www/asistencia

echo "==> 1/5 Instalando paquetes..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
# La version anterior (v1) usaba Apache + PHP: se apaga
systemctl disable --now apache2 2>/dev/null || true
apt-get install -y nginx certbot python3-certbot-nginx curl

echo "==> 2/5 Copiando el frontend estatico..."
rm -rf "$DESTINO"
mkdir -p "$DESTINO"
cp -r "$CARPETA/index.html" "$CARPETA/config" "$CARPETA/js" "$CARPETA/styles" "$DESTINO/"
chown -R www-data:www-data "$DESTINO"

echo "==> 3/5 Detectando como responde el backend..."
if curl -fsS --max-time 8 -H "X-API-KEY: ${API_KEY}" "https://${DOMINIO_BACK}/api/health" >/dev/null 2>&1; then
  BACKEND_URL="https://${DOMINIO_BACK}"
  BACKEND_HOST="${DOMINIO_BACK}"
  echo "    Backend por HTTPS: ${BACKEND_URL}"
elif curl -fsS --max-time 8 -H "X-API-KEY: ${API_KEY}" "http://${IP_BACKEND}/api/health" >/dev/null 2>&1; then
  BACKEND_URL="http://${IP_BACKEND}"
  BACKEND_HOST="${IP_BACKEND}"
  echo "    (!) Backend solo por HTTP: ${BACKEND_URL}"
else
  echo "ERROR: el backend no responde o la API_KEY no coincide."
  echo "       Prueba: curl -H 'X-API-KEY: ${API_KEY}' http://${IP_BACKEND}/api/health"
  exit 1
fi

echo "==> 4/5 Configurando Nginx (estatico + proxy /api)..."
cat > /etc/nginx/sites-available/asistencia <<CONF
server {
    listen 80;
    server_name ${DOMINIO} ${IP_PUBLICA} _;
    root ${DESTINO};
    index index.html;

    # Cabeceras de seguridad
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy same-origin always;

    # Proxy inverso: el navegador llama a /api y Nginx lo reenvia a AWS
    location /api/ {
        proxy_pass ${BACKEND_URL}/api/;
        proxy_set_header Host ${BACKEND_HOST};
        proxy_set_header X-API-KEY "${API_KEY}";
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_ssl_server_name on;
        proxy_ssl_name ${BACKEND_HOST};
        proxy_ssl_verify on;
        proxy_ssl_verify_depth 3;
        proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
CONF
chmod 600 /etc/nginx/sites-available/asistencia
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/asistencia /etc/nginx/sites-enabled/asistencia
nginx -t
systemctl enable nginx
systemctl restart nginx

echo "==> 5/5 HTTPS con Let's Encrypt para ${DOMINIO}..."
if certbot --nginx -d "$DOMINIO" --non-interactive --agree-tos \
           --register-unsafely-without-email --redirect; then
  URL="https://${DOMINIO}"
  echo "    HTTPS activo."
else
  URL="http://${IP_PUBLICA}"
  echo "    (!) No se pudo obtener el certificado. El frontend queda por HTTP."
fi
systemctl reload nginx

echo ""
echo "Probando el camino completo (navegador -> Azure -> AWS)..."
sleep 1
curl -s "${URL}/api/health" || true
echo ""
echo ""
echo "LISTO. Abre en el navegador:  ${URL}"
