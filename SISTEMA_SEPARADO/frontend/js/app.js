(function () {
    'use strict';

    var apiBaseUrl = String(window.APP_CONFIG.API_BASE_URL || '').replace(/\/+$/, '');
    var app = document.getElementById('app');
    var toastStack = document.getElementById('toast-stack');
    var state = { user: null, action: 'dashboard' };
    var roles = { admin: 'Administrador', profesor: 'Profesor', estudiante: 'Estudiante' };
    var cardsByRole = {
        admin: [
            ['listar', '👥', 'Grupos', 'Gestion de grupos y horarios'],
            ['materias', '📚', 'Materias', 'Catalogo de asignaturas'],
            ['clases', '🗓️', 'Clases', 'Programacion de clases y toma de asistencia'],
            ['estudiantes', '👨‍🎓', 'Estudiantes', 'Registro y control de alumnos'],
            ['registrar_estudiantes_grupo', '🧾', 'Asignar a un Grupo estudiantes', 'Asignar a un Grupo estudiantes'],
            ['profesores', '👨‍🏫', 'Profesores', 'Administracion de docentes'],
            ['usuarios', '🔐', 'Usuarios', 'Administracion de cuentas']
        ],
        profesor: [['clases', '📝', 'Mis Clases', 'Clases creadas para tus grupos'], ['registrar_clase', '➕', 'Crear Clase', 'Registrar una clase para tus grupos']],
        estudiante: []
    };
    var resources = {
        listar: { title: 'Gestion de Grupos', path: '/groups', singular: 'grupo', columns: [['id', 'ID'], ['nombre', 'Nombre'], ['capacidad_maxima', 'Capacidad'], ['capacidad_actual', 'Inscritos']] },
        materias: { title: 'Gestion de Materias', path: '/subjects', singular: 'materia', columns: [['id', 'ID'], ['nombre', 'Nombre']] },
        estudiantes: { title: 'Gestion de Estudiantes', path: '/students', singular: 'estudiante', columns: [['nombres', 'Nombre'], ['apellidos', 'Apellidos'], ['nombre_usuario', 'Usuario'], ['codigo_estudiante', 'Codigo'], ['ci', 'CI'], ['estado', 'Estado']] },
        profesores: { title: 'Gestion de Profesores', path: '/teachers', singular: 'profesor', columns: [['nombres', 'Nombre'], ['apellidos', 'Apellidos'], ['nombre_usuario', 'Usuario'], ['codigo_profesor', 'Codigo']] },
        usuarios: { title: 'Gestion de Usuarios', path: '/users', singular: 'usuario', columns: [['id', 'ID'], ['nombres', 'Nombres'], ['apellidos', 'Apellidos'], ['nombre_usuario', 'Usuario'], ['tipo_usuario', 'Tipo']] },
        clases: { title: 'Gestion de Clases', path: '/classes', singular: 'clase', columns: [['id', 'ID'], ['nombre', 'Grupo'], ['materia_nombre', 'Materia'], ['fecha', 'Fecha'], ['hora_inicio', 'Hora de inicio'], ['hora_fin', 'Hora de fin'], ['estado', 'Estado']] }
    };
    var resourceKeys = { grupo: 'listar', materia: 'materias', estudiante: 'estudiantes', profesor: 'profesores', usuario: 'usuarios', clase: 'clases' };

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
        });
    }

    function notify(message, type) {
        if (!message) return;
        var toast = document.createElement('div');
        toast.className = 'toast toast--' + (['success', 'danger', 'warning', 'info'].indexOf(type) >= 0 ? type : 'info');
        toast.innerHTML = '<span class="toast-dot"></span><span class="toast-text"></span><button type="button" class="toast-close" aria-label="Cerrar">x</button>';
        toast.querySelector('.toast-text').textContent = message;
        toast.querySelector('.toast-close').addEventListener('click', function () { toast.remove(); });
        toastStack.appendChild(toast);
        window.setTimeout(function () { if (toast.parentNode) toast.remove(); }, 5200);
    }

    async function request(path, options) {
        var config = Object.assign({ credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }, options || {});
        var response;
        try { response = await fetch(apiBaseUrl + path, config); } catch (error) { throw new Error('No se pudo conectar con el servidor.'); }
        var contentType = response.headers.get('content-type') || '';
        var result = contentType.indexOf('application/json') >= 0 ? await response.json().catch(function () { return {}; }) : await response.blob();
        if (!response.ok) throw new Error(result.message || 'El backend devolvió HTTP ' + response.status + '.');
        return result;
    }

    function role() { return String((state.user || {}).tipo_usuario || '').toLowerCase(); }
    function isAdmin() { return role() === 'admin'; }
    function value(row, key) { return row[key] != null ? row[key] : ''; }
    function setContent(html) { var content = document.getElementById('content'); if (content) content.innerHTML = html; }

    function shell() {
        var user = state.user || {};
        var cards = cardsByRole[role()] || [];
        app.innerHTML = '<div class="user-strip"><div class="user-strip-left"><div class="user-avatar">' +
            escapeHtml((user.nombres || 'U').substring(0, 1).toUpperCase()) + '</div><div><div class="user-name">' +
            escapeHtml((user.nombres || 'Usuario') + ' ' + (user.apellidos || '')) + '</div><div class="user-role">' +
            escapeHtml(roles[role()] || role()) + '</div></div></div><div class="user-strip-actions"><button type="button" id="theme-toggle" class="btn btn-outline btn-sm theme-toggle">Modo oscuro</button><button type="button" id="logout" class="btn btn-danger btn-sm">Cerrar Sesion</button></div></div>' +
            '<div class="grid dashboard-grid' + (role() === 'admin' ? ' dashboard-grid--admin' : '') + '">' + cards.map(function (card) { return '<a href="#' + card[0] + '" class="stat-card"><span class="icon">' + card[1] + '</span><h3>' + escapeHtml(card[2]) + '</h3><p>' + escapeHtml(card[3]) + '</p></a>'; }).join('') + '</div><div class="main-content" id="content"></div>';
        document.getElementById('logout').addEventListener('click', logout);
        document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    }

    function toggleTheme() {
        var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('asistenciau-theme', next);
    }

    async function logout() {
        try {
            await request('/auth/logout', { method: 'POST' });
            state.user = null;
            state.action = 'dashboard';
            history.replaceState(null, '', location.pathname + location.search);
            renderLogin();
        } catch (error) { notify(error.message, 'danger'); }
    }

    function renderLogin() {
        app.innerHTML = '<div class="card card-sm"><h2>Iniciar Sesion</h2><form id="login-form"><div class="form-group"><label for="username">Usuario:</label><input id="username" name="username" class="form-control" required></div><div class="form-group"><label for="password">Contraseña:</label><input id="password" name="password" type="password" class="form-control" required></div><button class="btn" type="submit">Ingresar</button></form></div>';
        document.getElementById('login-form').addEventListener('submit', async function (event) {
            event.preventDefault();
            var form = new FormData(event.target);
            try {
                var result = await request('/auth/login', { method: 'POST', body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) });
                state.user = result.user;
                if (!state.user) throw new Error('La respuesta de login no contiene el usuario autenticado.');
                state.action = defaultActionForRole();
                history.replaceState(null, '', location.pathname + location.search);
                render();
            } catch (error) { notify(error.message, 'danger'); }
        });
    }

    function button(label, action, id, kind, resource) {
        var extraClass = action === 'report-pdf' ? ' report-pdf' : action === 'report-excel' ? ' report-excel' : '';
        return '<button type="button" class="btn btn-' + (kind || 'outline') + ' btn-sm' + extraClass + '" data-action="' + escapeHtml(action) + '" data-id="' + escapeHtml(id) + '"' + (resource ? ' data-resource="' + escapeHtml(resource) + '"' : '') + '>' + label + '</button>';
    }

    function statusPill(status) {
        var normalized = String(status || 'Pendiente').toLowerCase();
        var className = normalized === 'presente' ? 'present' : normalized === 'tarde' ? 'late' : normalized === 'falta' ? 'absent' : normalized === 'licencia' ? 'license' : 'pending';
        return '<span class="status-pill status-pill--' + className + '">' + escapeHtml(status || 'Pendiente') + '</span>';
    }

    function renderTable(config, rows) {
        var resourceKey = Object.keys(resources).find(function (key) { return resources[key] === config; }) || '';
        var canCreate = config.singular === 'clase' ? (isAdmin() || role() === 'profesor') : isAdmin();
        var create = canCreate ? '<button type="button" class="btn" data-action="create" data-resource="' + config.singular + '">➕ Nuevo</button>' : '';
        var headers = config.columns.map(function (column) { return '<th>' + column[1] + '</th>'; }).join('');
        var body = rows.map(function (row) {
            var id = value(row, 'id') || value(row, 'usuario_id') || value(row, 'id_clase');
            var cells = config.columns.map(function (column) {
                var cellValue = value(row, column[0]);
                if (config.singular === 'clase' && (column[0] === 'hora_inicio' || column[0] === 'hora_fin')) cellValue = displayTime(cellValue);
                return '<td>' + escapeHtml(cellValue) + '</td>';
            }).join('');
            var actions = '';
            if (isAdmin() || (config.singular === 'clase' && role() === 'profesor')) {
                actions += button('Editar', 'edit', id, 'success', resourceKey) + ' ' + button('Eliminar', 'delete', id, 'danger', resourceKey);
            }
            if (config.singular === 'clase') {
                actions += ' ' + button('Asistencia', 'attendance', id, 'outline', resourceKey);
            }
            return '<tr>' + cells + '<td class="actions-cell">' + actions + '</td></tr>';
        }).join('');
        return '<div class="card"><div class="panel-header"><h2 class="panel-title">' + config.title + '</h2>' + create + '</div><div class="table-container"><table><thead><tr>' + headers + '<th class="actions-cell">Acciones</th></tr></thead><tbody>' + (body || '<tr><td colspan="' + (config.columns.length + 1) + '">No hay registros.</td></tr>') + '</tbody></table></div></div>';
    }

    function field(name, label, type, required, valueText, extra) {
        var tag = type === 'textarea' ? 'textarea' : 'input';
        var attributes = ' name="' + escapeHtml(name) + '" class="form-control"' + (required ? ' required' : '') + (extra ? ' ' + extra : '');
        if (tag === 'input') {
            return '<div class="form-group"><label>' + escapeHtml(label) + ':</label><input' + attributes + ' value="' + escapeHtml(valueText || '') + '"></div>';
        }
        return '<div class="form-group"><label>' + escapeHtml(label) + ':</label><textarea' + attributes + '>' + escapeHtml(valueText || '') + '</textarea></div>';
    }

    function selectField(name, label, options, selected, required) {
        return '<div class="form-group"><label>' + escapeHtml(label) + ':</label><select name="' + escapeHtml(name) + '" class="form-control"' + (required ? ' required' : '') + '><option value="">Seleccione...</option>' + options.map(function (item) { return '<option value="' + escapeHtml(item.value) + '"' + (String(item.value) === String(selected) ? ' selected' : '') + '>' + escapeHtml(item.label) + '</option>'; }).join('') + '</select></div>';
    }

    function localDateToday() {
        var now = new Date();
        return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    }

    function timeParts(valueText) {
        var match = String(valueText || '').match(/^(\d{1,2}):(\d{2})/);
        if (!match) return { hour: '08', minute: '00', period: 'AM' };
        var hour = Number(match[1]);
        return { hour: String(hour % 12 || 12).padStart(2, '0'), minute: match[2], period: hour >= 12 ? 'PM' : 'AM' };
    }

    function displayTime(valueText) {
        var parts = timeParts(valueText);
        return parts.hour + ':' + parts.minute + ' ' + parts.period;
    }

    function to24HourText(valueText) {
        var match = String(valueText || '').trim().toUpperCase().match(/^([0-1]\d):([0-5]\d) (AM|PM)$/);
        if (!match || match[1] === '00') throw new Error('La hora debe tener formato HH:MM AM/PM, con hora entre 01 y 12.');
        var hour = Number(match[1]);
        if (match[3] === 'AM' && hour === 12) hour = 0;
        if (match[3] === 'PM' && hour !== 12) hour += 12;
        return String(hour).padStart(2, '0') + ':' + match[2];
    }

    function timeField(name, label, valueText) {
        return field(name, label, 'text', true, valueText ? displayTime(valueText) : '', 'placeholder="08:00 AM" inputmode="text" pattern="[0-1][0-9]:[0-5][0-9] (AM|PM)" autocomplete="off"');
    }

    async function loadOptions(path, labelKey, valueKey) {
        var result = await request(path);
        return (result.data || []).map(function (item) { return { value: item[valueKey], label: item[labelKey] || item.nombre_usuario || item.codigo_profesor || item.nombres }; });
    }

    async function renderForm(resource, id, existing) {
        var editing = Boolean(id);
        var data = existing || {};
        var html = '<div class="card card-md"><h2>' + (editing ? 'Editar ' : 'Registrar ') + resource + '</h2><form id="entity-form" data-resource="' + resource + '" data-id="' + escapeHtml(id || '') + '">';
        if (resource === 'materia') html += field('nombre', 'Nombre', 'text', true, data.nombre);
        if (resource === 'usuario') {
            html += field('nombres', 'Nombres', 'text', true, data.nombres) + field('apellidos', 'Apellidos', 'text', true, data.apellidos) + field('genero', 'Género', 'text', false, data.genero) + field('nombre_usuario', 'Nombre de Usuario', 'text', true, data.nombre_usuario) + field('contrasena', editing ? 'Contraseña (dejar vacía para conservarla)' : 'Contraseña', 'password', !editing, '') + selectField('tipo_usuario', 'Tipo de Usuario', [{ value: 'profesor', label: 'Profesor' }, { value: 'estudiante', label: 'Estudiante' }, { value: 'admin', label: 'Admin' }], data.tipo_usuario, true);
        }
        if (resource === 'estudiante') {
            var users = await request('/students/available').then(function (result) {
                return (result.data || []).map(function (item) {
                    return { value: item.id, label: ((item.nombres || '') + ' ' + (item.apellidos || '')).trim() + ' (' + item.nombre_usuario + ')' };
                });
            });
            html += selectField('usuario_id', 'Usuario Base', users, data.usuario_id, !editing) + field('ci', 'Cédula de Identidad', 'text', true, data.ci) + field('codigo_estudiante', 'Código de Estudiante', 'text', true, data.codigo_estudiante) + selectField('estado', 'Estado', [{ value: 'activo', label: 'Activo' }, { value: 'inactivo', label: 'Inactivo' }], data.estado || 'activo', true);
        }
        if (resource === 'profesor') {
            var professorUsers = await request('/teachers/available').then(function (result) { return (result.data || []).map(function (item) { return { value: item.id, label: ((item.nombres || '') + ' ' + (item.apellidos || '')).trim() + ' (' + item.nombre_usuario + ')' }; }); });
            html += selectField('usuario_id', 'Usuario Base', professorUsers, data.usuario_id, !editing) + field('codigo_profesor', 'Código de Profesor', 'text', true, data.codigo_profesor);
        }
        if (resource === 'grupo') {
            var subjects = await loadOptions('/subjects', 'nombre', 'id');
            var teachers = (await request('/teachers')).data || [];
            teachers = teachers.map(function (item) {
                return {
                    value: item.profesor_id,
                    label: ((item.nombres || '') + ' ' + (item.apellidos || '')).trim() + ' (' + (item.nombre_usuario || item.codigo_profesor || '') + ')'
                };
            });
            html += field('nombre', 'Nombre', 'text', true, data.nombre) + field('capacidad_maxima', 'Capacidad Máxima', 'number', true, data.capacidad_maxima || 30, 'min="1"') + selectField('materia_id', 'Materia', subjects, data.materia_id, true) + selectField('profesor_id', 'Profesor', teachers, data.profesor_id, true);
        }
        if (resource === 'clase') {
            var groups = await loadOptions('/groups', 'nombre', 'id');
            html += selectField('grupo_id', 'Grupo', groups, data.grupo_id, true) + field('dia', 'Fecha de la clase', 'date', true, data.dia || data.fecha || localDateToday()) + timeField('hora_inicio', 'Hora de inicio', data.hora_inicio) + timeField('hora_fin', 'Hora de fin', data.hora_fin);
        }
        html += '<div class="form-actions"><button type="submit" class="btn">' + (editing ? 'Actualizar' : 'Guardar') + '</button><a href="#' + listHash(resource) + '" class="btn btn-danger">Cancelar</a></div></form></div>';
        setContent(html);
        document.getElementById('entity-form').addEventListener('submit', submitEntity);
        if (resource === 'clase') {
            ['hora_inicio', 'hora_fin'].forEach(function (name) {
                var input = document.querySelector('#entity-form [name="' + name + '"]');
                input.addEventListener('blur', function () {
                    var loose = String(input.value || '').trim().toUpperCase().match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/);
                    if (loose && Number(loose[1]) >= 1 && Number(loose[1]) <= 12) input.value = String(Number(loose[1])).padStart(2, '0') + ':' + loose[2] + ' ' + loose[3];
                });
            });
        }
        document.querySelector('#entity-form a.btn-danger').addEventListener('click', function (event) {
            event.preventDefault();
            loadResource(listHash(resource));
        });
    }

    function listHash(resource) {
        return { grupo: 'listar', materia: 'materias', estudiante: 'estudiantes', profesor: 'profesores', usuario: 'usuarios', clase: 'clases' }[resource] || 'dashboard';
    }

    function payloadFromForm(form, resource) {
        var data = Object.fromEntries(new FormData(form).entries());
        if (resource === 'estudiante') { data.codigo_estudiante = data.codigo_estudiante; }
        if (resource === 'grupo') { data.capacidad_maxima = Number(data.capacidad_maxima); data.materia_id = Number(data.materia_id); data.profesor_id = Number(data.profesor_id); }
        if (resource === 'clase') {
            data.grupo_id = Number(data.grupo_id);
            data.hora_inicio = to24HourText(data.hora_inicio);
            data.hora_fin = to24HourText(data.hora_fin);
        }
        return data;
    }

    function to24Hour(hour, minute, period) {
        var numericHour = Number(hour);
        if (!numericHour || numericHour < 1 || numericHour > 12 || !/^\d{2}$/.test(String(minute)) || Number(minute) > 59) {
            throw new Error('Seleccione una hora válida.');
        }
        if (period === 'AM' && numericHour === 12) numericHour = 0;
        if (period === 'PM' && numericHour !== 12) numericHour += 12;
        return String(numericHour).padStart(2, '0') + ':' + minute;
    }

    async function submitEntity(event) {
        event.preventDefault();
        var form = event.target;
        if (form.dataset.submitting === 'true') return;
        var resource = form.dataset.resource;
        var id = form.dataset.id;
        var pathMap = { grupo: '/groups', materia: '/subjects', estudiante: '/students', profesor: '/teachers', usuario: '/users', clase: '/classes' };
        var path = pathMap[resource] + (id ? '/' + encodeURIComponent(id) : '');
        var submitButton = form.querySelector('button[type="submit"]');
        form.dataset.submitting = 'true';
        if (submitButton) submitButton.disabled = true;
        try {
            var payload = payloadFromForm(form, resource);
            if (resource === 'clase' && payload.hora_inicio >= payload.hora_fin) throw new Error('La hora de fin debe ser posterior a la hora de inicio.');
            await request(path, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
            notify('Operacion realizada correctamente.', 'success');
            var destination = listHash(resource);
            if (location.hash.substring(1) === destination) {
                await loadResource(destination);
            } else {
                location.hash = destination;
            }
        } catch (error) {
            notify(error.message, 'danger');
            form.dataset.submitting = 'false';
            if (submitButton) submitButton.disabled = false;
        }
    }

    async function loadResource(action) {
        var config = resources[action];
        if (!config) return renderSpecial(action);
        setContent('<div class="card"><p>Cargando...</p></div>');
        try {
            var result = await request(config.path);
            setContent(renderTable(config, result.data || []));
        } catch (error) { setContent('<div class="alert alert-danger">' + escapeHtml(error.message) + '</div>'); }
    }

    async function renderSpecial(action) {
        if (action === 'registrar_clase') return renderForm('clase');
        if (action === 'crear_grupo') return renderForm('grupo');
        if (action === 'registrar_estudiante') return renderForm('estudiante');
        if (action === 'registrar_usuario') return renderForm('usuario');
        if (action === 'registrar_profesor') return renderForm('profesor');
        if (action === 'registrar_estudiantes_grupo') return renderAssignments();
        if (action === 'marcar_asistencia_estudiante') return renderStudentDashboard();
        if (action === 'attendance') return renderAttendance(state.pendingId);
        renderDashboard(action);
    }

    async function renderAssignments() {
        try {
            var groups = await loadOptions('/groups', 'nombre', 'id');
            setContent('<div class="card card-md"><h2>Asignar Estudiantes a un Grupo</h2><form id="assignment-form">' +
                selectField('group_id', 'Grupo', groups, '', true) +
                field('codes', 'Códigos de estudiantes (separados únicamente por comas)', 'textarea', false, '', 'placeholder="ESTU001,ESTU002,ESTU003"') +
                '<div class="form-group"><label for="assignment-csv">Archivo CSV:</label><input id="assignment-csv" class="form-control" type="file" accept=".csv,text/csv"><small>Formato: un código por fila en la primera columna. Ejemplo: ESTU001</small><br><a download="plantilla-asignaciones.csv" href="data:text/csv;charset=utf-8,codigo_estudiante%0AESTU001%0AESTU002">Descargar plantilla CSV</a></div>' +
                '<div class="form-actions"><button class="btn" type="submit">Asignar</button></div></form></div><div id="assignment-result"></div><div id="assignment-list"></div>');
            var groupSelect = document.querySelector('#assignment-form [name="group_id"]');
            var loadAssignments = async function () {
                var groupId = groupSelect.value;
                if (!groupId) {
                    document.getElementById('assignment-list').innerHTML = '';
                    return;
                }
                try {
                    var result = await request('/assignments?group_id=' + encodeURIComponent(groupId));
                    var rows = result.data || [];
                    document.getElementById('assignment-list').innerHTML = '<div class="card"><h3>Asignaciones realizadas</h3><div class="table-container"><table><thead><tr><th>Código</th><th>Nombre</th><th>Fecha</th></tr></thead><tbody>' +
                        (rows.length ? rows.map(function (row) {
                            return '<tr><td>' + escapeHtml(row.codigo_estudiante) + '</td><td>' + escapeHtml((row.apellidos || '') + ' ' + (row.nombres || '')) + '</td><td>' + escapeHtml(row.fecha_asignacion) + '</td></tr>';
                        }).join('') : '<tr><td colspan="3">No hay asignaciones para este grupo.</td></tr>') +
                        '</tbody></table></div></div>';
                } catch (error) {
                    document.getElementById('assignment-list').innerHTML = '<div class="alert alert-danger">' + escapeHtml(error.message) + '</div>';
                }
            };
            groupSelect.addEventListener('change', loadAssignments);
            document.getElementById('assignment-form').addEventListener('submit', async function (event) {
                event.preventDefault();
                var form = event.target;
                if (form.dataset.submitting === 'true') return;
                var submitButton = form.querySelector('button[type="submit"]');
                form.dataset.submitting = 'true';
                if (submitButton) submitButton.disabled = true;
                    var data = Object.fromEntries(new FormData(event.target).entries());
                var codes = (data.codes || '').split(',').map(function (code) { return code.trim(); }).filter(Boolean);
                codes = codes.filter(function (code, index) { return codes.indexOf(code) === index; });
                try {
                    var csv = document.getElementById('assignment-csv').files[0];
                    if (csv) {
                        var csvText = await csv.text();
                        csvText.split(/\r?\n/).forEach(function (line, index) {
                            var code = (line.split(',')[0] || '').trim();
                            if (index === 0 && code.toLowerCase() === 'codigo_estudiante') return;
                            if (code) codes.push(code);
                        });
                    }
                    codes = codes.filter(function (code, index) { return codes.indexOf(code) === index; });
                    if (!codes.length) throw new Error('Seleccione, escriba o cargue al menos un estudiante.');
                    var result = await request('/assignments', { method: 'POST', body: JSON.stringify({ groupId: Number(data.group_id), codes: codes }) });
                    var outcomes = result.data || [];
                    var failed = outcomes.filter(function (item) { return !item.ok; });
                    var succeeded = outcomes.filter(function (item) { return item.ok; });
                    document.getElementById('assignment-result').innerHTML = '<div class="card"><h3>Resultado de asignación</h3><p>Asignados: ' + succeeded.length + ' | Rechazados: ' + failed.length + '</p><div class="table-container"><table><thead><tr><th>Código</th><th>Resultado</th><th>Motivo</th></tr></thead><tbody>' +
                        outcomes.map(function (item) { return '<tr><td>' + escapeHtml(item.code) + '</td><td>' + (item.ok ? 'Asignado' : 'Rechazado') + '</td><td>' + escapeHtml(item.message || '') + '</td></tr>'; }).join('') +
                        '</tbody></table></div></div>';
                    var summary = succeeded.length === outcomes.length && succeeded.length > 0
                        ? 'Se asignaron ' + succeeded.length + ' estudiantes correctamente'
                        : succeeded.length > 0
                            ? 'Se asignaron ' + succeeded.length + ' estudiantes; ' + failed.length + ' no se asignaron. Revisa el detalle'
                            : 'No se asignaron estudiantes. Revisa el detalle';
                    notify(summary, failed.length ? (succeeded.length ? 'warning' : 'danger') : 'success');
                    await loadAssignments();
                } catch (error) {
                    notify(error.message, 'danger');
                } finally {
                    form.dataset.submitting = 'false';
                    if (submitButton) submitButton.disabled = false;
                }
            });
        } catch (error) { setContent('<div class="alert alert-danger">' + escapeHtml(error.message) + '</div>'); }
    }

    async function renderAttendance(classId) {
        try {
            var responses = await Promise.all([request('/attendance/classes/' + encodeURIComponent(classId)), request('/classes/' + encodeURIComponent(classId))]);
            var result = responses[0];
            var classData = responses[1].data || responses[1];
            var rows = result.data || [];
            var pending = rows.filter(function (row) { return !row.tipo; });
            var options = pending.map(function (row) { return '<option value="' + escapeHtml(row.codigo_estudiante) + '">' + escapeHtml((row.apellidos || '') + ' ' + (row.nombres || '') + ' (' + row.codigo_estudiante + ')') + '</option>'; }).join('');
            setContent('<div class="card"><div class="panel-header"><h2 class="panel-title">Registrar asistencia</h2><div>' + button('Actualizar', 'attendance', classId, 'outline') + ' ' + button('Volver a clases', 'back-to-classes', classId, 'outline') + ' ' + button('Finalizar', 'finish', classId, 'danger') + ' ' + button('PDF', 'report-pdf', classId, 'outline') + ' ' + button('Excel', 'report-excel', classId, 'outline') + '</div></div><div class="card card-sm"><p><strong>Clase:</strong> ' + escapeHtml(classData.id || classId) + ' · <strong>Grupo:</strong> ' + escapeHtml(classData.nombre || classData.grupo_nombre || '') + ' · <strong>Materia:</strong> ' + escapeHtml(classData.materia_nombre || '') + '</p><p><strong>Fecha:</strong> ' + escapeHtml(classData.fecha || classData.dia || '') + ' · ' + escapeHtml(displayTime(classData.hora_inicio)) + ' - ' + escapeHtml(displayTime(classData.hora_fin)) + '</p></div>' +
                '<form id="attendance-form" class="card card-sm"><label>Estudiante<select name="codigo_estudiante" class="form-control" required><option value="">Seleccione...</option>' + options + '</select></label><label>Tipo<select name="tipo" class="form-control" required><option value="presente">Presente</option><option value="falta">Falta</option><option value="licencia">Licencia</option></select></label><label>Estrategia<select name="estrategia" class="form-control" required><option value="manual">Manual (Sin cambios automáticos)</option><option value="tardanza">Tardanza Automática (Evaluar retraso)</option><option value="falta">Falta Automática</option></select></label><button class="btn" type="submit"' + (pending.length ? '' : ' disabled') + '>Registrar asistencia</button></form>' +
                '<div class="table-container"><table><thead><tr><th>Código</th><th>Nombres</th><th>Apellidos</th><th>Estado</th></tr></thead><tbody>' + rows.map(function (row) { return '<tr><td>' + escapeHtml(row.codigo_estudiante) + '</td><td>' + escapeHtml(row.nombres) + '</td><td>' + escapeHtml(row.apellidos) + '</td><td>' + statusPill(row.tipo) + '</td></tr>'; }).join('') + '</tbody></table></div></div>');
            document.getElementById('attendance-form').addEventListener('submit', async function (event) {
                event.preventDefault();
                var data = Object.fromEntries(new FormData(event.target).entries());
                try { await request('/attendance/classes/' + encodeURIComponent(classId), { method: 'POST', body: JSON.stringify(data) }); notify('Asistencia registrada.', 'success'); await renderAttendance(classId); } catch (error) { notify(error.message, 'danger'); }
            });
        } catch (error) { setContent('<div class="alert alert-danger">' + escapeHtml(error.message) + '</div>'); }
    }

    async function renderStudentDashboard() {
        try {
            var result = await request('/students/dashboard');
            var data = result.data || {};
            var serverNow = data.server_now ? new Date(data.server_now) : new Date();
            setContent('<div class="card"><h2>Mi asistencia</h2><p>Presente: ' + escapeHtml((data.resumen || {}).presente || 0) + ' | Tarde: ' + escapeHtml((data.resumen || {}).tarde || 0) + ' | Falta: ' + escapeHtml((data.resumen || {}).falta || 0) + '</p></div><div class="card"><h2>Mis clases</h2><div class="table-container"><table><thead><tr><th>Materia</th><th>Fecha</th><th>Horario</th><th>Estado</th><th>Acción</th></tr></thead><tbody>' + (data.clases || []).map(function (item) { var state = item.estado_asistencia || 'Pendiente'; var closed = Boolean(item.finalizada); var start = new Date(String(item.dia) + 'T' + String(item.hora_inicio).substring(0, 5) + ':00-04:00'); var end = new Date(String(item.dia) + 'T' + String(item.hora_fin).substring(0, 5) + ':00-04:00'); var available = serverNow >= start && serverNow <= end; var action = state !== 'Pendiente' || closed ? '<span class="text-muted">' + (closed ? 'Asistencia cerrada' : 'Registrada') + '</span>' : available ? button('Marcar asistencia', 'student-mark', item.id_clase, 'success') : '<span class="text-muted">' + (serverNow < start ? 'Aún no disponible' : 'Horario cerrado') + '</span>'; return '<tr><td>' + escapeHtml(item.materia_nombre) + '</td><td>' + escapeHtml(item.dia) + '</td><td>' + escapeHtml(displayTime(item.hora_inicio)) + ' - ' + escapeHtml(displayTime(item.hora_fin)) + '</td><td>' + statusPill(state) + '</td><td>' + action + '</td></tr>'; }).join('') + '</tbody></table></div><h2>Mi historial</h2><div class="table-container"><table><thead><tr><th>Materia</th><th>Fecha</th><th>Hora</th><th>Estado</th></tr></thead><tbody>' + (data.historial || []).map(function (item) { return '<tr><td>' + escapeHtml(item.materia_nombre) + '</td><td>' + escapeHtml(item.dia) + '</td><td>' + escapeHtml(item.hora_marcada || '--') + '</td><td>' + statusPill(item.tipo) + '</td></tr>'; }).join('') + '</tbody></table></div></div>');
        } catch (error) { setContent('<div class="alert alert-danger">' + escapeHtml(error.message) + '</div>'); }
    }

    async function handleAction(action, id, resource) {
        resource = resourceKeys[resource] ? resource : (resources[resource] || {}).singular;
        var config = resources[resourceKeys[resource]];
        if (action === 'create') return renderForm(resource);
        if (action === 'edit') {
            var result = await request(config.path + '/' + encodeURIComponent(id));
            return renderForm(resource, id, result.data || result);
        }
        if (action === 'delete') {
            if (!window.confirm('¿Está seguro de eliminar este registro?')) return;
            await request(config.path + '/' + encodeURIComponent(id), { method: 'DELETE' });
            notify('Registro eliminado correctamente.', 'success');
            return loadResource(state.action);
        }
        if (action === 'attendance') { state.pendingId = id; return renderAttendance(id); }
        if (action === 'report-pdf' || action === 'report-excel') {
            var blob = await request('/attendance/classes/' + encodeURIComponent(id) + '/report?format=' + (action === 'report-pdf' ? 'pdf' : 'excel'));
            var url = URL.createObjectURL(blob);
            var link = document.createElement('a'); link.href = url; link.download = 'reporte_asistencia_c' + id + (action === 'report-pdf' ? '.pdf' : '.xls'); link.click(); URL.revokeObjectURL(url); return;
        }
        if (action === 'finish') {
            await request('/attendance/classes/' + id + '/finish', { method: 'POST', body: JSON.stringify({ estrategia: 'manual' }) });
            notify('Asistencia finalizada.', 'success');
            if (location.hash.substring(1) === 'clases') await loadResource('clases'); else location.hash = 'clases';
            return;
        }
        if (action === 'back-to-classes') {
            if (location.hash.substring(1) === 'clases') return loadResource('clases');
            location.hash = 'clases';
            return;
        }
        if (action === 'mark-present' || action === 'mark-late') {
            var parts = String(id).split('|'); await request('/attendance/classes/' + parts[0], { method: 'POST', body: JSON.stringify({ codigo_estudiante: parts[1], tipo: action === 'mark-present' ? 'presente' : 'tarde', estrategia: 'manual' }) }); notify('Asistencia registrada.', 'success'); return renderAttendance(parts[0]);
        }
        if (action === 'student-mark') { await request('/students/attendance', { method: 'POST', body: JSON.stringify({ clase_id: Number(id) }) }); notify('Asistencia registrada.', 'success'); return renderStudentDashboard(); }
    }

    function renderDashboard() {
        if (role() === 'estudiante') return renderStudentDashboard();
        setContent('<div class="card empty-state"><span class="empty-state-icon">🎯</span><h2>Bienvenido al sistema</h2><p>Seleccione una opcion del panel para continuar.</p></div>');
    }

    function defaultActionForRole() {
        return role() === 'estudiante' ? 'marcar_asistencia_estudiante' : 'dashboard';
    }

    function isAllowedAction(action) {
        if (role() === 'estudiante') return action === 'dashboard' || action === 'marcar_asistencia_estudiante';
        if (role() === 'admin') return action === 'dashboard' || Boolean(resources[action]) || ['registrar_estudiantes_grupo', 'registrar_usuario', 'registrar_estudiante', 'registrar_profesor', 'registrar_clase', 'crear_grupo', 'attendance'].indexOf(action) >= 0;
        if (role() === 'profesor') return action === 'dashboard' || action === 'clases' || action === 'registrar_clase' || action === 'attendance';
        return false;
    }

    async function render() {
        var savedTheme = localStorage.getItem('asistenciau-theme');
        document.documentElement.setAttribute('data-theme', savedTheme === 'dark' ? 'dark' : 'light');
        var requestedAction = location.hash.substring(1) || state.action || 'dashboard';
        if (!isAllowedAction(requestedAction)) {
            requestedAction = defaultActionForRole();
            history.replaceState(null, '', location.pathname + location.search + (requestedAction === 'dashboard' ? '' : '#' + requestedAction));
        }
        state.action = requestedAction;
        shell();
        if (resources[state.action]) await loadResource(state.action); else await renderSpecial(state.action);
    }

    app.addEventListener('click', async function (event) {
        var card = event.target.closest('.stat-card');
        if (card) {
            event.preventDefault();
            var destination = new URL(card.href).hash.substring(1);
            if (location.hash.substring(1) === destination) {
                state.action = destination;
                if (resources[destination]) await loadResource(destination); else await renderSpecial(destination);
            } else {
                location.hash = destination;
            }
            return;
        }
        var target = event.target.closest('[data-action]');
        if (!target) return;
        try { await handleAction(target.dataset.action, target.dataset.id, target.dataset.resource || (state.action === 'listar' ? 'listar' : state.action)); } catch (error) { notify(error.message, 'danger'); }
    });
    window.addEventListener('hashchange', render);
    (async function () {
        try { var result = await request('/auth/me'); state.user = result.user; if (!state.user) throw new Error('Sin sesión'); render(); } catch (error) { renderLogin(); }
    }());
}());
