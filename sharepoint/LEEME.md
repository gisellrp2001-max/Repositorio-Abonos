# Gestión de Abonos para SharePoint: guía de instalación

La app es un web part de SharePoint (SPFx) que guarda todo en tus listas y biblioteca de SharePoint. Una Azure Function lee cada voucher con **Azure AI Document Intelligence** (recomendado) o con Azure OpenAI, y devuelve los datos para que el vendedor los revise. Tus colegas entran con su cuenta corporativa desde una página de SharePoint, en el navegador o en el celular.

## Qué incluye este paquete

| Carpeta o archivo | Qué es |
|---|---|
| `gestion-abonos.sppkg` | El paquete listo para subir al Catálogo de aplicaciones. No necesitas compilar nada. |
| `azure-function/` | La función `leer-voucher` (Node 20+) que lee los vouchers. |
| `scripts/Crear-Listas.ps1` | Crea las listas de Clientes e Historial, la biblioteca Vouchers y el grupo de Gestión. Opcionalmente completa las columnas de tu lista de abonos y ajusta permisos. |
| `spfx-source/` | Código fuente del web part, por si quieres modificarlo. |

## Cómo funciona

1. **Vendedor.** Sube uno o varios vouchers a la vez (JPG, PNG o PDF, hasta 20 por lote); cada archivo se convierte en un abono separado. Los vouchers se leen de dos en dos. En una columna ve la lista del lote y, al lado, revisa cada voucher: los datos detectados con su nivel de confianza, el cliente sugerido y un aviso si hay posibles duplicados. Luego confirma cada uno por separado.
2. **Registro.** Cada abono se crea en tu lista con estado *Enviado* y un código `AB-AAAA-000123` basado en su Id. El voucher se sube a la biblioteca con ese código como nombre (si era PDF, también se guarda el original). Además se agregan tres eventos al Historial.
3. **Gestión.** Revisa el voucher al lado de los datos y pulsa **Validar abono** o **Marcar como observado**. Antes de aplicar el cambio aparece una ventana de confirmación con el código, el cliente, el importe, el estado anterior y el nuevo, y la observación. Solo si confirma se guarda el cambio, junto con el responsable, la fecha y un evento en el Historial.
4. **Observados.** El vendedor ve la observación, corrige los datos y reenvía; el abono vuelve a *Enviado*. Las correcciones quedan en el Historial.

## Probarlo en tu computadora (sin Azure ni SharePoint)

Abre **`demo/gestion-abonos-demo.html`** con doble clic en Chrome o Edge. Es la misma app, con estas diferencias:

- Trae datos de ejemplo y lo que registres se guarda solo en ese navegador. El botón **Restablecer datos de ejemplo** vuelve al inicio.
- Con **Ver como** cambias entre dos vendedores y Gestión para probar el ciclo completo: registrar, validar u observar, y corregir.
- La lectura del voucher está simulada. Tus imágenes y PDF se cargan y se ven, pero los datos que aparecen son de ejemplo.

Si modificas el código, regenera la demo con:

```bash
cd spfx-source
npm ci
npm run demo      # crea demo/dist/gestion-abonos-demo.html
```

### Probar la lectura real con tus vouchers

Solo necesitas un recurso de **Document Intelligence** (Paso 1, puede ser el nivel gratuito F0) y Node 20 o superior. Nada se publica.

**A. Solo la lectura, desde la consola.** Muestra qué datos saca de cada voucher:

```bash
cd azure-function
npm install
# Windows (PowerShell):  $env:DOCINTEL_ENDPOINT="https://<recurso>.cognitiveservices.azure.com"; $env:DOCINTEL_KEY="<clave>"
export DOCINTEL_ENDPOINT=https://<recurso>.cognitiveservices.azure.com
export DOCINTEL_KEY=<clave>
node probar-voucher.js voucher1.jpg voucher2.pdf
```

Agrega `VER_TEXTO=1` para ver también todo el texto que leyó. Si un banco no se interpreta bien, ese texto sirve para ajustar las reglas en `src/docintel.js`.

**B. La demo completa con lectura real.** Necesitas Azure Functions Core Tools (`func`).

1. En `azure-function/`, copia `local.settings.example.json` como `local.settings.json`.
2. Completa `DOCINTEL_ENDPOINT` y `DOCINTEL_KEY`, y cambia `"CORS"` a `"*"`.
3. Ejecuta `npm install` y luego `func start`.
4. Abre la demo agregando `?ocr=http://localhost:7071/api/leer-voucher` al final de la dirección.

## Requisitos

- Permiso de **administrador de SharePoint** (para el Catálogo de aplicaciones y para aprobar el acceso a la API) o ayuda de tu TI.
- Una suscripción de **Azure** con un recurso de **Azure AI Document Intelligence** (o, como alternativa, **Azure OpenAI** con un modelo con visión, por ejemplo `gpt-4o`).
- Para el script: PowerShell 7 y el módulo `PnP.PowerShell`.
- Para publicar la función: Azure Functions Core Tools v4 (`func`) o la extensión Azure Functions de VS Code.

---

## Paso 1. El servicio de lectura

La función puede usar cualquiera de los dos servicios; elige uno. Si configuras `DOCINTEL_ENDPOINT`, usa Document Intelligence; si no, Azure OpenAI.

| | Document Intelligence (recomendado) | Azure OpenAI |
|---|---|---|
| Cómo lee | OCR de Microsoft (modelo *Layout* con pares clave-valor). Reglas para vouchers peruanos en `src/docintel.js` convierten el texto en los 9 datos. | Un modelo de IA con visión mira la imagen y devuelve los datos. |
| Fuerte en | Texto nítido, costo bajo y predecible, disponible en casi todas las suscripciones y con nivel gratuito. | Fotos torcidas o de baja calidad, y formatos de bancos que las reglas no conocen. |
| A tener en cuenta | Un formato nuevo de voucher puede requerir ajustar las reglas. | Algunas organizaciones deben solicitar acceso; costo algo mayor por voucher. |

**Opción A: Document Intelligence**

1. En el portal de Azure, crea un recurso **Document Intelligence** (en *Azure AI services*). Para probar, elige el plan **Free F0**; para producción, **Standard S0**.
2. En **Claves y punto de conexión**, anota el **punto de conexión** (`https://<recurso>.cognitiveservices.azure.com`) y una **clave**. La clave solo la usarás para probar en tu equipo; la función publicada usa identidad administrada.

**Opción B: Azure OpenAI**

1. En el portal de Azure, crea un recurso **Azure OpenAI** o usa uno existente.
2. En **Azure AI Foundry › Implementaciones**, despliega un modelo con visión. Anota el **nombre de la implementación** (por ejemplo `gpt-4o`) y el **endpoint** (`https://<recurso>.openai.azure.com`).

## Paso 2. Crear y publicar la función

```bash
# Variables de ejemplo
RG=rg-gestion-abonos
LOC=eastus2
ST=stgestionabonos$RANDOM
APP=func-gestion-abonos

az group create -n $RG -l $LOC
az storage account create -n $ST -g $RG -l $LOC --sku Standard_LRS
az functionapp create -n $APP -g $RG --storage-account $ST \
  --flexconsumption-location $LOC --runtime node --runtime-version 20

# Identidad administrada de la función (así no guardas claves)
az functionapp identity assign -n $APP -g $RG
PRINCIPAL=$(az functionapp identity show -n $APP -g $RG --query principalId -o tsv)
RECURSO_ID=$(az cognitiveservices account show -n <recurso> -g <rg-del-recurso> --query id -o tsv)

# Opción A: Document Intelligence
az functionapp config appsettings set -n $APP -g $RG --settings \
  DOCINTEL_ENDPOINT=https://<recurso>.cognitiveservices.azure.com
az role assignment create --assignee $PRINCIPAL --role "Cognitive Services User" --scope $RECURSO_ID

# Opción B: Azure OpenAI (en lugar de la A)
# az functionapp config appsettings set -n $APP -g $RG --settings \
#   AZURE_OPENAI_ENDPOINT=https://<recurso>.openai.azure.com AZURE_OPENAI_DEPLOYMENT=gpt-4o AZURE_OPENAI_API_VERSION=2024-10-21
# az role assignment create --assignee $PRINCIPAL --role "Cognitive Services OpenAI User" --scope $RECURSO_ID

# Publicar el código
cd azure-function
npm install
func azure functionapp publish $APP
```

La URL que usarás después es `https://<APP>.azurewebsites.net/api/leer-voucher`.

> Si prefieres usar una clave en lugar de identidad administrada, agrega el ajuste `DOCINTEL_KEY` (o `AZURE_OPENAI_KEY`). Es mejor guardarla en Key Vault.
>
> Ajustes opcionales de Document Intelligence: `DOCINTEL_MODEL` (por defecto `prebuilt-layout`) y `DOCINTEL_FEATURES` (por defecto `keyValuePairs`; déjalo vacío para leer solo texto a menor costo).

## Paso 3. Proteger la función con Entra ID

Este paso hace que solo usuarios de tu organización, desde el web part, puedan llamar a la función.

1. Ve a **Function App › Autenticación › Agregar proveedor de identidades › Microsoft**.
2. Elige **Crear un nuevo registro de aplicaciones** y ponle exactamente este nombre: **`GestionAbonos-OCR`**. El paquete de SharePoint pide permiso con ese nombre.
3. En tipos de cuenta admitidos, elige **Inquilino actual**.
4. En **Solicitudes no autenticadas**, elige **HTTP 401**.
5. Al guardar, abre el registro `GestionAbonos-OCR` en Entra ID › **Exponer una API** y comprueba dos cosas: que exista el URI `api://<client-id>` y el ámbito `user_impersonation`. Anota ese URI.
6. De vuelta en **Autenticación › Editar**, en **Audiencias de token permitidas**, agrega `api://<client-id>`.
7. En **Function App › CORS**, agrega `https://<tu-tenant>.sharepoint.com`.

## Paso 4. Preparar las listas de SharePoint

Tu lista de abonos ya existe. El script no la toca, salvo que uses `-AgregarColumnasAbonos`, y aun así solo agrega columnas faltantes.

```powershell
Install-Module PnP.PowerShell -Scope CurrentUser
./scripts/Crear-Listas.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<sitio> -ClientId <id-de-tu-app-PnP> -ListaAbonos "<nombre de tu lista>"
# Opcional:
#   -AgregarColumnasAbonos   agrega a tu lista las columnas que le falten (nombres por defecto)
#   -ProtegerPermisos        historial solo para agregar; cada vendedor edita solo lo que registró
```

### Columnas que usa la app en la lista de abonos

Si tu lista usa otros nombres, no hace falta renombrar nada. Basta con indicar el mapeo en el web part (Paso 6).

| Dato | Nombre interno por defecto | Tipo recomendado |
|---|---|---|
| Código | `Title` | Una línea de texto |
| Cliente (razón social) | `Cliente` | Una línea de texto |
| RUC | `RUC` | Una línea de texto |
| Banco | `Banco` | Una línea de texto (o Elección) |
| Fecha de operación | `FechaOperacion` | Fecha |
| Hora | `HoraOperacion` | Una línea de texto |
| N° de operación | `NumeroOperacion` | Una línea de texto |
| Importe | `Importe` | Número o Moneda |
| Moneda | `Moneda` | Elección (`PEN`, `USD`) |
| Cuenta destino | `CuentaDestino` | Una línea de texto |
| Ordenante | `Ordenante` | Una línea de texto |
| Referencia | `Referencia` | Una línea de texto |
| Estado | `Estado` | Elección (`Enviado`, `Validado`, `Observado`) |
| Observación de Gestión | `ObservacionGestion` | Varias líneas de texto |
| Fecha del estado | `FechaEstado` | Fecha y hora |
| Responsable de Gestión | `ResponsableGestion` | Persona |
| Voucher | `Voucher` | Hipervínculo (o texto) |
| Datos de lectura OCR | `DatosOCR` | **Varias líneas de texto sin formato** |

La columna `DatosOCR` guarda lo que leyó el OCR y qué campos cambió el vendedor. Debe ser de **varias líneas**, porque una columna de una línea (máximo 255 caracteres) no alcanza. Si no la creas, la app funciona igual, pero se pierde esa trazabilidad.

Las columnas mínimas que la app necesita son: código, cliente, RUC, banco, fecha, operación, importe, moneda y estado.

## Paso 5. Instalar el web part

1. Abre el **Centro de administración de SharePoint › Más características › Aplicaciones › Catálogo de aplicaciones**.
2. Sube `gestion-abonos.sppkg`. Cuando te pregunte, marca **Hacer que esta solución esté disponible en todos los sitios** y pulsa **Implementar**.
3. Ve a **Centro de administración de SharePoint › Avanzado › Acceso a API**. Aprueba la solicitud **GestionAbonos-OCR · user_impersonation**.

## Paso 6. Crear la página y configurar

1. En tu sitio, crea una página. Para que se vea como una app, usa una sección de **ancho completo**.
2. Agrega el web part **Gestión de Abonos**, que aparece en la categoría *Avanzado*.
3. Edita el web part y completa el panel:
   - **Lista de abonos:** el nombre visible de tu lista.
   - **Lista de clientes**, **Lista de historial**, **Biblioteca de vouchers** y **Grupo de Gestión:** si usaste el script, deja los valores por defecto.
   - **URL de la función:** `https://<APP>.azurewebsites.net/api/leer-voucher`.
   - **ID de aplicación:** `api://<client-id>`, el del Paso 3.
   - **Mapeo de columnas (JSON):** indica solo lo que difiere de los nombres por defecto. Ejemplo:

     ```json
     {
       "abonos": { "importe": "Monto", "operacion": "NroOperacion", "clienteRazon": "RazonSocial" },
       "valores": { "estado": { "Enviado": "Pendiente", "Validado": "Aprobado", "Observado": "Observado" } }
     }
     ```

     El nombre interno de una columna aparece en la URL al editarla, después de `Field=`. La sección `valores` sirve si tus opciones de Estado o Moneda tienen otros textos.
4. Publica la página. Abre **Configuración** en el menú de la app (solo la ven los administradores del sitio): ahí se muestra qué listas y columnas encontró y cuáles faltan.

## Paso 7. Roles y permisos

- **Gestión:** los miembros del grupo *Gestión de Abonos* y los administradores del sitio. Ven la bandeja, validan u observan, y acceden a reportes.
- **Vendedores:** todos los demás. Necesitan permiso de **Colaborar** en el sitio, o al menos en la lista de abonos, la lista de clientes, la de historial y la biblioteca.
- **Historial y ediciones:** con `-ProtegerPermisos`, nadie puede editar ni borrar el historial, y cada vendedor solo edita los abonos que registró. Para que esto último aplique, los vendedores deben tener nivel **Colaborar**, no **Editar**. El nivel Editar incluye *Administrar listas*, que se salta esa restricción.

---

## Modificar y recompilar

Necesitas Node 22.

```bash
cd spfx-source
npm ci
npm run build              # genera sharepoint/solution/gestion-abonos.sppkg
npm run start              # prueba en el workbench: https://<tenant>.sharepoint.com/_layouts/15/workbench.aspx
```

Estructura principal:

- `src/webparts/gestionAbonos/model.ts`: tipos, mapeo por defecto y utilidades.
- `src/webparts/gestionAbonos/services/SpService.ts`: lectura y escritura en SharePoint (REST).
- `src/webparts/gestionAbonos/services/OcrService.ts`: preparación de imágenes y PDF, y llamada a la función.
- `src/webparts/gestionAbonos/components/`: interfaz (`views/Nuevo.tsx` contiene el registro por lote; `views/Detalle.tsx`, la validación con confirmación).

## Problemas frecuentes

| Qué ves | Qué hacer |
|---|---|
| “La lectura falló (401)” | Falta aprobar la API en SharePoint (Paso 5.3), o el ID de aplicación del web part no coincide con `api://<client-id>`. |
| “La lectura falló (403/404)” o error de CORS | Revisa la URL de la función y agrega tu dominio de SharePoint en CORS (Paso 3.7). |
| “El servicio de lectura no respondió correctamente” | Revisa en la función los ajustes `DOCINTEL_*` (o `AZURE_OPENAI_*`) y el rol de la identidad administrada: *Cognitive Services User* para Document Intelligence, *Cognitive Services OpenAI User* para Azure OpenAI. Los registros están en Application Insights. |
| Un banco se lee mal o le faltan datos | Prueba ese voucher con `node probar-voucher.js` y `VER_TEXTO=1`, y ajusta las etiquetas en `src/docintel.js`. La revisión del vendedor siempre permite corregir antes de enviar. |
| La app dice que no encuentra una columna | Corrige el mapeo en el panel del web part y revisa **Configuración**. |
| “No se pudo registrar: … Estado” | La columna Estado es de elección y sus opciones no coinciden. Agrega las opciones o usa `valores.estado` en el mapeo. |
| Un vendedor no puede subir el voucher | Le falta permiso en la biblioteca *Vouchers*. |

## Costos

- **Document Intelligence:** se cobra por página analizada (cada voucher es una página). El plan Free F0 sirve para probar sin costo; en Standard S0 el precio del modelo *Layout* con pares clave-valor es de centavos por voucher. Consulta los precios de tu región en la [página de precios de Azure](https://azure.microsoft.com/pricing/details/ai-document-intelligence/).
- **Azure OpenAI:** cada lectura es una llamada con una imagen y cuesta centavos por voucher según el modelo y la región.
- **La función** en plan Flex Consumption solo cobra por uso.
