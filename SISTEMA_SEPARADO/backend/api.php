<?php
/**
 * API del BACKEND (AWS)
 * ---------------------
 * Recibe peticiones del FRONTEND (Azure), ejecuta la capa de negocio
 * y responde en JSON.
 *
 * Peticion (POST, JSON):
 *   { "clase": "NEstudiante", "metodo": "getAll", "args": [] }
 *
 * Respuesta:
 *   { "ok": true,  "data": ..., "b64": false }
 *   { "ok": false, "error": "mensaje" }
 *
 * Seguridad: el frontend debe enviar la cabecera  X-API-KEY  con el mismo
 * valor que la variable de entorno API_KEY de este servidor.
 */

header('Content-Type: application/json; charset=UTF-8');

function responder(int $codigo, array $cuerpo): void {
    http_response_code($codigo);
    echo json_encode($cuerpo, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

// Prueba rapida desde el navegador: http://IP_BACKEND/api.php
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    responder(200, ['ok' => true, 'servicio' => 'backend-control-asistencia']);
}

// 1. Verificar la clave compartida
$apiKey = getenv('API_KEY') ?: '';
$recibida = $_SERVER['HTTP_X_API_KEY'] ?? '';
if ($apiKey === '' || !hash_equals($apiKey, $recibida)) {
    responder(401, ['ok' => false, 'error' => 'No autorizado']);
}

// 2. Leer la peticion
$peticion = json_decode(file_get_contents('php://input'), true);
$clase  = $peticion['clase']  ?? '';
$metodo = $peticion['metodo'] ?? '';
$args   = $peticion['args']   ?? [];

// 3. Solo se permiten las clases de la capa de negocio
$clasesPermitidas = [
    'NAsistencia', 'NClase', 'NEstudiante', 'NGrupo',
    'NMateria', 'NProfesor', 'NUsuario', 'NaGrupo',
];
if (!in_array($clase, $clasesPermitidas, true) || !is_array($args)) {
    responder(400, ['ok' => false, 'error' => 'Peticion invalida']);
}

require_once __DIR__ . '/capa_negocio/' . $clase . '.php';

if (!method_exists($clase, $metodo)
    || !(new ReflectionMethod($clase, $metodo))->isPublic()
    || str_starts_with($metodo, '__')) {
    responder(400, ['ok' => false, 'error' => 'Metodo no permitido']);
}

// 4. Ejecutar la capa de negocio
try {
    $resultado = (new $clase())->$metodo(...array_values($args));

    // Algunos metodos devuelven un resultado de BD sin leer: lo convertimos en lista
    if ($resultado instanceof PDOStatement) {
        $resultado = $resultado->fetchAll(PDO::FETCH_ASSOC);
    }

    // Los reportes PDF/Excel son binarios: se envian en base64
    if (is_string($resultado) && !mb_check_encoding($resultado, 'UTF-8')) {
        responder(200, ['ok' => true, 'data' => base64_encode($resultado), 'b64' => true]);
    }

    responder(200, ['ok' => true, 'data' => $resultado, 'b64' => false]);
} catch (Throwable $e) {
    error_log('[api.php] ' . $e->getMessage());
    responder(500, ['ok' => false, 'error' => $e->getMessage()]);
}
