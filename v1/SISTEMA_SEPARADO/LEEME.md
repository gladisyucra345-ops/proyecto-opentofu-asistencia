# Sistema de Control de Asistencia: Frontend y Backend separados

## Arquitectura

```
Usuario (navegador)
      |
      v
FRONTEND - Azure VM (Apache + PHP)          BACKEND - AWS EC2 (Apache + PHP + PostgreSQL)
  index.php, style.css                        api.php   <- recibe peticiones JSON
  capa_presentacion/  (pantallas)   --HTTP-->  capa_negocio/  (reglas: estrategias, reportes)
  cliente_api/  (puente a la API)   <-JSON--   capa_datos/    (consultas SQL)
                                               PostgreSQL: base "asistenciau"
```

- El **frontend** solo muestra las pantallas. La carpeta `cliente_api/` es el puente: cada
  llamada (por ejemplo `$nEstudiante->getAll()`) se envía al backend por HTTP. **La capa de
  negocio solo existe en el backend.**
- El **backend** ejecuta la lógica de negocio y la base de datos, y responde en JSON.
- La comunicación está protegida con una clave compartida (**API_KEY**) que va en la
  cabecera `X-API-KEY`. Sin la clave, el backend responde "No autorizado".

## Cambios respecto al sistema original

| Archivo | Cambio |
|---|---|
| `backend/api.php` | **Nuevo.** API que ejecuta la capa de negocio y responde en JSON |
| `backend/capa_datos/DatabaseHelper.php` | Lee host, usuario y clave de variables de entorno |
| `backend/capa_datos/DClase.php` | `getClaseDetalle` devuelve `profesor_usuario_id` (corrige un error previo: los profesores no podían abrir sus propias clases) |
| `frontend/cliente_api/` | **Nueva.** Reemplaza a `capa_negocio` en el frontend: `ApiCliente.php` envía cada llamada a la API |
| `frontend/capa_presentacion/*.php`, `index.php` | Los `require_once` apuntan a `cliente_api/` en lugar de `capa_negocio/` |
| `frontend/capa_presentacion/PEstudiante.php`, `PProfesor.php` | Quitado `fetchAll()`, porque los datos ya llegan como lista |
| `frontend/capa_presentacion/PAsistencia.php` | Quitados 2 `require` de adaptadores que no se usaban (ahora viven en el backend) |
| `frontend/index.php` | Usa `profesor_usuario_id` para validar que la clase sea del profesor |

## Despliegue

Antes de empezar, define dos claves y anótalas:
- **CLAVE_BD**: la contraseña de la base de datos (ejemplo: `Asist2026db`).
- **API_KEY**: la clave compartida entre los servidores. Puedes generarla con `openssl rand -hex 16`.

> Después de `tofu apply`, espera unos **3 minutos** antes de instalar, porque el servidor
> todavía está terminando su configuración inicial.

### 1. Backend en AWS
Desde tu laptop, en la carpeta donde descomprimiste este zip:
```bash
scp -i ~/.ssh/aws-backend -r backend ubuntu@IP_AWS:~
ssh -i ~/.ssh/aws-backend ubuntu@IP_AWS
sudo bash backend/instalar_backend.sh CLAVE_BD API_KEY
exit
```
Para probarlo, abre `http://IP_AWS/api.php`. Debe mostrar `{"ok":true,"servicio":"backend-control-asistencia"}`.

### 2. Frontend en Azure
```bash
scp -i ~/.ssh/azure-frontend -r frontend azureuser@IP_AZURE:~
ssh -i ~/.ssh/azure-frontend azureuser@IP_AZURE
sudo bash frontend/instalar_frontend.sh IP_AWS API_KEY
exit
```
Para probarlo, abre `http://IP_AZURE`. Debe aparecer el login.

### Usuarios de prueba (vienen en bd_asistencia.sql)
| Usuario | Contraseña | Rol |
|---|---|---|
| admin | admin123 | Administrador |
| profesor1 | prof123 | Profesor |
| estudiante1 | estu123 | Estudiante |

## Si cambia una IP
Si destruyes y vuelves a crear el backend, su IP cambia. En ese caso, vuelve a ejecutar
en Azure: `sudo bash frontend/instalar_frontend.sh NUEVA_IP_AWS API_KEY`.
