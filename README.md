# Gestión de Abonos

Aplicación web de Streamlit para vendedores y el equipo de Gestión. Registra abonos a partir de uno o varios vouchers, lee su contenido con Tesseract OCR, permite corregir cada dato, advierte duplicados y conserva archivos e historial de validaciones.

## Estructura

```text
app.py                 Pantallas y navegación de Streamlit
 db.py                 Usuarios, clientes, abonos, adjuntos e historial en SQLite
 ocr.py                Lectura de imágenes/PDF y extracción conservadora de campos
 security.py           Contraseñas con PBKDF2 y utilidades JSON
 requirements.txt      Dependencias de Python
 Dockerfile            Imagen con Tesseract en español e inglés
 compose.yaml          Servicio y volumen persistente
 .env.example          Variables iniciales (sin credenciales reales)
 .streamlit/config.toml Tema y tamaño de carga
 tests/test_core.py    Prueba del flujo completo y parser OCR
```

## Ejecución recomendada: Docker

1. Copia `.env.example` como `.env` y define un correo administrador y una contraseña **de al menos 12 caracteres**. No subas `.env` al repositorio.
2. Ejecuta `docker compose up --build -d`.
3. Abre `http://localhost:8501` e ingresa con el administrador.
4. En **Usuarios**, crea un vendedor y una persona de Gestión. En **Clientes**, registra los clientes y asigna cada uno a un vendedor.
5. Comparte las credenciales iniciales por un canal seguro; cada persona puede cambiar su contraseña en el menú lateral.

El volumen `abonos_data` conserva la base SQLite y todos los adjuntos entre reinicios. Haz copias de seguridad de ese volumen. Para un servidor corporativo, publica el contenedor detrás del acceso HTTPS de la empresa; limita quién puede entrar y define copias de seguridad. El equipo de infraestructura debe confirmar si su plataforma admite Docker y un volumen persistente. **No despliegues este proyecto en Streamlit Community Cloud sin adaptar el almacenamiento:** allí el disco local no garantiza conservar los registros y archivos.

## Ejecución local sin Docker

Requiere Python 3.12 y Tesseract OCR con los idiomas `spa` y `eng`. Instala las dependencias con `pip install -r requirements.txt`, crea `.env` y carga sus variables en el entorno antes de ejecutar `streamlit run app.py`. El archivo `.env` no se carga automáticamente fuera de Docker. Los datos se guardan en `APP_DATA_DIR` (por defecto `./data`).

## Flujo de uso

- **Vendedor:** adjunta varios JPG, PNG o PDF; pulsa *Leer archivos con OCR*; compara los campos con los vouchers; selecciona un cliente asignado; revisa una posible coincidencia; confirma y envía. Puede corregir abonos observados y reenviarlos.
- **Gestión:** revisa todos los registros y adjuntos, abre el detalle y utiliza una ventana de confirmación para validar u observar. Una observación exige un motivo. Cada transición registra responsable, fecha, estado anterior, estado nuevo y los cambios.
- **Administrador:** crea usuarios, restablece contraseñas y registra clientes.

Se permiten hasta **20 archivos**, de **10 MB cada uno**, con un máximo total de **50 MB por registro**. El OCR funciona localmente sin enviar el voucher a un servicio externo. Es asistido: jamás registra automáticamente; la revisión humana es obligatoria. La detección puede fallar según el banco y la calidad del voucher. Los campos sin certeza quedan para revisión. La alerta de duplicados compara banco, operación, fecha, cliente, importe y moneda. No se compara contra movimientos bancarios reales; la validación final corresponde a Gestión.

Los importes PEN y USD se reportan por separado, sin convertir monedas. La lista operativa muestra hasta 1 000 registros por consulta y presenta 25 por página. Para un volumen mucho mayor o varios servidores, conviene migrar SQLite a una base de datos corporativa y usar almacenamiento de objetos para los adjuntos.

## Publicar el código en GitHub

Descomprime el ZIP y sube **el contenido de esta carpeta** como raíz del repositorio. Puedes crear un repositorio vacío en GitHub y ejecutar:

```bash
git init
git add .
git commit -m "Aplicación Gestión de Abonos"
git branch -M main
git remote add origin URL_DE_TU_REPOSITORIO
git push -u origin main
```

El repositorio no incluye datos, vouchers ni contraseñas. `.gitignore` excluye `.env` y `data/`.

## Verificación

```bash
python -m unittest discover -s tests -v
```

Las pruebas cubren registro de dos adjuntos, permisos, detección de duplicados, observación, corrección, validación e interpretación básica de campos OCR.
