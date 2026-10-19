<?php
/**
 * Cliente de la API del BACKEND (AWS)
 * -----------------------------------
 * En el FRONTEND (Azure) ya no existe la logica de negocio.
 * Cada clase N... de esta carpeta es un "espejo": cuando la capa de
 * presentacion llama a un metodo (ej. $nEstudiante->getAll()), la llamada
 * se envia por HTTP al backend y se devuelve su respuesta.
 *
 * Variables de entorno del servidor frontend:
 *   BACKEND_URL  ->  http://IP_BACKEND/api.php
 *   API_KEY      ->  la misma clave configurada en el backend
 */
abstract class ApiCliente {

    public function __call(string $metodo, array $args) {
        $url = getenv('BACKEND_URL') ?: 'http://localhost:8001/api.php';
        $cuerpo = json_encode([
            'clase'  => static::class,
            'metodo' => $metodo,
            'args'   => $args,
        ], JSON_UNESCAPED_UNICODE);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $cuerpo,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'X-API-KEY: ' . (getenv('API_KEY') ?: ''),
            ],
        ]);
        $respuesta = curl_exec($ch);
        $error = curl_error($ch);
        curl_close($ch);

        if ($respuesta === false) {
            throw new RuntimeException('No se pudo conectar con el backend: ' . $error);
        }
        $json = json_decode($respuesta, true);
        if (!is_array($json) || empty($json['ok'])) {
            throw new RuntimeException('Error del backend: ' . ($json['error'] ?? $respuesta));
        }
        return !empty($json['b64']) ? base64_decode($json['data']) : $json['data'];
    }
}
