# AsistencIAU v2: Frontend en Azure + Backend en AWS con OpenTofu

## Arquitectura

```
Navegador
   │  HTTPS  (https://<ip-azure>.sslip.io)
   ▼
FRONTEND · Azure VM · Nginx
   ├─ Sirve index.html + css + js   (100 % HTML/JavaScript, sin PHP)
   └─ /api/*  ──proxy inverso──►  HTTPS + X-API-KEY
                                      ▼
                        BACKEND · AWS EC2 · Apache + PHP
                           ├─ API REST  /api/...
                           ├─ capa_negocio  (reglas, estrategias, reportes)
                           ├─ capa_datos    (SQL)
                           └─ PostgreSQL
```

| Mejora | Cómo |
|---|---|
| Frontend 100 % HTML + JS | Nginx sirve archivos estáticos; no hay PHP en Azure |
| API REST | Rutas como `/api/groups`, `/api/classes`, `/api/attendance/classes/{id}` |
| Inicio de sesión y roles | Sesión con cookie `HttpOnly` y `Secure`; cada ruta valida admin, profesor o estudiante |
| Propiedad | Un profesor solo ve y modifica **sus** grupos y clases |
| Sin contraseñas en respuestas | La API las quita antes de responder |
| HTTPS | Certificados gratuitos de Let's Encrypt con dominios `<ip>.sslip.io` |
| Backend no expuesto | Solo el proxy de Azure tiene la `API_KEY`; sin ella la API responde 401 |
| Errores siempre en JSON | Se eliminaron los mensajes de depuración que rompían las respuestas |

### Rutas de la API

| Método | Ruta | Quién |
|---|---|---|
| POST | `/api/auth/login` · `/api/auth/logout` | Todos |
| GET | `/api/auth/me` | Con sesión |
| GET, POST, PATCH, DELETE | `/api/users` · `/api/teachers` · `/api/students` | Admin |
| GET | `/api/subjects` (escritura: admin) | Admin, profesor |
| GET | `/api/groups` (escritura: admin) | Admin; profesor solo los suyos |
| GET, POST, PATCH, DELETE | `/api/classes` | Admin; profesor solo las suyas |
| GET, POST | `/api/assignments` | Admin |
| GET, POST | `/api/attendance/classes/{id}` | Admin; profesor dueño |
| POST | `/api/attendance/classes/{id}/finish` | Admin; profesor dueño |
| GET | `/api/attendance/classes/{id}/report?format=pdf\|excel` | Admin; profesor dueño |
| GET · POST | `/api/students/dashboard` · `/api/students/attendance` | Estudiante |

---

## Paso 1. Herramientas (una sola vez, en Ubuntu)

```bash
sudo apt update && sudo apt install -y git unzip curl
sudo snap install --classic opentofu
sudo snap install aws-cli --classic
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
```

## Paso 2. Cuentas

```bash
aws configure                     # llaves del usuario IAM, región us-east-1, salida json
az login
export TF_VAR_subscription_id=$(az account show --query id -o tsv)   # repetir en cada terminal nueva
```

## Paso 3. Llaves SSH (Enter en todas las preguntas, solo la primera vez)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/aws-backend
ssh-keygen -t ed25519 -f ~/.ssh/azure-frontend
```

## Paso 4. Crear los servidores con OpenTofu

```bash
cd ~/proyecto-infra/aws-backend && tofu init && tofu apply -auto-approve
IP_AWS=$(tofu output -raw ip_publica)
cd ~/proyecto-infra/azure-frontend && tofu init && tofu apply -auto-approve
IP_AZURE=$(tofu output -raw ip_publica)
echo "AWS=$IP_AWS  AZURE=$IP_AZURE"
```
Espera **3 minutos** antes de instalar.

## Paso 5. Claves de la aplicación

```bash
API_KEY=$(openssl rand -hex 16); echo $API_KEY
CLAVE_BD=MiClaveBD2026
```
Guárdalas. La misma `API_KEY` va en el backend y en el frontend.

## Paso 6. Instalar el backend (AWS)

```bash
cd ~/proyecto-infra/SISTEMA_SEPARADO
scp -i ~/.ssh/aws-backend -r backend ubuntu@$IP_AWS:~
ssh -i ~/.ssh/aws-backend ubuntu@$IP_AWS "sudo bash backend/instalar_backend.sh $CLAVE_BD $API_KEY $IP_AWS"
```
Debe terminar con `{"ok":true,...}`, `HTTPS activo` y **LISTO**.

## Paso 7. Instalar el frontend (Azure)

```bash
scp -i ~/.ssh/azure-frontend -r frontend azureuser@$IP_AZURE:~
ssh -i ~/.ssh/azure-frontend azureuser@$IP_AZURE "sudo bash frontend/instalar_frontend.sh $IP_AWS $API_KEY $IP_AZURE"
```
Debe mostrar `Backend por HTTPS`, `HTTPS activo` y la dirección final.

## Paso 8. Usar el sistema

Abre la dirección que mostró el paso 7: `https://<ip-azure-con-guiones>.sslip.io`
(por ejemplo, `https://20-3-100-78.sslip.io`).

| Usuario | Contraseña | Rol |
|---|---|---|
| admin | admin123 | Administrador |
| profesor1 | prof123 | Profesor |
| estudiante1 | estu123 | Estudiante |

---

## Pruebas para demostrar

| Qué demuestra | Comando o acción | Resultado esperado |
|---|---|---|
| Infraestructura como código | `tofu state list` en cada carpeta | AWS: 3 recursos · Azure: 8 |
| Frontend sin PHP | `ssh -i ~/.ssh/azure-frontend azureuser@$IP_AZURE "ls /var/www/asistencia; which php \|\| echo sin PHP"` | `config index.html js styles` y `sin PHP` |
| Backend con las capas | `ssh -i ~/.ssh/aws-backend ubuntu@$IP_AWS "ls /opt/asistencia"` | `api capa_datos capa_negocio` |
| HTTPS | Candado en el navegador; `curl -I https://$(echo $IP_AZURE \| tr . -).sslip.io` | `HTTP/1.1 200` |
| API REST en vivo | `ssh -i ~/.ssh/aws-backend ubuntu@$IP_AWS "sudo tail -f /var/log/apache2/access.log"` y navegar | Líneas `IP_AZURE "GET /api/classes ..." 200` |
| Backend protegido | `curl -s https://$(echo $IP_AWS \| tr . -).sslip.io/api/health` | `{"message":"No autorizado."}` |
| Roles | Navegador: F12 → Consola, con sesión de estudiante: `fetch('/api/users').then(r=>r.json()).then(console.log)` | `No tiene permisos para esta operación.` |
| Sin contraseñas | Sesión admin, F12 → Red → `users` | Ningún campo `contrasena` |
| Frontend depende del backend | `ssh -i ~/.ssh/aws-backend ubuntu@$IP_AWS "sudo systemctl stop apache2"` → recargar → `start` | Error de conexión y luego vuelve |

## Si algo falla

| Síntoma | Solución |
|---|---|
| `Could not get lock` | El servidor aún arranca: espera 2 minutos y repite |
| `No se pudo obtener el certificado` | Funciona por HTTP. Revisa que los puertos 80 y 443 estén abiertos y vuelve a ejecutar el instalador |
| Instalador del frontend: `el backend no responde o la API_KEY no coincide` | Usa la misma `API_KEY` del paso 6 |
| Ver errores de la API | `ssh -i ~/.ssh/aws-backend ubuntu@$IP_AWS "sudo tail -20 /var/log/apache2/error.log"` |
| Azure `AllocationFailed` / `SkuNotAvailable` | Borra la VM fallida (`az vm delete -g rg-frontend-asistencia -n vm-frontend --yes`) y cambia `size` en `azure-frontend/main.tf` |
| `No value for required variable subscription_id` | Falta el `export TF_VAR_subscription_id=...` del paso 2 |

## Al terminar

```bash
cd ~/proyecto-infra/aws-backend && tofu destroy -auto-approve
cd ~/proyecto-infra/azure-frontend && tofu destroy -auto-approve
```
