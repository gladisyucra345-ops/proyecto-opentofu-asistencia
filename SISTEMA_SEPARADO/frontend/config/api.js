/*
 * El frontend llama a /api en su MISMO servidor (Azure).
 * Nginx reenvia esas peticiones al backend en AWS (proxy inverso) agregando la API_KEY.
 * Asi el navegador nunca ve la clave ni la IP del backend.
 */
window.APP_CONFIG = Object.freeze({
    API_BASE_URL: '/api'
});
