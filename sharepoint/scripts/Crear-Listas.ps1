<#
  Crear-Listas.ps1 — Prepara el sitio de SharePoint para "Gestión de Abonos".

  Crea (solo si no existen):
    - Lista "Clientes", lista "Historial Abonos" y biblioteca "Vouchers".
    - Grupo de SharePoint de Gestión.
  Opcional:
    - -AgregarColumnasAbonos : agrega a tu lista de abonos existente las columnas que le falten,
                               con los nombres por defecto de la app. No modifica ni borra columnas existentes.
    - -ProtegerPermisos      : el historial queda de "solo agregar" (nadie puede editarlo ni borrarlo, salvo propietarios)
                               y en la lista de abonos cada vendedor solo puede editar lo que registró.

  Requisitos: PowerShell 7 y el módulo PnP.PowerShell (Install-Module PnP.PowerShell -Scope CurrentUser).
  PnP exige un registro de aplicación propio: https://pnp.github.io/powershell/articles/registerapplication.html

  Ejemplo:
    ./Crear-Listas.ps1 -SiteUrl https://contoso.sharepoint.com/sites/comercial -ClientId <id-app-pnp> -ListaAbonos "Abonos" -AgregarColumnasAbonos -ProtegerPermisos
#>
param(
  [Parameter(Mandatory = $true)][string]$SiteUrl,
  [Parameter(Mandatory = $true)][string]$ClientId,
  [string]$ListaAbonos = "Abonos",
  [string]$ListaClientes = "Clientes",
  [string]$ListaHistorial = "Historial Abonos",
  [string]$Biblioteca = "Vouchers",
  [string]$GrupoGestion = "Gestión de Abonos",
  [switch]$AgregarColumnasAbonos,
  [switch]$ProtegerPermisos
)

$ErrorActionPreference = "Stop"
Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $ClientId

function Asegurar-Lista([string]$Titulo, [string]$Plantilla) {
  $l = Get-PnPList -Identity $Titulo -ErrorAction SilentlyContinue
  if (-not $l) {
    Write-Host "Creando $Titulo…" -ForegroundColor Cyan
    New-PnPList -Title $Titulo -Template $Plantilla -OnQuickLaunch:$false | Out-Null
  } else { Write-Host "$Titulo ya existe." -ForegroundColor DarkGray }
}

function Asegurar-Campo([string]$Lista, [string]$Interno, [string]$Visible, [string]$Tipo, [string[]]$Opciones = $null, [switch]$SoloFecha) {
  $f = Get-PnPField -List $Lista -Identity $Interno -ErrorAction SilentlyContinue
  if ($f) { Write-Host "  · $Interno ya existe ($($f.TypeAsString))" -ForegroundColor DarkGray; return }
  Write-Host "  + $Interno ($Tipo)" -ForegroundColor Green
  if ($Opciones) {
    Add-PnPField -List $Lista -InternalName $Interno -DisplayName $Visible -Type $Tipo -Choices $Opciones -AddToDefaultView | Out-Null
  } else {
    Add-PnPField -List $Lista -InternalName $Interno -DisplayName $Visible -Type $Tipo -AddToDefaultView | Out-Null
  }
  if ($SoloFecha) { Set-PnPField -List $Lista -Identity $Interno -Values @{ DisplayFormat = 0 } | Out-Null }
  if ($Tipo -eq "Note") { Set-PnPField -List $Lista -Identity $Interno -Values @{ RichText = $false; UnlimitedLengthInDocumentLibrary = $true } -ErrorAction SilentlyContinue | Out-Null }
}

# ---------- Listas nuevas ----------
Asegurar-Lista $ListaClientes "GenericList"
Set-PnPField -List $ListaClientes -Identity "Title" -Values @{ Title = "Razón social" } | Out-Null
Asegurar-Campo $ListaClientes "RUC" "RUC" "Text"
Asegurar-Campo $ListaClientes "VendedorAsignado" "Vendedor asignado" "User"
Asegurar-Campo $ListaClientes "Estado" "Estado" "Choice" @("Activo", "Inactivo")

Asegurar-Lista $ListaHistorial "GenericList"
Set-PnPField -List $ListaHistorial -Identity "Title" -Values @{ Title = "Código de abono" } | Out-Null
Asegurar-Campo $ListaHistorial "AbonoId" "Id del abono" "Number"
Asegurar-Campo $ListaHistorial "Tipo" "Tipo" "Text"
Asegurar-Campo $ListaHistorial "EstadoAnterior" "Estado anterior" "Text"
Asegurar-Campo $ListaHistorial "EstadoNuevo" "Estado nuevo" "Text"
Asegurar-Campo $ListaHistorial "Detalle" "Detalle" "Note"
Set-PnPField -List $ListaHistorial -Identity "AbonoId" -Values @{ Indexed = $true } | Out-Null

Asegurar-Lista $Biblioteca "DocumentLibrary"

# ---------- Lista de abonos existente ----------
$abonos = Get-PnPList -Identity $ListaAbonos -ErrorAction SilentlyContinue
if (-not $abonos) {
  Write-Host "No existe la lista '$ListaAbonos'. Revisa el nombre o créala primero." -ForegroundColor Yellow
} elseif ($AgregarColumnasAbonos) {
  Write-Host "Revisando columnas de $ListaAbonos…" -ForegroundColor Cyan
  Asegurar-Campo $ListaAbonos "Cliente" "Cliente" "Text"
  Asegurar-Campo $ListaAbonos "RUC" "RUC" "Text"
  Asegurar-Campo $ListaAbonos "Banco" "Banco" "Text"
  Asegurar-Campo $ListaAbonos "FechaOperacion" "Fecha de operación" "DateTime" -SoloFecha
  Asegurar-Campo $ListaAbonos "HoraOperacion" "Hora" "Text"
  Asegurar-Campo $ListaAbonos "NumeroOperacion" "N° de operación" "Text"
  Asegurar-Campo $ListaAbonos "Importe" "Importe" "Number"
  Asegurar-Campo $ListaAbonos "Moneda" "Moneda" "Choice" @("PEN", "USD")
  Asegurar-Campo $ListaAbonos "CuentaDestino" "Cuenta destino" "Text"
  Asegurar-Campo $ListaAbonos "Ordenante" "Ordenante" "Text"
  Asegurar-Campo $ListaAbonos "Referencia" "Referencia" "Text"
  Asegurar-Campo $ListaAbonos "Estado" "Estado" "Choice" @("Enviado", "Validado", "Observado")
  Asegurar-Campo $ListaAbonos "ObservacionGestion" "Observación de Gestión" "Note"
  Asegurar-Campo $ListaAbonos "FechaEstado" "Fecha del estado" "DateTime"
  Asegurar-Campo $ListaAbonos "ResponsableGestion" "Responsable de Gestión" "User"
  Asegurar-Campo $ListaAbonos "Voucher" "Voucher" "URL"
  Asegurar-Campo $ListaAbonos "DatosOCR" "Datos de lectura OCR" "Note"
  $est = Get-PnPField -List $ListaAbonos -Identity "Estado" -ErrorAction SilentlyContinue
  if ($est) { Set-PnPField -List $ListaAbonos -Identity "Estado" -Values @{ Indexed = $true } -ErrorAction SilentlyContinue | Out-Null }
}

# ---------- Grupo de Gestión ----------
$g = Get-PnPGroup -Identity $GrupoGestion -ErrorAction SilentlyContinue
if (-not $g) {
  Write-Host "Creando grupo '$GrupoGestion' con nivel Editar…" -ForegroundColor Cyan
  New-PnPSiteGroup -Name $GrupoGestion -PermissionLevels "Edit" | Out-Null
} else { Write-Host "El grupo '$GrupoGestion' ya existe." -ForegroundColor DarkGray }

# ---------- Permisos opcionales ----------
if ($ProtegerPermisos) {
  Write-Host "Aplicando permisos…" -ForegroundColor Cyan
  $rol = "Agregar sin editar"
  if (-not (Get-PnPRoleDefinition -Identity $rol -ErrorAction SilentlyContinue)) {
    Add-PnPRoleDefinition -RoleName $rol -Clone "Contribute" -Exclude EditListItems, DeleteListItems, DeleteVersions -Description "Puede agregar y ver elementos, pero no editarlos ni borrarlos." | Out-Null
  }
  # Historial: todos agregan, nadie edita ni borra (los propietarios del sitio conservan el control total).
  Set-PnPList -Identity $ListaHistorial -BreakRoleInheritance -CopyRoleAssignments | Out-Null
  $miembros = Get-PnPGroup -AssociatedMemberGroup
  foreach ($grp in @($miembros.Title, $GrupoGestion)) {
    if (-not $grp) { continue }
    Set-PnPListPermission -Identity $ListaHistorial -Group $grp -RemoveRole "Edit" -ErrorAction SilentlyContinue | Out-Null
    Set-PnPListPermission -Identity $ListaHistorial -Group $grp -RemoveRole "Contribute" -ErrorAction SilentlyContinue | Out-Null
    Set-PnPListPermission -Identity $ListaHistorial -Group $grp -AddRole $rol | Out-Null
  }
  # Abonos: cada usuario edita solo lo que registró; Gestión (con "Administrar listas") puede editar todo.
  if ($abonos) { Set-PnPList -Identity $ListaAbonos -WriteSecurity 2 | Out-Null }
  Write-Host "Importante: para que la restricción de abonos aplique, los vendedores deben tener nivel 'Colaborar' (Contribute), no 'Editar'." -ForegroundColor Yellow
}

Write-Host "`nListo. Abre la app y revisa la sección Configuración para confirmar que encuentra todas las columnas." -ForegroundColor Green
