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
| **Strip** | Black, Vintage (aged cream paper) or White background, which also sets the studio's colour scheme. Optional **tilt** gives each photo a slight angle and a white snapshot border. **Vintage postage stamps** turns each photo into a **portrait (4:5) or square** perforated stamp with an engraved frame and a dated postmark on the first stamp. A dashed guide on the camera preview shows what will fit inside the stamp. Any **stamp text** and **values** (for example `10, 25, 50, 100`) are typed in by the host and start blank each time, like the caption. Stamps work with or without tilt. The **date and time** of the session is printed on every strip. A **caption** prints only when one is typed. It is never remembered, so every event starts blank. |
| **Download** | A single 2×6 in strip, saved as a JPG at **600 DPI (1200 × 3600 px)**. A "Download 4×6 sheet" button is also available. |
| **Print** | A **4×6 in portrait sheet with two identical strips side by side** (1200 × 1800 px at 300 DPI). Cut along the long centre line to get two 2×6 strips. |
| **Restyle** | On the review screen you can change the look, background, tilt, stamp shape, stamp text or caption, then download or print again. |

## Devices and browsers

Selfie Studio runs in current versions of Safari, Chrome, Edge, Firefox and Samsung Internet on iPhone, iPad, Android, Mac, Windows, Linux and ChromeOS. The camera needs an **https** address (such as the Cloudflare Pages site) or `localhost`.

- **iPhone and iPad (iOS / iPadOS 15 or later):** open the site in Safari and allow the camera. **Save strip** opens the share sheet, so you can tap *Save Image* to put it in Photos. **Print** also opens the share sheet; choose *Print* to use an AirPrint printer and pick 4×6 paper. For a full-screen kiosk, tap Share → *Add to Home Screen*, and use *Guided Access* to lock the iPad to the app.
- **Android:** the same share sheet is used for saving and printing (through Mopria or the printer's app).
- **Computers:** strips download as JPGs, and Print opens the browser's print dialog, or prints straight to a Wi-Fi printer when run with `npm start`.
- Phones and tablets get a lighter live preview that adjusts itself if the device is slow. Full-resolution still capture is used where the browser supports it (Chrome and Edge); Safari and Firefox use the best video resolution the camera offers.

## Support links

Selfie Studio is free. A quiet footer invites people to support its development through [Patreon](https://www.patreon.com/cw/kiberastories), [Ko-fi](https://ko-fi.com/kiberastories) or M-Pesa (+254711254986; tapping the button copies the number). To change these, edit `public/js/config.js`. Any link left empty is hidden.

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
