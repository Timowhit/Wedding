# File uploads: design

Status: built after the product owner chose option A in ACTIONS.md, "In your PostgreSQL database" · 2026-11-27 · branch `file-uploads`

This covers the notes item "Store inspiration boards, floor plans, contracts, and other files in each event workspace". Choices the product owner didn't make are marked _(call)_.

## What people get

- **A Files page (`/files`)** for each wedding, with a filter for each kind: contracts, floor plans, inspiration and other.
  - Photos show as a grid of thumbnails, and other files as a list.
  - Everyone in the wedding can see and download the files. Editors upload and delete them.
- **Vendor pages** show that vendor's files, with an upload form already set to that vendor (for example, the signed contract PDF).
- **Accepted file types** _(call)_: PDF, JPEG, PNG, WebP, GIF, Word (.docx), Excel (.xlsx) and plain text.
  - A file's real type is checked from its first bytes, not from its name or what the browser says.
  - HTML, SVG and anything executable are refused.
- **Limits** _(call)_: 10 MB per file and 250 MB per wedding. The page shows how much space is used.

## Security

- **Storage:** files go in `wedding_files.data` (BYTEA). Lists never load that column.
- **Downloads** (`GET /files/:id`) are scoped by the active wedding. Each download sends:
  - the content type checked at upload
  - `X-Content-Type-Options: nosniff`
  - `Content-Security-Policy: sandbox`
  - `Content-Disposition: inline` for images and PDFs, `attachment` for everything else
  - a name that is cleaned and RFC 5987-encoded
- **CSRF:** the global check reads the token from normal form bodies. Upload forms post their fields differently, so the global check refuses them except on the upload routes. There the order is:
  1. sign-in and editor checks
  2. multer, holding the file in memory with a size limit
  3. the CSRF check on the parsed form
- **Quota:** the size check and the insert happen in one statement.

## Data

Migration `015_files.sql` creates `wedding_files`:

- `id`, `wedding_id` (FK, cascades), `vendor_id` (FK, set to null when the vendor is deleted), `uploaded_by` (FK users, set to null)
- `kind`, `name`, `content_type`, `size`, `note`, `data`, `created_at`
- an index on `(wedding_id, created_at)`

## Testing

- Upload, list, download and delete.
- A file pretending to be another type is refused, for example HTML renamed `.pdf`.
- Files over the size limit are refused, as are uploads beyond the wedding's quota.
- Viewers can download but can't upload or delete.
- Another wedding's file id returns 404.
- An upload without a CSRF token gets 403, as does any other upload-type post.
- Download headers: content type, sandbox, inline or attachment, and the encoded name.
- The vendor page shows its files.
