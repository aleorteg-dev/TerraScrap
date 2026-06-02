"""One-shot generator for item_world_map.json schema 3.0.0.

Names sourced from backend/src/twi/item_catalog/data/items.seed.json (Terraria
items.seed). Tile/wall IDs cross-checked against terraria.wiki.gg/wiki/Tile_IDs
and /wiki/Wall_IDs.
"""

from __future__ import annotations

import json
from pathlib import Path

# Item name lookup — only ids referenced below; loaded from items.seed.json.
HERE = Path(__file__).resolve().parent
SEED = HERE.parent / "src" / "twi" / "item_catalog" / "data" / "items.seed.json"
OUT = HERE.parent / "src" / "twi" / "tile_search" / "data" / "item_world_map.json"


def item_names() -> dict[int, str]:
    raw = json.loads(SEED.read_text(encoding="utf-8"))
    out: dict[int, str] = {}
    for it in raw["items"]:
        out[int(it["id"])] = str(it["name"])
    return out


NAMES = item_names()


def n(item_id: int) -> str:
    return NAMES[item_id]


# Tile-name lookup for tiles we map. Names follow terraria.wiki.gg/Tile_IDs.
TILE_NAME = {
    0: "Dirt Block",
    1: "Stone Block",
    4: "Torch",
    6: "Iron Ore",
    7: "Copper Ore",
    8: "Gold Ore",
    9: "Silver Ore",
    12: "Life Crystal",
    13: "Bottle",
    14: "Wooden Table",
    15: "Wooden Chair",
    16: "Iron Anvil",
    17: "Furnace",
    18: "Work Bench",
    19: "Wood Platform",
    21: "Containers",
    22: "Demonite Ore",
    25: "Ebonstone Block",
    26: "Demon/Crimson Altar",
    27: "Sunflower",
    29: "Mana Crystal",
    30: "Wood",
    31: "Shadow Orb/Crimson Heart",
    33: "Candle",
    34: "Chandelier",
    35: "Jack 'O Lantern",
    36: "Present",
    37: "Meteorite",
    38: "Gray Brick",
    39: "Red Brick",
    40: "Clay Block",
    41: "Blue Brick",
    43: "Green Brick",
    44: "Pink Brick",
    45: "Gold Brick",
    46: "Silver Brick",
    47: "Copper Brick",
    48: "Spike",
    49: "Water Candle",
    50: "Book",
    51: "Cobweb",
    53: "Sand Block",
    54: "Glass",
    55: "Sign",
    56: "Obsidian",
    57: "Ash Block",
    58: "Hellstone",
    59: "Mud Block",
    63: "Sapphire Stone Block",
    64: "Ruby Stone Block",
    65: "Emerald Stone Block",
    66: "Topaz Stone Block",
    67: "Amethyst Stone Block",
    68: "Diamond Stone Block",
    75: "Obsidian Brick",
    76: "Hellstone Brick",
    77: "Hellforge",
    78: "Clay Pot",
    79: "Bed",
    80: "Cactus",
    81: "Coral",
    85: "Tombstone",
    86: "Loom",
    87: "Piano",
    88: "Dresser",
    91: "Banner",
    101: "Bookcase",
    102: "Throne",
    103: "Bowl",
    104: "Grandfather Clock",
    105: "Statue",
    106: "Sawmill",
    107: "Cobalt Ore",
    108: "Mythril Ore",
    111: "Adamantite Ore",
    112: "Ebonsand Block",
    114: "Tinkerer's Workshop",
    116: "Pearlsand Block",
    117: "Pearlstone Block",
    118: "Pearlstone Brick",
    119: "Iridescent Brick",
    120: "Mudstone Brick",
    121: "Cobalt Brick",
    122: "Mythril Brick",
    123: "Silt Block",
    124: "Wooden Beam",
    125: "Crystal Ball",
    126: "Disco Ball",
    127: "Magical Ice Block",
    129: "Crystal Shard",
    130: "Active Stone Block",
    131: "Inactive Stone Block",
    132: "Lever",
    133: "Mythril/Orichalcum Anvil",
    136: "Switch",
    138: "Boulder",
    147: "Snow Block",
    148: "Ice Block",
    166: "Tin Ore",
    167: "Lead Ore",
    168: "Tungsten Ore",
    169: "Platinum Ore",
    179: "Green Moss",
    180: "Brown Moss",
    181: "Red Moss",
    182: "Blue Moss",
    183: "Purple Moss",
    191: "Living Wood",
    192: "Leaf Block",
    193: "Slime Block",
    194: "Bone Block",
    195: "Flesh Block",
    196: "Rain Cloud",
    197: "Frozen Slime Block",
    198: "Asphalt Block",
    200: "Red Ice Block",
    202: "Sunplate Block",
    203: "Crimstone Block",
    204: "Crimtane Ore",
    206: "Ice Brick",
    208: "Shadewood",
    210: "Land Mine",
    211: "Chlorophyte Ore",
    212: "Snowball Launcher",
    213: "Rope",
    214: "Chain",
    215: "Campfire",
    217: "Blend-O-Matic",
    218: "Meat Grinder",
    219: "Extractinator",
    220: "Solidifier",
    221: "Palladium Ore",
    222: "Orichalcum Ore",
    223: "Titanium Ore",
    224: "Slush Block",
    225: "Hive",
    226: "Lihzahrd Brick",
    228: "Dye Vat",
    229: "Honey Block",
    230: "Crispy Honey Block",
    232: "Wooden Spike",
    234: "Crimsand Block",
    235: "Teleporter",
    237: "Lihzahrd Altar",
    286: "Crystal Shard cage frame",
    300: "Bone Welder",
    301: "Flesh Cloning Vat",
    302: "Glass Kiln",
    303: "Lihzahrd Furnace",
    304: "Living Loom",
    305: "Sky Mill",
    306: "Ice Machine",
    307: "Steampunk Boiler",
    308: "Honey Dispenser",
    311: "Dynasty Wood",
    315: "Coralstone Block",
    321: "Boreal Wood",
    322: "Palm Wood",
    325: "Tin Plating",
    326: "Waterfall Block",
    327: "Lavafall Block",
    328: "Confetti Block",
    329: "Midnight Confetti Block",
    330: "Copper Coin Pile",
    331: "Silver Coin Pile",
    332: "Gold Coin Pile",
    333: "Platinum Coin Pile",
    334: "Weapon Rack",
    335: "Fireworks Box",
    336: "Living Fire Block",
    338: "Firework Fountain",
    340: "Living Cursed Fire Block",
    341: "Living Demon Fire Block",
    342: "Living Frost Fire Block",
    343: "Living Ichor Block",
    344: "Living Ultrabright Fire Block",
    345: "Honeyfall Block",
    346: "Chlorophyte Brick",
    347: "Crimtane Brick",
    348: "Shroomite Plating",
    349: "Mushroom Statue",
    350: "Martian Conduit Plating",
    351: "Smoke Block",
    353: "Vine Rope",
    354: "Bewitching Table",
    355: "Alchemy Table",
    356: "Enchanted Sundial",
    357: "Smooth Marble Block",
    365: "Silk Rope",
    366: "Web Rope",
    367: "Marble Block",
    368: "Granite Block",
    369: "Smooth Granite Block",
    370: "Meteorite Brick",
    371: "Pink Slime Block",
    372: "Peace Candle",
    373: "Magic Water Dropper",
    374: "Magic Lava Dropper",
    375: "Magic Honey Dropper",
    377: "Sharpening Station",
    378: "Target Dummy",
    379: "Bubble",
    381: "Lava Moss",
    383: "Living Mahogany",
    384: "Mahogany Leaf Block",
    385: "Crystal Block",
    390: "Lava Lamp",
    395: "Item Frame",
    396: "Sandstone Block",
    397: "Hardened Sand Block",
    398: "Hardened Ebonsand Block",
    399: "Hardened Crimsand Block",
    400: "Ebonsandstone Block",
    401: "Crimsandstone Block",
    402: "Hardened Pearlsand Block",
    403: "Pearlsandstone Block",
    404: "Desert Fossil",
    405: "Fireplace",
    406: "Chimney",
    407: "Sturdy Fossil",
    408: "Luminite",
    409: "Luminite Brick",
    411: "Detonator",
    412: "Ancient Manipulator",
    415: "Solar Fragment Block",
    416: "Vortex Fragment Block",
    417: "Nebula Fragment Block",
    418: "Stardust Fragment Block",
    424: "Junction Box",
    425: "Announcement Box",
    429: "Wire Bulb",
    441: "Containers",
    443: "Geyser",
    444: "Bee Hive",
    445: "Pixel Box",
    452: "Silly Balloon Machine",
    454: "Pigronata",
    455: "Party Center",
    457: "Party Present",
    458: "Sandfall Block",
    459: "Snowfall Block",
    460: "Snow Cloud",
    461: "Magic Sand Dropper",
    462: "Desert Spirit Lamp",
    463: "Defender's Forge",
    464: "War Table",
    465: "War Table Banner",
    466: "Eternia Crystal Stand",
    467: "Containers2",
    468: "Dressers/Containers",
    471: "Weapon Rack",
    472: "Iron Brick",
    473: "Lead Brick",
    474: "Lesion Block",
    475: "Hat Rack",
    476: "Golf Cup",
    478: "Crimstone Brick",
    479: "Smooth Sandstone",
    480: "Blood Moon Monolith",
    481: "Cracked Blue Brick",
    482: "Cracked Green Brick",
    483: "Cracked Pink Brick",
    484: "Rolling Cactus",
    485: "Antlion Eggs",
    486: "Drum Set",
    487: "Picnic Table",
    488: "Fallen Log",
    489: "Pin Wheel",
    490: "Weather Vane",
    491: "Void Vault",
    494: "Golf Tee",
    495: "Shell Pile",
    496: "Anti-Portal Block",
    498: "Spider Nest Block",
    499: "Decay Chamber",
    500: "Solar Brick",
    501: "Vortex Brick",
    502: "Nebula Brick",
    503: "Stardust Brick",
    504: "Mystic Snake Coil",
    506: "Bast Statue",
    507: "Gold Starry Block",
    508: "Blue Starry Block",
    509: "Void Monolith",
    510: "Arrow Sign",
    511: "Painted Arrow Sign",
    520: "Plate",
    534: "Krypton Moss",
    536: "Xenon Moss",
    539: "Argon Moss",
    541: "Echo Block",
    545: "Lawn Flamingo",
    561: "Marble Column",
    562: "Bamboo",
    564: "Plasma Lamp",
    565: "Fog Machine",
    566: "Amber Stone Block",
    567: "Garden Gnome",
    573: "Tattered Wood Sign",
    574: "Boreal Beam",
    575: "Rich Mahogany Beam",
    576: "Granite Column",
    577: "Sandstone Column",
    578: "Mushroom Beam",
    593: "Mini Volcano",
    594: "Large Volcano",
    617: "Relic Base",
    618: "Stone Accent Slab",
    621: "Slice of Cake",
    622: "Teapot",
    625: "Neon Moss",
    627: "Helium Moss",
    630: "Stinkbug Blocker",
    631: "Ghostly Stinkbug Blocker",
    635: "Ash Wood",
    639: "Mana Crystal",
    641: "Reef Block",
    642: "Chlorophyte Extractinator",
    646: "Shadow Candle",
    654: "TNT Barrel",
    656: "Glow Tulip",
    657: "Echo Chamber",
    658: "Aether Monolith",
    659: "Aetherium Block",
    660: "Faeling in a Bottle",
    664: "Bouncy Boulder",
    665: "Life Crystal Boulder",
    666: "Poo",
    667: "Aetherium Brick",
    668: "The Dirtiest Block",
    687: "Lava Moss Brick",
    688: "Argon Moss Brick",
    689: "Krypton Moss Brick",
    690: "Xenon Moss Brick",
    691: "Neon Moss Brick",
    692: "Helium Moss Brick",
}

WALL_NAME = {
    1: "Stone Wall",
    2: "Dirt Wall",
    4: "Wood Wall",
    7: "Blue Brick Wall",
    8: "Green Brick Wall",
    9: "Pink Brick Wall",
    34: "Sandstone Brick Wall",
    72: "Cactus Wall",
    94: "Blue Slab Wall",
    95: "Blue Tiled Wall",
    96: "Pink Slab Wall",
    97: "Pink Tiled Wall",
    98: "Green Slab Wall",
    99: "Green Tiled Wall",
    187: "Sandstone Wall",
    200: "Hallowed Prism Wall",
    201: "Hallowed Cavern Wall",
    202: "Hallowed Shard Wall",
    203: "Hallowed Crystalline Wall",
    216: "Hardened Sand Wall",
    217: "Hardened Ebonsand Wall",
    218: "Hardened Crimsand Wall",
    219: "Hardened Pearlsand Wall",
    220: "Ebonsandstone Wall",
    221: "Crimsandstone Wall",
    222: "Pearlsandstone Wall",
    235: "Smooth Sandstone Wall",
    341: "Lava Moss Brick Wall",
    342: "Argon Moss Brick Wall",
    343: "Krypton Moss Brick Wall",
    344: "Xenon Moss Brick Wall",
    345: "Neon Moss Brick Wall",
    346: "Helium Moss Brick Wall",
}


WIKI_TILES = "https://terraria.wiki.gg/wiki/Tile_IDs"
WIKI_WALLS = "https://terraria.wiki.gg/wiki/Wall_IDs"


def block(item_id: int, tile_id: int) -> dict:
    return {
        "item_id": item_id,
        "item_name": n(item_id),
        "matchers": [
            {
                "category": "block",
                "world_id": tile_id,
                "world_name": TILE_NAME.get(tile_id, n(item_id)),
                "source_url": WIKI_TILES,
            }
        ],
    }


def wall(item_id: int, wall_id: int, safe: bool | None = None) -> dict:
    m: dict = {
        "category": "wall",
        "world_id": wall_id,
        "world_name": WALL_NAME.get(wall_id, n(item_id)),
        "source_url": WIKI_WALLS,
    }
    if safe is not None:
        m["safe"] = safe
    return {"item_id": item_id, "item_name": n(item_id), "matchers": [m]}


def walls(item_id: int, wall_ids: list[int]) -> dict:
    return {
        "item_id": item_id,
        "item_name": n(item_id),
        "matchers": [
            {
                "category": "wall",
                "world_ids": wall_ids,
                "world_name": WALL_NAME.get(wall_ids[0], n(item_id)),
                "source_url": WIKI_WALLS,
            }
        ],
    }


def obj(
    item_id: int,
    tile_id: int,
    frame_xy: tuple[int, int] | None = None,
) -> dict:
    m: dict = {
        "category": "object",
        "world_id": tile_id,
        "world_name": TILE_NAME.get(tile_id, n(item_id)),
        "source_url": WIKI_TILES,
    }
    if frame_xy is not None:
        m["frame_xy"] = list(frame_xy)
    return {"item_id": item_id, "item_name": n(item_id), "matchers": [m]}


def objs(item_id: int, matchers_specs: list[dict]) -> dict:
    matchers = []
    for spec in matchers_specs:
        m: dict = {
            "category": "object",
            "world_id": spec["world_id"],
            "world_name": TILE_NAME.get(spec["world_id"], n(item_id)),
            "source_url": WIKI_TILES,
        }
        if "frame_xy" in spec:
            m["frame_xy"] = list(spec["frame_xy"])
        if "frame_xys" in spec:
            m["frame_xys"] = [list(p) for p in spec["frame_xys"]]
        matchers.append(m)
    return {"item_id": item_id, "item_name": n(item_id), "matchers": matchers}


# ----- Build entries (migrated from schema 2.0.0 + selective additions) -----

entries: list[dict] = []

# Blocks
for iid, tid in [
    (2, 0),
    (3, 1),
    (9, 30),
    (11, 6),
    (12, 7),
    (13, 8),
    (14, 9),
    (56, 22),
    (61, 25),
    (85, 214),  # Chain
    (116, 37),
    (129, 38),  # Gray Brick
    (131, 39),  # Red Brick
    (133, 40),  # Clay Block
    (147, 48),  # Spike
    (169, 53),
    (170, 54),  # Glass
    (172, 57),
    (173, 56),
    (174, 58),
    (176, 59),
    (192, 75),  # Obsidian Brick
    (214, 76),  # Hellstone Brick
    (276, 80),
    (364, 107),
    (365, 108),
    (366, 111),
    (370, 112),  # Ebonsand Block
    (408, 116),  # Pearlsand Block
    (409, 117),
    (412, 118),  # Pearlstone Brick
    (413, 119),  # Iridescent Brick
    (414, 120),  # Mudstone Brick
    (415, 121),  # Cobalt Brick
    (416, 122),  # Mythril Brick
    (424, 123),  # Silt Block
    (480, 124),  # Wooden Beam
    (511, 130),  # Active Stone Block
    (512, 131),  # Inactive Stone Block
    (593, 147),
    (664, 148),  # Ice Block
    (699, 166),
    (700, 167),
    (701, 168),
    (702, 169),
    (762, 193),  # Slime Block
    (763, 195),  # Flesh Block
    (765, 196),  # Rain Cloud
    (766, 194),  # Bone Block
    (767, 197),  # Frozen Slime Block
    (775, 198),  # Asphalt Block
    (824, 202),  # Sunplate Block
    (835, 200),  # Red Ice Block
    (836, 203),
    (880, 204),
    (883, 206),  # Ice Brick
    (911, 208),  # Shadewood block
    (947, 211),
    (1101, 226),
    (1103, 224),  # Slush Block
    (1104, 221),
    (1105, 222),
    (1106, 223),
    (1124, 225),  # Hive
    (1125, 229),  # Honey Block
    (1127, 230),  # Crispy Honey Block
    (1246, 234),  # Crimsand Block
    (2260, 311),  # Dynasty Wood
    (2435, 315),  # Coralstone Block
    (2503, 321),  # Boreal Wood
    (2504, 322),  # Palm Wood
    (2692, 325),  # Tin Plating
    (2693, 326),  # Waterfall Block
    (2694, 327),  # Lavafall Block
    (2695, 328),  # Confetti Block
    (2697, 329),  # Midnight Confetti Block
    (2701, 336),  # Living Fire Block
    (2751, 340),  # Living Cursed Fire Block
    (2752, 341),  # Living Demon Fire Block
    (2753, 342),  # Living Frost Fire Block
    (2754, 343),  # Living Ichor Block
    (2755, 344),  # Living Ultrabright Fire Block
    (2787, 345),  # Honeyfall Block
    (2792, 346),  # Chlorophyte Brick
    (2793, 347),  # Crimtane Brick
    (2794, 348),  # Shroomite Plating
    (2860, 350),  # Martian Conduit Plating
    (2868, 351),  # Smoke Block
    (3066, 357),  # Smooth Marble Block
    (3081, 367),
    (3086, 368),
    (3087, 369),  # Smooth Granite Block
    (3100, 370),  # Meteorite Brick
    (3113, 371),  # Pink Slime Block
    (3234, 385),  # Crystal Block
    (3271, 396),
    (3272, 397),
    (3274, 398),
    (3275, 399),
    (3276, 400),
    (3277, 401),
    (3338, 402),
    (3339, 403),
    (3347, 404),
    (3380, 407),  # Sturdy Fossil
    (3460, 408),  # Luminite
    (3461, 409),  # Luminite Brick
    (3951, 472),  # Iron Brick
    (3953, 473),  # Lead Brick
    (3955, 474),  # Lesion Block
    (4050, 478),  # Crimstone Brick
    (4051, 479),
    (4139, 498),  # Spider Nest Block
    (4229, 500),  # Solar Brick
    (4230, 501),  # Vortex Brick
    (4231, 502),  # Nebula Brick
    (4232, 503),  # Stardust Brick
    (4238, 481),  # Cracked Blue Brick
    (4239, 482),  # Cracked Green Brick
    (4240, 483),  # Cracked Pink Brick
    (4277, 507),  # Gold Starry Block
    (4278, 508),  # Blue Starry Block
    (4349, 179),
    (4350, 180),
    (4351, 181),
    (4352, 182),
    (4353, 183),
    (4354, 381),
    (4377, 534),
    (4378, 536),
    (4389, 539),
    (4390, 484),
    (4392, 541),  # Echo Block
    (4554, 561),  # Marble Column
    (4564, 562),  # Bamboo
    (4640, 67),  # Amethyst Stone Block
    (4641, 66),  # Topaz Stone Block
    (4642, 63),  # Sapphire Stone Block
    (4643, 65),  # Emerald Stone Block
    (4644, 64),  # Ruby Stone Block
    (4645, 68),  # Diamond Stone Block
    (4646, 566),  # Amber Stone Block
    (4719, 576),  # Granite Column
    (4720, 577),  # Sandstone Column
    (4717, 574),  # Boreal Beam
    (4718, 575),  # Rich Mahogany Beam
    (4721, 578),  # Mushroom Beam
    (4962, 618),  # Stone Accent Slab
    (5127, 625),
    (5128, 627),
    (5215, 635),  # Ash Wood
    (5306, 641),  # Reef Block
    (5395, 666),  # Poo
    (5400, 668),  # The Dirtiest Block
    (5439, 687),
    (5440, 688),
    (5441, 689),
    (5442, 690),
    (5443, 691),
    (5444, 692),
    # (6042) Spike Block omitted — would collide with Wooden Spike (1150) on tile 232
]:
    if tid is None:
        continue
    entries.append(block(iid, tid))

# Walls (single)
for iid, wid in [
    (26, 1),
    (30, 2),
    (93, 4),
    (135, 7),
    (138, 8),
    (140, 9),
    (608, 34),
    (750, 72),
    (1378, 94),
    (1379, 95),
    (1380, 96),
    (1381, 97),
    (1382, 98),
    (1383, 99),
    (3273, 187),
    (3340, 216),
    (3341, 217),
    (3342, 218),
    (3343, 219),
    (3344, 220),
    (3345, 221),
    (3346, 222),
    (4053, 235),
    (4525, 200),
    (4526, 201),
    (4527, 202),
    (4528, 203),
    (5445, 341),
    (5446, 342),
    (5447, 343),
    (5448, 344),
    (5449, 345),
    (5450, 346),
]:
    entries.append(wall(iid, wid))

# Objects (unframed). Only tiles where the wiki shows a single sub_id 0 mapping
# AND the catalogue contains the exact placeable item with that name.
for iid, tid in [
    (8, 4),  # Torch (generic)
    (31, 13),  # Bottle (generic on Bottles tile)
    (32, 14),  # Wooden Table (generic on Tables tile)
    (33, 17),  # Furnace
    (35, 16),  # Iron Anvil
    (34, 15),  # Wooden Chair (generic on Chairs tile)
    (36, 18),  # Work Bench (generic)
    (94, 19),  # Wood Platform (generic on Platforms tile)
    (63, 27),  # Sunflower
    (109, None),  # Mana Crystal alias - special handled below
    (221, 77),  # Hellforge
    (222, 78),  # Clay Pot
    (224, 79),  # Bed (generic)
    (275, 81),  # Coral
    (332, 86),  # Loom
    (333, 87),  # Piano (generic)
    (334, 88),  # Dresser (generic)
    # (350) Pink Vase requires frame_xy on tile 13 — skipped (ambiguous frame)
    (354, 101),  # Bookcase (generic)
    (355, 102),  # Throne
    (356, 103),  # Bowl (generic)
    (359, 104),  # Grandfather Clock (generic)
    (363, 106),  # Sawmill
    (398, 114),  # Tinkerer's Workshop
    (487, 125),  # Crystal Ball
    (488, 126),  # Disco Ball
    (513, 132),  # Lever
    (538, 136),  # Switch
    (540, 138),  # Boulder
    # (716) Lead Anvil collides on tile 16 with Iron Anvil; needs frame_xy — skipped
    (937, 210),  # Land Mine
    (951, 212),  # Snowball Launcher
    (965, 213),  # Rope
    (966, 215),  # Campfire (generic)
    (995, 217),  # Blend-O-Matic
    (996, 218),  # Meat Grinder
    (997, 219),  # Extractinator
    (998, 220),  # Solidifier
    (1120, 228),  # Dye Vat
    (1150, 232),  # Wooden Spike
    (1292, 237),  # Lihzahrd Altar
    (2175, 286),  # Glowing Snail Cage
    (2192, 300),  # Bone Welder
    (2193, 301),  # Flesh Cloning Vat
    (2194, 302),  # Glass Kiln
    (2195, 303),  # Lihzahrd Furnace
    (2196, 304),  # Living Loom
    (2197, 305),  # Sky Mill
    (2198, 306),  # Ice Machine
    (2203, 307),  # Steampunk Boiler
    (2204, 308),  # Honey Dispenser
    (2699, 334),  # Weapon Rack
    (2700, 335),  # Fireworks Box
    (2738, 338),  # Firework Fountain
    (2996, 353),  # Vine Rope
    (2999, 354),  # Bewitching Table
    (3000, 355),  # Alchemy Table
    (3064, 356),  # Enchanted Sundial
    (3077, 365),  # Silk Rope
    (3078, 366),  # Web Rope
    (3117, 372),  # Peace Candle
    (3182, 373),  # Magic Water Dropper
    (3184, 374),  # Magic Lava Dropper
    (3185, 375),  # Magic Honey Dropper
    (3198, 377),  # Sharpening Station
    (3202, 378),  # Target Dummy
    (3214, 379),  # Bubble
    (3253, 390),  # Lava Lamp
    (3270, 395),  # Item Frame
    (3364, 405),  # Fireplace
    (3365, 406),  # Chimney
    (3545, 411),  # Detonator
    (3549, 412),  # Ancient Manipulator
    (3616, 424),  # Junction Box
    (3617, 425),  # Announcement Box
    (3629, 429),  # Wire Bulb
    (3722, 443),  # Geyser
    (3725, 445),  # Pixel Box
    (3746, 454),  # Pigronata
    (3747, 455),  # Party Center
    (3749, 457),  # Party Present
    (3754, 458),  # Sandfall Block
    (3755, 459),  # Snowfall Block
    (3756, 460),  # Snow Cloud
    (3782, 461),  # Magic Sand Dropper
    (3795, 462),  # Desert Spirit Lamp
    (3813, 463),  # Defender's Forge
    (3814, 464),  # War Table
    (3815, 465),  # War Table Banner
    (3816, 466),  # Eternia Crystal Stand
    (3977, 475),  # Hat Rack
    (4040, 476),  # Golf Cup
    (4054, 480),  # Blood Moon Monolith
    (4063, 486),  # Drum Set
    (4064, 487),  # Picnic Table (generic)
    (4074, 489),  # Pin Wheel
    (4075, 490),  # Weather Vane
    (4076, 491),  # Void Vault
    (4089, 494),  # Golf Tee
    (4090, 495),  # Shell Pile
    (4091, 496),  # Anti-Portal Block
    (4142, 499),  # Decay Chamber
    (4276, 506),  # Bast Statue
    (4318, 509),  # Void Monolith
    (4319, 510),  # Arrow Sign
    (4320, 511),  # Painted Arrow Sign
    (4326, 520),  # Plate
    (4420, 545),  # Lawn Flamingo
    (4552, 565),  # Fog Machine
    (4553, 564),  # Plasma Lamp
    (4609, 567),  # Garden Gnome
    (4710, 573),  # Tattered Wood Sign
    (4868, 593),  # Mini Volcano
    (4869, 594),  # Large Volcano
    (5008, 622),  # Teapot
    (5066, 444),  # Bee Hive
    (5067, 485),  # Antlion Eggs
    (5133, 629),  # Stinkbug Cage
    (5137, 630),  # Stinkbug Blocker
    (5138, 631),  # Ghostly Stinkbug Blocker
    (5296, 642),  # Chlorophyte Extractinator
    (5333, 656),  # Glow Tulip
    (5351, 660),  # Faeling in a Bottle
    (5383, 664),  # Bouncy Boulder
    (5384, 665),  # Life Crystal Boulder
]:
    if iid == 109:
        # Mana Crystal alias: tile 29 (Mana Crystal) + tile 639 (Repaired)
        entries.append(
            objs(
                109,
                [
                    {"world_id": 29},
                    {"world_id": 639},
                ],
            )
        )
        continue
    entries.append(obj(iid, tid))

# Chest: unframed multi-tile (catch-all on tiles 21, 441, 467, 468)
entries.append(
    objs(
        48,
        [
            {"world_id": 21},
            {"world_id": 441},
            {"world_id": 467},
            {"world_id": 468},
        ],
    )
)

# Statues, forges, altars (framed objects on shared tiles)
entries.append(obj(29, 12, frame_xy=(0, 0)))  # Life Crystal
entries.append(obj(438, 105, frame_xy=(72, 0)))  # Star Statue
entries.append(obj(473, 105, frame_xy=(1332, 0)))  # Heart Statue
entries.append(obj(524, 133, frame_xy=(0, 0)))  # Adamantite Forge
entries.append(obj(1221, 133, frame_xy=(54, 0)))  # Titanium Forge
entries.append(obj(5532, 26, frame_xy=(0, 0)))  # Demon Altar
entries.append(obj(5533, 26, frame_xy=(54, 0)))  # Crimson Altar

# Chest variants on tile 21 (frame_x grouping by 36)
for iid, fx in [
    (306, 36),
    (328, 144),
    (625, 252),
    (626, 288),
    (627, 324),
    (680, 360),
    (681, 396),
    (831, 432),
    (838, 468),
    (952, 540),
    (1142, 576),
    (1298, 612),
    (1528, 648),
    (1529, 684),
    (1530, 720),
    (1531, 756),
]:
    entries.append(obj(iid, 21, frame_xy=(fx, 0)))

# Sort by item_id ascending
entries.sort(key=lambda e: int(e["item_id"]))

payload = {"schema_version": "3.0.0", "items": entries}
OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
print(f"wrote {OUT} with {len(entries)} entries")
