# GPU-accelerated exports

ClipPress uses the graphics card automatically. The bundled FFmpeg includes the NVIDIA
(NVENC), AMD (AMF) and Intel (Quick Sync) encoders, and each needs only the normal graphics
driver, so there is nothing extra to install. Each encoder is tested by opening it once (the answer is kept
until the graphics card, its driver, FFmpeg or ClipPress changes), because a card can be present without an
AV1 or HEVC encoder.

## Which encoder a target-size export uses

**Settings > Export > Video format** picks the codec the size presets make:

- **HEVC** (the default) plays and saves on every iPhone and Android phone, and plays on every PC with an HEVC
  decoder (Discord's app plays video on the graphics card only: GTX 970/980 and older cards, Intel graphics before
  the 6th generation and most virtual machines show a still picture).
- **H.264** plays anywhere, old PCs included, a little less sharp.
- **AV1** can be a little sharper at the same size, but an iPhone's Photos won't save it, and iPhones before the
  15 Pro can't play it.

Where several GPUs are present, NVIDIA is preferred, then AMD, then Intel.

HEVC (every step stays phone-safe, never AV1):

| Preset | First choice | Without GPU HEVC | Without any GPU encoder |
| --- | --- | --- | --- |
| Max Quality | CPU HEVC (x265 `slow`) 2-pass | (unchanged) | (unchanged) |
| Quality | GPU HEVC | x265 `fast` on 8+ CPU threads, otherwise GPU H.264 | x265 `fast` |
| Fast | GPU HEVC | GPU H.264 | x265 `veryfast` |

H.264: GPU H.264 for Quality and Fast (x264 without one), x264 `slow` 2-pass for Max Quality.

AV1 (as before HEVC became the default):

| Preset | First choice | Without GPU AV1 | Without GPU AV1 or HEVC | Without any GPU encoder |
| --- | --- | --- | --- | --- |
| Max Quality | CPU AV1 (SVT-AV1) 2-pass | (unchanged) | (unchanged) | (unchanged) |
| Quality | GPU AV1 | GPU HEVC | CPU AV1 on 8+ CPU threads, otherwise GPU H.264 | CPU AV1 |
| Fast | GPU AV1 | GPU HEVC | GPU H.264 | CPU AV1 (fast preset), then CPU H.264 |

x265's settings were measured on 1080p60 game footage at 5 Mbps (VMAF, three games, same size): Quality's `fast`
with slow's psychovisual RDOQ is 1.3-3.1 sharper than plain `fast`, in `medium`'s time; SAO is off (never worse).
Max Quality's first pass uses x265's quicker settings: the same result in a third less time. Every HEVC export is
Main profile, tagged `hvc1` (Apple's players and Photos need it), in H.264's tight bitrate window.

Both 2-pass encoders are real ones with the bundled FFmpeg (9.0): the second pass reads the first pass's statistics,
puts the bits where the clip needs them and lands just under the target size. (FFmpeg before 8.1 couldn't pass those
statistics to SVT-AV1, so its "2-pass" was one pass done twice; one without `-x265-stats` gets one x265 pass.)

A clip that already fits is copied as it is only when phones take its codec: H.264 or HEVC (and AV1 with AV1
chosen; only H.264 with H.264 chosen), 8-bit 4:2:0. An HEVC copy, and an HEVC recording cut to MP4 or MOV with
Original quality, is tagged `hvc1` too.

In Custom settings, the **AV1 GPU**, **HEVC GPU** and **H.264 GPU** choices use whichever vendor is present, mapping
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
