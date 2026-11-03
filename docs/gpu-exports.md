# GPU-accelerated exports

ClipPress uses the graphics card automatically. The bundled FFmpeg includes the NVIDIA
(NVENC), AMD (AMF) and Intel (Quick Sync) encoders, and each needs only the normal graphics
driver, so there is nothing extra to install. Each encoder is tested by opening it once
(cached for five minutes), because a card can be present without an AV1 encoder.

## Which encoder a target-size export uses

AV1 encoding needs an NVIDIA RTX 40-series, AMD RX 7000-series, Intel Arc or newer GPU. Older cards
(GTX 900 to RTX 30, RX 400 to RX 6000, 6th-gen Intel and newer) encode HEVC instead, which is about as
quick as H.264 and much sharper at the same size; Discord plays HEVC on desktop and the web. Where several
GPUs are present, NVIDIA is preferred, then AMD, then Intel.

| Preset | First choice | Without GPU AV1 | Without GPU AV1 or HEVC | Without any GPU encoder |
| --- | --- | --- | --- | --- |
| Max Quality | CPU AV1 (SVT-AV1) 2-pass | (unchanged) | (unchanged) | (unchanged) |
| Quality | GPU AV1 | GPU HEVC | CPU AV1 on 8+ CPU threads, otherwise GPU H.264 | CPU AV1 |
| Fast | GPU AV1 | GPU HEVC | GPU H.264 | CPU AV1 (fast preset), then CPU H.264 |

Max Quality's 2-pass is a real one with the bundled FFmpeg (9.0, SVT-AV1 4.2): the second pass reads
the first pass's statistics, puts the bits where the clip needs them and lands within about 1% of the
target size. (FFmpeg before 8.1 couldn't pass those statistics to SVT-AV1, so its "2-pass" was one pass
done twice.)

In Custom settings, the **AV1 GPU** and **H.264 GPU** choices use whichever vendor is present, mapping
the **Speed** setting (p1–p7) to the vendor's own scale. NVIDIA **2-pass** now runs as one encode with the
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

Each GPU encoder has tuned settings (look-ahead, adaptive quantisation, B-frames: what NVIDIA, AMD and
Intel recommend) and basic ones every driver accepts. The first export check tries both, and an older card
or driver that turns the tuned ones down gets the basic ones.

If an export fails, ClipPress retries it with CPU decoding, then with the same encoder's basic settings,
then (for the size presets and regular exports) on the next encoder in line, and skips a failed encoder
for the rest of the session once another one worked. Cancelling and a full disk are never retried, and an
encoder picked in Custom settings keeps to it (its basic settings included).

AMD's AV1 encoder on RX 7000 cards and current Ryzen chips pads the picture to blocks of 64×16 pixels,
which players show as black bars, so its exports are sized to those blocks (scaled a little, at most a few
pixels cropped from the middle).

Turning off **Settings > Export > Use the GPU** keeps every export off the graphics card: decoding,
regular exports and the target-size presets, which then choose from the CPU encoders. An encoder picked
in Custom settings is still used.
