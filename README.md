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

## Not yet

- Seeds made in the page (the randomizer is a large Python program; for now
  ootrandomizer.com makes them).
- Item pictures (the tracker uses names for now).
- A map with checks and logic.
- Crowd Control effects.
- Joining Rando Hub (planned the same way as Zelda 1: a copy of this app served
  inside the hub).

## Licenses

The emulator in `data/` is [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS)
(GPL-3.0) with the [mupen64plus-next](https://github.com/EmulatorJS/mupen64plus-libretro-nx)
libretro core (GPL-2.0); their licenses are in `LICENSES/`. Ocarina of Time is
Nintendo's; this project includes no game data.
