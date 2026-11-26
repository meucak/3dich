# 3dich — 3D Printer Modding, SolidCraft CAD & Gemini AI Studio

> Ultra-optimized, zero-dependency WebGL2 / WebGL1 / Software Canvas2D 3D printer customization studio with **59 real-world engineered mods**, **7 printer platforms**, **off-thread SolidCraft CAD import**, **real-time kinematics & resonance physics**, and **multimodal Gemini Vision + 3D Studio Render generation**.

Live Web App (GitHub Pages): **https://meucak.github.io/3dich/**

---

## Core Engineering Highlights

### 1. Extreme 3D Performance Architecture (Zero External Runtime Libraries)
- **5-Draw-Call Batched Printer Engine:** All 7 base 3D printers and all 59 procedural mods compile into 5 kinematic batches (`staticFrame`, `transparent`, `yGroup`, `toolheadGroup`, `zGroup`).
- **UNORM16 Quantized Custom Meshes & Zero-Byte Normals:** Imported SolidCraft `.stl` / `.obj` / `.3mf` meshes are quantized to 6 bytes/vertex (`Uint16Array`) with screen-space `dFdx/dFdy` analytic normals (**>67% VRAM savings**) and **4096-triangle chunked frustum culling**.
- **Pure On-Demand Render Loop (`0.0% Idle CPU/GPU`):** `requestAnimationFrame` halts completely once camera inertia settles or motion simulation pauses.
- **Tri-Tier Rendering Fallback:** Automatically cascades `WebGL2` → `WebGL1` → `SW-2D` (software painter/Z-sort Canvas2D) so it renders cleanly even on legacy GPUs or `--disable-gpu` environments.
- **Off-Thread Web Worker CAD Parsing:** Binary/ASCII STL (with binary `"solid "` header trap protection), OBJ, 3MF (ZIP-deflate + XML), ZIP, and SolidCraft `.sc` archives parse in a dedicated Web Worker with zero-copy `Transferable` buffers.

### 2. 172 Real-World 3D Printers × 59 Engineered Mods × 6 Curated Presets
- **Searchable 172-Printer Database (`docs/js/printers_db.js`):** Creality (Ender-3 Classic, Ender-3 Pro, Ender-3 V2/Neo/S1/V3 SE/KE/CoreXZ, Ender-5, CR-10, K1/K1C/K1 Max/K2 Plus), Prusa (MK2S, MK3S+, MK4S, MINI+, XL, CORE One), Bambu Lab (A1 Mini, A1, P1P, P1S, X1C, X1E, H2D, H2S), Voron (V0.2, Switchwire, Trident, 2.4 R2, Tridex), RatRig V-Core 3.1/4, VzBot AWD, Anycubic (i3 Mega, Kobra 1/2/3/S1), Elegoo (Neptune 2/3/4, Centauri Carbon), Sovol (SV01–SV08), QIDI Tech (X-Max 3, Q1 Pro, Plus4), Artillery Sidewinder, FlashForge AD5M, UltiMaker, FLSUN Delta (Q5, QQ-S, SR, V400, T1 Pro, S1 Pro), Anet A8, Tevo, Kingroon, Tronxy, TwoTrees, BIQU, Snapmaker, Raise3D, LulzBot, and **Custom Scratch-Build** — rendered across 4 true procedural 3D chassis architectures (`cube`, `gantry`, `cantilever`, and 3-tower `delta`)!
- **10 Mod Categories (59 Mods):**
  1. *Hotend & Extrusion:* Phaetus Rapido 2 UHF, E3D Revo HF, Slice Mosquito Magnum+ (450°C), CHC Pro, Closed-Loop Watercooled Hotend, Orbiter V2.0, Galileo 2 (G2E)
  2. *Cooling & Airflow:* Voron StealthBurner, Dragon Burner Dual-4010, Hero Me Gen 7 Dual-5015, External CPAP 6.5 kPa Turbo + Hose, Side 120mm Aux Fan, Rear PWM Exhaust
  3. *Motion & Frame:* Hiwin MGN12H Linear Rails, Hollow Carbon Fiber X-Beam, AWD 4-Motor CoreXY, 48V TMC5160 FOC, Dual Belted-Z, 45° CNC Frame Braces, Silicone Bed Mounts, Concrete Paver + Sorbothane Feet
  4. *Probing & Bed:* Beacon/Cartographer Eddy Scanner, Voron Tap, Klicky Dock, Onboard ADXL345, Textured PEI + CryoGrip Pro, 8mm Cast MIC-6 + 750W AC Heater
  5. *Electronics & FW:* Raspberry Pi 5 + Klipper, BTT EBB36 CANbus, BTT Octopus Pro 8-Axis, 5" KlipperScreen HMI, KNOMI V2 Toolhead Eye, Articulated Cable Drag Chains
  6. *Enclosure & Thermal:* Polycarbonate Panels + Magnetic Doors, Nevermore Micro V6 Carbon VOC Scrubber, Ellis Under-Bed Fans, Active 300W PTC Chamber Heater, Vented Top-Hat Riser, Flame-Retardant Acoustic Liner
  7. *Multi-Material & Toolchanging:* BoxTurtle 4-Lane MMU, ERCF V2 8-Lane, StealthChanger 4-Dock Toolchanger, Filametrix Filament Cutter, Rear Purge Bucket + Brass Nozzle Scrubber
  8. *Filament & Dryboxes:* Active 55°C Dual-Spool Drybox, 608ZZ Bearing Roller, BTT SFS V2.0 Tangle Sensor, Spoolman NFC + Load Scale
  9. *Monitoring & Safety:* OV5648 Micro Nozzle-Cam, Wide-Angle Corner Cam, 5000K + Status NeoPixel Bar, Smoke & Thermal Cutoff Relay, Front Tool Drawer, Magnetic Build Plate Rack
  10. *Exotic & Maker:* Quick-Swap 10W Diode Laser, Spring-Loaded Pen/PCB Plotter, 45° Infinite-Z Conveyor Belt, Extended Non-Planar Conical Nozzle, Print-Farm Auto-Eject Chute

### 3. SolidCraft MCP & CAD Integration
- **Direct Import:** Drag-and-drop `.stl`, `.obj`, `.3mf`, `.zip`, or paste (`Ctrl+V`) meshes directly onto the printer.
- **Native `.sc` Archive Inspector:** Dropping a SolidCraft `.sc` file extracts `document.json` (components, parameters, joints) + embedded thumbnail and generates a ready-to-run `file.export` MCP command.
- **12 Engineered Hardpoints & 3D Transform Gizmo:** Snap parts to toolhead, X-carriage, bed edge, gantry, or 2020 frame extrusions; drag X/Y/Z Translate (`G`), Rotate (`R`), or Scale (`S`) handles directly in 3D.
- **SolidCraft MCP Prompt & Command Builder:** Pick any hardpoint to copy exact bolt patterns (MGN12H 20×20mm, 2020 T-slot, NEMA17 31×31mm, StealthBurner 26×26mm, KIZAK_STD_V1 dovetail) and safe clearance specs.

### 4. Real-Time Physics, Collision & Klipper Engine
- Calculates X/Y/Z moving mass, natural resonant frequencies ($f_X, f_Y$), Input Shaper Bode/PSD resonance spectrum (10–120 Hz), volumetric flow vs. cooling vs. motion bottlenecks, 3DBenchy print-time delta, filament thermal compatibility matrix (PLA through PEEK), PSU headroom, dBA noise, 3D AABB collisions, and thermal softening risk (e.g., PLA near hotend or inside a heated chamber).
- One-click export for tailored **Klipper `printer.cfg`**, **BOM CSV**, **Project JSON**, **3D Viewport PNG**, and **Merged Custom Parts Binary STL**.

### 5. Latest 2026 Gemini API + Zero-Trust Antigravity (`AGY Kasa` & `AGY Toshi`)
- **Latest 2026 Gemini Models + Live Discovery:** Supports `gemini-3.8-flash`, `gemini-4-carbon`, `gemini-4-argon`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-image`, `gemini-3-pro-image`, `imagen-4.0-generate-001`, plus a live **"Fetch Live Models"** (`ListModels`) button and automatic 404 fallback chain.
- **Zero-Trust Hardened `AGY Kasa` & `AGY Toshi` Bridges (`scripts/agy_secure_bridge.py`):**
  - Never binds `0.0.0.0` — strictly loopback + Tailscale WireGuard + micro-segmented `10.89.99.0/24` Docker subnet (public Internet and LAN Wi-Fi blocked with `403`).
  - 256-bit high-entropy Bearer token (`chmod 0600`, retrieved locally via `3dich token`, constant-time `hmac.compare_digest` verification on every endpoint including `/health`).
  - Strict CORS Origin allowlist (never `*`), 5-strike 15-minute brute-force IP lockout, sliding-window rate limit, max-2 concurrency cap, PNG magic-byte verification, and sandboxed `--disable-slash-commands --sandbox --print=<prompt>` CLI execution inside an isolated `0700` temp directory.

---

## Quick Start

### Option A — Terminal Launcher (Kasa & Toshi)
```bash
3dich           # Starts Docker if needed and opens 3dich studio
3dich status    # Check Docker container + Zero-Trust AGY bridge health
3dich token     # Print your private 256-bit AGY bridge token
```

### Option B — Web / GitHub Pages (Zero Install)
Open **https://meucak.github.io/3dich/** in any modern desktop, tablet, or mobile browser. Works offline as an installable PWA.

### Option B — Local Docker Compose (with Local SolidCraft Library Bridge)
```bash
docker compose up -d --build
# Open http://localhost:8099
```

### Running Tests
```bash
# Unit & Server tests
docker run --rm -v "$PWD:/app" -w /app node:22-alpine sh -c \
  "node tests/unit/test_physics.mjs && node tests/unit/test_parsers.mjs && node tests/unit/test_gemini.mjs && node tests/server/test_server.mjs"
```

---

## Keyboard Shortcuts
- `1`–`5`: Camera views (Iso, Front, Side, Top, Toolhead) • `F`: Frame printer
- `Space`: Toggle live kinematic motion simulation
- `G` / `R` / `S`: Transform Gizmo (Translate / Rotate / Scale) • `Delete`: Remove selected part
- `Ctrl+Z` / `Ctrl+Y`: Undo / Redo • `Ctrl+V`: Paste STL/OBJ file or text
