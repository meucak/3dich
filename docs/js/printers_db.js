// 3dich — Comprehensive 155 Real-World 3D Printer Database
// From legendary classics (Creality Ender-3, Ender-3 Pro, CR-10, Anet A8, Prusa MK2S/MK3S+, i3 Mega)
// to modern CoreXY, CoreXZ, Cantilever, IDEX & Delta speed monsters (Bambu H2D/X1C/A1, Voron 2.4/Trident/V0.2,
// RatRig V-Core 4, VzBot AWD, Creality K2 Plus/Ender-3 V3, Prusa MK4S/CORE One/XL, FLSUN T1 Pro/V400, QIDI Plus4, Sovol SV08).

// Compact tuple schema:
// [id, name, vendor, kinLabel, bedX, bedY, bedZ, directDrive, maxFlow, accelStock, isKlipper, enclosed, priceUsd, flags]
// flags: 'delta' | 'cantilever' | 'cube' | 'gantry' | 'rails' | 'awd' | 'idex' | 'custom'
const RAW_PRINTERS = [
  // ================= CREALITY (30 models) =================
  ['creality_ender3',          'Creality Ender-3 (Classic)',         'Creality', 'Cartesian',      220, 220, 250, 0, 11,  500, 0, 0,  169, 'gantry'],
  ['creality_ender3_pro',      'Creality Ender-3 Pro',               'Creality', 'Cartesian',      220, 220, 250, 0, 12,  550, 0, 0,  199, 'gantry'],
  ['creality_ender3_v2',       'Creality Ender-3 V2',                'Creality', 'Cartesian',      220, 220, 250, 0, 12,  700, 0, 0,  229, 'gantry'],
  ['creality_ender3_v2_neo',   'Creality Ender-3 V2 Neo',            'Creality', 'Cartesian',      220, 220, 250, 0, 13,  800, 0, 0,  249, 'gantry'],
  ['creality_ender3_neo',      'Creality Ender-3 Neo',               'Creality', 'Cartesian',      220, 220, 250, 0, 12,  600, 0, 0,  199, 'gantry'],
  ['creality_ender3_max',      'Creality Ender-3 Max',               'Creality', 'Cartesian',      300, 300, 340, 0, 12,  500, 0, 0,  289, 'gantry'],
  ['creality_ender3_max_neo',  'Creality Ender-3 Max Neo',           'Creality', 'Cartesian',      300, 300, 320, 0, 13,  700, 0, 0,  319, 'gantry'],
  ['creality_ender3_s1',       'Creality Ender-3 S1',                'Creality', 'Cartesian DD',   220, 220, 270, 1, 15, 1200, 0, 0,  289, 'gantry'],
  ['creality_ender3_s1_pro',   'Creality Ender-3 S1 Pro',            'Creality', 'Cartesian DD',   220, 220, 270, 1, 16, 1500, 0, 0,  349, 'gantry'],
  ['creality_ender3_s1_plus',  'Creality Ender-3 S1 Plus',           'Creality', 'Cartesian DD',   300, 300, 300, 1, 15, 1000, 0, 0,  399, 'gantry'],
  ['creality_ender3_v3_se',    'Creality Ender-3 V3 SE',             'Creality', 'Cartesian DD',   220, 220, 250, 1, 18, 2500, 0, 0,  199, 'gantry'],
  ['creality_ender3_v3_ke',    'Creality Ender-3 V3 KE',             'Creality', 'Cartesian IS',   220, 220, 240, 1, 22, 5000, 1, 0,  279, 'gantry,rails'],
  ['creality_ender3_v3',       'Creality Ender-3 V3 (CoreXZ)',       'Creality', 'CoreXZ',         220, 220, 250, 1, 24, 6500, 1, 0,  349, 'gantry,rails'],
  ['creality_ender3_v3_plus',  'Creality Ender-3 V3 Plus',           'Creality', 'CoreXZ',         300, 300, 330, 1, 24, 5500, 1, 0,  469, 'gantry,rails'],
  ['creality_ender5',          'Creality Ender-5',                   'Creality', 'Cube Cartesian', 220, 220, 300, 0, 12,  700, 0, 0,  279, 'cube'],
  ['creality_ender5_pro',      'Creality Ender-5 Pro',               'Creality', 'Cube Cartesian', 220, 220, 300, 0, 13,  800, 0, 0,  329, 'cube'],
  ['creality_ender5_plus',     'Creality Ender-5 Plus',              'Creality', 'Cube Cartesian', 350, 350, 400, 0, 13,  650, 0, 0,  549, 'cube'],
  ['creality_ender5_s1',       'Creality Ender-5 S1',                'Creality', 'Cube DD',        220, 220, 280, 1, 18, 2500, 0, 0,  429, 'cube'],
  ['creality_ender5_max',      'Creality Ender-5 Max (400mm)',       'Creality', 'CoreXY',         400, 400, 400, 1, 28, 7000, 1, 0,  749, 'cube,rails'],
  ['creality_cr10',            'Creality CR-10 (Classic)',           'Creality', 'Cartesian',      300, 300, 400, 0, 11,  500, 0, 0,  299, 'gantry'],
  ['creality_cr10s',           'Creality CR-10S',                    'Creality', 'Cartesian',      300, 300, 400, 0, 12,  550, 0, 0,  349, 'gantry'],
  ['creality_cr10s_pro_v2',    'Creality CR-10S Pro V2',             'Creality', 'Cartesian',      300, 300, 400, 0, 13,  650, 0, 0,  449, 'gantry'],
  ['creality_cr10_smart_pro',  'Creality CR-10 Smart Pro',           'Creality', 'Cartesian DD',   300, 300, 400, 1, 15, 1000, 0, 0,  549, 'gantry'],
  ['creality_cr10_se',         'Creality CR-10 SE',                  'Creality', 'Cartesian IS',   220, 220, 265, 1, 22, 5000, 1, 0,  349, 'gantry,rails'],
  ['creality_cr6_se',          'Creality CR-6 SE',                   'Creality', 'Cartesian',      235, 235, 250, 0, 13,  700, 0, 0,  329, 'gantry'],
  ['creality_k1',              'Creality K1',                        'Creality', 'CoreXY',         220, 220, 250, 1, 24, 6500, 1, 1,  449, 'cube,rails'],
  ['creality_k1_se',           'Creality K1 SE',                     'Creality', 'CoreXY',         220, 220, 250, 1, 24, 6500, 1, 0,  359, 'cube,rails'],
  ['creality_k1c',             'Creality K1C',                       'Creality', 'CoreXY',         220, 220, 250, 1, 26, 7500, 1, 1,  519, 'cube,rails'],
  ['creality_k1_max',          'Creality K1 Max',                    'Creality', 'CoreXY',         300, 300, 300, 1, 26, 7000, 1, 1,  749, 'cube,rails'],
  ['creality_k2_plus',         'Creality K2 Plus',                   'Creality', 'CoreXY',         350, 350, 350, 1, 32, 9000, 1, 1, 1299, 'cube,rails'],

  // ================= PRUSA RESEARCH (12 models) =================
  ['prusa_mk2s',               'Prusa i3 MK2S (Classic)',            'Prusa',    'Cartesian DD',   250, 210, 200, 1, 13,  800, 0, 0,  499, 'gantry'],
  ['prusa_mk3',                'Prusa i3 MK3',                       'Prusa',    'Cartesian DD',   250, 210, 210, 1, 15, 1000, 0, 0,  649, 'gantry'],
  ['prusa_mk3s',               'Prusa i3 MK3S+',                     'Prusa',    'Cartesian DD',   250, 210, 210, 1, 15, 1200, 0, 0,  699, 'gantry'],
  ['prusa_mk35',               'Prusa MK3.5 (Input Shaper)',         'Prusa',    'Cartesian IS',   250, 210, 210, 1, 18, 3000, 0, 0,  749, 'gantry'],
  ['prusa_mk39',               'Prusa MK3.9 (Nextruder)',            'Prusa',    'Cartesian IS',   250, 210, 220, 1, 22, 3500, 0, 0,  779, 'gantry'],
  ['prusa_mk4',                'Prusa MK4 (Input Shaper)',           'Prusa',    'Cartesian IS',   250, 210, 220, 1, 22, 3600, 0, 0,  799, 'gantry'],
  ['prusa_mk4s',               'Prusa MK4S (High-Flow IS)',          'Prusa',    'Cartesian IS',   250, 210, 220, 1, 26, 4200, 0, 0,  899, 'gantry'],
  ['prusa_mini_classic',       'Prusa MINI (Classic)',               'Prusa',    'Cantilever',     180, 180, 180, 0, 13, 1200, 0, 0,  399, 'cantilever'],
  ['prusa_mini',               'Prusa MINI+ (Input Shaper)',         'Prusa',    'Cantilever',     180, 180, 180, 0, 15, 2500, 0, 0,  459, 'cantilever'],
  ['prusa_xl',                 'Prusa XL (360mm CoreXY)',            'Prusa',    'CoreXY',         360, 360, 360, 1, 26, 6500, 0, 0, 1999, 'cube,rails'],
  ['prusa_core_one',           'Prusa CORE One',                     'Prusa',    'CoreXY',         250, 220, 270, 1, 28, 7500, 0, 1, 1199, 'cube,rails'],
  ['prusa_core_one_l',         'Prusa CORE One L (300mm)',           'Prusa',    'CoreXY',         300, 300, 300, 1, 30, 8000, 0, 1, 1599, 'cube,rails'],

  // ================= BAMBU LAB (9 models) =================
  ['bambu_x1',                 'Bambu Lab X1',                       'Bambu Lab','CoreXY',         256, 256, 256, 1, 26, 8000, 1, 1,  999, 'cube,rails'],
  ['bambu_x1c',                'Bambu Lab X1 Carbon',                'Bambu Lab','CoreXY',         256, 256, 256, 1, 28, 9000, 1, 1, 1199, 'cube,rails'],
  ['bambu_x1e',                'Bambu Lab X1E (Heated Chamber)',     'Bambu Lab','CoreXY',         256, 256, 256, 1, 28, 9000, 1, 1, 2499, 'cube,rails'],
  ['bambu_p1p',                'Bambu Lab P1P',                      'Bambu Lab','CoreXY',         256, 256, 256, 1, 26, 8000, 1, 0,  599, 'cube,rails'],
  ['bambu_p1s',                'Bambu Lab P1S',                      'Bambu Lab','CoreXY',         256, 256, 256, 1, 28, 8500, 1, 1,  699, 'cube,rails'],
  ['bambu_a1',                 'Bambu Lab A1',                       'Bambu Lab','Cartesian IS',   256, 256, 256, 1, 24, 5800, 1, 0,  399, 'gantry,rails'],
  ['bambu_a1_mini',            'Bambu Lab A1 Mini',                  'Bambu Lab','Cantilever IS',  180, 180, 180, 1, 22, 5500, 1, 0,  249, 'cantilever,rails'],
  ['bambu_h2d',                'Bambu Lab H2D (350mm Dual)',         'Bambu Lab','CoreXY',         350, 320, 325, 1, 34, 10000,1, 1, 1899, 'cube,rails'],
  ['bambu_h2s',                'Bambu Lab H2S (340mm)',              'Bambu Lab','CoreXY',         340, 320, 340, 1, 32, 9500, 1, 1, 1399, 'cube,rails'],

  // ================= VORON, RATRIG, VZBOT & ANNEX (17 models) =================
  ['voron_02',                 'Voron V0.2 (120mm Pocket)',          'Voron',    'CoreXY',         120, 120, 120, 1, 22, 8500, 1, 1,  520, 'cube,rails'],
  ['voron_switchwire',         'Voron Switchwire (CoreXZ)',          'Voron',    'CoreXZ',         250, 210, 240, 1, 22, 5200, 1, 1,  790, 'gantry,rails'],
  ['voron_trident_250',        'Voron Trident 250mm',                'Voron',    'CoreXY',         250, 250, 250, 1, 26, 7500, 1, 1,  980, 'cube,rails'],
  ['voron_trident_300',        'Voron Trident 300mm',                'Voron',    'CoreXY',         300, 300, 250, 1, 28, 7000, 1, 1, 1080, 'cube,rails'],
  ['voron_trident_350',        'Voron Trident 350mm',                'Voron',    'CoreXY',         350, 350, 250, 1, 28, 6500, 1, 1, 1190, 'cube,rails'],
  ['voron_24_250',             'Voron 2.4 R2 (250mm)',               'Voron',    'CoreXY',         250, 250, 230, 1, 24, 7200, 1, 1, 1050, 'cube,rails'],
  ['voron_24_300',             'Voron 2.4 R2 (300mm)',               'Voron',    'CoreXY',         300, 300, 300, 1, 24, 6500, 1, 1, 1150, 'cube,rails'],
  ['voron_24_350',             'Voron 2.4 R2 (350mm)',               'Voron',    'CoreXY',         350, 350, 330, 1, 26, 6000, 1, 1, 1290, 'cube,rails'],
  ['voron_tridex',             'Voron Tridex (IDEX CoreXY)',         'Voron',    'CoreXY IDEX',    250, 250, 250, 1, 28, 6800, 1, 1, 1450, 'cube,rails,idex'],
  ['ratrig_vcore3_300',        'RatRig V-Core 3.1 (300mm)',          'RatRig',   'CoreXY',         300, 300, 300, 1, 30, 8000, 1, 0, 1390, 'cube,rails'],
  ['ratrig_vcore3_400',        'RatRig V-Core 3.1 (400mm)',          'RatRig',   'CoreXY',         400, 400, 400, 1, 30, 6800, 1, 0, 1550, 'cube,rails'],
  ['ratrig_vcore3_500',        'RatRig V-Core 3.1 (500mm)',          'RatRig',   'CoreXY',         500, 500, 500, 1, 32, 5500, 1, 0, 1790, 'cube,rails'],
  ['ratrig_vcore4_300',        'RatRig V-Core 4 (300mm)',            'RatRig',   'Hybrid CoreXY',  300, 300, 300, 1, 34, 10000,1, 0, 1490, 'cube,rails'],
  ['ratrig_vcore4_400',        'RatRig V-Core 4 (400mm)',            'RatRig',   'Hybrid CoreXY',  400, 400, 400, 1, 34, 8500, 1, 0, 1650, 'cube,rails'],
  ['ratrig_vcore4_500',        'RatRig V-Core 4 (500mm)',            'RatRig',   'Hybrid CoreXY',  500, 500, 500, 1, 36, 7200, 1, 0, 1950, 'cube,rails'],
  ['vzbot_235',                'VzBot 235 AWD',                      'VzBot',    'CoreXY AWD',     235, 235, 235, 1, 38, 16000,1, 1, 1350, 'cube,rails,awd'],
  ['vzbot_330',                'VzBot 330 AWD',                      'VzBot',    'CoreXY AWD',     330, 330, 400, 1, 38, 13000,1, 1, 1590, 'cube,rails,awd'],

  // ================= ANYCUBIC (16 models) =================
  ['anycubic_i3_mega',         'Anycubic i3 Mega (Classic)',         'Anycubic', 'Cartesian',      210, 210, 205, 0, 11,  500, 0, 0,  179, 'gantry'],
  ['anycubic_mega_s',          'Anycubic Mega S',                    'Anycubic', 'Cartesian',      210, 210, 205, 0, 12,  600, 0, 0,  199, 'gantry'],
  ['anycubic_mega_x',          'Anycubic Mega X',                    'Anycubic', 'Cartesian',      300, 300, 305, 0, 12,  500, 0, 0,  269, 'gantry'],
  ['anycubic_mega_zero',       'Anycubic Mega Zero 2.0',             'Anycubic', 'Cartesian',      220, 220, 250, 0, 12,  550, 0, 0,  169, 'gantry'],
  ['anycubic_vyper',           'Anycubic Vyper',                     'Anycubic', 'Cartesian',      245, 245, 260, 0, 14,  900, 0, 0,  279, 'gantry'],
  ['anycubic_kobra',           'Anycubic Kobra',                     'Anycubic', 'Cartesian DD',   220, 220, 250, 1, 15, 1200, 0, 0,  249, 'gantry'],
  ['anycubic_kobra_go',        'Anycubic Kobra Go',                  'Anycubic', 'Cartesian',      220, 220, 250, 0, 13,  800, 0, 0,  189, 'gantry'],
  ['anycubic_kobra_neo',       'Anycubic Kobra Neo',                 'Anycubic', 'Cartesian DD',   220, 220, 250, 1, 14, 1000, 0, 0,  199, 'gantry'],
  ['anycubic_kobra_plus',      'Anycubic Kobra Plus',                'Anycubic', 'Cartesian',      300, 300, 350, 0, 15,  900, 0, 0,  349, 'gantry'],
  ['anycubic_kobra_max',       'Anycubic Kobra Max',                 'Anycubic', 'Cartesian',      400, 400, 450, 0, 16,  700, 0, 0,  469, 'gantry'],
  ['anycubic_kobra2',          'Anycubic Kobra 2',                   'Anycubic', 'Cartesian DD',   220, 220, 250, 1, 20, 2500, 0, 0,  249, 'gantry'],
  ['anycubic_kobra2_neo',      'Anycubic Kobra 2 Neo',               'Anycubic', 'Cartesian DD',   220, 220, 250, 1, 19, 2500, 0, 0,  189, 'gantry'],
  ['anycubic_kobra2_pro',      'Anycubic Kobra 2 Pro',               'Anycubic', 'Cartesian IS',   220, 220, 250, 1, 24, 5000, 1, 0,  279, 'gantry'],
  ['anycubic_kobra2_max',      'Anycubic Kobra 2 Max',               'Anycubic', 'Cartesian IS',   420, 420, 500, 1, 24, 3500, 1, 0,  449, 'gantry'],
  ['anycubic_kobra3',          'Anycubic Kobra 3',                   'Anycubic', 'Cartesian IS',   250, 250, 260, 1, 26, 6000, 1, 0,  329, 'gantry'],
  ['anycubic_kobra_s1',        'Anycubic Kobra S1',                  'Anycubic', 'CoreXY',         250, 250, 250, 1, 28, 8000, 1, 1,  499, 'cube,rails'],

  // ================= ELEGOO (12 models) =================
  ['elegoo_neptune2',          'Elegoo Neptune 2',                   'Elegoo',   'Cartesian',      220, 220, 250, 0, 12,  600, 0, 0,  169, 'gantry'],
  ['elegoo_neptune2s',         'Elegoo Neptune 2S',                  'Elegoo',   'Cartesian',      220, 220, 250, 0, 13,  700, 0, 0,  189, 'gantry'],
  ['elegoo_neptune3',          'Elegoo Neptune 3',                   'Elegoo',   'Cartesian',      220, 220, 280, 0, 14,  800, 0, 0,  209, 'gantry'],
  ['elegoo_neptune3_pro',      'Elegoo Neptune 3 Pro',               'Elegoo',   'Cartesian DD',   225, 225, 280, 1, 16, 1400, 0, 0,  229, 'gantry'],
  ['elegoo_neptune3_plus',     'Elegoo Neptune 3 Plus',              'Elegoo',   'Cartesian DD',   320, 320, 400, 1, 16, 1000, 0, 0,  319, 'gantry'],
  ['elegoo_neptune3_max',      'Elegoo Neptune 3 Max',               'Elegoo',   'Cartesian DD',   420, 420, 500, 1, 16,  800, 0, 0,  429, 'gantry'],
  ['elegoo_neptune4',          'Elegoo Neptune 4',                   'Elegoo',   'Cartesian IS',   225, 225, 265, 1, 22, 4000, 1, 0,  259, 'gantry'],
  ['elegoo_neptune4_pro',      'Elegoo Neptune 4 Pro',               'Elegoo',   'Cartesian IS',   225, 225, 265, 1, 24, 4500, 1, 0,  299, 'gantry,rails'],
  ['elegoo_neptune4_plus',     'Elegoo Neptune 4 Plus',              'Elegoo',   'Cartesian IS',   320, 320, 385, 1, 24, 3500, 1, 0,  349, 'gantry'],
  ['elegoo_neptune4_max',      'Elegoo Neptune 4 Max',               'Elegoo',   'Cartesian IS',   420, 420, 480, 1, 24, 3000, 1, 0,  469, 'gantry'],
  ['elegoo_centauri',          'Elegoo Centauri',                    'Elegoo',   'CoreXY',         256, 256, 256, 1, 28, 8000, 1, 0,  249, 'cube,rails'],
  ['elegoo_centauri_carbon',   'Elegoo Centauri Carbon',             'Elegoo',   'CoreXY',         256, 256, 256, 1, 28, 8500, 1, 1,  299, 'cube,rails'],

  // ================= SOVOL (9 models) =================
  ['sovol_sv01',               'Sovol SV01',                         'Sovol',    'Cartesian DD',   280, 240, 300, 1, 13,  600, 0, 0,  249, 'gantry'],
  ['sovol_sv01_pro',           'Sovol SV01 Pro',                     'Sovol',    'Cartesian DD',   280, 240, 300, 1, 15,  900, 0, 0,  289, 'gantry'],
  ['sovol_sv04',               'Sovol SV04 IDEX',                    'Sovol',    'Cartesian IDEX', 300, 300, 400, 1, 15,  800, 0, 0,  499, 'gantry,idex'],
  ['sovol_sv06',               'Sovol SV06',                         'Sovol',    'Cartesian DD',   220, 220, 250, 1, 16, 1500, 0, 0,  229, 'gantry'],
  ['sovol_sv06_ace',           'Sovol SV06 ACE (Klipper)',           'Sovol',    'Cartesian IS',   220, 220, 250, 1, 24, 5500, 1, 0,  279, 'gantry'],
  ['sovol_sv06_plus',          'Sovol SV06 Plus',                    'Sovol',    'Cartesian DD',   300, 300, 340, 1, 20, 1800, 0, 0,  319, 'gantry'],
  ['sovol_sv07',               'Sovol SV07 (Klipper)',               'Sovol',    'Cartesian IS',   220, 220, 250, 1, 22, 4500, 1, 0,  269, 'gantry'],
  ['sovol_sv07_plus',          'Sovol SV07 Plus (Klipper)',          'Sovol',    'Cartesian IS',   300, 300, 350, 1, 23, 3800, 1, 0,  349, 'gantry'],
  ['sovol_sv08',               'Sovol SV08 (350mm CoreXY)',          'Sovol',    'CoreXY',         350, 350, 345, 1, 28, 7200, 1, 0,  579, 'cube,rails'],

  // ================= QIDI TECH (7 models) =================
  ['qidi_x_smart3',            'QIDI X-Smart 3',                     'QIDI Tech','CoreXY',         175, 180, 170, 1, 24, 7000, 1, 1,  299, 'cube,rails'],
  ['qidi_x_plus3',             'QIDI X-Plus 3',                      'QIDI Tech','CoreXY',         280, 280, 270, 1, 28, 8000, 1, 1,  599, 'cube,rails'],
  ['qidi_x_max3',              'QIDI X-Max 3',                       'QIDI Tech','CoreXY',         325, 325, 315, 1, 28, 7500, 1, 1,  899, 'cube,rails'],
  ['qidi_q1_pro',              'QIDI Q1 Pro',                        'QIDI Tech','CoreXY',         245, 245, 245, 1, 28, 8500, 1, 1,  449, 'cube,rails'],
  ['qidi_plus4',               'QIDI Plus4 (Heated Chamber)',        'QIDI Tech','CoreXY',         305, 305, 280, 1, 30, 9000, 1, 1,  799, 'cube,rails'],
  ['qidi_q2',                  'QIDI Q2 (Active 65C)',               'QIDI Tech','CoreXY',         270, 270, 256, 1, 30, 9000, 1, 1,  549, 'cube,rails'],
  ['qidi_imate_s',             'QIDI i-Mate S (Classic)',            'QIDI Tech','Cube DD',        260, 200, 200, 1, 13,  800, 0, 1,  399, 'cube'],

  // ================= ARTILLERY (7 models) =================
  ['artillery_sw_x1',          'Artillery Sidewinder X1',            'Artillery','Cartesian DD',   300, 300, 400, 1, 16,  700, 0, 0,  329, 'gantry'],
  ['artillery_sw_x2',          'Artillery Sidewinder X2',            'Artillery','Cartesian DD',   300, 300, 400, 1, 16,  800, 0, 0,  349, 'gantry'],
  ['artillery_sw_x3_pro',      'Artillery Sidewinder X3 Pro',        'Artillery','Cartesian DD',   240, 240, 260, 1, 19, 2000, 0, 0,  249, 'gantry'],
  ['artillery_sw_x4_pro',      'Artillery Sidewinder X4 Pro',        'Artillery','Cartesian IS',   240, 240, 260, 1, 23, 4500, 1, 0,  279, 'gantry,rails'],
  ['artillery_sw_x4_plus',     'Artillery Sidewinder X4 Plus',       'Artillery','Cartesian IS',   300, 300, 400, 1, 23, 3500, 1, 0,  369, 'gantry'],
  ['artillery_genius_pro',     'Artillery Genius Pro',               'Artillery','Cartesian DD',   220, 220, 250, 1, 16,  900, 0, 0,  249, 'gantry'],
  ['artillery_hornet',         'Artillery Hornet',                   'Artillery','Cartesian',      220, 220, 250, 0, 13,  700, 0, 0,  169, 'gantry'],

  // ================= FLASHFORGE (6 models) =================
  ['flashforge_adv3',          'FlashForge Adventurer 3',            'FlashForge','Cube',          150, 150, 150, 0, 12,  700, 0, 1,  299, 'cube'],
  ['flashforge_adv4',          'FlashForge Adventurer 4',            'FlashForge','Cube',          220, 200, 250, 0, 14,  900, 0, 1,  499, 'cube'],
  ['flashforge_ad5m',          'FlashForge Adventurer 5M',           'FlashForge','CoreXY',        220, 220, 220, 1, 28, 8000, 1, 0,  299, 'cube,rails'],
  ['flashforge_ad5m_pro',      'FlashForge Adventurer 5M Pro',       'FlashForge','CoreXY',        220, 220, 220, 1, 28, 8000, 1, 1,  449, 'cube,rails'],
  ['flashforge_ad5x',          'FlashForge AD5X (Multi-Color)',      'FlashForge','CoreXY',        220, 220, 220, 1, 28, 8000, 1, 0,  399, 'cube,rails'],
  ['flashforge_creator_pro2',  'FlashForge Creator Pro 2 (IDEX)',    'FlashForge','Cube IDEX',     200, 148, 150, 1, 13,  700, 0, 1,  649, 'cube,idex'],

  // ================= ULTIMAKER (5 models) =================
  ['ultimaker_2plus',          'UltiMaker 2+ (Classic)',             'UltiMaker', 'Cross-Gantry',  223, 223, 205, 0, 12, 1500, 0, 1, 1899, 'cube'],
  ['ultimaker_3',              'UltiMaker 3',                        'UltiMaker', 'Cross-Gantry',  215, 215, 200, 0, 13, 1500, 0, 1, 2499, 'cube'],
  ['ultimaker_s3',             'UltiMaker S3',                       'UltiMaker', 'Cross-Gantry',  230, 190, 200, 0, 14, 2000, 0, 1, 3499, 'cube'],
  ['ultimaker_s5',             'UltiMaker S5',                       'UltiMaker', 'Cross-Gantry',  330, 240, 300, 0, 15, 2000, 0, 1, 5999, 'cube'],
  ['ultimaker_s7',             'UltiMaker S7',                       'UltiMaker', 'Cross-Gantry',  330, 240, 300, 0, 16, 2200, 0, 1, 6999, 'cube'],

  // ================= FLSUN DELTA (6 models — True 3-Tower Delta!) =================
  ['flsun_q5',                 'FLSUN Q5 (Delta)',                   'FLSUN',    'Delta',          200, 200, 200, 0, 14, 2000, 0, 0,  199, 'delta'],
  ['flsun_qqs_pro',            'FLSUN QQ-S Pro (Delta)',             'FLSUN',    'Delta',          255, 255, 365, 0, 15, 2200, 0, 0,  289, 'delta'],
  ['flsun_sr',                 'FLSUN Super Racer (SR Delta)',       'FLSUN',    'Delta',          260, 260, 330, 0, 20, 3500, 0, 0,  379, 'delta,rails'],
  ['flsun_v400',               'FLSUN V400 (Klipper Delta)',         'FLSUN',    'Delta IS',       300, 300, 410, 1, 28, 7500, 1, 0,  649, 'delta,rails'],
  ['flsun_t1_pro',             'FLSUN T1 Pro (Ultra Delta)',         'FLSUN',    'Delta IS',       260, 260, 330, 1, 36, 15000,1, 1,  599, 'delta,rails'],
  ['flsun_s1_pro',             'FLSUN S1 Pro (1200mm/s Delta)',      'FLSUN',    'Delta IS',       320, 320, 430, 1, 42, 18000,1, 1, 1299, 'delta,rails'],

  // ================= KINGROON & ANKERMAKE (6 models) =================
  ['kingroon_kp3s',            'Kingroon KP3S (3.0)',                'Kingroon', 'Cantilever DD',  180, 180, 180, 1, 13, 1000, 0, 0,  159, 'cantilever,rails'],
  ['kingroon_kp3s_pro',        'Kingroon KP3S Pro',                  'Kingroon', 'Cantilever DD',  200, 200, 200, 1, 15, 1500, 0, 0,  199, 'cantilever,rails'],
  ['kingroon_kp3s_pro_v2',     'Kingroon KP3S Pro V2 (Klipper)',     'Kingroon', 'Cantilever IS',  200, 200, 200, 1, 22, 5000, 1, 0,  249, 'cantilever,rails'],
  ['kingroon_klp1',            'Kingroon KLP1 (CoreXY)',             'Kingroon', 'CoreXY',         210, 210, 210, 1, 24, 7000, 1, 1,  359, 'cube,rails'],
  ['ankermake_m5',             'AnkerMake M5',                       'AnkerMake','Cartesian IS',   235, 235, 250, 1, 22, 4000, 0, 0,  499, 'gantry'],
  ['ankermake_m5c',            'AnkerMake M5C',                      'AnkerMake','Cartesian IS',   220, 220, 250, 1, 22, 4000, 0, 0,  299, 'gantry'],

  // ================= CLASSICS, DIY LEGENDS & OTHER BRANDS (30 models) =================
  ['anet_a8',                  'Anet A8 (Classic Legend)',           'Anet',     'Cartesian DD',   220, 220, 240, 1, 10,  400, 0, 0,  129, 'gantry'],
  ['anet_a8_plus',             'Anet A8 Plus (300mm)',               'Anet',     'Cartesian DD',   300, 300, 350, 1, 11,  450, 0, 0,  199, 'gantry'],
  ['anet_a6',                  'Anet A6 (Classic)',                  'Anet',     'Cartesian DD',   220, 220, 250, 1, 10,  400, 0, 0,  139, 'gantry'],
  ['anet_et4',                 'Anet ET4 / ET4 Pro',                 'Anet',     'Cartesian',      220, 220, 250, 0, 11,  500, 0, 0,  169, 'gantry'],
  ['tevo_tarantula',           'Tevo Tarantula (Classic)',           'Tevo',     'Cartesian',      200, 200, 200, 0, 11,  500, 0, 0,  159, 'gantry'],
  ['tevo_tornado',             'Tevo Tornado (Classic)',             'Tevo',     'Cartesian',      300, 300, 400, 0, 12,  500, 0, 0,  269, 'gantry'],
  ['wanhao_duplicator_i3',     'Wanhao Duplicator i3 / Maker Select','Wanhao',   'Cartesian DD',   200, 200, 180, 1, 11,  500, 0, 0,  219, 'gantry'],
  ['monoprice_mini_v2',        'Monoprice Select Mini V2',           'Monoprice','Cantilever',     120, 120, 120, 0, 10,  500, 0, 0,  169, 'cantilever'],
  ['tronxy_x5sa',              'Tronxy X5SA (330mm CoreXY)',         'Tronxy',   'CoreXY',         330, 330, 400, 0, 14, 1000, 0, 0,  319, 'cube'],
  ['tronxy_x5sa_400',          'Tronxy X5SA-400 Pro',                'Tronxy',   'CoreXY',         400, 400, 400, 0, 15, 1100, 0, 0,  449, 'cube,rails'],
  ['twotrees_sapphire_pro',    'TwoTrees Sapphire Pro',              'TwoTrees', 'CoreXY',         235, 235, 235, 0, 15, 1500, 0, 0,  279, 'cube,rails'],
  ['twotrees_sapphire_plus',   'TwoTrees Sapphire Plus (SP-5)',      'TwoTrees', 'CoreXY',         300, 300, 350, 0, 16, 1600, 0, 0,  399, 'cube,rails'],
  ['twotrees_bluer',           'TwoTrees Bluer',                     'TwoTrees', 'Cartesian',      235, 235, 280, 0, 12,  600, 0, 0,  179, 'gantry'],
  ['twotrees_sk1',             'TwoTrees SK1 (Klipper CoreXY)',      'TwoTrees', 'CoreXY',         256, 256, 256, 1, 26, 7500, 1, 0,  449, 'cube,rails'],
  ['biqu_b1',                  'BIQU B1',                            'BIQU',     'Cartesian',      235, 235, 270, 0, 14,  900, 0, 0,  229, 'gantry'],
  ['biqu_hurakan',             'BIQU Hurakan (Klipper)',             'BIQU',     'Cartesian IS',   235, 235, 270, 0, 18, 3500, 1, 0,  299, 'gantry'],
  ['geeetech_a10',             'Geeetech A10',                       'Geeetech', 'Cartesian',      220, 220, 260, 0, 11,  500, 0, 0,  159, 'gantry'],
  ['geeetech_a20',             'Geeetech A20 / A20M',                'Geeetech', 'Cartesian',      250, 250, 250, 0, 12,  600, 0, 0,  219, 'gantry'],
  ['flyingbear_ghost5',        'FlyingBear Ghost 5',                 'FlyingBear','CoreXY',        255, 210, 200, 0, 14, 1200, 0, 1,  329, 'cube'],
  ['flyingbear_ghost6',        'FlyingBear Ghost 6',                 'FlyingBear','CoreXY DD',     255, 210, 210, 1, 18, 2500, 0, 1,  399, 'cube'],
  ['flyingbear_reborn2',       'FlyingBear Reborn 2 (325mm)',        'FlyingBear','CoreXY',        325, 325, 350, 1, 22, 4500, 1, 1,  549, 'cube,rails'],
  ['snapmaker_a350',           'Snapmaker 2.0 A350 (3-in-1)',        'Snapmaker','Cartesian DD',   320, 350, 330, 1, 14,  800, 0, 0, 1499, 'gantry,rails'],
  ['snapmaker_artisan',        'Snapmaker Artisan (400mm Dual)',     'Snapmaker','Cartesian DD',   400, 400, 400, 1, 20, 1500, 0, 1, 2499, 'cube,rails'],
  ['raise3d_e2',               'Raise3D E2 (IDEX)',                  'Raise3D',  'Cartesian IDEX', 330, 240, 240, 1, 15, 1000, 0, 1, 3199, 'cube,idex'],
  ['raise3d_pro3',             'Raise3D Pro3 Plus',                  'Raise3D',  'Cube DD',        300, 300, 605, 1, 22, 2500, 0, 1, 5499, 'cube,rails'],
  ['lulzbot_taz6',             'LulzBot TAZ 6 (Classic)',            'LulzBot',  'Cartesian DD',   280, 280, 250, 1, 15,  500, 0, 0, 1499, 'gantry'],
  ['lulzbot_mini2',            'LulzBot Mini 2',                     'LulzBot',  'Cartesian DD',   160, 160, 180, 1, 15,  700, 0, 0, 1199, 'gantry'],
  ['generic_220',              'Generic 220³ DIY (Marlin 2)',        'Generic',  'Cartesian',      220, 220, 250, 1, 16, 1800, 0, 0,  249, 'gantry'],
  ['generic_300_klipper',      'Generic 300³ CoreXY (Klipper)',      'Generic',  'CoreXY',         300, 300, 300, 1, 26, 6000, 1, 0,  649, 'cube,rails'],
  ['custom_scratch',           'Custom Scratch-Build Lab',           'Custom',   'CoreXY',         280, 280, 280, 1, 18, 4500, 1, 0,  680, 'cube,rails,custom'],
];

function hydratePrinter(row) {
  const [
    id, name, vendor, kinLabel, bx, by, bz,
    directDrive, maxFlow, accelStock, isKlipper, enclosed, baseCostUsd, flagStr,
  ] = row;
  const flags = new Set((flagStr || '').split(',').filter(Boolean));
  const isDelta = flags.has('delta');
  const isCantilever = flags.has('cantilever');
  const isCube = flags.has('cube');
  const hasRails = flags.has('rails');
  const isAwd = flags.has('awd');
  const isCore = /corexy|cross-gantry|hybrid/i.test(kinLabel) || isCube;
  const hasIS = Boolean(isKlipper) || /IS|CoreXY|Delta/i.test(kinLabel) || accelStock >= 2800;

  const kinematics = isDelta ? 'delta' : isCore ? 'corexy' : 'bedslinger';
  const frameType = isDelta ? 'delta' : isCantilever ? 'cantilever' : isCube ? 'cube' : 'gantry';
  const extrusionMm = bx >= 360 ? 30 : bx <= 150 ? 15 : 20;

  const padX = isDelta ? 90 : bx >= 350 ? 175 : 150;
  const padY = isDelta ? 90 : by >= 350 ? 175 : 155;
  const padZ = isDelta ? 260 : isCube ? 215 : 205;

  // Physically realistic stock mass & resonance parameters derived from printer class & bed size
  const sizeRatio = (bx * by) / (250 * 250);
  const xMassG = Math.round(isDelta ? 170 : isCore ? (bx <= 180 ? 220 : 340 + (directDrive ? 65 : 0)) : (330 + (directDrive ? 80 : 0)));
  const yMassG = Math.round(
    isDelta
      ? 280
      : isCore
        ? 480 + bx * 0.9
        : 840 * Math.pow(sizeRatio, 0.72), // Bedslinger moving heated bed scales strongly with area!
  );
  const zMassG = Math.round(700 + bx * 2.2);
  const frameMassG = Math.round((isCube ? 9200 : isDelta ? 7600 : 5400) * Math.pow(sizeRatio, 0.55));
  const frameStiffness = Number((
    (isCube ? 1.32 : isDelta ? 1.42 : isCantilever ? 0.88 : 0.82) *
    (hasRails ? 1.12 : 1.0) *
    (isAwd ? 1.18 : 1.0) *
    (bx >= 380 ? 0.90 : 1.0)
  ).toFixed(2));

  // Derive realistic stock resonance frequencies from stock accel & kinematics
  const baseFreqX = Math.round(Math.max(28, Math.min(82, (isDelta ? 62 : isCore ? 48 : 34) + Math.sqrt(accelStock) * 0.22 + (hasRails ? 5 : 0))));
  const baseFreqY = Math.round(Math.max(19, Math.min(74, (isDelta ? 62 : isCore ? 40 : 21) + Math.sqrt(accelStock) * (isCore ? 0.19 : 0.14) - (sizeRatio > 1.4 ? 5 : 0))));

  const maxNozzleC = maxFlow >= 24 ? 300 : maxFlow >= 16 ? 280 : 260;
  const maxBedC = enclosed ? 115 : bx >= 300 ? 110 : 100;
  const chamberC = /heated chamber|active 65c/i.test(name) ? 62 : enclosed ? 46 : 24;
  const coolingCfm = Number((3.2 + (maxFlow / 4.2)).toFixed(1));
  const coolingStaticPa = Math.round(90 + maxFlow * 8.5);
  const psuWatts = bx >= 350 ? 480 : bx <= 160 ? 180 : 350;
  const baseDrawWatts = Math.round(isCube ? 150 : 165);
  const bedDrawWatts = Math.round(140 + sizeRatio * 140);
  const noiseDba = Number((enclosed ? 52 : isKlipper ? 55 : 53).toFixed(1));

  return {
    id,
    name,
    vendor,
    kinLabel,
    kinematics,
    frameType,
    extrusionMm,
    buildVolume: { x: bx, y: by, z: bz },
    outerSize: { x: bx + padX, y: by + padY, z: bz + padZ },
    stock: {
      xMassG,
      yMassG,
      zMassG,
      frameMassG,
      frameStiffness,
      baseFreqX,
      baseFreqY,
      maxFlowMm3s: maxFlow,
      maxNozzleC,
      maxBedC,
      chamberC,
      coolingCfm,
      coolingStaticPa,
      stepperVoltage: isAwd ? 48 : 24,
      extruderType: directDrive ? 'direct' : 'bowden',
      hasKlipper: Boolean(isKlipper),
      hasInputShaper: hasIS,
      hasLinearRails: hasRails,
      enclosed: Boolean(enclosed),
      psuWatts,
      baseDrawWatts,
      bedDrawWatts,
      noiseDba,
      baseCostUsd,
    },
    tagline: {
      tr: `${vendor} • ${kinLabel} • ${bx}×${by}×${bz} mm • ${directDrive ? 'Direct Drive' : 'Bowden'}${enclosed ? ' • Kapalı' : ''}`,
      en: `${vendor} • ${kinLabel} • ${bx}×${by}×${bz} mm • ${directDrive ? 'Direct Drive' : 'Bowden'}${enclosed ? ' • Enclosed' : ''}`,
    },
  };
}

export const ALL_PRINTER_PLATFORMS = RAW_PRINTERS.map(hydratePrinter);

// Unique sorted brand list for filter chips
export const PRINTER_VENDORS = [
  'ALL',
  'Creality',
  'Prusa',
  'Bambu Lab',
  'Voron',
  'Anycubic',
  'Elegoo',
  'Sovol',
  'QIDI Tech',
  'RatRig',
  'FLSUN',
  'Artillery',
  'FlashForge',
  'UltiMaker',
  'Other',
];

export const MAIN_VENDOR_SET = new Set(PRINTER_VENDORS.filter((v) => v !== 'ALL' && v !== 'Other'));

// Legacy ID aliases so saved links, presets & unit tests work seamlessly
export const PRINTER_ID_ALIASES = {
  'voron-24': 'voron_24_300',
  'ender-3': 'creality_ender3_pro',
  'prusa-mk4': 'prusa_mk4s',
  'bambu-corexy': 'bambu_x1c',
  'ratrig-vc4': 'ratrig_vcore4_400',
  'voron-v0': 'voron_02',
  'custom-scratch': 'custom_scratch',
};
