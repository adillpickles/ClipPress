# Encoder test: the graphics card's HEVC and H.264 (and, on NVIDIA, AV1 for comparison) at each preset, against the
# CPU encoders, at the same bitrate. Prints VMAF (quality: the mean and the worst 5% of frames), seconds and the size
# each case reached, and saves them to results.csv.
#
# Run in PowerShell from an empty folder (it writes its encodes there), with ClipPress's FFmpeg (9.0): the one
# `yarn download-ffmpeg-win32-x64` fetches, or an installed copy's:
#   & C:\src\ClipPress\script\gpu-encoder-test.ps1 -Ffmpeg "$env:LOCALAPPDATA\Programs\clippress\resources\ffmpeg.exe" -Recording "D:\Clips\game.mp4" -Start 30 -Kbps 5000
# On an AMD or Intel card add -Vendor amd or -Vendor intel (NVIDIA is the default). The scores need FFmpeg's libvmaf
# filter: if that FFmpeg lacks it, add -VmafFfmpeg with one that has it (BtbN's n9.0 gpl builds do).
# A 1080p60 recording at 5000 kb/s and a 1440p30 one at 2500 cover the usual Discord sizes. Close other apps first:
# times matter. Each case's arguments are the ones ClipPress runs for that preset (keep them in step with
# src/renderer/src/sizeLimitedEncoderArgs.ts), except the "candidate" ones: settings being tried.
param(
  [Parameter(Mandatory = $true)][string]$Ffmpeg,
  [Parameter(Mandatory = $true)][string]$Recording,
  [double]$Start = 30,
  [int]$Seconds = 20,
  [int]$Kbps = 5000,
  [ValidateSet('nvidia', 'amd', 'intel')][string]$Vendor = 'nvidia',
  # Scores the encodes; only needs libvmaf.
  [string]$VmafFfmpeg = $Ffmpeg,
  # Leave out the slow CPU two-pass cases (a few minutes each).
  [switch]$GpuOnly
)
$ErrorActionPreference = 'Continue'
if (-not ((& $VmafFfmpeg -hide_banner -filters 2>&1 | Out-String) -match 'libvmaf')) {
  Write-Host "$VmafFfmpeg has no libvmaf filter, so it can't score the encodes: add -VmafFfmpeg with an FFmpeg that has it."
  exit 1
}
$probe = & $Ffmpeg -hide_banner -i $Recording 2>&1 | Out-String
$fps = 60
if ($probe -match '(\d+(\.\d+)?) fps') { $fps = [math]::Round([double]$Matches[1]) }
$gop = $fps * 10
$win = @('-b:v', "${Kbps}k", '-maxrate', "$([int]($Kbps * 1.05))k", '-bufsize', "$([int]($Kbps * 1.5))k")

# A lossless 20 s reference, so every encode starts from the same frames and VMAF lines them up one to one.
if (-not (Test-Path ref.mkv)) {
  & $Ffmpeg -v error -y -ss $Start -i $Recording -t $Seconds -an -c:v ffv1 -level 3 -pix_fmt yuv420p ref.mkv
}

$cases = [ordered]@{}
if ($Vendor -eq 'nvidia') {
  $hevc = @('-c:v', 'hevc_nvenc', '-tune', 'hq', '-profile:v', 'main', '-rc', 'vbr')
  $h264 = @('-c:v', 'h264_nvenc', '-tune', 'hq', '-profile:v', 'high', '-rc', 'vbr')
  $hevcUhq = @('-c:v', 'hevc_nvenc', '-tune', 'uhq', '-profile:v', 'main', '-rc', 'vbr')
  $hevcRest = @('-rc-lookahead', '20', '-temporal-aq', '1', '-strict_gop', '1', '-b_ref_mode', 'middle', '-spatial-aq', '1', '-aq-strength', '8', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1')
  # GPU HEVC as ClipPress runs it (the default for everyone with a card that makes HEVC). Quality: the "ultra high
  # quality" tuning at p4 on a card that takes it (an RTX 40/50 does; an older one may refuse it: the case then fails),
  # otherwise hq at p6.
  $cases['gpu-hevc-quality'] = $hevcUhq + @('-preset', 'p4', '-multipass', 'qres') + $hevcRest + $win
  $cases['gpu-hevc-quality-without-uhq'] = $hevc + @('-preset', 'p6', '-multipass', 'qres') + $hevcRest + $win
  $cases['gpu-hevc-fast'] = $hevc + @('-preset', 'p4', '-multipass', 'qres', '-rc-lookahead', '12', '-temporal-aq', '1', '-strict_gop', '1', '-spatial-aq', '1', '-aq-strength', '6', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1') + $win
  # Max quality on the card, as ClipPress runs it when this FFmpeg has no x265 (otherwise Max quality is x265, below).
  $cases['gpu-hevc-max'] = $hevcUhq + @('-preset', 'p7', '-multipass', 'fullres') + $hevcRest + $win
  # GPU H.264: Video format H.264, and the step down for cards without HEVC.
  $cases['gpu-h264-quality'] = $h264 + @('-preset', 'p6', '-multipass', 'qres', '-rc-lookahead', '20', '-spatial-aq', '1', '-temporal-aq', '1', '-aq-strength', '8', '-strict_gop', '1', '-b_ref_mode', 'middle', '-pix_fmt', 'yuv420p') + $win
  $cases['gpu-h264-fast'] = $h264 + @('-preset', 'p3', '-multipass', 'qres', '-rc-lookahead', '12', '-spatial-aq', '1', '-temporal-aq', '1', '-aq-strength', '6', '-strict_gop', '1', '-pix_fmt', 'yuv420p') + $win
  $cases['gpu-h264-max'] = $h264 + @('-preset', 'p6', '-multipass', 'fullres', '-rc-lookahead', '20', '-spatial-aq', '1', '-temporal-aq', '1', '-aq-strength', '8', '-strict_gop', '1', '-b_ref_mode', 'middle', '-pix_fmt', 'yuv420p') + $win
  $cases['gpu-h264-max-p7-candidate'] = $h264 + @('-preset', 'p7', '-multipass', 'fullres', '-rc-lookahead', '32', '-spatial-aq', '1', '-temporal-aq', '1', '-aq-strength', '8', '-strict_gop', '1', '-b_ref_mode', 'middle', '-pix_fmt', 'yuv420p') + $win
  # GPU AV1 Quality, for reference (Video format AV1).
  $cases['gpu-av1-quality'] = @('-c:v', 'av1_nvenc', '-preset', 'p6', '-tune', 'hq', '-rc', 'vbr', '-multipass', 'qres', '-cq', '28', '-rc-lookahead', '20', '-spatial-aq', '1', '-temporal-aq', '1', '-aq-strength', '8', '-b_ref_mode', 'middle', '-pix_fmt', 'yuv420p') + $win
}
if ($Vendor -eq 'amd') {
  $tools = @('-vbaq', '1', '-preencode', '1', '-enforce_hrd', '1', '-g', "$gop")
  $analysis = @('-preanalysis', '1', '-pa_lookahead_buffer_depth', '11', '-pa_scene_change_detection_enable', '1', '-pa_high_motion_quality_boost_mode', 'auto', '-high_motion_quality_boost_enable', '1')
  $hevcEnd = @('-rc', 'vbr_peak', '-pix_fmt', 'nv12', '-tag:v', 'hvc1') + $win
  # GPU HEVC as ClipPress runs it (Max quality on the card is the same as Quality, and only runs without x265).
  $cases['gpu-hevc-quality'] = @('-c:v', 'hevc_amf', '-usage', 'transcoding', '-quality', 'quality', '-profile:v', 'main') + $tools + $analysis + $hevcEnd
  $cases['gpu-hevc-fast'] = @('-c:v', 'hevc_amf', '-usage', 'transcoding', '-quality', 'balanced', '-profile:v', 'main') + $tools + $hevcEnd
  # Candidates: FFmpeg 9.0's slowest HEVC preset; AMD's high-quality usage; hardware temporal AQ instead of VBAQ.
  $cases['gpu-hevc-high-quality-candidate'] = @('-c:v', 'hevc_amf', '-usage', 'transcoding', '-quality', 'high_quality', '-profile:v', 'main') + $tools + $analysis + $hevcEnd
  $cases['gpu-hevc-usage-hq-candidate'] = @('-c:v', 'hevc_amf', '-usage', 'high_quality', '-quality', 'quality', '-profile:v', 'main') + $tools + $analysis + $hevcEnd
  $cases['gpu-hevc-taq-candidate'] = @('-c:v', 'hevc_amf', '-usage', 'transcoding', '-quality', 'quality', '-profile:v', 'main') + $tools + $analysis + @('-pa_taq_mode', '2') + $hevcEnd
  # GPU H.264: Video format H.264, and the step down for cards without HEVC.
  $h264End = @('-rc', 'vbr_peak', '-pix_fmt', 'nv12') + $win
  $cases['gpu-h264-quality'] = @('-c:v', 'h264_amf', '-usage', 'transcoding', '-quality', 'quality', '-profile:v', 'high') + $tools + $analysis + @('-bf', '2') + $h264End
  $cases['gpu-h264-fast'] = @('-c:v', 'h264_amf', '-usage', 'transcoding', '-quality', 'balanced', '-profile:v', 'high') + $tools + $h264End
  $cases['gpu-h264-high-quality-candidate'] = @('-c:v', 'h264_amf', '-usage', 'transcoding', '-quality', 'high_quality', '-profile:v', 'high') + $tools + $analysis + @('-bf', '2') + $h264End
}
if ($Vendor -eq 'intel') {
  $lookahead = @('-extbrc', '1', '-look_ahead_depth', '40', '-adaptive_i', '1', '-adaptive_b', '1', '-b_strategy', '1', '-bf', '7')
  # GPU HEVC as ClipPress runs it: Max quality on the card (only without x265), Quality and Fast.
  $cases['gpu-hevc-max'] = @('-c:v', 'hevc_qsv', '-preset', 'veryslow', '-profile:v', 'main', '-g', "$gop") + $lookahead + @('-pix_fmt', 'nv12', '-tag:v', 'hvc1') + $win
  $cases['gpu-hevc-quality'] = @('-c:v', 'hevc_qsv', '-preset', 'slower', '-profile:v', 'main', '-g', "$gop") + $lookahead + @('-pix_fmt', 'nv12', '-tag:v', 'hvc1') + $win
  $cases['gpu-hevc-fast'] = @('-c:v', 'hevc_qsv', '-preset', 'fast', '-profile:v', 'main', '-g', "$gop", '-pix_fmt', 'nv12', '-tag:v', 'hvc1') + $win
  # GPU H.264.
  $cases['gpu-h264-quality'] = @('-c:v', 'h264_qsv', '-preset', 'slower', '-profile:v', 'high', '-bitrate_limit', '0', '-g', "$gop") + $lookahead + @('-pix_fmt', 'nv12') + $win
  $cases['gpu-h264-fast'] = @('-c:v', 'h264_qsv', '-preset', 'fast', '-profile:v', 'high', '-bitrate_limit', '0', '-g', "$gop", '-pix_fmt', 'nv12') + $win
}
# CPU HEVC (x265) for a card without HEVC, or Use the GPU off.
$cases['cpu-x265-quality'] = @('-c:v', 'libx265', '-preset', 'fast', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-x265-params', "keyint=${gop}:no-sao=1:rdoq-level=2:psy-rdoq=1.0:log-level=error", '-tag:v', 'hvc1') + $win
$cases['cpu-x265-fast'] = @('-c:v', 'libx265', '-preset', 'veryfast', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-x265-params', "keyint=${gop}:log-level=error", '-tag:v', 'hvc1') + $win

# Two-pass CPU cases: pass 1 arguments, then pass 2, and the option that names their shared stats file.
$x264q = 'aq-mode=3:aq-strength=0.85:deblock=-1,-1:rc-lookahead=28:me=umh:subme=7:ref=3'
$twoPass = [ordered]@{
  # Max quality for HEVC (the default) as ClipPress runs it.
  'cpu-x265-max' = @{
    p1 = @('-c:v', 'libx265', '-preset', 'slow', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-x265-params', "keyint=${gop}:no-sao=1:no-slow-firstpass=1:log-level=error") + $win
    p2 = @('-c:v', 'libx265', '-preset', 'slow', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-x265-params', "keyint=${gop}:no-sao=1:log-level=error", '-tag:v', 'hvc1') + $win
    stats = '-x265-stats'
  }
  # Max quality for H.264.
  'cpu-x264-max' = @{
    p1 = @('-c:v', 'libx264', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-x264-params', $x264q) + $win
    p2 = @('-c:v', 'libx264', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-x264-params', $x264q) + $win
    stats = '-passlogfile'
  }
  # Max quality for AV1, for reference.
  'cpu-svt-av1-max' = @{
    p1 = @('-c:v', 'libsvtav1', '-preset', '5', '-pix_fmt', 'yuv420p', '-b:v', "${Kbps}k", '-svtav1-params', "tune=0:keyint=${gop}")
    p2 = @('-c:v', 'libsvtav1', '-preset', '5', '-pix_fmt', 'yuv420p', '-b:v', "${Kbps}k", '-svtav1-params', "tune=0:keyint=${gop}")
    stats = '-passlogfile'
  }
}

function Measure-Vmaf($file) {
  # libvmaf takes the encode first and the reference second (a blurred copy scores 7 that way round, 100 the other).
  & $VmafFfmpeg -v error -i $file -i ref.mkv -lavfi "[0:v]setpts=PTS-STARTPTS[d];[1:v]setpts=PTS-STARTPTS[r];[d][r]libvmaf=n_threads=$([Environment]::ProcessorCount):log_fmt=json:log_path=vmaf.json" -f null - 2>$null
  $j = Get-Content vmaf.json -Raw | ConvertFrom-Json
  $scores = $j.frames | ForEach-Object { $_.metrics.vmaf } | Sort-Object
  $p5 = $scores[[math]::Max(0, [int]($scores.Count * 0.05) - 1)]
  return @([math]::Round($j.pooled_metrics.vmaf.mean, 2), [math]::Round($p5, 2))
}

function Add-Row($name, $seconds) {
  if (-not (Test-Path "$name.mp4")) { Write-Host "$name failed (this card or driver may not take these settings)"; return }
  $kb = [math]::Round((Get-Item "$name.mp4").Length * 8 / $Seconds / 1000)
  $v = Measure-Vmaf "$name.mp4"
  $row = [pscustomobject]@{ Case = $name; Kbps = $kb; Seconds = [math]::Round($seconds, 1); VMAF = $v[0]; Worst5 = $v[1] }
  $script:rows += $row
  $row | Format-Table -HideTableHeaders
}

$rows = @()
foreach ($name in $cases.Keys) {
  Remove-Item "$name.mp4" -ErrorAction SilentlyContinue
  $sw = [Diagnostics.Stopwatch]::StartNew()
  & $Ffmpeg -v error -y -i ref.mkv -an $cases[$name] -movflags +faststart "$name.mp4"
  $sw.Stop()
  Add-Row $name $sw.Elapsed.TotalSeconds
}
if (-not $GpuOnly) {
  foreach ($name in $twoPass.Keys) {
    $c = $twoPass[$name]
    Remove-Item "$name.mp4" -ErrorAction SilentlyContinue
    $sw = [Diagnostics.Stopwatch]::StartNew()
    & $Ffmpeg -v error -y -i ref.mkv -an @($c.p1) -pass 1 $c.stats "$name.stats" -f null NUL
    & $Ffmpeg -v error -y -i ref.mkv -an @($c.p2) -pass 2 $c.stats "$name.stats" -movflags +faststart "$name.mp4"
    $sw.Stop()
    Remove-Item "$name.stats*" -ErrorAction SilentlyContinue
    Add-Row $name $sw.Elapsed.TotalSeconds
  }
}
"`nTarget ${Kbps} kb/s, ${fps} fps, ${Seconds} s from ${Start} s of $Recording ($Vendor)"
$rows | Format-Table -AutoSize
$rows | Export-Csv -NoTypeInformation results.csv
"Saved results.csv."
