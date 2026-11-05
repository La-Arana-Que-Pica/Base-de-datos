// Módulo autónomo: la página genera texto; nunca ejecuta comandos.
export function buildPowerShell(value) {
  const folder = String(value ?? '').trim();
  if (!folder) throw new Error('Pegá la ruta de tu carpeta de minifaces.');
  if (/[\u0000-\u001f\u007f]/u.test(folder)) throw new Error('La ruta debe estar en una sola línea, sin caracteres de control.');
  if (!/^(?:[a-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)/i.test(folder)) {
    throw new Error('Usá una ruta completa, por ejemplo D:\\Mis Minifaces.');
  }
  // Base64 de UTF-8 mantiene TODO el texto fuera de la sintaxis PowerShell,
  // incluso comillas tipográficas, $, acentos graves y apóstrofos.
  const encoded = btoa(Array.from(new TextEncoder().encode(folder), byte => String.fromCharCode(byte)).join(''));
  return `& {
    $folder = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))
    try {
        $directory = Get-Item -LiteralPath $folder -ErrorAction Stop
        if (-not $directory.PSIsContainer) { throw 'No es una carpeta.' }
        $files = @(Get-ChildItem -LiteralPath $folder -File -ErrorAction Stop | Where-Object { $_.Extension -ieq '.dds' })
    } catch {
        Write-Host 'No se pudo abrir la carpeta. Comproba que exista y tengas permiso de lectura.'
        return
    }
    $renamed = 0
    $skipped = 0
    foreach ($file in $files) {
        if ($file.BaseName -notmatch '^[0-9]+$' -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            $skipped++
            continue
        }
        $newName = 'Player_' + $file.BaseName + '.dds'
        $destination = Join-Path -Path $folder -ChildPath $newName
        try {
            if (Test-Path -LiteralPath $destination -ErrorAction Stop) {
                $skipped++
                continue
            }
            Rename-Item -LiteralPath $file.FullName -NewName $newName -ErrorAction Stop
            $renamed++
        } catch {
            $skipped++
            Write-Host ('No se pudo renombrar: ' + $file.Name)
        }
    }
    Write-Host ('Renombrados: ' + $renamed + '. Omitidos: ' + $skipped + '.')
    Write-Host 'Solo se contaron archivos DDS de esta carpeta. No se recorrieron subcarpetas.'
}`;
}

export function mount(host) {
  if (host.dataset.componentReady) return;
  host.innerHTML = `<h3>Renombrar minifaces</h3>
    <p>Agregá <strong>Player_</strong> a los archivos DDS que tengan un ID numérico. Por ejemplo: 12345.dds → Player_12345.dds.</p>
    <ol><li>Copiá la ruta de tu carpeta desde el Explorador de archivos de Windows.</li>
    <li>Pegala abajo. Generá y copiá el código.</li>
    <li>Abrí PowerShell en Windows, pegá el código y presioná Enter.</li></ol>
    <p>El código renombra archivos de esa carpeta, sin entrar en subcarpetas. Conservá una copia de tus imágenes antes de usarlo. La web no accede a tus archivos ni ejecuta PowerShell.</p>
    <form><label>Ruta de tu carpeta<input name="folder" type="text" placeholder="D:\\Mis Minifaces" autocomplete="off" spellcheck="false" required></label>
    <button type="submit">Generar código</button></form>
    <p class="gl-component-status" role="status" aria-live="polite"></p>
    <div class="gl-component-result" hidden><label>Código PowerShell<textarea readonly spellcheck="false" rows="12" wrap="off" aria-label="Código PowerShell generado"></textarea></label>
    <button type="button" data-copy>Copiar código</button>
    <p>Al terminar verás cuántos DDS se renombraron y cuántos se omitieron. Los nombres no numéricos, los que ya tienen prefijo y los destinos existentes se omiten; otras extensiones no se cuentan.</p></div>`;
  const level = Number(host.dataset.headingLevel || 3);
  if ([2,4].includes(level)) { const previous=host.querySelector('h3'),heading=document.createElement('h'+level);heading.textContent=previous.textContent;previous.replaceWith(heading); }
  const form = host.querySelector('form');
  const input = host.querySelector('input');
  const result = host.querySelector('.gl-component-result');
  const output = host.querySelector('textarea');
  const status = host.querySelector('[role=status]');
  const copy = host.querySelector('[data-copy]');
  const reset = () => { result.hidden = true; output.value = ''; status.textContent = ''; input.removeAttribute('aria-invalid'); };
  input.addEventListener('input', reset);
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      output.value = buildPowerShell(input.value);
      result.hidden = false;
      input.removeAttribute('aria-invalid');
      status.textContent = 'Código listo. Copialo para usarlo en PowerShell en Windows.';
    } catch (error) {
      result.hidden = true;
      output.value = '';
      input.setAttribute('aria-invalid', 'true');
      status.textContent = error.message;
      input.focus();
    }
  });
  copy.addEventListener('click', async () => {
    copy.disabled = true;
    const code = output.value;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Portapapeles no disponible');
      await navigator.clipboard.writeText(code);
      if (output.value === code) status.textContent = 'Código copiado. Abrí PowerShell en Windows, pegalo y presioná Enter.';
    } catch {
      if (output.value === code) {
        output.focus(); output.select();
        status.textContent = 'No pudimos copiar automáticamente. El código quedó seleccionado: usá Copiar en tu dispositivo.';
      }
    } finally { copy.disabled = false; }
  });
  host.dataset.componentReady = 'true';
}

if (typeof document !== 'undefined') {
  document.querySelectorAll('[data-guide-component="generador-powershell-minifaces"]').forEach(mount);
}
