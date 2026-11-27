# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas). No dependencies, no build step, no tests, no linter. UI text and README are in Spanish.

## Running

Open `index.html` directly, or serve statically (e.g. `python -m http.server 8000`, `npx serve .`) and visit `http://localhost:8000`.

## Architecture

Three files: `index.html` (markup; canvases `#board` 300x600 and `#next-canvas` 120x120, HUD spans, `#overlay`), `style.css`, and `game.js` (all logic, loaded as a classic script, `'use strict'`).

`game.js` is one flat script with module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, ...) declared in a single `let` and reset by `init()`. Key points:

- **Pieces**: `PIECES[type]` are 2D matrices whose cell values are the type index (1-7), which also indexes `COLORS`. `board` cells hold that same index (0 = empty). `randomPiece()` is uniform random (no 7-bag).
- **Rotation**: `rotateCW` + `tryRotate` with horizontal-only kicks `[0,-1,1,-2,2]`. Clockwise only.
- **Game loop**: `loop(ts)` is a `requestAnimationFrame` loop that accumulates `dropAccum` and does gravity when it exceeds `dropInterval`, then calls `draw()` every frame. Pause/game-over cancel the rAF via `animId`; `init()` and unpausing restart it.
- **Piece lifecycle**: `lockPiece()` = `merge()` -> `clearLines()` -> `spawn()`. `spawn()` promotes `next`, generates a new `next`, and calls `endGame()` if the new piece collides immediately.
- **Scoring/level**: `LINE_SCORES[cleared] * level`; level = `levelBase + floor(lines/10) + 1` (`levelBase = startLevel-1`, set by `init()` from `startLevel`, 1–10, persisted in `localStorage['startLevel']` and chosen in the pause menu); `dropInterval = max(100, 1000 - (level-1)*90)`. Soft drop +1/cell, hard drop +2/cell. HUD is updated via `updateHUD()` (called in `clearLines`, `softDrop`, and after every keydown).
- **Pause menu**: `P`/`Escape` -> `togglePause()` opens `#pause-menu` inside the overlay (Reanudar / Reiniciar / Ver controles / Nivel inicial); `menuKey(e)` runs first in the `keydown` listener and consumes all keys while paused (arrows/Enter navigate buttons).
- **Input**: single `keydown` listener (arrows, `X` also rotates, Space hard drop, `P`/`Esc` pause). Restart button re-runs `init()`. Keys are ignored until the game starts (`started`) and while an `<input>` has focus.
- **Start screen & records**: `init()` no longer runs on load; the `#start-screen` Jugar button sets `started` and calls `init()`. The "Records" section of `game.js` keeps the top 5 in `localStorage['tetris-records']` and best combo / max lines in `tetris-records-stats` (all access in try/catch, data sanitized on load). `endGame()` calls `showGameOverRecords()` (name form if the score qualifies); `clearLines` tracks `combo`/`maxCombo`. `draw()` returns early when `current` is undefined.
- **Skins**: `SKINS` (retro/neon/pastel/pixel) define `palette(light)` y `drawBlock(context, px, py, color, size)`; `drawBlock`/`drawNutHole` delegan en la skin activa (`skinName`, guardada en `localStorage['skin']`, selector `#skin-select`). `applySkin()` pone `data-skin` en `<html>` (Neon fuerza fondo negro vía CSS) y llama a `applyTheme()` para repintar.
