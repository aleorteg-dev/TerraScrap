import { FALLBACK_TILE_COLORS, FALLBACK_WALL_COLORS } from './tilePaletteFallback';

// Palette ported from TerraMap (MapHelper.js, decompiled Terraria colors).
// Uses the first style variant per tile/wall. Chests and notable containers
// are overridden with a vivid gold so they stand out from surrounding wood.

const CHEST_COLOR = '#fdc94c';
const DRESSER_COLOR = '#c97a3a';

const TILE_COLORS: Readonly<Record<number, string>> = {
  0: '#976b4b', // Dirt
  1: '#808080', // Stone
  2: '#1cd85e', // Grass
  3: '#1ac454', // Plants
  5: '#976b4b', // Tree
  6: '#8c6550', // Iron Ore
  7: '#964316', // Copper Ore
  8: '#b9a417', // Gold Ore
  9: '#b9c2c3', // Silver Ore
  10: '#77694f', // Door (closed)
  11: '#77694f', // Door (open)
  12: '#ae1845', // Heart crystal
  13: '#85d5f7', // Bottle
  14: '#bf8e6f', // Table
  15: '#bf8e6f', // Chair
  16: '#8c8274', // Bench (anvil/work)
  17: '#909490', // Furnace / Workbench machines
  18: '#bf8e6f', // Work bench
  19: '#bf8e6f', // Wood platform
  20: '#a37451', // Sapling
  21: CHEST_COLOR, // Chest
  22: '#625fa7', // Demonite Ore
  23: '#8d89df', // Corrupt Grass
  24: '#7a74da', // Corruption plants
  25: '#6d5a80', // Ebonstone
  26: '#77657d', // Demon altar
  27: '#369a36', // Sunflower
  28: '#974f50', // Pot
  29: '#af6980', // Piggy bank
  30: '#976b4b', // Wood block
  31: '#8d78a8', // Corruption mushroom
  32: '#9787b7', // Corruption thorn
  33: '#fddd03', // Candle
  34: '#eba687', // Chandelier
  35: '#e2911e', // Jackolantern
  36: '#e6595c', // Presents
  37: '#685654', // Meteorite
  38: '#808080', // Gray Stone
  39: '#b53e3b', // Crimstone alt
  40: '#925144', // Obsidian
  41: '#42546d', // Blue Brick (Dungeon)
  42: '#fbeb7f', // Hanging lantern
  43: '#54643f', // Green Brick (Dungeon)
  44: '#6b4463', // Pink Brick (Dungeon)
  45: '#b9a417', // Gold Brick
  46: '#b9c2c3', // Silver Brick
  47: '#964316', // Copper Brick
  48: '#808080', // Spike
  49: '#59c9ff', // Water candle
  50: '#aa3072', // Book
  51: '#c0cacb', // Cobweb
  52: '#17b14c', // Vines
  53: '#baa854', // Sand
  54: '#c8f6fe', // Glass
  55: '#bf8e6f', // Sign
  56: '#2b2854', // Obsidian Brick / Ebonsand
  57: '#44444c', // Ash
  58: '#8e4242', // Hellstone
  59: '#5c4449', // Mud
  60: '#8fd71d', // Jungle Grass
  61: '#87c41a', // Jungle plants
  62: '#79b018', // Jungle vines
  63: '#6e8cb6', // Sapphire
  64: '#c46072', // Ruby
  65: '#389661', // Emerald
  66: '#a0763a', // Topaz
  67: '#8c3aa6', // Amethyst
  68: '#7dbfc5', // Diamond
  69: '#be965c', // Thorny bush
  70: '#5d7fff', // Mushroom Grass
  71: '#b6af82', // Mushroom plants
  72: '#b6af82', // Mushroom plants
  73: '#1bc56d', // Grass plants alt
  74: '#60c51b', // Plant
  75: '#1a1a1a', // Obsidian brick wall ?
  76: '#8e4242', // Hellstone brick
  77: '#ee5546', // Lava lamp / Crimtane
  78: '#796e61', // Cooking pot
  79: '#bf8e6f', // Bed
  80: '#497811', // Cactus
  81: '#f585bf', // Coral
  82: '#f6c51a', // Herb (mature)
  83: '#4c96d8', // Herb (blooming)
  84: '#b9d62a', // Herb
  85: '#c0c0c0', // Tombstone
  86: '#bf8e6f', // Loom
  87: '#bf8e6f', // Piano
  88: '#bf8e6f', // Dresser
  89: '#bf8e6f', // Sofa
  90: '#909490', // Lamp post
  91: '#0d5882', // Banner
  92: '#d5e5ed', // Lamp
  93: '#fddd03', // Torch
  94: '#bf8e6f', // Bathtub
  95: '#ffa21f', // Red lantern
  96: '#909490', // Cannon
  97: '#909490', // Hellstone metal
  98: '#fddd03', // Candelabra
  99: '#bf8e6f', // Bookcase
  100: '#fddd03', // Throne
  101: '#bf8e6f', // Bowl
  102: '#e5d449', // Grandfather clock
  103: '#8d624d', // Statue
  104: '#bf8e6f', // Sawmill
  105: '#909490', // Statue (various)
  106: '#bf8e6f', // Blacksmith
  107: '#0b508f', // Cobalt Ore
  108: '#5ba9a9', // Mythril Ore
  109: '#4ec1e3', // Hallowed Grass
  110: '#30ba87', // Hallow plants
  111: '#801a34', // Adamantite Ore
  112: '#67627a', // Ebonsand alt
  113: '#30d0ea', // Hallow vines
  114: '#bf8e6f', // Anvil (mythril?)
  115: '#21abcf', // Hallow vines alt
  116: '#eee1da', // Pearlsand
  117: '#b5acbe', // Pearlstone
  118: '#eee1da', // Cobalt Brick
  119: '#6b5c6c', // Mythril Brick
  120: '#5c4449', // Mud variant
  121: '#0b508f', // Cobalt brick
  122: '#5ba9a9', // Mythril brick
  123: '#6a6b76', // Silt
  124: '#493324', // Wooden beam
  125: '#8daff', // Glass alt
  126: '#9fd1e5', // Glass
  128: '#bf8e6f', // Mannequin
  129: '#ff75e0', // Crystal Shard
  130: '#808080', // Active stone
  131: '#343434', // Inactive stone
  132: '#909490', // Lever
  133: '#909490', // Adamantite Forge
  134: '#a6bb99', // Mythril Anvil
  136: '#d5cbcc', // Switch
  137: '#909490', // Trap
  138: '#808080', // Boulder
  139: '#bf8e6f', // Music box
  140: '#625fa7', // Demonite Brick
  141: '#c03b3b', // Explosives
  142: '#909490', // Inlet/outlet pump
  143: '#909490', // Pump
  144: '#909490', // Timer
  145: '#c01e1e', // Red present
  146: '#2bc01e', // Green present
  147: '#e9efff', // Snow Block
  148: '#aac7d8', // Ice
  149: '#dc3232', // Christmas lights
  150: '#801a34', // Adamantite Brick
  151: '#beab5e', // Sandstone brick (legacy slab)
  152: '#8085b8', // Ebonwood
  153: '#ef8d7e', // Rich Mahogany
  154: '#beab5e', // Pearlwood
  155: '#83a2a1', // Rainbow brick
  156: '#aaab9d', // Ice brick
  157: '#68647e', // Shadewood
  158: '#915155', // Crimson grass
  159: '#948562', // Living mahogany
  161: '#90c3e8', // Thin Ice
  162: '#b8dbf0', // Purple Ice
  163: '#ae91d6', // Red Ice
  164: '#dab6cc', // Pink Ice
  165: '#73ade5', // Tin Plating
  166: '#817d5d', // Tin Ore
  167: '#3e5272', // Lead Ore
  168: '#849d7f', // Tungsten Ore
  169: '#98abc6', // Platinum Ore
  170: '#1b6d45', // Christmas Tree
  171: '#218755', // Christmas tree (alt)
  172: '#bf8e6f', // Sink
  173: '#fddd03', // Defenders forge
  174: '#fddd03', // Lihzahrd Altar
  175: '#817d5d', // Cobalt block
  176: '#849d7f', // Mythril block
  177: '#98abc6', // Platinum block
  178: '#d05ec9', // Gemstone display
  179: '#318672', // Echo block
  180: '#7e8631', // Echo block alt
  181: '#863b31', // Echo block alt
  182: '#2b568c', // Echo block alt
  183: '#793186', // Echo block alt
  184: '#1d6a58', // Stalactite gem
  185: '#636363', // Stalactite
  186: '#636363', // Stalactite
  187: '#636363', // Stalactite
  188: '#497811', // Cactus
  189: '#dfffff', // Cloud
  190: '#b6af82', // Glowing mushroom
  191: '#976b4b', // Living Wood
  192: '#1ac454', // Leaves
  193: '#3879ff', // Slime block
  194: '#9d9d6b', // Bone block
  195: '#861622', // Flesh block
  196: '#9390b2', // Rain cloud
  197: '#61c8e1', // Frozen slime block
  198: '#3e3d34', // Asphalt
  199: '#d05050', // Crimson grass alt
  200: '#d89890', // Flesh grass
  201: '#cb3d40', // Crimstone
  202: '#d5b21c', // Crimsand
  203: '#802c2d', // Crimstone block
  204: '#7d3741', // Crimstone alt
  205: '#ba3234', // Crimsand block
  206: '#7cafc9', // Sunplate block
  207: '#909490', // Water fountain
  208: '#586976', // Lavamoss block
  209: '#909490', // Cannon (large)
  210: '#bf8e6f', // Land mine
  211: '#bfe973', // Chlorophyte Ore
  212: '#909490', // Trap
  213: '#897843', // Jungle thorn
  214: '#676767', // Mushroom block
  215: '#fe7902', // Campfire
  216: '#bf8e6f', // Rocket launcher
  217: '#909490', // Chlorophyte extractinator
  218: '#909490', // Cooking pot alt
  219: '#909490', // Safe
  220: '#909490', // Skull lantern
  221: '#ef5a32', // Solidifier (gold-ish)
  222: '#e760e4', // Vine rope coil
  223: '#395565', // Waterfall
  224: '#6b848b', // Lavafall
  225: '#e37d16', // Hay
  226: '#8d3800', // Lihzahrd Brick
  227: '#4ac59b', // Dye plant (turquoise)
  228: '#909490', // Dye vat
  229: '#ff9c0c', // Honey Block
  230: '#834f0d', // Honey block alt
  231: '#e0c265', // Hive
  232: '#915155', // Crimson plants
  233: '#6bb61d', // Jungle grass alt
  234: '#352c29', // Lihzahrd alt
  235: '#d6b82e', // Hive Wall variant
  236: '#95e857', // Plantera bulb
  237: '#fff133', // Life fruit
  238: '#e180ce', // Chlorophyte
  239: '#e0c265', // Hive variant
  240: '#78553c', // Painting
  241: '#4d4a48', // Painting
  243: '#c6c4aa', // Imbuing station
  244: '#c8f5fd', // Bubble machine
  245: '#633220', // Painting
  246: '#633220', // Painting
  247: '#8c9696', // Cobalt shield
  248: '#db4726', // Crimsand alt
  249: '#eb26e7', // Shimmer dust
  250: '#56555c', // Lead anvil
  251: '#eb9617', // Honey dispenser
  252: '#99832c', // Larva
  253: '#393061', // Wizard's stand
  254: '#f89e5c', // Pumpkin
  255: '#6b319a', // Hallowed bar block
  256: '#9a9431', // Mannequin alt
  257: '#31319a', // Mannequin alt
  258: '#319a44', // Mannequin alt
  259: '#9a314d', // Mannequin alt
  260: '#555976', // Mannequin alt
  261: '#9a5331', // Mannequin alt
  262: '#dd4fff', // Lihzahrd torch
  263: '#faff4f', // Living torch
  264: '#4f66ff', // Lihzahrd torch
  265: '#4fff59', // Lihzahrd torch
  266: '#ff4f4f', // Demon torch
  267: '#f0f0f7', // White torch
  268: '#ff914f', // Orange torch
  269: '#bf8e6f', // Coral wall hanger
  270: '#bbff6b', // Bubble
  271: '#6bfaff', // Bubble
  272: '#797765', // Marble
  273: '#808080', // Granite
  274: '#beab5e', // Sandstone brick
  283: '#808080', // Misc grey
  396: '#c67c4e', // Copper Plating
  397: '#d4c064', // Sandstone
  400: '#604475', // Hardened Ebonsand
  401: '#443c33', // Hardened Crimsand
  404: '#d49458', // Hardened Pearlsand
  407: '#ffe384', // Defender's forge
  408: '#555352', // Marble alt
  411: '#e32e2e', // Crimsand alt
  441: CHEST_COLOR, // Chest (alt)
  467: CHEST_COLOR, // Chest (alt)
  468: CHEST_COLOR, // Chest (alt)
  470: '#bf8e6f', // Loom alt
  471: '#bf8e6f', // Sewing machine
  481: '#42546d', // Crimson hardened
  482: '#54643f', // Pearl hardened
  483: '#6b4463', // Corruption hardened
  488: '#7f5c45', // Dresser
  489: '#ff1d88', // Shadewood platform
  490: '#d3d3d3', // Pearlwood platform
  491: '#3c14a0', // Void vault
  494: '#e0dbec', // Lihzahrd platform
  517: '#fe7902', // Crimson grass
  518: '#1ac454', // Grass plants
  519: '#1cd86d', // Plants alt
  521: '#7ad9e8', // Hellstone Brick (echo)
  522: '#7ad9e8', // Obsidian Brick (echo)
  548: '#fa6432', // Crimsand alt
  574: '#4c392c', // Living Mahogany
  583: '#7f7f7f', // Stalactite
  584: '#7f7f7f', // Stalactite
  591: '#725138', // Furniture set
  595: '#976b4b', // Tree variant
  596: '#976b4b', // Tree variant
  615: '#976b4b', // Tree variant
  616: '#976b4b', // Tree variant
  621: '#fafafa', // Crystal Block
  622: '#ebebf9', // Aether
  624: '#d25b4d', // Sandstone Slab
  381: '#fe7902', // Lava Moss
  534: '#72fe02', // Krypton Moss
  536: '#00c5d0', // Xenon Moss
  539: '#d0007e', // Argon Moss
  625: '#dc0ced', // Neon Moss
  627: '#ff4c4c', // Helium Moss
  687: '#fe7902', // Lava Moss Brick
  688: '#d0007e', // Argon Moss Brick
  689: '#72fe02', // Krypton Moss Brick
  690: '#00c5d0', // Xenon Moss Brick
  691: '#dc0ced', // Neon Moss Brick
  692: '#ff4c4c', // Helium Moss Brick
  629: '#7ad9e8', // Sub-biome block
  633: '#d28c64', // Sandstone variant
  634: '#917878', // Lihzahrd variant
  637: '#c87850', // Sandstone variant
  638: '#c87850', // Sandstone variant
  656: '#157cd4', // Blue Brick alt
  661: '#8d89df', // Corrupt variant
  662: '#d05050', // Crimson variant
  664: '#808080', // Cracked block
  668: '#976b4b', // Dirt variant
  700: '#d25b4d', // Sandstone variant
  701: '#157cd4', // Blue Brick alt
  711: '#808080', // Stone variant
  712: '#808080', // Stone variant
  713: '#808080', // Stone variant
  714: '#808080', // Stone variant
  715: '#808080', // Stone variant
  716: '#808080', // Stone variant
  720: '#a4afaf', // Lavamoss
  721: '#4db090', // Argon moss
  722: '#b9be14', // Krypton moss
  723: '#b9be14', // Xenon moss
  734: '#a07350', // Reef block
  735: '#ebc814', // Sunflower
  // Containers/dressers extra hint
  10000: DRESSER_COLOR, // reserved sentinel; unused
};

const WALL_COLORS: Readonly<Record<number, string>> = {
  1: '#343434', // Stone Wall
  2: '#583d2e', // Dirt Wall
  3: '#3d3a4e', // Ebonstone Wall
  4: '#493324', // Wood Wall
  5: '#343434', // Gray Brick Wall
  6: '#5b1e1e', // Red Brick Wall
  7: '#1b1f2a', // Blue Brick Wall
  8: '#1f271a', // Green Brick Wall
  9: '#291c24', // Pink Brick Wall
  10: '#4a3e0c', // Gold Brick Wall
  11: '#2e383b', // Silver Brick Wall
  12: '#4b200b', // Copper Brick Wall
  13: '#432525', // Obsidian Brick Wall
  14: '#0f0f0f', // Hellstone Brick Wall
  15: '#342b2d', // Pearlstone Brick Wall
  16: '#583d2e', // Iridescent Brick
  17: '#1b1f2a', // Mudstone Brick Wall
  18: '#1f271a', // Cobalt Brick Wall
  19: '#291c24', // Mythril Brick Wall
  20: '#0f0f0f', // Adamantite Brick Wall
  21: '#71636e', // Demonite Brick Wall
  22: '#716363', // Stone Slab
  23: '#26262b', // Sandstone Brick Wall
  24: '#352729', // Ebonstone Brick Wall
  25: '#0b233e', // Blue Slab
  26: '#153f46', // Pearlstone Brick Wall alt
  27: '#583d2e', // Snow Brick Wall
  28: '#515465', // Amethyst Brick
  29: '#581717', // Crimstone Brick Wall
  30: '#1c5817', // Jungle Wall
  31: '#4e5763', // Flower Wall
  32: '#561128', // Diamond
  33: '#312f53', // Cave Wall
  34: '#454329', // Cave Wall
  35: '#333346', // Sand Wall
  36: '#573b37', // Snow Wall
  37: '#454329', // Mushroom Wall
  38: '#313931', // Demonite Wall
  39: '#4e4f49', // Crimstone Wall
  40: '#556667', // Crimson Wall
  41: '#34323e', // Glass Wall
  42: '#472a2c', // Confetti Wall
  43: '#494232', // Spider Wall
  44: '#343434', // Marble Wall
  45: '#3c3b33', // Granite Wall
  46: '#30392f', // Crystal Wall
  47: '#474d55', // Mushroom Wall
  48: '#343434', // Cave Wall
  49: '#343434', // Cave Wall
  50: '#343434', // Cave Wall
  51: '#343434', // Cave Wall
  52: '#343434', // Cave Wall
  53: '#343434', // Cave Wall
  54: '#283832', // Sandstone Wall
  55: '#313024', // Glass Wall
  56: '#2b2120', // Mythril Wall
  57: '#1f2831', // Adamantite Wall
  58: '#302334', // Demonite Wall
  59: '#583d2e', // Dirt cave
  60: '#013414', // Jungle vine
  61: '#37291a', // Wood Wall alt
  62: '#27211a', // Cave Wall
  63: '#1e5030', // Jungle Wall alt
  64: '#35501e', // Crimson Wall alt
  65: '#1e5030', // Pearlstone variant
  66: '#1e5030', // Pearl Wall
  67: '#35501e', // Pearl
  68: '#1e5030', // Mushroom variant
  69: '#2b2a44', // Spider Wall
  70: '#1e4650', // Ice Wall
  71: '#4e6987', // Crystal
  72: '#34540c', // Mushroom Wall
  73: '#bed3df', // Cloud Wall
  74: '#403e50', // Sunplate
  75: '#414123', // Sunplate alt
  76: '#142e68', // Mythril Wall
  77: '#3d0d10', // Crimstone Wall
  78: '#3f271a', // Wood Wall
  79: '#332f60', // Mushroom Wall
  80: '#403e50', // Slime Wall
  81: '#653333', // Crimstone alt
  82: '#4d4022', // Hive Wall
  83: '#3e2629', // Sand Wall
  84: '#304e5d', // Snow Wall
  85: '#363f45', // Granite
  86: '#8a4926', // Honey Wall
  87: '#1b1f2a', // Blue Dungeon Wall
  88: '#581717', // Green Dungeon Wall
  89: '#3a1c2a', // Pink Dungeon Wall
  108: '#8a4926', // Honey wall alt
  109: '#5e1911', // Crimstone wall
  110: '#7d247a', // Demonite wall
  111: '#33231b', // Lihzahrd wall
  112: '#320f08', // Crimstone wall
  113: '#873a00', // Hive wall
  114: '#41340f', // Mushroom wall
  115: '#272a33', // Cobalt
  116: '#591a1b', // Crimson Cavern Wall
  117: '#7e7b73', // Granite Wall
  118: '#083213', // Jungle
  119: '#5f1518', // Crimson
  120: '#111f41', // Cobalt
  121: '#c0ad8f', // Ice
  122: '#727283', // Cave
  123: '#887707', // Lihzahrd
  124: '#084803', // Jungle variant
  125: '#758452', // Jungle alt
  126: '#646672', // Cave
  127: '#1e76e2', // Tin plating
  128: '#5d0666', // Demonite wall
  129: '#4028a9', // Cobalt
  130: '#2722b4', // Mythril
  131: '#575e7d', // Marble
  132: '#060606', // Demonic
  133: '#4548ba', // Cobalt
  134: '#823e10', // Wood Wall
  135: '#167ba3', // Glass
  136: '#285697', // Cobalt brick
  137: '#b74b0f', // Copper brick
  138: '#535064', // Marble
  139: '#734144', // Crimson
  140: '#776c51', // Sandstone
  141: '#3b4347', // Cave
  142: '#ded8ca', // Cloud
  143: '#5a7069', // Marble
  144: '#3e1c57', // Demonite
  146: '#783b13', // Wood
  147: '#3b3b3b', // Stone slab
  148: '#e5daa1', // Pearlstone
  149: '#493b32', // Wood
  151: '#664b22', // Wood
  154: '#dd4fff', // Demonite alt
  155: '#f0f0f7', // White brick
  156: '#4fff59', // Crystal
  157: '#9a5331', // Hive
  158: '#6b319a', // Demonite
  159: '#555976', // Cave
  160: '#319a44', // Mushroom
  161: '#9a314d', // Crimson
  162: '#31319a', // Cobalt
  163: '#9a9431', // Hive
  164: '#ff4f4f', // Crimson Wall
  165: '#4f66ff', // Cobalt
  166: '#faff4f', // Sunplate
  167: '#464433', // Cave
  168: '#5a6e6f', // Marble Wall
  170: '#3b2716', // Sandstone Wall
  171: '#3b2716', // Sandstone variant
  175: '#6e6b73', // Granite Wall
  176: '#4a4558', // Cave Wall
  187: '#955033', // Copper Brick
  196: '#3b5043', // Jungle Vine Wall
  216: '#9e6440', // Lihzahrd brick wall
  217: '#3e2d4b', // Spooky Wall
  224: '#393734', // Crimson Wall
  244: '#3f271a', // Pink Slime Wall
  246: '#3d3a4e', // Hive Wall
  315: '#b5e61d', // Glowing wall
  316: '#7d6464', // Dungeon variant
  317: '#7d6464', // Dungeon variant
  330: '#99a4bb', // Reef Wall
  346: '#343434', // Cave Wall
  347: '#644182', // Hallowed Wall
  348: '#784b4b', // Crimstone Wall
  349: '#343434', // Cave Wall
  351: '#c5944c', // Solar Brick Wall (Lunar)
  353: '#1b6d45', // Pine Wall
  94: '#20282d', // Blue Slab Wall (Dungeon)
  95: '#2c2932', // Blue Tiled Wall (Dungeon)
  96: '#48324d', // Pink Slab Wall (Dungeon)
  97: '#4e3245', // Pink Tiled Wall (Dungeon)
  98: '#242d2c', // Green Slab Wall (Dungeon)
  99: '#263132', // Green Tiled Wall (Dungeon)
  200: '#8f327b', // Hallowed Prism Wall
  201: '#887883', // Hallowed Cavern Wall
  202: '#db5c8f', // Hallowed Shard Wall
  203: '#714096', // Hallowed Crystalline Wall
  218: '#390e0c', // Hardened Crimsand Wall
  219: '#604885', // Hardened Pearlsand Wall
  220: '#433750', // Ebonsandstone Wall
  221: '#40251d', // Crimsandstone Wall
  222: '#46335b', // Pearlsandstone Wall
  235: '#8c4b30', // Smooth Sandstone Wall
  341: '#642801', // Lava Moss Brick Wall
  342: '#5c1e48', // Argon Moss Brick Wall
  343: '#2a5101', // Krypton Moss Brick Wall
  344: '#01516d', // Xenon Moss Brick Wall
  345: '#381661', // Neon Moss Brick Wall
};

const LIQUID_COLORS: Readonly<Record<number, string>> = {
  1: '#093dbf', // water
  2: '#fd2003', // lava
  3: '#fec214', // honey
  4: '#a17fff', // shimmer
};

// Backdrop band colors ported verbatim from TerraMap (main.js:1019, getTileColor).
// When a cell carries no tile / liquid / wall, the rendered color depends purely
// on its world Y relative to the three world-layer breakpoints.
const SKY_TOP_RGB = [8, 47, 99] as const;
const SKY_HORIZON_RGB = [132, 170, 248] as const;

export const SKY_TOP_COLOR = '#082f63'; // deep navy sky
export const SKY_BAND_COLOR = '#84aaf8'; // rgb(132, 170, 248), horizon / surface sky
export const DIRT_BAND_COLOR = '#583d2e'; // rgb( 88,  61,  46)
export const ROCK_BAND_COLOR = '#4a433c'; // rgb( 74,  67,  60)
export const HELL_BAND_COLOR = '#000000';

// Kept exported for legacy callers of getTileColor(-1); the actual render path
// resolves the air color through getBackgroundColor() against the world layers.
export const AIR_COLOR = SKY_BAND_COLOR;

const DEFAULT_TILE_COLOR = '#555555';
const DEFAULT_WALL_COLOR = '#3a3a3a';
const DEFAULT_LIQUID_COLOR = '#093dbf';

export type BackgroundBand = 'sky' | 'dirt' | 'rock' | 'hell';

export interface BackgroundBreakpoints {
  readonly surface: number;
  readonly rock: number;
  readonly hell: number;
}

function isUsableSurfaceBreakpoint(value: number, worldHeight: number): boolean {
  if (!Number.isFinite(value) || value <= 0) return false;
  if (worldHeight < 100) return true;
  const minSurfaceY = Math.max(16, worldHeight * 0.05);
  const maxSurfaceY = worldHeight * 0.75;
  return value >= minSurfaceY && value < maxSurfaceY;
}

function isUsableLowerBreakpoint(value: number, previous: number, worldHeight: number): boolean {
  if (!Number.isFinite(value) || value <= previous) return false;
  if (worldHeight < 100) return true;
  return value < worldHeight * 1.25;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function hexByte(value: number): string {
  return Math.round(value).toString(16).padStart(2, '0');
}

function interpolateColor(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  t: number
): string {
  const ratio = clamp01(t);
  const r = from[0] + (to[0] - from[0]) * ratio;
  const g = from[1] + (to[1] - from[1]) * ratio;
  const b = from[2] + (to[2] - from[2]) * ratio;
  return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`;
}

// Resolves the three layer breakpoints. Prefers the .wld metadata when each
// value looks sane; otherwise falls back to Terraria/TerraMap-derived defaults:
//   surface ≈ 0.20 · h
//   rock    ≈ 0.34 · h
//   hell    = h - 235   (Terraria reserves the bottom 235 rows for hell on
//                        every world size; the formula is
//                        `((maxTilesY - 230) - surface)/6 * 6 + surface - 5`,
//                        which simplifies to `maxTilesY - 235`.)
// Naive proportional fallbacks (e.g. hell = h·0.9) misclassify small worlds:
// h=1200 yields hell=1080 instead of 965 and paints ~115 rows of true hell as
// rock band.
export function resolveBackgroundBreakpoints(
  worldHeight: number,
  worldSurfaceY: number,
  rockLayerY: number,
  hellLayerY: number
): BackgroundBreakpoints {
  const h = Number.isFinite(worldHeight) && worldHeight > 0 ? worldHeight : 1200;
  const surface = isUsableSurfaceBreakpoint(worldSurfaceY, h) ? worldSurfaceY : Math.floor(h * 0.2);
  const rock =
    isUsableLowerBreakpoint(rockLayerY, surface, h) && rockLayerY > surface
      ? rockLayerY
      : Math.max(Math.floor(h * 0.34), surface + 1);
  const hell =
    isUsableLowerBreakpoint(hellLayerY, rock, h) && hellLayerY > rock
      ? hellLayerY
      : Math.max(Math.floor(h - 235), rock + 1);
  return { surface, rock, hell };
}

// Per-column open-sky surface_y refines the sky/dirt boundary inside the
// surface band only. It can EXTEND sky downward when a column has air below
// the global surface (canyons, spawn arenas) but is clamped to bp.rock so
// caves and hell can never be repainted as sky — no matter how bogus or
// maximal the per-column value is.
function effectiveSurfaceY(bp: BackgroundBreakpoints, openSkySurfaceY: number | undefined): number {
  if (openSkySurfaceY === undefined || !Number.isFinite(openSkySurfaceY) || openSkySurfaceY <= 0) {
    return bp.surface;
  }
  return Math.min(Math.max(bp.surface, openSkySurfaceY), bp.rock);
}

// Single rule: given a depth and resolved breakpoints, return the band.
export function classifyBackgroundBand(
  worldY: number,
  bp: BackgroundBreakpoints,
  openSkySurfaceY?: number
): BackgroundBand {
  const surface = effectiveSurfaceY(bp, openSkySurfaceY);
  if (worldY < surface) return 'sky';
  if (worldY < bp.rock) return 'dirt';
  if (worldY < bp.hell) return 'rock';
  return 'hell';
}

export function getSkyGradientColor(worldY: number, surfaceY: number): string {
  const denominator = Math.max(surfaceY - 1, 1);
  const t = Number.isFinite(worldY) ? worldY / denominator : 0;
  return interpolateColor(SKY_TOP_RGB, SKY_HORIZON_RGB, t);
}

export function getBackgroundColor(
  worldY: number,
  worldSurfaceY: number,
  rockLayerY: number,
  hellLayerY: number,
  worldHeight = Number.NaN,
  openSkySurfaceY = Number.NaN
): string {
  const bp = resolveBackgroundBreakpoints(worldHeight, worldSurfaceY, rockLayerY, hellLayerY);
  const surface = effectiveSurfaceY(bp, openSkySurfaceY);
  if (worldY < surface) {
    // Sky gradient depends on the GLOBAL surface (bp.surface), never on the
    // per-column openSkySurfaceY. Two adjacent columns whose terrain heights
    // differ must produce the same sky color at a given worldY, so a column
    // dip cannot draw a brighter vertical streak. When a cell is classified
    // as sky but sits at or below the global surface (canyon air below the
    // average terrain line) we clamp to the horizon row so the result is
    // SKY_BAND_COLOR rather than an extrapolation past the gradient end.
    const denom = Math.max(bp.surface, 1);
    const clampedY = Math.min(worldY, Math.max(bp.surface - 1, 0));
    return getSkyGradientColor(clampedY, denom);
  }
  if (worldY < bp.rock) return DIRT_BAND_COLOR;
  if (worldY < bp.hell) return ROCK_BAND_COLOR;
  return HELL_BAND_COLOR;
}

export function getTileColor(tileId: number): string {
  if (tileId < 0) return AIR_COLOR;
  return TILE_COLORS[tileId] ?? FALLBACK_TILE_COLORS[tileId] ?? DEFAULT_TILE_COLOR;
}

export function getWallColor(wallId: number): string {
  return WALL_COLORS[wallId] ?? FALLBACK_WALL_COLORS[wallId] ?? DEFAULT_WALL_COLOR;
}

export function getLiquidColor(liquidType: number): string {
  return LIQUID_COLORS[liquidType] ?? DEFAULT_LIQUID_COLOR;
}
