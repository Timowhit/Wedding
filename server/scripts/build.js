/* eslint-disable no-console */
/**
 * @file scripts/build.js
 * @description Production build for the Forever Planner frontend.
 *
 * What it does:
 *   1. Cleans dist/
 *   2. Bundles + minifies each JS entry point  →  dist/scripts/
 *   3. Minifies main.css                        →  dist/styles/
 *   4. Copies all HTML files                    →  dist/
 *
 * Usage:
 *   node scripts/build.js           # one-off production build
 *   node scripts/build.js --watch   # rebuild on file changes (dev)
 *
 * Output folder: dist/
 * The Express static middleware in server.js should point at dist/
 * in production (swap 'public' → 'dist').
 */

"use strict";

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

/* ── Config ──────────────────────────────────────────────────── */
const ROOT = path.join(__dirname, "../..");
const SRC = path.join(ROOT, "public");
const DIST = path.join(ROOT, "dist");
const WATCH = process.argv.includes("--watch");
const IS_PROD = !WATCH;

// One entry point per HTML page — esbuild resolves their imports automatically
const JS_ENTRIES = [
  "scripts/budget.js",
  "scripts/checklist.js",
  "scripts/guests.js",
  //"scripts/index.js",
  "scripts/inspiration.js",
  "scripts/invite.js",
  "scripts/login.js",
  "scripts/music.js",
  "scripts/settings.js",
  "scripts/vendors.js",
  "scripts/dashboard.js",
  //"scripts/weddings.js",
].map((f) => path.join(SRC, f));

const CSS_ENTRY = path.join(SRC, "styles", "main.css");

/* ── Helpers ─────────────────────────────────────────────────── */

/** Remove and recreate dist/ */
function clean() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST, "styles"), { recursive: true });
  fs.mkdirSync(path.join(DIST, "scripts"), { recursive: true });
  console.log("✓ dist/ cleaned");
}

/** Copy every *.html from public/ into dist/ */
function copyHtml() {
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".html"));
  for (const file of files) {
    // eslint-disable-next-line node/no-unsupported-features/node-builtins
    fs.copyFileSync(path.join(SRC, file), path.join(DIST, file));
  }
  console.log(`✓ ${files.length} HTML files copied`);
}

/** Rewrite <script src="scripts/X.js"> to point at the bundled file.
 *  esbuild outputs bundle-[name].js so the src paths need updating. */
function rewriteHtmlScriptTags() {
  const files = fs.readdirSync(DIST).filter((f) => f.endsWith(".html"));
  for (const file of files) {
    const fullPath = path.join(DIST, file);
    let html = fs.readFileSync(fullPath, "utf8");

    // e.g.  src="scripts/budget.js"  →  src="scripts/budget.bundle.js"
    html = html.replace(
      /(<script[^>]+src=["'])scripts\/([^"']+\.js)(["'])/g,
      (_, prefix, name, suffix) =>
        `${prefix}scripts/${name.replace(".js", ".bundle.js")}${suffix}`,
    );

    fs.writeFileSync(fullPath, html);
  }
  console.log("✓ HTML script tags rewritten");
}

/* ── Build options ───────────────────────────────────────────── */

/** Shared esbuild options for JS bundles */
function jsOptions(_watch) {
  return {
    entryPoints: JS_ENTRIES,
    entryNames: "[name].bundle",
    bundle: true,
    format: "esm",
    outdir: path.join(DIST, "scripts"),
    platform: "browser",
    target: ["chrome100", "firefox100", "safari16", "edge100"],
    sourcemap: !IS_PROD,
    minify: IS_PROD,
    // Tree-shake dead code in production
    treeShaking: IS_PROD,
    // Print file sizes after build
    metafile: true,
    logLevel: "info",
  };
}

/** Shared esbuild options for the CSS bundle */
function cssOptions() {
  return {
    entryPoints: [CSS_ENTRY],
    bundle: true,
    outdir: path.join(DIST, "styles"),
    minify: IS_PROD,
    sourcemap: !IS_PROD,
    logLevel: "info",
  };
}

/* ── Size reporter ───────────────────────────────────────────── */
function reportSizes(meta) {
  if (!meta?.outputs) {
    return;
  }
  const outputs = Object.entries(meta.outputs)
    .filter(([f]) => !f.endsWith(".map"))
    .sort(([, a], [, b]) => b.bytes - a.bytes);

  console.log("\nBundle sizes:");
  for (const [file, { bytes }] of outputs) {
    const kb = (bytes / 1024).toFixed(1);
    const name = path.relative(ROOT, file);
    console.log(`  ${kb.padStart(6)} kB  ${name}`);
  }
}

/* ── Main ────────────────────────────────────────────────────── */
(async () => {
  if (WATCH) {
    // ── Watch mode (development) ──────────────────────────
    console.log("👀  Watch mode — rebuilding on changes…\n");

    const [jsCtx, cssCtx] = await Promise.all([
      esbuild.context(jsOptions(true)),
      esbuild.context(cssOptions()),
    ]);

    // Initial build
    clean();
    copyHtml();
    rewriteHtmlScriptTags();
    await Promise.all([jsCtx.rebuild(), cssCtx.rebuild()]);

    await Promise.all([jsCtx.watch(), cssCtx.watch()]);
    console.log("\n✅  Watching for changes. Ctrl-C to stop.");
  } else {
    // ── Production build ──────────────────────────────────
    console.log("🔨  Building for production…\n");
    const start = Date.now();

    clean();
    copyHtml();

    const [jsResult] = await Promise.all([
      esbuild.build(jsOptions(false)),
      esbuild.build(cssOptions()),
    ]);

    rewriteHtmlScriptTags();

    if (jsResult.metafile) {
      reportSizes(jsResult.metafile);
    }

    console.log(`\n✅  Build complete in ${Date.now() - start}ms`);
    console.log("    Output → dist/\n");
  }
})().catch((err) => {
  console.error("\n❌  Build failed:", err.message);
  throw new Error("Build failed");
});
