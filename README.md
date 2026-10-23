# OoTR — play and track Ocarina of Time Randomizer seeds in one page

The Ocarina of Time sibling of Rando Hub's Zelda 3 and Zelda 1 apps (standalone
for now). Play a randomized Ocarina of Time in the browser with an item tracker
beside it that follows along as you play. Works on PC and iPad (touch controls
come with the emulator).

## Playing

1. Make a seed on [ootrandomizer.com](https://ootrandomizer.com/generator) and patch
   it there with your own **Ocarina of Time 1.0 (NTSC-U)** ROM. Their page patches in
   your browser and gives you a `.z64`.
2. Open this page and press **Play ROM file**, then pick that `.z64`.
3. Next time, **Continue** starts the last ROM again without picking the file.

Your ROM stays on your device. In-game saves (SRAM) are kept in this browser for
each ROM, and save states are under the emulator's own menu.

## What's in the page

```
index.html
├── data/            EmulatorJS 4.2.3 (GPL-3.0) and its mupen64plus-next N64 core
├── js/patcher.js    decompresses your ROM and applies a .zpf patch (ported from the
│                    randomizer: Decompress, N64Patch.py, crc.py); reads item pictures
├── js/patch-worker.js   runs the patcher off the page
├── js/seed.js       the New seed dialog (relay + patch file)
├── js/icons.js      item pictures, drawn from your ROM
├── js/ram.js        finds the N64's RAM inside the emulator and reads it
├── js/tracker.js    items, equipment, songs, stones and medallions, dungeons
└── js/app.js        picking a ROM, starting the emulator, Continue
```

**Autotracking.** EmulatorJS has no "read RAM" call, so `js/ram.js` finds the
N64's 8 MB RDRAM inside the core's memory once, by Ocarina of Time's save marker
`ZELDAZ` (gSaveContext + 0x1C, gSaveContext = 0x8011A5D0 in NTSC 1.0), then reads
the save context directly: items, equipment, upgrades, quest items (songs,
stones, medallions, Stone of Agony, Gerudo Card, heart pieces), dungeon items
(boss key, map, compass), small keys in hand, hearts and Gold Skulltula tokens.
mupen stores RDRAM as 32-bit words in the computer's byte order, so byte A is at
`base + (A ^ 3)`.

Counts only ever go up during a session. Every item can also be clicked by hand
(right click or press and hold to go back down), so the tracker works without
autotracking too.

**Patching.** `js/patcher.js` is a JavaScript port of the randomizer's own
decompressor and patch code. Tested against them: the same synthetic ROM gives
byte-identical output from the randomizer's C decompressor and Python patcher
(header checksum included). The result is the randomizer's uncompressed 64 MB
ROM, which emulators play as is.

**Item pictures** are read out of the ROM you play (the game's own icon files,
`icon_item_static` at 0x7BD000 and `icon_item_24_static` after it), so none of
the game's art is in this repository. Before a ROM is loaded the tracker shows
names.

## Seed relay (Cloudflare)

ootrandomizer.com's API needs a key, which can't sit in a web page. Ask TreZ on
the [OoT Randomizer Discord](https://discord.ootrandomizer.com) for one, then
deploy `relay/ootr-worker.js` as a Cloudflare Worker named `ootr-relay` and add
the key as a secret named `OOTR_API_KEY` (steps at the top of the file). The app
uses `https://ootr-relay.hugecrankhank.workers.dev`; change it in New seed →
Seed relay if yours differs. The presets come from the randomizer's Dev branch
(`presets/presets.json`), so pick the Dev version when rolling with them.

## Not yet

- A map with checks and logic.
- Crowd Control effects.
- Joining Rando Hub (planned the same way as Zelda 1: a copy of this app served
  inside the hub).

## Licenses

The emulator in `data/` is [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS)
(GPL-3.0) with the [mupen64plus-next](https://github.com/EmulatorJS/mupen64plus-libretro-nx)
libretro core (GPL-2.0); their licenses are in `LICENSES/`. Ocarina of Time is
Nintendo's; this project includes no game data.
