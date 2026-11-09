# Selfie Studio by Storitellah

A free photo booth that runs in a browser, by [Storitellah](https://storitellah.com). It shoots four poses, turns them into a classic 2×6 strip, prints automatically to a Wi-Fi printer on 4×6 photo paper, and lets guests download a high-resolution JPG.

Selfie Studio has a hand-drawn sketchbook design. It opens on an overview of a sketched booth with hand-drawn layout ideas around it. **step inside** opens the studio, where the camera, settings tabs and live strip all fit on one laptop screen (a 14-inch MacBook or larger) without scrolling. On phones the studio becomes one scrolling column, with the **take photos** button pinned to the bottom. There's also an [FAQ](public/faq.html), a [privacy policy](public/privacy.html), and a link to [@storitellah on Instagram](https://instagram.com/storitellah).

## Quick start

```bash
npm start            # Node 18+, no dependencies to install
```

Or double-click **Start Selfie Studio (Mac).command** / **Start Selfie Studio (Windows).bat**.

Open **http://localhost:8080** on the computer the camera is plugged into. Browsers only allow camera access on `localhost` or over `https`. Then press **Take Photos** or the space bar.

## What it does

| | |
|---|---|
| **Camera** | Opens the selected camera at the highest resolution it supports. Where the browser allows it (Chrome and Edge, especially on Android), each photo is taken through the device's still-photo pipeline at full sensor resolution, and cropped to match what the preview showed. |
| **Pro cameras** | Any camera the computer sees as a webcam can be picked from the **Camera** list. That includes DSLR and mirrorless cameras connected with an HDMI capture card (such as Elgato Cam Link) or through USB-C webcam mode. Cameras recognised as professional are marked ★, and mirroring is switched off when you choose one. |
| **Eye contact** | During the countdown a **Look here** tab drops down from the top-centre of the screen, just under a laptop or phone camera, with the countdown beside it. With an external camera it says **Look into the camera lens** instead. You can change this under *Eye contact guide*. |
| **Looks** | **Colour** (light-based): Natural Light, Golden Hour, Soft Glow, Sunlit Film, Window Light, Faded Polaroid, Neon Night. **Black & White**: Classic Mono, Noir Spotlight, Silver Screen, Sepia Lamp, Hard Light. **White**: High-Key White, Porcelain, Ghost White, Milk Glass. |
| **Stickers** | 16 colourful die-cut stickers (heart, smiley star, sparkles, crown, rainbow, butterfly, flower, bow, happy cloud, lollipop, ice cream, strawberry, and BFF, Sisters, WOW! and cutie badges). Tap to toggle them, or use **Surprise me!** Stickers appear on the live camera view where they will land, stay near the edges so faces are clear, shuffle around between the four photos (crowns and bows always go on top), and can be changed again on the review screen. |
| **Strip** | Black, Vintage (aged cream paper) or White background, which also sets the studio's colour scheme. Optional **tilt** gives each photo a slight angle and a white snapshot border. **Vintage postage stamps** turns each photo into a **portrait (4:5) or square** perforated stamp with an engraved frame and a dated postmark on the first stamp. A dashed guide on the camera preview shows what will fit inside the stamp. Any **stamp text** and **values** (for example `10, 25, 50, 100`) are typed in by the host and start blank each time, like the caption. Stamps work with or without tilt. The **date and time** of the session is printed on every strip. A **caption** prints only when one is typed. It is never remembered, so every event starts blank. |
| **Download** | A single 2×6 in strip, saved as a JPG at **600 DPI (1200 × 3600 px)**. A "Download 4×6 sheet" button is also available. |
| **Print** | A **4×6 in portrait sheet with two identical strips side by side** (1200 × 1800 px at 300 DPI). Cut along the long centre line to get two 2×6 strips. |
| **Share** | **share** opens the device's share sheet (WhatsApp, AirDrop, Messages, Instagram…) with the strip attached, on iPhone, iPad, Android, Mac Safari and Windows. Where a browser can't share files, a small menu offers WhatsApp (copies the strip and opens WhatsApp), copy image, and save. |
| **Restyle** | On the review screen you can change the look, background, tilt, stickers, stamp shape, stamp text or caption, then download or print again. |

## Devices and browsers

Selfie Studio runs in current versions of Safari, Chrome, Edge, Firefox and Samsung Internet on iPhone, iPad, Android, Mac, Windows, Linux and ChromeOS. The camera needs an **https** address (such as the Cloudflare Pages site) or `localhost`.

- **iPhone and iPad (iOS / iPadOS 15 or later):** open the site in Safari and allow the camera. **Save strip** opens the share sheet, so you can tap *Save Image* to put it in Photos. **Print** also opens the share sheet; choose *Print* to use an AirPrint printer and pick 4×6 paper. For a full-screen kiosk, tap Share → *Add to Home Screen*, and use *Guided Access* to lock the iPad to the app.
- **Android:** the same share sheet is used for saving and printing (through Mopria or the printer's app).
- **Computers:** strips download as JPGs, and Print opens the browser's print dialog, or prints straight to a Wi-Fi printer when run with `npm start`.
- Phones and tablets get a lighter live preview that adjusts itself if the device is slow. Full-resolution still capture is used where the browser supports it (Chrome and Edge); Safari and Firefox use the best video resolution the camera offers.

## Support links

Selfie Studio is free. A quiet footer invites people to support its development through [Patreon](https://www.patreon.com/cw/kiberastories), [Ko-fi](https://ko-fi.com/kiberastories) or M-Pesa (+254711254986; tapping the button copies the number). To change these, edit `public/js/config.js`. Any link left empty is hidden.

## Canon SELPHY CP1300 / CP1500

1. Connect the SELPHY to your Wi-Fi: **Wi-Fi settings → Connection method → Via Wi-Fi network**, on the same network as the computer. Don't use Direct connection.
2. Double-click **Start Selfie Studio (Mac).command** or **Start Selfie Studio (Windows).bat**. These need [Node.js](https://nodejs.org) LTS, a free one-time install. On a Mac, if it says the file is from an unidentified developer, right-click it and choose **Open**.
3. The studio opens and finds the SELPHY automatically, including printers that only answer Bonjour by multicast, as SELPHYs do. In the printer settings, press **test print**.

The SELPHY has no true 4×6 paper. Selfie Studio reads the printer's own paper list, picks **postcard (100×148 mm)** and lays the two strips out at exactly that size, borderless, as JPEG at 300 DPI. If a SELPHY isn't found, type `ipp://ITS-IP/ipp/print` into the printer settings and press **check**. The IP is under **Wi-Fi settings → Confirm settings** on the printer. A SELPHY added in macOS printer settings also works: its `Postcard.Fullbleed` size is chosen automatically.

`test/helpers/selphy-sim.js` is a strict stand-in for the CP1300, used by the tests. It offers only postcard, card and L paper, accepts only JPEG/URF, refuses anything else, and answers Bonjour by multicast only.

## Wi-Fi printing

The server looks for printers on your network the same way AirPrint and Mopria do (mDNS, `_ipp._tcp`). It uses the first printer it finds. When **Print automatically** is on, every finished strip is sent straight to that printer as an IPP job for borderless 4×6 paper (`na_index-4x6_4x6in`). Printers that reject borderless settings get a plain 4×6 request instead. No drivers are needed.

- The chip in the top-right corner shows the printer's status. Click it to pick a different printer, enter an address yourself, or turn borderless printing off.
- To fix the printer at startup: `PRINTER_URI=ipp://192.168.1.40/ipp/print npm start`
- A printer already installed on the booth computer also works: `PRINTER_URI=cups:Canon_SELPHY npm start`
- **Bluetooth and USB printers:** pair or plug the printer into the computer running `npm start` and add it in the system's printer settings. It then shows up next to the Wi-Fi printers (marked Bluetooth or USB) and prints automatically too.
- **Printer found later:** if the photos were taken before any printer was on, the waiting strip prints automatically the moment a printer is detected. The server checks for new printers every 20 seconds.
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
