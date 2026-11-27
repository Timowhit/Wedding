/**
 * Writes public/css/themes.css from src/themes.js.
 * Usage: npm run build:themes   (tests fail when the file is out of date)
 */
import { writeFile } from 'node:fs/promises';
import { renderThemesCss } from '../src/themes.js';

const target = new URL('../public/css/themes.css', import.meta.url);
await writeFile(target, renderThemesCss());
console.info(`Wrote ${target.pathname}`);
