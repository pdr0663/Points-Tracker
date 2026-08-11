$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$outputDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) "public\icons"
[IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

foreach ($size in @(192, 512)) {
    $bitmap = [Drawing.Bitmap]::new($size, $size, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $background = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml("#315f58"))
        $foreground = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml("#f7f3e8"))
        $accent = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml("#d8aa55"))
        try {
            $graphics.FillRectangle($background, 0, 0, $size, $size)
            $graphics.FillEllipse($foreground, $size * 0.242, $size * 0.211, $size * 0.516, $size * 0.516)
            $graphics.FillEllipse($background, $size * 0.348, $size * 0.316, $size * 0.305, $size * 0.305)
            foreach ($x in @(0.332, 0.5, 0.668)) {
                $graphics.FillEllipse($accent, $size * ($x - 0.043), $size * (0.746 - 0.043), $size * 0.086, $size * 0.086)
            }
        } finally {
            $background.Dispose()
            $foreground.Dispose()
            $accent.Dispose()
        }
        $path = Join-Path $outputDirectory "icon-$size.png"
        $bitmap.Save($path, [Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}
