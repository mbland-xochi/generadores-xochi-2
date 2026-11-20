# Xochi · Generadores v2

Herramienta web (GitHub Pages) + Google Apps Script/Sheets para inspecciones diarias, semanales y abastecimiento de combustible de los 4 generadores (KM 145, 152, 162, 170).

## Páginas
- **Resumen**: dashboard de los 4 generadores (estado, combustible, horas, servicio, batería, alertas) y botones de PDF.
- **Inspección**: diaria (checklist rutinario eléctrico) o semanal (revisión semanal con 4 fotos obligatorias). Ambas con firma. PDF automático al guardar.
- **Abastecimiento**: alerta cuando el diésel está bajo 70 %; registro con factura/saldo UNO y PDF automático.
- **Historial**: todos los registros con filtros y PDF por registro.

## Reglas
- Voltaje de batería correcto: 24.5 V (alerta si es menor).
- Diésel menor a 70 %: alerta de abastecimiento.
- Servicio general cada 500 h de trabajo (editable en Resumen > Ajustes, junto con las horas del último servicio de cada generador).

## Instalación (resumen)
1. En tu Google Sheet: Extensiones > Apps Script, reemplaza todo el código por `Code.gs`.
2. Implementar > Nueva implementación > Aplicación web > Ejecutar como: Yo, Acceso: Cualquier usuario. Autoriza (ahora también pide acceso a Drive, para fotos y firmas).
3. Copia la URL (/exec) en `config.js`.
4. Sube TODOS los archivos y la carpeta `vendor/` a GitHub (index.html, styles.css, app.js, api.js, schema.js, pdf.js, config.js, vendor/).
5. Al actualizar solo el código del Apps Script: Implementar > Gestionar implementaciones > editar > Nueva versión (misma URL).

Sin URL en `config.js` la herramienta corre en modo demo.

## Clave de acceso
- Al abrir la página se pide una clave. La clave **solo vive en `Code.gs`** (constante `CLAVE`, al inicio). No aparece en el HTML, ni en `config.js`, ni viaja en cada petición.
- Sin sesión válida el servidor no devuelve ni modifica ningún dato (lecturas incluidas).
- Sesión de 12 horas (`SESSION_HOURS`). 5 intentos fallidos bloquean el acceso 5 minutos (`MAX_FAILS`, `LOCK_MINUTES`).
- Para cambiar la clave: edita `CLAVE` en Apps Script y crea una nueva versión de la implementación. Todas las sesiones abiertas se cierran.
