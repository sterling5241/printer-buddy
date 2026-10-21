# Printer Buddy (Lite, remote mode)

A self-hosted printer monitor that runs on a separate box on your LAN (a Pi, NAS or home server).
**Nothing is installed on the printers.** It finds Moonraker printers on the network, you choose
which ones to monitor, and it subscribes to only those over Moonraker's WebSocket API.

## Install (Pi / any Debian box on the same network as your printers)

```bash
git clone https://github.com/sterling5241/printer-buddy.git
cd printer-buddy
./install.sh            # makes a venv, installs deps, sets up the printer-buddy systemd service
```

Then open `http://<box-ip>:8080`. Settings (notifications, subnets) live in `printer-buddy.env`.

**Port:** Printer Buddy uses 8080. If something else already has it (often the webcam streamer on
Klipper boxes), the installer says what's using it and offers the next free port. Change it later
with **P) Change port** in the menu, or `./install.sh -y --port 8081` (the port must be free).

## Update

```bash
cd printer-buddy && ./update.sh     # git pull + restart
```

Logs: `journalctl -u printer-buddy -f`.
Docker is still supported if you want it: `docker compose -f docker/docker-compose.yml up -d --build`.

## AI failure detection

Printer Buddy's own model scores camera snapshots for spaghetti, warping, first-layer problems,
stringing, blobs and cracks. See **[docs/AI.md](docs/AI.md)** for how it works, test results and
limits ([credits](#credits) are at the bottom). Models: [releases tagged `ai-`](https://github.com/sterling5241/printer-buddy/releases?q=ai-&expanded=true).

## How it works

1. **Scan network** sweeps the box's /24 on ports 7125 and 80 and listens for Moonraker's mDNS
   (`_moonraker._tcp`). Each hit is confirmed with `/server/info`. **It only lists printers; it doesn't connect to any.**
2. You **tick the printers you want** (adding an API key if Moonraker has auth turned on) and click *Add selected*.
   Printers the scan missed can be added with *Add by IP*.
3. For each printer you picked, the box keeps one WebSocket open to `/websocket`, calls `server.connection.identify`,
   then `printer.objects.subscribe` (print_stats, extruder, heater_bed, display_status, virtual_sdcard, webhooks).
   It reconnects with backoff and re-subscribes on `notify_klippy_ready`.
4. The dashboard updates live via Server-Sent Events. Webcam snapshots come from `server.webcams.list`
   and are proxied through the box.
5. Print started, paused, resumed, finished, failed and cancelled events go to ntfy and/or Discord.

## Config (env vars)

| Var | Default | |
|---|---|---|
| `DB_PATH` | `data/monitor.db` | SQLite file holding the printers you picked |
| `SCAN_SUBNETS` | auto (/24 of this box) | comma list, e.g. `192.168.1.0/24,192.168.2.0/24` |
| `PROBE_PORTS` | `7125,80` | ports tried during the sweep |
| `NTFY_URL` / `NTFY_TOKEN` | — | e.g. `https://ntfy.sh/my-printers` |
| `DISCORD_WEBHOOK` | — | Discord webhook URL |
| `NOTIFY_EVENTS` | all | `started,paused,resumed,finished,failed,cancelled` |

## Moonraker side

Nothing is installed on the printer. If Moonraker restricts access, either add this box's IP to
`[authorization] trusted_clients` in `moonraker.conf` or paste an API key when adding the printer.
For mDNS discovery, enable `[zeroconf]` in `moonraker.conf`; the subnet sweep works either way.

## Layout

```
app/main.py              HTTP API + SSE
app/core/                SQLite store, stdlib async HTTP + WebSocket client, ntfy / Discord alerts
app/printers/            Moonraker client, printer manager (events, fan-out), mDNS + subnet discovery
app/ai/                  failure detection, photo collection, model downloads
app/media/               timelapse recording
ui/                      web UI (served at /static/): core/ builder, panels/ one folder per panel
docs/                    AI.md
docker/                  Dockerfile + docker-compose.yml
relay/                   Cloudflare worker (share links + news)
```
Each folder has a README.txt saying what's in it.

## API

`POST /api/scan` · `POST /api/probe {host,port?,api_key?}` · `GET/POST /api/printers` ·
`PATCH/DELETE /api/printers/{id}` · `GET /api/printers/{id}/snapshot` · `GET /api/events` (SSE) ·
`POST /api/notify/test`

## Credits

### Bundled libraries (web UI, in `ui/vendor/`)

- [Apache ECharts](https://echarts.apache.org) - Apache-2.0, © The Apache Software Foundation - charts
- [ECharts GL](https://github.com/ecomfe/echarts-gl) - BSD-3-Clause, © 2017 Baidu Inc. - 3D bed mesh
- [three.js](https://threejs.org) - MIT, © 2010-2022 three.js authors - 3D G-code preview

### Python packages

- [Starlette](https://www.starlette.io) (BSD-3-Clause), [Uvicorn](https://www.uvicorn.org) (BSD-3-Clause), [python-zeroconf](https://github.com/python-zeroconf/python-zeroconf) (LGPL-2.1)
- AI detection: [ONNX Runtime](https://github.com/microsoft/onnxruntime) (MIT), [NumPy](https://numpy.org) (BSD-3-Clause), [Pillow](https://python-pillow.org) (MIT-CMU)

### Reference

- [Fluidd](https://github.com/fluidd-core/fluidd) and [Mainsail](https://github.com/mainsail-crew/mainsail) (both GPL-3.0) - used as a reference for how features behave and look. **No code is copied.**

### AI datasets

Thank you to everyone who published these. We **resized, relabelled and merged** the images;
nothing here is endorsed by the original authors.

| Dataset | Author | License | Images used |
|---|---|---|---|
| [3D printing defects](https://universe.roboflow.com/hnnm/3d-printing-defects-eavhn) | hnnm (Roboflow) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | 16,133 |
| [3D printing error](https://universe.roboflow.com/cameteam/3d-printing-error-cv8ue) | cameteam (Roboflow) | MIT | 4,274 |
| [3DPrintFail](https://universe.roboflow.com/minedorothy/3dprintfail) | minedorothy (Roboflow) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | 4,347 |
| [3D print fail detection](https://universe.roboflow.com/detection-y0hrz/3d-print-fail-detection) | detection-y0hrz (Roboflow) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | 2,058 |
| [3Dprint3](https://universe.roboflow.com/edison-jyxbh/3dprint3) | edison-jyxbh (Roboflow) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | 1,372 |
| [3d-ho5at](https://universe.roboflow.com/automatisierung-projekt-aajut/3d-ho5at) | automatisierung-projekt-aajut (Roboflow) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | 3,493 |
| [FDM defects](https://universe.roboflow.com/defects-of-3d-printing/fdm-sw9eb) | defects-of-3d-printing (Roboflow) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | 3,888 |
| [3dprinting](https://universe.roboflow.com/additive-manufacturing-qa/3dprinting) | additive-manufacturing-qa (Roboflow) | Public Domain | 692 |
| [3D printing errors](https://www.kaggle.com/datasets/mikulhe/3d-printing-errors) | mikulhe (Kaggle) | see dataset page | 388 |
| [3D printing success/failure (finetuned)](https://www.kaggle.com/datasets/bshaurya/3d-printing-success-failure-dataset-finetuned) | bshaurya (Kaggle) | see dataset page | 327 |
| [Defect 3D printing](https://www.kaggle.com/datasets/muhammadmeftahmafazy/defect-3d-printing) | muhammadmeftahmafazy (Kaggle) | see dataset page | 635 |
| [3D printing errors](https://www.kaggle.com/datasets/nimbus200/3d-printing-errors) | nimbus200 (Kaggle) | see dataset page | 2,000 (of 17,883) |

"Images used" is before duplicates were removed. Several sets share images, so the final dataset is smaller.

### AI datasets added for the next model (`basic-v2`)

| Dataset | Author | License |
|---|---|---|
| [3D FDM faults detection](https://universe.roboflow.com/wangdada/3d_fdm_faults_detection-krkkr) | wangdada (Roboflow) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| [3Dprinting](https://universe.roboflow.com/hnnm/3dprinting-32nsa) | hnnm (Roboflow) | Public Domain |
| [KS1 full dataset](https://github.com/mann1x/anycubic/releases/tag/datasets%2Fks1-full) | mann1x (Anycubic Kobra S1 camera, from BigEdge-FDM-Models) | none stated - credited here; ask the author before a model trained on it is released |

Plus photos shared by Printer Buddy users through **Help improve the AI**.

### AI ideas

- [PrintGuard](https://github.com/oliverbravery/PrintGuard) by Oliver Bravery (GPL-2.0) - showed that
  a small, fast model on a Pi works, and the "hold for a while before acting" alert idea. Its list of
  datasets pointed us to several of the sets above. **No PrintGuard code or model is used.**

### AI software

- [PyTorch / torchvision](https://github.com/pytorch/vision) (BSD-3-Clause) - MobileNetV3 and training
- MobileNetV3 starting weights trained on [ImageNet](https://www.image-net.org/) (ImageNet's terms are for research use; check them before any commercial use)
- [ONNX](https://github.com/onnx/onnx) and [ONNX Runtime](https://github.com/microsoft/onnxruntime) (Apache-2.0 / MIT) - running the model
- [Roboflow](https://roboflow.com) and [Kaggle](https://www.kaggle.com) - dataset hosting
