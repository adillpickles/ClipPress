# GPU-accelerated exports

ClipPress uses the graphics card automatically. The bundled FFmpeg includes the NVIDIA
(NVENC), AMD (AMF) and Intel (Quick Sync) encoders, and each needs only the normal graphics
driver, so there is nothing extra to install. Each encoder is tested by opening it once
(cached for five minutes), because a card can be present without an AV1 encoder.

## Which encoder a target-size export uses

AV1 encoding needs an NVIDIA RTX 40-series, AMD RX 7000-series, Intel Arc or newer GPU.
Where several GPUs are present, NVIDIA is preferred, then AMD, then Intel.

| Preset | First choice | Without GPU AV1 | Without any GPU encoder |
| --- | --- | --- | --- |
| Max Quality | CPU AV1 (SVT-AV1) 2-pass | (unchanged) | (unchanged) |
| Quality | GPU AV1 | CPU AV1 on 8+ CPU threads, otherwise GPU H.264 | CPU AV1 |
| Fast | GPU AV1 | GPU H.264 | CPU AV1 (fast preset), then CPU H.264 |

In Custom settings, the **AV1 GPU** and **H.264 GPU** choices use whichever vendor is present, mapping
the p1–p7 preset to the vendor's own scale. NVIDIA **2-pass** now runs as one encode with the
encoder's full multipass: FFmpeg 2-pass logs do nothing for hardware encoders, so the old second
run produced an identical file. That removed 24–42% of the time in benchmarks at the same size
and quality.

## Regular exports and GPU decoding

A regular export that must re-encode (text, speed or crop) uses the GPU's H.264 encoder in a
quality mode, falling back to x264. On a 30-second 1080p60 clip this took 5.4 s instead of 20.1 s.

Video is also decoded on the GPU (D3D11VA, Windows) and handed back to the CPU filters, so crop,
speed, text and scaling behave exactly as before. Measured on 1440p60 HEVC:

| Export | 4 CPU threads | 8 threads | 16 threads |
| --- | --- | --- | --- |
| Single clip | 12.4 s → 7.2 s | 6.8 s → 6.0 s | unchanged |
| 3-clip merge | 7.8 s → 5.0 s | slower | slower |

Merges therefore decode on the GPU only on CPUs with fewer than 8 threads, and only while the
inputs fit a video-memory budget (each open decoder holds about 250 MB at 1440p).

## When the GPU fails

If an export fails, ClipPress retries it with CPU decoding, then (for Simple presets and regular
exports) on the next encoder in line, and skips a failed encoder for the rest of the session.
Cancelling is never retried, and an encoder picked in Custom settings reports its error instead.

**Settings → Use the GPU to speed up exports** turns off GPU decoding and GPU encoding for regular
exports. Target-size presets keep choosing their encoder as above; to force a CPU encoder, pick one in
Custom settings.
