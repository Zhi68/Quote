# Web Fomular

MYBOX quotation page for corrugated box pricing with live 2D SVG dieline preview.

## Current scope

- Home page box selection: `RSC Box`, `5 Panel Box`, `Pizza Box`, `Gift Box`
- Quotation page with real-time pricing
- Live 2D dieline preview from L/W/H inputs
- No 3D preview in the current deploy package

## Deploy structure

```text
C:\Users\Zhi\Desktop\Web Fomular
|-- index.html
|-- README.md
|-- assets
|   `-- images
|       |-- logo.png
|       |-- rsc.png
|       |-- 5panel.png
|       |-- pizza.png
|       `-- gift.png
`-- scripts
    |-- app.js
    `-- models
        |-- pizza-template-b-model.js
        |-- gift-box-template.js
        `-- five-panel-template.js
```

## Deploy

This is now a static frontend package.
Upload the folder contents to your hosting/server and open `index.html` as the entry page.

## Pricing rules

- MOQ: `30`
- 3 Layer minimum unit price before discount: `RM 1.00`
- 5 Layer minimum unit price before discount: `RM 1.50`
- Quantity discount:
  - `>= 100`: 10%
  - `>= 500`: 15%
  - `>= 1000`: 20%

## Box validation rules

- Pizza Box:
  - `L: 50..1000`
  - `W: 40..L`
  - `H: 25..(W + X)` where `X = 2`
- RSC Box:
  - `L: 70..2000`
  - `W: 55..L`
  - `H: 60..2000`
- Gift Box:
  - `L: 40..800`
  - `W: 30..L`
  - `H: 40..800`
- 5 Panel Box:
  - Uses the current in-app FPF 2D generation logic and default size `200 x 150 x 50`

## Main files

- Runtime UI and logic: `index.html`, `scripts/app.js`
- Pizza 2D model source: `scripts/models/pizza-template-b-model.js`
- Gift 2D model source: `scripts/models/gift-box-template.js`
- 5 Panel 2D model source: `scripts/models/five-panel-template.js`
