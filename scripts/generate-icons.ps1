$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$iconDir = Join-Path $root "public\icons"
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null

function New-RoundedRectPath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-Icon {
  param(
    [int]$Size,
    [string]$FileName,
    [bool]$Maskable = $false
  )

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $background = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(23, 60, 57))
  $bitmapGraphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $bitmapGraphics.Clear([System.Drawing.Color]::FromArgb(23, 60, 57))

  $inset = if ($Maskable) { $Size * 0.16 } else { $Size * 0.08 }
  $rectPath = New-RoundedRectPath -X $inset -Y $inset -Width ($Size - 2 * $inset) -Height ($Size - 2 * $inset) -Radius ($Size * 0.16)
  $innerBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(247, 244, 234))
  $graphics.FillPath($innerBrush, $rectPath)

  $plotInset = if ($Maskable) { $Size * 0.27 } else { $Size * 0.2 }
  $left = $plotInset
  $top = $plotInset
  $right = $Size - $plotInset
  $bottom = $Size - $plotInset
  $gridPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(205, 215, 207)), ([Math]::Max(1, $Size / 220))
  for ($i = 1; $i -le 4; $i++) {
    $x = $left + (($right - $left) * $i / 5)
    $y = $top + (($bottom - $top) * $i / 5)
    $graphics.DrawLine($gridPen, $x, $top, $x, $bottom)
    $graphics.DrawLine($gridPen, $left, $y, $right, $y)
  }

  $axisPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(80, 100, 94)), ([Math]::Max(2, $Size / 150))
  $midY = ($top + $bottom) / 2
  $midX = ($left + $right) / 2
  $graphics.DrawLine($axisPen, $left, $midY, $right, $midY)
  $graphics.DrawLine($axisPen, $midX, $top, $midX, $bottom)

  $curvePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(203, 91, 48)), ([Math]::Max(4, $Size / 70))
  $curvePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $curvePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $points = New-Object System.Collections.Generic.List[System.Drawing.PointF]
  $samples = 48
  for ($i = 0; $i -le $samples; $i++) {
    $t = $i / $samples
    $x = $left + ($right - $left) * $t
    $normalized = [Math]::Sin(($t * 2.2 - 0.15) * [Math]::PI)
    $normalized += 0.25 * [Math]::Sin(($t * 5.0 + 0.4) * [Math]::PI)
    $y = $midY - $normalized * ($bottom - $top) * 0.28
    $points.Add([System.Drawing.PointF]::new($x, $y))
  }
  $graphics.DrawLines($curvePen, $points.ToArray())

  $dotBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(23, 60, 57))
  $dotRadius = [Math]::Max(4, $Size / 80)
  $graphics.FillEllipse($dotBrush, ($midX - $dotRadius), ($midY - $dotRadius), ($dotRadius * 2), ($dotRadius * 2))

  $output = Join-Path $iconDir $FileName
  $stream = New-Object System.IO.MemoryStream
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  [System.IO.File]::WriteAllBytes($output, $stream.ToArray())

  $stream.Dispose()
  $dotBrush.Dispose()
  $curvePen.Dispose()
  $axisPen.Dispose()
  $gridPen.Dispose()
  $innerBrush.Dispose()
  $rectPath.Dispose()
  $background.Dispose()
  $bitmapGraphics.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-Icon -Size 180 -FileName "apple-touch-icon-180.png"
New-Icon -Size 192 -FileName "icon-192.png"
New-Icon -Size 512 -FileName "icon-512.png"
New-Icon -Size 512 -FileName "maskable-512.png" -Maskable $true

Write-Output "Icons generated in $iconDir"
