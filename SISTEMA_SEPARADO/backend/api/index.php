<?php
/**
 * API REST del BACKEND (AWS) - AsistencIAU
 * -----------------------------------------
 * Rutas:  /api/auth/*, /api/users, /api/teachers, /api/students, /api/subjects,
 *         /api/groups, /api/classes, /api/assignments, /api/attendance/classes/{id}/...
 *
 * Seguridad en capas:
 *   1. X-API-KEY: solo el servidor frontend (proxy en Azure) conoce la clave.
 *   2. Sesion: el usuario inicia sesion; la cookie es HttpOnly y Secure (HTTPS).
 *   3. Roles: cada ruta valida admin / profesor / estudiante.
 *   4. Propiedad: un profesor solo accede a SUS grupos y SUS clases.
 *   5. Las respuestas nunca incluyen contrasenas.
 */
declare(strict_types=1);

// Cualquier salida accidental (avisos, depuracion) se descarta para no romper el JSON
ob_start();

date_default_timezone_set(getenv('APP_TIMEZONE') ?: 'America/La_Paz');

function jsonResponse($data, int $status = 200): never {
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function fail(string $message, int $status = 400): never {
    jsonResponse(['message' => $message], $status);
}

// 1. Clave compartida con el proxy del frontend
$apiKey = getenv('API_KEY') ?: '';
if ($apiKey === '' || !hash_equals($apiKey, (string)($_SERVER['HTTP_X_API_KEY'] ?? ''))) {
    fail('No autorizado.', 401);
}

// 2. Sesion. "Secure" cuando el navegador usa HTTPS (lo informa el proxy)
$httpsNavegador = strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
session_name(getenv('SESSION_NAME') ?: 'asistenciau_session');
session_set_cookie_params([
    'path' => '/',
    'httponly' => true,
    'secure' => $httpsNavegador,
    'samesite' => 'Lax',
]);
session_start();

require_once __DIR__ . '/../capa_negocio/NUsuario.php';
require_once __DIR__ . '/../capa_negocio/NGrupo.php';
require_once __DIR__ . '/../capa_negocio/NMateria.php';
require_once __DIR__ . '/../capa_negocio/NEstudiante.php';
require_once __DIR__ . '/../capa_negocio/NProfesor.php';
require_once __DIR__ . '/../capa_negocio/NClase.php';
require_once __DIR__ . '/../capa_negocio/NaGrupo.php';
require_once __DIR__ . '/../capa_negocio/NAsistencia.php';

function body(): array {
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') return [];
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) fail('El cuerpo debe ser JSON.', 400);
    return $decoded;
}

function currentUser(): ?array {
    return isset($_SESSION['user']) && is_array($_SESSION['user']) ? $_SESSION['user'] : null;
}

function requireAuth(): array {
    $user = currentUser();
    if ($user === null) fail('Autenticación requerida.', 401);
    return $user;
}

function requireRole(array $roles): array {
    $user = requireAuth();
    if (!in_array(strtolower((string)($user['tipo_usuario'] ?? '')), $roles, true)) {
        fail('No tiene permisos para esta operación.', 403);
    }
    return $user;
}

/** Quita la contrasena de cualquier registro antes de enviarlo */
function sinClave($row) {
    if (is_array($row)) unset($row['contrasena']);
    return $row;
}

function rows($result): array {
    if ($result instanceof PDOStatement) return $result->fetchAll(PDO::FETCH_ASSOC);
    return is_array($result) ? array_values($result) : [];
}

function idFrom(string $value): int {
    if (!ctype_digit($value) || (int)$value <= 0) fail('Identificador inválido.', 422);
    return (int)$value;
}

function normalizeGroup(array $row): array {
    $row['id'] = (int)($row['id_grupo'] ?? $row['id'] ?? 0);
    return $row;
}

function normalizeClass(array $row): array {
    return $row + [
        'id' => (int)($row['id_clase'] ?? 0),
        'nombre' => $row['grupo_nombre'] ?? '',
        'fecha' => $row['dia'] ?? '',
        'estado' => !empty($row['finalizada']) ? 'finalizada' : 'activa',
    ];
}

/** profesor_id (tabla profesor) del usuario conectado, o 0 */
function profesorIdDe(array $user): int {
    $prof = (new NProfesor())->getById((int)$user['id']);
    return (int)($prof['profesor_id'] ?? 0);
}

/** El profesor solo puede usar grupos suyos */
function exigirGrupoPropio(array $user, int $grupoId): void {
    if (strtolower((string)$user['tipo_usuario']) !== 'profesor') return;
    $grupo = (new NGrupo())->getById($grupoId);
    if (!$grupo || (int)($grupo['profesor_id'] ?? 0) !== profesorIdDe($user)) {
        fail('Solo puede usar sus propios grupos.', 403);
    }
}

/** Devuelve la clase y, si es profesor, verifica que sea suya */
function claseAutorizada(array $user, int $classId): array {
    $clase = (new NClase())->getClaseDetalle($classId);
    if (!$clase) fail('Clase no encontrada.', 404);
    if (strtolower((string)$user['tipo_usuario']) === 'profesor'
        && (int)($clase['profesor_usuario_id'] ?? 0) !== (int)$user['id']) {
        fail('Esta clase no pertenece a sus grupos.', 403);
    }
    return $clase;
}

try {
    $method = $_SERVER['REQUEST_METHOD'];
    $path = trim((string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/');
    $path = (string)preg_replace('#^api/?#', '', $path);
    $segments = $path === '' ? [] : explode('/', $path);

    // ---------- Autenticacion ----------
    if ($segments === ['health'] && $method === 'GET') {
        jsonResponse(['ok' => true, 'servicio' => 'backend-control-asistencia']);
    }
    if ($segments === ['auth', 'me'] && $method === 'GET') {
        $user = currentUser();
        if ($user === null) fail('No hay una sesión activa.', 401);
        jsonResponse(['user' => sinClave($user)]);
    }
    if ($segments === ['auth', 'login'] && $method === 'POST') {
        $input = body();
        $username = trim((string)($input['username'] ?? ''));
        $password = (string)($input['password'] ?? '');
        if ($username === '' || $password === '') fail('Usuario y contraseña son obligatorios.', 422);
        $user = (new NUsuario())->login($username, $password);
        if ($user === []) fail('Credenciales incorrectas.', 401);
        session_regenerate_id(true);
        $_SESSION['user'] = sinClave($user);
        jsonResponse(['user' => sinClave($user)]);
    }
    if ($segments === ['auth', 'logout'] && $method === 'POST') {
        $_SESSION = [];
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], (bool)$params['secure'], (bool)$params['httponly']);
        session_destroy();
        jsonResponse(['ok' => true]);
    }

    $user = requireAuth();
    $role = strtolower((string)$user['tipo_usuario']);

    // ---------- Grupos ----------
    if ($segments === ['groups'] && $method === 'GET') {
        requireRole(['admin', 'profesor']);
        $items = (new NGrupo())->getAll();
        if ($role === 'profesor') {
            $profId = profesorIdDe($user);
            $items = array_values(array_filter($items, fn($g) => (int)($g['profesor_id'] ?? 0) === $profId));
        }
        jsonResponse(['data' => array_map('normalizeGroup', $items)]);
    }
    if ($segments === ['groups'] && $method === 'POST') {
        requireRole(['admin']);
        if (!(new NGrupo())->create(body())) fail('No se pudo crear el grupo.', 422);
        jsonResponse(['ok' => true], 201);
    }
    if (($segments[0] ?? '') === 'groups' && count($segments) === 2) {
        $id = idFrom($segments[1]);
        $service = new NGrupo();
        if ($method === 'GET') {
            requireRole(['admin', 'profesor']);
            exigirGrupoPropio($user, $id);
            $group = $service->getById($id);
            if (!$group) fail('Grupo no encontrado.', 404);
            jsonResponse(['data' => normalizeGroup($group)]);
        }
        if ($method === 'PATCH') {
            requireRole(['admin']);
            if (!$service->update($id, body())) fail('No se pudo actualizar el grupo.', 422);
            jsonResponse(['ok' => true]);
        }
        if ($method === 'DELETE') {
            requireRole(['admin']);
            if (!$service->delete($id)) fail('No se pudo eliminar el grupo.', 409);
            jsonResponse(['ok' => true]);
        }
    }

    // ---------- Estudiante: su panel y marcar asistencia ----------
    if ($segments === ['students', 'available'] && $method === 'GET') {
        requireRole(['admin']);
        jsonResponse(['data' => array_map('sinClave', (new NEstudiante())->obtenerUsuariosLibres())]);
    }
    if ($segments === ['teachers', 'available'] && $method === 'GET') {
        requireRole(['admin']);
        jsonResponse(['data' => array_map('sinClave', (new NProfesor())->obtenerUsuariosDisponibles())]);
    }
    if ($segments === ['students', 'dashboard'] && $method === 'GET') {
        $student = requireRole(['estudiante']);
        jsonResponse(['data' => (new NAsistencia())->getDashboardEstudiante((int)$student['id'])]);
    }
    if ($segments === ['students', 'attendance'] && $method === 'POST') {
        $student = requireRole(['estudiante']);
        $classId = (int)(body()['clase_id'] ?? 0);
        $result = (new NAsistencia())->marcarAsistenciaEstudiante((int)$student['id'], $classId);
        if (empty($result['ok'])) fail((string)($result['message'] ?? 'No se pudo registrar la asistencia.'), 422);
        jsonResponse($result, 201);
    }

    // ---------- CRUD de materias, estudiantes, profesores y usuarios ----------
    $simpleResources = [
        //  ruta        clase            quien lee                quien escribe
        'subjects' => [NMateria::class,   ['admin', 'profesor'], 'admin'],
        'students' => [NEstudiante::class, ['admin'],            'admin'],
        'teachers' => [NProfesor::class,   ['admin'],            'admin'],
        'users'    => [NUsuario::class,    ['admin'],            'admin'],
    ];
    foreach ($simpleResources as $resource => [$class, $readRoles, $writeRole]) {
        if ($segments === [$resource] && $method === 'GET') {
            requireRole($readRoles);
            jsonResponse(['data' => array_map('sinClave', rows((new $class())->getAll()))]);
        }
        if ($segments === [$resource] && $method === 'POST') {
            requireRole([$writeRole]);
            if (!(new $class())->create(body())) fail('No se pudo crear el registro.', 422);
            jsonResponse(['ok' => true], 201);
        }
        if (($segments[0] ?? '') === $resource && count($segments) === 2) {
            $id = idFrom($segments[1]);
            $service = new $class();
            if ($method === 'GET') {
                requireRole($readRoles);
                $item = $service->getById($id);
                if (!$item) fail('Registro no encontrado.', 404);
                jsonResponse(['data' => sinClave($item)]);
            }
            if ($method === 'PATCH') {
                requireRole([$writeRole]);
                if (!$service->update($id, body())) fail('No se pudo actualizar el registro.', 422);
                jsonResponse(['ok' => true]);
            }
            if ($method === 'DELETE') {
                requireRole([$writeRole]);
                if ($resource === 'users' && !(new NUsuario())->checkReferences($id)) {
                    fail('El usuario no existe o tiene un perfil de profesor/estudiante asociado.', 409);
                }
                if (!$service->delete($id)) fail('No se pudo eliminar el registro.', 409);
                jsonResponse(['ok' => true]);
            }
        }
    }

    // ---------- Clases ----------
    if ($segments === ['classes'] && $method === 'GET') {
        requireRole(['admin', 'profesor']);
        $service = new NClase();
        $items = $role === 'profesor' ? $service->getByProfesorUsuarioId((int)$user['id']) : $service->getAll();
        jsonResponse(['data' => array_map('normalizeClass', $items)]);
    }
    if ($segments === ['classes'] && $method === 'POST') {
        requireRole(['admin', 'profesor']);
        $input = body();
        exigirGrupoPropio($user, (int)($input['grupo_id'] ?? 0));
        if (!(new NClase())->create($input)) fail('No se pudo crear la clase. Revise el grupo, la fecha y el horario.', 422);
        jsonResponse(['ok' => true], 201);
    }
    if (($segments[0] ?? '') === 'classes' && count($segments) === 2) {
        requireRole(['admin', 'profesor']);
        $id = idFrom($segments[1]);
        $clase = claseAutorizada($user, $id);
        $service = new NClase();
        if ($method === 'GET') {
            jsonResponse(['data' => normalizeClass($clase)]);
        }
        if ($method === 'PATCH') {
            $input = body();
            exigirGrupoPropio($user, (int)($input['grupo_id'] ?? $clase['grupo_id']));
            if (!$service->update($id, $input)) fail('No se pudo actualizar la clase.', 422);
            jsonResponse(['ok' => true]);
        }
        if ($method === 'DELETE') {
            if (!$service->delete($id)) fail('No se pudo eliminar la clase.', 409);
            jsonResponse(['ok' => true]);
        }
    }

    // ---------- Asignacion de estudiantes a grupos ----------
    if ($segments === ['assignments'] && $method === 'GET') {
        requireRole(['admin']);
        $groupId = idFrom((string)($_GET['group_id'] ?? '0'));
        jsonResponse(['data' => (new NaGrupo())->getById($groupId)['asignaciones'] ?? []]);
    }
    if ($segments === ['assignments'] && $method === 'POST') {
        requireRole(['admin']);
        $input = body();
        $result = isset($input['codes'], $input['groupId']) || isset($input['codigos'], $input['grupo_id'])
            ? (new NaGrupo())->bulkAssign($input)
            : (new NaGrupo())->assignToGroup((string)($input['code'] ?? ''), (int)($input['group_id'] ?? 0));
        jsonResponse(['data' => $result]);
    }

    // ---------- Asistencia tomada por el profesor ----------
    if (($segments[0] ?? '') === 'attendance' && ($segments[1] ?? '') === 'classes' && isset($segments[2])) {
        requireRole(['admin', 'profesor']);
        $classId = idFrom($segments[2]);
        $clase = claseAutorizada($user, $classId);
        $service = new NAsistencia();

        if (count($segments) === 3 && $method === 'GET') {
            jsonResponse(['data' => $service->getStatusBoardByClass($classId)]);
        }
        if (count($segments) === 3 && $method === 'POST') {
            if (!empty($clase['finalizada'])) fail('La asistencia de esta clase ya fue finalizada.', 409);
            $input = body();
            $input['id_clase'] = $classId;
            $codigo = trim((string)($input['codigo_estudiante'] ?? ''));
            $board = $service->getStatusBoardByClass($classId);
            $fila = null;
            foreach ($board as $row) {
                if (($row['codigo_estudiante'] ?? '') === $codigo) { $fila = $row; break; }
            }
            if ($fila === null) fail('El estudiante no pertenece al grupo de esta clase.', 422);
            if (!empty($fila['tipo'])) fail('Este estudiante ya tiene asistencia registrada en esta clase.', 409);
            $strategy = strtolower((string)($input['estrategia'] ?? 'manual'));
            if (!in_array($strategy, ['manual', 'tardanza', 'falta'], true)) fail('Estrategia de asistencia inválida.', 422);
            if (!$service->addAttendance($input, $strategy)) fail('No se pudo registrar la asistencia.', 422);
            jsonResponse(['ok' => true], 201);
        }
        if (($segments[3] ?? '') === 'finish' && $method === 'POST') {
            if (!$service->finalizar($classId)) fail('No se pudo finalizar la asistencia.', 422);
            jsonResponse(['ok' => true]);
        }
        if (($segments[3] ?? '') === 'report' && $method === 'GET') {
            $format = strtolower((string)($_GET['format'] ?? 'pdf'));
            if (!in_array($format, ['pdf', 'excel'], true)) fail('Formato de reporte inválido.', 422);
            $content = $service->generarReporte($classId, $format);
            if ($content === '') fail('No hay registros para generar el reporte.', 404);
            while (ob_get_level() > 0) {
                ob_end_clean();
            }
            header('Content-Type: ' . ($format === 'pdf' ? 'application/pdf' : 'application/vnd.ms-excel'));
            header('Content-Disposition: attachment; filename="reporte_asistencia_c' . $classId . '.' . ($format === 'pdf' ? 'pdf' : 'xls') . '"');
            header('Cache-Control: no-store');
            echo $content;
            exit;
        }
    }

    fail('Ruta no encontrada.', 404);
} catch (Throwable $exception) {
    error_log('[api] ' . $exception->getMessage());
    fail('Error interno del servidor.', 500);
}
