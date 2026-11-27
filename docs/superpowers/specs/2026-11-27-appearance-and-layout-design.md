# Appearance and venue layout: design

Status: built without a separate approval round, at the product owner's request ("continue working on the unfinished tasks") · 2026-11-27 · branch `appearance-and-layout`

These are the six ideas the product owner added to `notes.txt`. Every choice the product owner did not make is marked _(call)_.

## Goals

1. **Short-lived notices.** Success and info flashes ("10 example tasks added", "Signed in") fade after 4 seconds _(call: "a couple of seconds" is too short to read a sentence)_.
   - The timer pauses while the pointer or focus is on the notice.
   - A close button appears with JavaScript.
   - Errors stay until dismissed, because people need them to fix the form.
   - Without JavaScript, nothing changes.
2. **Live appearance settings.** In Settings → Appearance, picking a palette, a mode or a colour changes the page at once and saves itself, so there's no scrolling down to a Save button.
   - Without JavaScript, the Save button still works.
   - A new **Custom** palette takes three colours (primary, secondary, accent) and a background. The background is neutral or a light tint of one of the three colours: _(call)_ a tint keeps text readable, whereas a free background colour could make it unreadable.
3. **Wedding colours page** (`/colors`): the wedding's palette as named swatches, up to 12. Add a colour by:
   - the colour picker, or by typing a hex code
   - **uploading an image** or **taking a picture**: the browser suggests the image's main colours, and you tap the ones to keep. The image is never uploaded _(call: no file storage exists yet, and a photo of a venue or a dress may be private)_. This part needs JavaScript; without it the page says so and the picker still works.
   - **"Use these colours for the app"**: choose primary, secondary, accent and background from the swatches. Inside that wedding, everyone then sees those colours _(call: they win over a planner's brand palette, because the couple's colours are the point; light/dark mode stays personal)_. A button turns it off again.
4. **Venue layout page** (`/layout`): a floor plan of the room, drawn to scale.
   - **Room:** width and depth, in feet or metres.
   - **Seating tables:** place them from the seating chart, round or rectangular. Each shows its name and "6/8 seated".
   - **Fixtures:** dance floor, stage, bar, buffet, DJ, cake, gifts, photo booth, entrance, other. Each has a label, a size and a rotation.
   - **With JavaScript:** drag pieces to move them; it saves on drop.
   - **Without JavaScript:** each piece has a form with its position, size and rotation.
   - **Who can do what:** viewers see the plan only, and editors change it.
   - The plan prints, and is saved for offline use with the other event-day pages _(call)_.
5. **New logo:** two interlocking rings drawn in SVG (primary and accent colours, so the logo follows the theme), with the "Forever Planner" wordmark. The same mark is the favicon.
6. **Wedding selector:** a pill-shaped control with the rings icon, the wedding's name and its date.
   - Someone with one wedding sees the name as text, not as a dropdown.

## Non-goals

- Storing uploaded images (a later "files" release).
- A custom brand palette for planners. Brand palettes stay the preset ones for now.
- Collision checks or automatic table arrangement on the floor plan.

## Details

- **Custom colours as a key.**
  - Four colours become a key such as `a85a73-4f7a59-b8862b-p`: three hex colours plus `n`, `p`, `s` or `a` for the background.
  - `GET /css/custom/<key>.css` (under `/css/`, so the offline worker caches it like the other stylesheets) returns the stylesheet. It is a pure function of the key, cached as immutable, and needs no sign-in.
  - The page links it and sets `data-palette="custom"`. The live preview only swaps that link, so the colour rules live in one place (`src/themes.js`) and the CSP stays strict: no inline styles.
- **The derivation** (`customTokens(key)`): for light and dark mode, it shifts each colour's lightness just enough for these to pass WCAG AA (4.5:1):
  - primary on surface and on background
  - the text on primary
  - secondary used behind button text
  - hover and soft variants
  - the field border at 3:1

  Tests try a set of awkward inputs: yellow, white, black, pure blue, and a near-background primary.

- **Data:** migration `012_appearance_and_layout.sql`:
  - `users.theme_colors TEXT`: the key, used when `theme_palette = 'custom'`
  - `weddings.theme_colors TEXT`: null when the wedding's colours are off
  - `wedding_colors (id, wedding_id, hex, name, sort_order)`
  - `venue_layouts (wedding_id PK, width, depth, unit)`
  - `layout_items (id, wedding_id, kind, label, table_id UNIQUE NULL → seating_tables ON DELETE CASCADE, shape, x, y, width, depth, rotation)`
- **Precedence:** the wedding's colours (when on), then the planner's brand palette, then the person's own palette or custom colours.
- **Venue numbers:**
  - room sides are 5–500 units
  - pieces are 1–200 units and stay inside the room, with positions as their centre
  - rotation is 0–359 degrees, entered in steps of 15
  - positions are rounded to 0.5
  - at most 200 pieces per wedding
- **Routes:**
  - member: `GET /colors`, `GET /layout`
  - editor: `POST /colors`, `/colors/:id/delete`, `/colors/app`, `/colors/app/off`, `/layout/room`, `/layout/items`, `/layout/tables`, `/layout/items/:id`, `/layout/items/:id/delete`
  - account: `POST /settings/appearance`, which now also accepts `custom` and answers JSON to `fetch`
  - public: `GET /css/custom/:key.css`

## Testing

- **Units:**
  - the key parser and validator
  - `customTokens` passes AA for awkward inputs in both modes
  - precedence in `resolveTheme`
  - colour extraction from pixels (`public/js/palette.js`, a pure function)
  - layout clamping and validation
- **Integration:**
  - the theme CSS route, including 404 for bad keys
  - saving custom appearance by form and by fetch
  - adding and deleting colours, turning app colours on and off, and their effect on the page's palette
  - access for viewer and editor
  - room, pieces, placing tables, moving a piece, staying inside the room, and the 404s for another wedding's ids
  - the flash markup carries the auto-hide marker only for success and info
  - the header shows plain text for one wedding
