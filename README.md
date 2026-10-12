# Selfie Studio by Storitellah

A free photo booth that runs in a browser, by [Storitellah](https://storitellah.com). It shoots four poses, turns them into a classic 2×6 strip, prints automatically to a Wi-Fi printer on 4×6 photo paper, and lets guests download a high-resolution JPG.

## Quick start

```bash
npm start            # Node 18+, no dependencies to install
```

Open **http://localhost:8080** on the computer the camera is plugged into. Browsers only allow camera access on `localhost` or over `https`. Then press **Take Photos** or the space bar.

## What it does

| | |
|---|---|
| **Camera** | Opens the selected camera at the highest resolution it supports. Where the browser allows it (Chrome and Edge, especially on Android), each photo is taken through the device's still-photo pipeline at full sensor resolution, and cropped to match what the preview showed. |
| **Pro cameras** | Any camera the computer sees as a webcam can be picked from the **Camera** list. That includes DSLR and mirrorless cameras connected with an HDMI capture card (such as Elgato Cam Link) or through USB-C webcam mode. Cameras recognised as professional are marked ★, and mirroring is switched off when you choose one. |
| **Eye contact** | During the countdown a **Look here** tab drops down from the top-centre of the screen, just under a laptop or phone camera, with the countdown beside it. With an external camera it says **Look into the camera lens** instead. You can change this under *Eye contact guide*. |
| **Looks** | **Colour** (light-based): Natural Light, Golden Hour, Soft Glow, Sunlit Film, Window Light, Faded Polaroid, Neon Night. **Black & White**: Classic Mono, Noir Spotlight, Silver Screen, Sepia Lamp, Hard Light. **White**: High-Key White, Porcelain, Ghost White, Milk Glass. |
| **Strip** | Black, Vintage (aged cream paper) or White background, which also sets the studio's colour scheme. Optional **tilt** gives each photo a slight angle and a white snapshot border. The **date and time** of the session is printed on every strip. A **caption** prints only when one is typed. It is never remembered, so every event starts blank. |
| **Download** | A single 2×6 in strip, saved as a JPG at **600 DPI (1200 × 3600 px)**. A "Download 4×6 sheet" button is also available. |
| **Print** | A **4×6 in portrait sheet with two identical strips side by side** (1200 × 1800 px at 300 DPI). Cut along the long centre line to get two 2×6 strips. |
| **Restyle** | On the review screen you can change the look, background, tilt or caption, then download or print again. |

## Support links

Selfie Studio is free. A quiet footer invites people to support its development. Add your links in `public/js/config.js`:

```js
patreon: 'https://www.patreon.com/…',
kofi: 'https://ko-fi.com/…',
mpesa: { url: '', text: 'Till 123456' },   // a payment link, or details to display
```

Any link left empty is hidden.

## Wi-Fi printing

The server looks for printers on your network the same way AirPrint and Mopria do (mDNS, `_ipp._tcp`). It uses the first printer it finds. When **Print automatically** is on, every finished strip is sent straight to that printer as an IPP job for borderless 4×6 paper (`na_index-4x6_4x6in`). Printers that reject borderless settings get a plain 4×6 request instead. No drivers are needed.

- The chip in the top-right corner shows the printer's status. Click it to pick a different printer, enter an address yourself, or turn borderless printing off.
- To fix the printer at startup: `PRINTER_URI=ipp://192.168.1.40/ipp/print npm start`
- A printer already installed on the booth computer also works: `PRINTER_URI=cups:Canon_SELPHY npm start`
- Load the printer's photo tray with 4×6 paper.

**No server?** If the page is opened without `npm start` (for example, on static hosting), the **Print** button opens the browser's print dialog with a 4×6, zero-margin page already set up. To print silently without the dialog, launch Chrome with `--kiosk-printing` and set the photo printer as the system default.

## Hosting on Cloudflare Pages

`wrangler.toml` tells Pages to serve the `public/` folder, so leave the build command empty. A hosted copy can take photos, download strips and print through the browser's print dialog. It can't send prints to a Wi-Fi printer by itself, because a cloud server can't reach a printer on your local network. For automatic printing, run `npm start` on a computer on the same Wi-Fi as the printer.

## Settings

| Env var | Default | |
|---|---|---|
| `PORT` | `8080` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `PRINTER_URI` | auto-discover | `ipp://`, `ipps://` or `cups:NAME` |
| `SELFIEBOOTH_CONFIG` | `./config.json` | Where the printer chosen in the UI is saved |

## Project layout

```
server.js            static server + /api/printer, /api/printers, /api/print
lib/ipp.js           dependency-free IPP client (Print-Job, Get-Printer-Attributes)
lib/mdns.js          mDNS / DNS-SD printer discovery
lib/printer.js       printer selection, status, CUPS fallback
public/js/filters.js looks (pixel grading + glow, light leaks, vignettes, grain)
public/js/layout.js  strip & 4x6 sheet geometry and rendering
public/js/app.js     booth UI
test/                node --test unit tests (npm test)
```
