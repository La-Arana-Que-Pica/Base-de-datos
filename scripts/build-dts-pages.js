'use strict';

const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://laqp.website';
const rootDir = path.resolve(__dirname, '..');
const dtsDir = path.join(rootDir, 'database', 'DTs');
const dtsEscudosDir = path.join(dtsDir, 'escudos');
const databaseDir = path.join(rootDir, 'database');
const DTS_POPULAR_LIMIT = 3;

function parseCsv(csvText, delimiter = ',') {
  csvText = String(csvText || '').replace(/^\uFEFF/, '');
  const rows = [];
  let current = '';
  let row = [];
  let quoted = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && char === delimiter) {
      row.push(current.trim());
      current = '';
      continue;
    }

    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current.trim());
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  row.push(current.trim());
  if (row.some(value => value !== '')) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map(header => header.trim().replace(/^\uFEFF/, ''));
  return rows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

function readCsv(filePath, delimiter = ',') {
  return parseCsv(fs.readFileSync(filePath, 'utf8'), delimiter);
}

function detectCsvDelimiter(csvText) {
  const firstLine = String(csvText || '').replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '';
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

function readCsvAuto(filePath) {
  const csvText = fs.readFileSync(filePath, 'utf8');
  return parseCsv(csvText, detectCsvDelimiter(csvText));
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function dtNumber(value) {
  const number = Number(String(value || '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

const FACE_EDITOR_SECTIONS = [
  {
    title: 'Cara',
    subsections: [
      {
        title: 'Color de piel / Proporcion de cabeza',
        fields: [
          { col: 'Skin Colour', label: 'Color de piel', imageKey: 'skin_colour' },
          { col: 'Head Length', label: 'Altura de la cabeza' },
          { col: 'Head Width', label: 'Anchura de la cabeza' },
          { col: 'Head Depth', label: 'Profundidad de la cabeza' },
          { col: 'Face Height', label: 'Largo de la cara' },
          { col: 'Face Size', label: 'Tamaño de la cara' },
        ],
      },
      {
        title: 'Ojos',
        fields: [
          { col: 'Upper Eyelid Type', label: 'Tipo de parpado superior', imageKey: 'upper_eyelid' },
          { col: 'Bottom Eyelid Type', label: 'Tipo de parpado inferior', imageKey: 'bottom_eyelid' },
          { col: 'Eye Height', label: 'Altura de los ojos' },
          { col: 'Horizontal Eye Position', label: 'Posicion horizontal ojos' },
          { col: 'Iris Colour', label: 'Color del iris', imageKey: 'iris_colour' },
          { col: 'Pupil Size', label: 'Tamaño del iris' },
          { col: 'Upper Eyelid Ht. (Inner)', label: 'Alt. parpado sup. (I.)' },
          { col: 'Upper Eyelid Wd. (Inner)', label: 'Ancho parpado sup. (I.)' },
          { col: 'Upper Eyelid Ht. (Outer)', label: 'Alt. parpado sup. (E.)' },
          { col: 'Upper Eyelid Wd. (Outer)', label: 'Ancho parpado sup. (E.)' },
          { col: 'Inner Eye Height', label: 'Altura interior ojos' },
          { col: 'Inner Eye Position', label: 'Posicion interior de ojos' },
          { col: 'Eye Corner Height', label: 'Altura exterior ojos' },
          { col: 'Outer Eye Position', label: 'Posicion exterior ojos' },
          { col: 'Bottom Eyelid Height', label: 'Altura parpado inferior' },
          { col: 'Eye Depth', label: 'Prof. de los ojos' },
        ],
      },
      {
        title: 'Frente / Cejas',
        fields: [
          { col: 'Forehead', label: 'Frente', imageKey: 'forehead' },
          { col: 'Eyebrow Type', label: 'Estilo de cejas', imageKey: 'eyebrow_type' },
          { col: 'Eyebrow Thickness', label: 'Espesor de cejas' },
          { col: 'Eyebrow Style', label: 'Tipo de cejas', enum: { '0': 'Fina', '1': 'Normal', '2': 'Gruesa' } },
          { col: 'Eyebrow Density', label: 'Densidad de cejas' },
          { col: 'Eyebrow Colour R', label: 'Color de cejas R', noPlus: true },
          { col: 'Eyebrow Colour G', label: 'Color de cejas V', noPlus: true },
          { col: 'Eyebrow Colour B', label: 'Color de cejas A', noPlus: true },
          { col: 'Inner Eyebrow Height', label: 'Altura interior cejas' },
          { col: 'Brow Width', label: 'Ancho del entrecejo' },
          { col: 'Outer Edyebrow Height', label: 'Altura exterior cejas' },
          { col: 'Temple Width', label: 'Ancho de la sien' },
          { col: 'Eyebrow Depth', label: 'Profundidad de cejas' },
        ],
      },
      {
        title: 'Nariz',
        fields: [
          { col: 'Nose Type', label: 'Tipo de nariz', imageKey: 'nose_type' },
          { col: 'Laughter Lines', label: 'Arrugas', imageKey: 'laughter_lines' },
          { col: 'Nose Height', label: 'Altura de la nariz' },
          { col: 'Nostril Width', label: 'Tamaño fosas nasales' },
          { col: 'Nose Width', label: 'Grosor de la nariz' },
          { col: 'Nose Tip Depth', label: 'Profundidad punta nariz' },
          { col: 'Nose Depth', label: 'Profundidad nariz' },
        ],
      },
      {
        title: 'Boca',
        fields: [
          { col: 'Upper Lip Type', label: 'Tipo labio sup.', imageKey: 'upper_lip' },
          { col: 'Lower Lip Type', label: 'Tipo labio inf.', imageKey: 'lower_lip' },
          { col: 'Mouth Position', label: 'Posicion de la boca' },
          { col: 'Lip Size', label: 'Tamaño labios' },
          { col: 'Lip Width', label: 'Ancho de labio' },
          { col: 'Mouth Corner Height', label: 'Alt. comisuras lab.' },
          { col: 'Mouth Depth', label: 'Profundidad de boca' },
        ],
      },
      {
        title: 'Vello facial',
        fields: [
          { col: 'Facial Hair Type', label: 'Tipo vello fac.', imageKey: 'facial_hair', conditionalLabel: { value: '1', label: 'No' } },
          { col: 'Facial Hair Colour R', label: 'Color del vello facial R', noPlus: true, conditionalDash: { col: 'Facial Hair Type', value: '1' } },
          { col: 'Facial Hair Colour G', label: 'Color del vello facial V', noPlus: true, conditionalDash: { col: 'Facial Hair Type', value: '1' } },
          { col: 'Facial Hair Colour B', label: 'Color del vello facial A', noPlus: true, conditionalDash: { col: 'Facial Hair Type', value: '1' } },
          { col: 'Thickness', label: 'Espesura', conditionalDash: { col: 'Facial Hair Type', value: '1' } },
        ],
      },
      {
        title: 'Mejillas / Maxilar / Menton',
        fields: [
          { col: 'Cheek Type', label: 'Tipo mejillas', imageKey: 'cheek_type' },
          { col: 'Neck Line Type', label: 'Tipo de linea del cuello', imageKey: 'neck_line' },
          { col: 'Cheekbones', label: 'Pomulos' },
          { col: 'Chin Height', label: 'Altura del menton' },
          { col: 'Chin Width', label: 'Ancho del menton' },
          { col: 'Jaw Height', label: 'Altura del maxilar' },
          { col: 'Jawline', label: 'Linea del maxilar' },
          { col: 'Chin Depth', label: 'Profundidad del menton' },
        ],
      },
      {
        title: 'Orejas',
        fields: [
          { col: 'Ear Length', label: 'Largo de orejas' },
          { col: 'Ear Width', label: 'Ancho de orejas' },
          { col: 'Ear Angle', label: 'Angulo de la oreja' },
        ],
      },
    ],
  },
  {
    title: 'Peinado',
    subsections: [
      {
        title: 'General',
        fields: [
          { col: 'Overall - Style', label: 'Estilo', enum: { '0': '-', '1': 'Normal', '2': 'Seco', '3': 'Mohicano', '4': 'Afro', '5': 'Rastas', '6': 'Trenzado', '7': 'Especial' } },
          { col: 'Overall - Length', label: 'Longitud', enum: { '0': '-', '1': 'Afeitado', '2': 'Muy corto', '3': 'Corto', '4': 'Mediano', '5': 'Largo' }, notApplicableWhen: { col: 'Overall - Style', value: '7' } },
          { col: 'Overall - Wave Level', label: 'Ondulado', notApplicableWhen: { col: 'Overall - Style', value: '7' } },
          { col: 'Overall - Hair Variation', label: 'Variacion del pelo', imageKey: 'hair_variation' },
        ],
      },
      {
        title: 'Delante',
        fields: [
          { col: 'Font - Style', label: 'Estilo', enum: { '0': '-', '1': 'Arriba', '2': 'Abajo', '3': 'Hacia atras' }, conditionalDash: { col: 'Overall - Style', value: '7' } },
          { col: 'Font - Parted', label: 'Con raya', enum: { '0': '-', '1': 'No', '2': 'Izquierda 2', '3': 'Izquierda 1', '4': 'Centro', '5': 'Derecha 1', '6': 'Derecha 2' }, conditionalDash: { col: 'Overall - Style', value: '7' } },
          { col: 'Font - Hairline', label: 'A raiz', enum: { '0': '-', '1': 'Tipo 1', '2': 'Tipo 2', '3': 'Tipo 3' }, conditionalDash: { col: 'Overall - Style', value: '7' } },
          { col: 'Font - Forehead Width', label: 'Ancho de frente', enum: { '0': '-', '1': 'Estrecha', '2': 'Normal', '3': 'Amplia' }, conditionalDash: { col: 'Overall - Style', value: '7' } },
        ],
      },
      {
        title: 'Lateral / Atras',
        fields: [
          { col: 'Side/Back - Style', label: 'Estilo', enum: { '0': '-', '1': 'Normal', '2': 'Menos volumen', '3': 'Menos lateral', '4': 'Recortado' }, conditionalDash: { col: 'Overall - Style', value: '7' } },
          { col: 'Side/Back - Cropped', label: 'Recortado', showImageIf: true, imageKey: 'hair_cropped', conditionalDash: { col: 'Overall - Style', value: '7' } },
        ],
      },
      {
        title: 'Color de pelo / Accesorios',
        fields: [
          { col: 'Hair Colour', label: 'Color de pelo', imageKey: 'hair_colour' },
          { col: 'Hair Colour R', label: 'Color de pelo R', noPlus: true },
          { col: 'Hair Colour G', label: 'Color de pelo V', noPlus: true },
          { col: 'Hair Colour B', label: 'Color de pelo A', noPlus: true },
          { col: 'Accessories', label: 'Accesorios', enum: { False: 'No', True: 'Si' } },
          { col: 'Accessory Colour', label: 'Color de accesorio', noPlus: true },
        ],
      },
    ],
  },
];

function assetUrl(dt, fileName) {
  return `database/DTs/${encodeURIComponent(dt.id)}/${encodeURIComponent(fileName || '')}`;
}

function dtEscudoUrl(teamName) {
  const wanted = String(teamName || '').trim();
  if (!wanted || !fs.existsSync(dtsEscudosDir)) return '';
  const candidates = [wanted, ...dtEscudoLookupNames(wanted)];
  const file = fs.readdirSync(dtsEscudosDir)
    .find(name => {
      if (name === '.gitkeep') return false;
      const fileName = path.parse(name).name;
      return candidates.some(candidate => (
        fileName === candidate
        || name === candidate
        || normalize(fileName) === normalize(candidate)
        || isDtEscudoBaseMatch(candidate, fileName)
      ));
    });
  return file ? `/database/DTs/escudos/${encodeURIComponent(file)}` : '';
}

function isDtEscudoBaseMatch(teamName, fileName) {
  const team = normalize(teamName);
  const file = normalize(fileName);
  if (!team || !file || !team.startsWith(file)) return false;
  const suffix = team.slice(file.length).trim();
  return /^(b|ii|juvenil|infantil sub \d+|sub \d+|u \d+|u\d+)$/.test(suffix);
}

function dtEscudoLookupNames(teamName) {
  const name = String(teamName || '').trim();
  const aliases = [];

  const youthMarkers = [
    /\s+Infantil\/Sub-\d+$/i,
    /\s+Sub-\d+$/i,
    /\s+U-\d+$/i,
    /\s+U\d+$/i,
    /\s+Juvenil$/i,
    /\s+B$/i,
    /\s+II$/i,
  ];

  youthMarkers.forEach(pattern => {
    const base = name.replace(pattern, '').trim();
    if (base && base !== name) aliases.push(base);
  });

  return aliases;
}

function appearanceImagePath(imageKey, value) {
  return `img/appearance/${imageKey}/${encodeURIComponent(value)}.webp`;
}

function readDtFaceData(dt) {
  if (!dt.face_csv) return null;
  const filePath = path.join(dtsDir, dt.sourceFolder, dt.face_csv);
  if (!fs.existsSync(filePath)) return null;
  const [row] = readCsv(filePath, ';');
  return row || null;
}

function faceValue(row, field) {
  if (!row) return '';
  return row[field.col] !== undefined ? row[field.col] : '';
}

function renderEditorRow(row, field) {
  const rawVal = faceValue(row, field);

  if (field.conditionalDash && faceValue(row, field.conditionalDash) === field.conditionalDash.value) {
    return renderEditorValue(field.label, '-');
  }

  if (field.notApplicableWhen && faceValue(row, field.notApplicableWhen) === field.notApplicableWhen.value) {
    return renderEditorValue(field.label, '*');
  }

  if (field.conditionalLabel && rawVal === field.conditionalLabel.value) {
    return renderEditorValue(field.label, field.conditionalLabel.label);
  }

  const displayVal = rawVal !== undefined && rawVal !== '' ? rawVal : '-';

  if (field.enum) {
    return renderEditorValue(field.label, field.enum[rawVal] !== undefined ? field.enum[rawVal] : displayVal);
  }

  if (field.showImageIf && rawVal && rawVal !== '0') {
    return renderEditorValue(field.label, rawVal, appearanceImagePath(field.imageKey, rawVal), field.imageKey);
  }

  if (field.imageKey && rawVal) {
    return renderEditorValue(field.label, rawVal, appearanceImagePath(field.imageKey, rawVal), field.imageKey);
  }

  const numeric = Number(displayVal);
  const formatted = !Number.isNaN(numeric) && displayVal !== '-' && !field.noPlus
    ? (numeric >= 0 ? `+${numeric}` : String(numeric))
    : displayVal;
  return renderEditorValue(field.label, formatted);
}

function renderEditorValue(label, value, imagePath, imageKey) {
  const extraClass = value === '-' ? ' is-empty' : value === '*' ? ' is-na' : '';
  const valueHtml = imagePath
    ? `<span class="dts-editor-value dts-editor-value-image">
        <img src="${imagePath}" alt="${escapeAttr(imageKey || label)}" loading="lazy" onerror="this.onerror=null;this.src='img/appearance/placeholder.webp'">
        <strong>${escapeHtml(value)}</strong>
      </span>`
    : `<span class="dts-editor-value${extraClass}">${escapeHtml(value)}</span>`;

  return `<div class="dts-editor-row">
    <span class="dts-editor-label">${escapeHtml(label)}</span>
    ${valueHtml}
  </div>`;
}

function renderFaceEditor(dt) {
  const row = dt.faceData;
  if (!row) {
    return `<div class="dts-empty-editor">
      <strong>Sin datos de cara</strong>
      <span>Todavia no hay valores de cara cargados para este DT.</span>
    </div>`;
  }

  const nav = FACE_EDITOR_SECTIONS.map((section, index) => `
    <button type="button" class="dts-face-tab${index === 0 ? ' is-active' : ''}" data-dts-face-tab="${index}">
      ${escapeHtml(section.title)}
    </button>`).join('');

  const panels = FACE_EDITOR_SECTIONS.map((section, sectionIndex) => {
    const subsections = section.subsections.map(subsection => {
      const rows = subsection.fields.map(field => renderEditorRow(row, field)).join('');
      return `<article class="dts-face-subsection">
        <h3>${escapeHtml(subsection.title)}</h3>
        <div class="dts-editor-grid">${rows}</div>
      </article>`;
    }).join('');

    return `<section class="dts-face-panel${sectionIndex === 0 ? ' is-active' : ''}" data-dts-face-panel="${sectionIndex}">
      ${subsections}
    </section>`;
  }).join('');

  return `<div class="dts-face-editor">
    <div class="dts-face-tabs">${nav}</div>
    <div class="dts-face-panels">${panels}</div>
  </div>`;
}

function faceFieldCount(dt) {
  if (!dt.faceData) return 0;
  return FACE_EDITOR_SECTIONS
    .flatMap(section => section.subsections)
    .flatMap(subsection => subsection.fields)
    .filter(field => faceValue(dt.faceData, field) !== '')
    .length;
}

function pageShell({ title, description, canonicalPath, imagePath, body }) {
  const absoluteUrl = `${SITE_URL}${canonicalPath}`;
  const imageUrl = imagePath ? `${SITE_URL}/${imagePath.replace(/^\/+/, '')}` : `${SITE_URL}/img/logo.png`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <base href="/">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttr(description)}">
  <link rel="canonical" href="${absoluteUrl}">
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:description" content="${escapeAttr(description)}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:url" content="${absoluteUrl}">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeAttr(title)}">
  <meta name="twitter:description" content="${escapeAttr(description)}">
  <meta name="twitter:image" content="${imageUrl}">
  <link rel="stylesheet" href="css/style.css">
  <link rel="icon" href="img/logo.webp" type="image/webp">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Inicio", "item": "${SITE_URL}/" },
      { "@type": "ListItem", "position": 2, "name": "Base de datos", "item": "${SITE_URL}/database.html" },
      { "@type": "ListItem", "position": 3, "name": "Directores Técnicos", "item": "${SITE_URL}/database/DTs/" }
    ]
  }
  </script>
</head>
<body class="dts-body">
  <header id="header">
    <a href="index.html" class="header-logo-link">
      <img class="logo" src="img/logo.webp" onerror="this.onerror=null;this.src='img/logo.webp'" alt="Logo">
    </a>
    <div class="header-title">La Araña Que Pica <span>LAqP.website</span></div>
    <nav class="header-nav" aria-label="Menu principal"></nav>
  </header>

  ${body}

  <script src="js/i18n.js"></script>
  <script src="js/site.js"></script>
</body>
</html>
`;
}

function loadTeams() {
  const filePath = path.join(databaseDir, 'All teams exported.csv');
  if (!fs.existsSync(filePath)) return [];
  return readCsv(filePath, ';').filter(team => team.Id && team.Name);
}

function resolveTeam(dt, teams) {
  const teamName = normalize(dt.equipo);
  if (!teamName) return null;

  return teams.find(team => normalize(team.Name) === teamName)
    || teams.find(team => normalize(team.Name).endsWith(` ${teamName}`))
    || teams.find(team => normalize(team.Name).includes(teamName))
    || null;
}

function loadDts() {
  if (!fs.existsSync(dtsDir)) fs.mkdirSync(dtsDir, { recursive: true });
  const teams = loadTeams();

  return fs.readdirSync(dtsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const folderPath = path.join(dtsDir, entry.name);
      const configPath = path.join(folderPath, 'config.csv');
      if (!fs.existsSync(configPath)) return null;
      const [row] = readCsvAuto(configPath);
      if (!row) return null;

      const id = row.id || entry.name;
      const dt = {
        id,
        nombre: row.nombre || id,
        equipo: row.equipo || '',
        anio: row.anio || '',
        nacionalidad: row.nacionalidad || '',
        continente: row.continente || '',
        descripcion: row.descripcion || '',
        tutorial: row.tutorial || '',
        real_img: row.real_img || '',
        ingame_img: row.ingame_img || 'ingame.png',
        face_csv: row.face_csv || (fs.existsSync(path.join(folderPath, 'face.csv')) ? 'face.csv' : ''),
        visitas: row.visitas || row.views || row.analytics || row.popularidad || '',
        trayectoria: row.trayectoria || '',
        palmares: row.palmares || '',
        sourceFolder: entry.name,
        recent: Math.round(fs.statSync(configPath).mtimeMs),
      };
      const team = resolveTeam(dt, teams);
      if (team) {
        dt.teamId = team.Id;
        dt.teamName = team.Name;
      }
      dt.crest = dtEscudoUrl(dt.equipo);
      dt.faceData = readDtFaceData(dt);
      dt.faceFieldCount = faceFieldCount(dt);
      return dt;
    })
    .filter(Boolean)
    .sort((a, b) => b.recent - a.recent || a.nombre.localeCompare(b.nombre, 'es'));
}

function optionList(items, key, label) {
  const values = [...new Set(items.map(item => item[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  return `<option value="">${label}</option>${values.map(value => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`).join('')}`;
}

function dtCareerTeams(dt) {
  return splitDtList(dt.trayectoria)
    .map(item => {
      const parts = item.split(':').map(part => part.trim());
      return dtDisplayTeamName(parts[1] || parts[0] || '');
    })
    .filter(team => team && !normalize(team).startsWith('sin equipo'));
}

function dtDisplayTeamName(teamName) {
  const name = String(teamName || '').trim();
  return normalize(name).startsWith('sin equipo') ? 'Sin equipo' : name;
}

function careerTeamOptions(dts) {
  const teams = [...new Set(dts.flatMap(dtCareerTeams))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'es'));
  return `<option value="">Todos</option>${teams.map(team => `<option value="${escapeAttr(team)}">${escapeHtml(team)}</option>`).join('')}`;
}

function cardHtml(dt) {
  const careerTeams = dtCareerTeams(dt);
  const search = normalize([dt.nombre, dt.equipo, dt.nacionalidad, dt.continente, dt.anio, ...careerTeams].join(' '));
  const careerSearch = normalize(careerTeams.join(' '));
  const detailPath = `database/DTs/${encodeURIComponent(dt.id)}/`;
  const portrait = dt.real_img || dt.ingame_img;
  const nationalityFlag = dtNationalityFlag(dt.nacionalidad);
  const teamCrest = dtEscudoUrl(dt.equipo) || '';
  return `<article class="dts-card"
      data-search="${escapeAttr(search)}"
      data-career="${escapeAttr(careerSearch)}"
      data-equipo="${escapeAttr(dt.equipo)}"
      data-nacionalidad="${escapeAttr(dt.nacionalidad)}"
      data-continente="${escapeAttr(dt.continente)}"
      data-anio="${escapeAttr(dt.anio)}"
      data-nombre="${escapeAttr(dt.nombre)}"
      data-recent="${escapeAttr(dt.recent)}">
    <a class="dts-card-media" href="${detailPath}" aria-label="Ver cara de ${escapeAttr(dt.nombre)}">
      <img class="dts-card-portrait" src="${assetUrl(dt, portrait)}" alt="${escapeAttr(dt.nombre)} - cara PES 2018" loading="lazy" onerror="this.onerror=null;this.src='img/logo.webp'">
      <span class="dts-card-ribbon">${dt.faceData ? 'Cara editable' : 'Pendiente'}</span>
      ${teamCrest ? `<img class="dts-team-crest" src="${escapeAttr(teamCrest)}" alt="${escapeAttr(dt.equipo)}" loading="lazy" onerror="this.remove()">` : ''}
    </a>
    <div class="dts-card-body">
      <a class="dts-card-title" href="${detailPath}">${escapeHtml(dt.nombre)}</a>
      <div class="dts-card-meta">${escapeHtml(dt.equipo)} · ${escapeHtml(dt.anio)}</div>
      <div class="dts-card-meta">${escapeHtml(dt.nacionalidad)} · ${escapeHtml(dt.continente)}</div>
      <div class="dts-card-badges">
        <span>Cara</span>
        <span>Peinado</span>
        <span>${escapeHtml(String(dt.faceFieldCount || 0))} valores</span>
      </div>
      <p>${escapeHtml(dt.descripcion)}</p>
      <div class="dts-card-actions">
        <a class="dts-link-button" href="${detailPath}">Ver cara</a>
      </div>
    </div>
  </article>`;
}

function cardHtml(dt) {
  const careerTeams = dtCareerTeams(dt);
  const search = normalize([dt.nombre, dt.equipo, dt.nacionalidad, dt.continente, dt.anio, ...careerTeams].join(' '));
  const careerSearch = normalize(careerTeams.join(' '));
  const detailPath = `database/DTs/${encodeURIComponent(dt.id)}/`;
  const portrait = dt.real_img || dt.ingame_img;
  const nationalityFlag = dtNationalityFlag(dt.nacionalidad);
  const teamCrest = dtEscudoUrl(dt.equipo) || '';
  return `<article class="dts-card"
      data-search="${escapeAttr(search)}"
      data-career="${escapeAttr(careerSearch)}"
      data-equipo="${escapeAttr(dt.equipo)}"
      data-nacionalidad="${escapeAttr(dt.nacionalidad)}"
      data-continente="${escapeAttr(dt.continente)}"
      data-anio="${escapeAttr(dt.anio)}"
      data-nombre="${escapeAttr(dt.nombre)}"
      data-recent="${escapeAttr(dt.recent)}"
      data-popularity="${escapeAttr(dt.visitas || '')}">
    <a class="dts-card-media" href="${detailPath}" aria-label="Ver cara de ${escapeAttr(dt.nombre)}">
      <img class="dts-card-portrait" src="${assetUrl(dt, portrait)}" alt="${escapeAttr(dt.nombre)} - cara PES 2018" loading="lazy" onerror="this.onerror=null;this.src='img/logo.webp'">
      ${teamCrest ? `<img class="dts-team-crest" src="${escapeAttr(teamCrest)}" alt="${escapeAttr(dt.equipo)}" loading="lazy" onerror="this.remove()">` : ''}
    </a>
    <div class="dts-card-body">
      <a class="dts-card-title" href="${detailPath}">${escapeHtml(dt.nombre)}</a>
      <div class="dts-card-meta dts-card-team">${teamCrest ? `<img src="${escapeAttr(teamCrest)}" alt="" aria-hidden="true" onerror="this.remove()">` : ''}<span>${escapeHtml(dt.equipo)}</span></div>
      <div class="dts-card-meta dts-card-year">${escapeHtml(dt.anio)}</div>
      <div class="dts-card-meta dts-card-origin">
        <span>${nationalityFlag}${escapeHtml(dt.nacionalidad)}</span>
        <span class="dts-continent-mark" aria-hidden="true">◎</span><span>${escapeHtml(dt.continente)}</span>
      </div>
      <div class="dts-card-actions">
        <a class="dts-link-button" href="${detailPath}">Ver cara</a>
      </div>
    </div>
  </article>`;
}

function dtPopularScore(dt) {
  const analyticsScore = Math.max(
    dtNumber(dt.visitas),
    dtNumber(dt.views),
    dtNumber(dt.analytics),
    dtNumber(dt.popularidad),
  );
  return analyticsScore > 0 ? analyticsScore + 1000 : dt.recent || 0;
}

function compareDtsByPopularity(a, b) {
  return dtPopularScore(b) - dtPopularScore(a)
    || String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
}

function popularDtCardHtml(dt) {
  const detailPath = `database/DTs/${encodeURIComponent(dt.id)}/`;
  const portrait = dt.real_img || dt.ingame_img;
  const nationalityFlag = dtNationalityFlag(dt.nacionalidad);
  const teamCrest = dtEscudoUrl(dt.equipo) || '';
  return `
    <article class="dts-popular-card">
      <a class="dts-popular-media" href="${detailPath}" aria-label="Ver cara de ${escapeAttr(dt.nombre)}">
        <img src="${assetUrl(dt, portrait)}" alt="${escapeAttr(dt.nombre)}" loading="lazy" onerror="this.onerror=null;this.src='img/logo.webp'">
      </a>
      <div class="dts-popular-summary">
        <h2>${escapeHtml(dt.nombre)}</h2>
        <span class="dts-popular-team">${teamCrest ? `<img src="${escapeAttr(teamCrest)}" alt="" aria-hidden="true" onerror="this.remove()">` : ''}${escapeHtml(dt.equipo)}</span>
        <strong>${escapeHtml(dt.anio)}</strong>
        <div class="dts-popular-meta">
          <span>${nationalityFlag}${escapeHtml(dt.nacionalidad)}</span>
          <span class="dts-continent-mark" aria-hidden="true">◎</span><span>${escapeHtml(dt.continente)}</span>
        </div>
        <a class="history-primary-button" href="${detailPath}">Ver cara</a>
      </div>
    </article>`;
}

function relatedDtCardHtml(dt) {
  const detailPath = `database/DTs/${encodeURIComponent(dt.id)}/`;
  const portrait = dt.real_img || dt.ingame_img;
  const nationalityFlag = dtNationalityFlag(dt.nacionalidad);
  const teamCrest = dtEscudoUrl(dt.equipo) || '';
  return `<article class="dts-related-card">
    <a class="dts-related-media" href="${detailPath}" aria-label="Ver cara de ${escapeAttr(dt.nombre)}">
      <img class="dts-related-portrait" src="${assetUrl(dt, portrait)}" alt="${escapeAttr(dt.nombre)}" loading="lazy" onerror="this.onerror=null;this.src='img/logo.webp'">
      ${teamCrest ? `<img class="dts-related-crest" src="${escapeAttr(teamCrest)}" alt="${escapeAttr(dt.equipo)}" loading="lazy" onerror="this.remove()">` : ''}
    </a>
    <div class="dts-related-body">
      <a class="dts-related-title" href="${detailPath}">${escapeHtml(dt.nombre)}</a>
      <div class="dts-related-team">${teamCrest ? `<img src="${escapeAttr(teamCrest)}" alt="" aria-hidden="true" onerror="this.remove()">` : ''}<span>${escapeHtml(dt.equipo)}</span></div>
      <strong>${escapeHtml(dt.anio)}</strong>
      <div class="dts-related-origin">
        <span>${nationalityFlag}${escapeHtml(dt.nacionalidad)}</span>
        <span class="dts-continent-mark" aria-hidden="true">◎</span><span>${escapeHtml(dt.continente)}</span>
      </div>
      <a class="dts-related-button" href="${detailPath}">Ver cara</a>
    </div>
  </article>`;
}

function indexPage(dts) {
  const popularDts = [...dts].sort(compareDtsByPopularity).slice(0, DTS_POPULAR_LIMIT);
  const teamCount = new Set(dts.map(dt => dt.equipo).filter(Boolean)).size;
  const continentCount = new Set(dts.map(dt => dt.continente).filter(Boolean)).size;
  const body = `<main id="dts-page" class="dts-shell">
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="index.html">Inicio</a>
      <a href="database.html">Base de datos</a>
      <span>Directores Técnicos</span>
    </nav>

    <section class="dts-hero">
      <div class="dts-hero-copy">
        <span class="dts-kicker">Tácticas históricas</span>
        <h1><span>Directores</span><span>Técnicos</span></h1>
        <p>Explorá directores técnicos recreados para PES 2018 con una ficha pensada para preparar tu trayectoria o llevar su cara al editor de Liga Máster.</p>
        <div class="dts-hero-stats" aria-label="Resumen de directores técnicos">
          <article><span aria-hidden="true">♙</span><strong>${dts.length}</strong><small>Directores técnicos</small></article>
          <article><span aria-hidden="true">▦</span><strong>${teamCount}</strong><small>Equipos principales</small></article>
          <article><span aria-hidden="true">◎</span><strong>${continentCount}</strong><small>Continentes</small></article>
        </div>
      </div>
      <figure class="dts-hero-visual" aria-hidden="true">
        <div class="dts-hero-board">
          <span></span><span></span><span></span><span></span><span></span>
        </div>
      </figure>
    </section>
    <section class="dts-filters" aria-label="Filtros de directores tecnicos">
      <label class="dts-filter-search">
        <span><i aria-hidden="true">⌕</i><b>Buscar entrenador</b></span>
        <input id="dts-search" type="search" placeholder="Buscar entrenador..." autocomplete="off">
      </label>
      <label>
        <span><i aria-hidden="true">⚑</i><b>Nacionalidad</b></span>
        <select id="dts-nationality-filter">${optionList(dts, 'nacionalidad', 'Todas')}</select>
      </label>
      <label>
        <span><i aria-hidden="true">◎</i><b>Continente</b></span>
        <select id="dts-continent-filter">${optionList(dts, 'continente', 'Todos')}</select>
      </label>
      <label>
        <span><i aria-hidden="true">▰</i><b>Equipo</b></span>
        <select id="dts-team-filter">${optionList(dts, 'equipo', 'Todos')}</select>
      </label>
      <label>
        <span><i aria-hidden="true">↳</i><b>Estuvo en</b></span>
        <select id="dts-career-filter">${careerTeamOptions(dts)}</select>
      </label>
      <label>
        <span><i aria-hidden="true">▣</i><b>Año</b></span>
        <select id="dts-year-filter">${optionList(dts, 'anio', 'Todos')}</select>
      </label>
      <button type="button" id="dts-clear"><span aria-hidden="true">↻</span> Limpiar filtros</button>
    </section>
    <div class="history-list-heading dts-popular-heading">
      <div>
        <span class="history-kicker">☆ Destacados</span>
        <h2>Destacados</h2>
        <p>Algunos de los entrenadores más buscados por la comunidad.</p>
      </div>
    </div>
    <section class="dts-popular-list" aria-label="DTs populares">
      ${popularDts.map(popularDtCardHtml).join('\n')}
    </section>

    <section class="dts-list-head">
      <div>
        <span class="history-kicker">▣ Todos los entrenadores</span>
        <h2>Todos los entrenadores</h2>
        <p>Explorá toda la colección de directores técnicos disponibles.</p>
      </div>
      <div class="dts-list-controls">
        <span id="dts-count">${dts.length} resultado(s)</span>
        <label>
          <span>Ordenar por</span>
          <select id="dts-sort">
            <option value="recent">Más recientes</option>
            <option value="az">Nombre (A - Z)</option>
            <option value="year">Año</option>
          </select>
        </label>
      </div>
    </section>
    <section class="dts-grid" id="dts-grid">
      ${dts.map(cardHtml).join('\n')}
    </section>

    <p class="dts-empty" id="dts-empty" hidden>No hay DTs que coincidan con esos filtros.</p>
  </main>

  <script>
    (function () {
      const normalize = value => String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim();
      const grid = document.getElementById('dts-grid');
      const cards = Array.from(grid.querySelectorAll('.dts-card'));
      const search = document.getElementById('dts-search');
      const team = document.getElementById('dts-team-filter');
      const career = document.getElementById('dts-career-filter');
      const nationality = document.getElementById('dts-nationality-filter');
      const continent = document.getElementById('dts-continent-filter');
      const year = document.getElementById('dts-year-filter');
      const sort = document.getElementById('dts-sort');
      const count = document.getElementById('dts-count');
      const empty = document.getElementById('dts-empty');

      function matches(card) {
        const query = normalize(search.value);
        return (!query || card.dataset.search.includes(query))
          && (!team.value || card.dataset.equipo === team.value)
          && (!career.value || card.dataset.career.includes(normalize(career.value)))
          && (!nationality.value || card.dataset.nacionalidad === nationality.value)
          && (!continent.value || card.dataset.continente === continent.value)
          && (!year.value || card.dataset.anio === year.value);
      }

      function applyFilters() {
        const sorted = cards.slice().sort((a, b) => {
          if (sort.value === 'az') return a.dataset.nombre.localeCompare(b.dataset.nombre, 'es');
          if (sort.value === 'year') return (Number(b.dataset.anio) || 0) - (Number(a.dataset.anio) || 0);
          return (Number(b.dataset.recent) || 0) - (Number(a.dataset.recent) || 0);
        });
        let visible = 0;
        sorted.forEach(card => {
          const show = matches(card);
          card.hidden = !show;
          if (show) visible += 1;
          grid.appendChild(card);
        });
        count.textContent = visible + ' resultado(s)';
        empty.hidden = visible > 0;
      }

      [search, team, career, nationality, continent, year, sort].forEach(control => {
        control.addEventListener(control === search ? 'input' : 'change', applyFilters);
      });
      document.getElementById('dts-clear').addEventListener('click', () => {
        search.value = '';
        team.value = '';
        career.value = '';
        nationality.value = '';
        continent.value = '';
        year.value = '';
        sort.value = 'recent';
        applyFilters();
      });
      applyFilters();
    })();
  </script>`;

  return pageShell({
    title: 'Directores Técnicos PES 2018 - Caras para Liga Máster | LAqP',
    description: 'Explorá caras recreadas de directores técnicos para usar en PES 2018 como entrenador en Liga Máster.',
    canonicalPath: '/database/DTs/',
    imagePath: dts[0] ? assetUrl(dts[0], dts[0].real_img || dts[0].ingame_img) : 'img/logo.png',
    body,
  });
}

function relatedDts(current, all) {
  return all
    .filter(item => item.id !== current.id)
    .map(item => {
      let score = 0;
      if (item.equipo && item.equipo === current.equipo) score += 4;
      if (item.nacionalidad && item.nacionalidad === current.nacionalidad) score += 3;
      if (item.continente && item.continente === current.continente) score += 1;
      return { item, score };
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.nombre.localeCompare(b.item.nombre, 'es'))
    .slice(0, 3)
    .map(entry => entry.item);
}

function detailPage(dt, all) {
  const related = relatedDts(dt, all);
  const detailPortrait = assetUrl(dt, dt.real_img || dt.ingame_img);
  const relatedHtml = related.length ? `
    <section class="dts-detail-panel dts-related">
      <header>
        <h2>DTs relacionados</h2>
      </header>
      <div class="dts-related-grid">${related.map(relatedDtCardHtml).join('\n')}</div>
    </section>` : '';
  const body = `<main id="dts-page" class="dts-shell dts-detail-shell">
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="index.html">Inicio</a>
      <a href="database.html">Base de datos</a>
      <a href="database/DTs/">Directores Técnicos</a>
      <span>${escapeHtml(dt.nombre)}</span>
    </nav>

    <section class="dts-detail-hero">
      ${dt.crest ? `<img class="dts-detail-crest" src="${escapeAttr(dt.crest)}" alt="${escapeAttr(dt.equipo)}" onerror="this.remove()">` : ''}
      <div>
        <span class="dts-kicker">Director Técnico</span>
        <h1>${escapeHtml(dt.nombre)}</h1>
        <strong>${escapeHtml(dt.equipo)} · ${escapeHtml(dt.anio)}</strong>
        <p>${escapeHtml(dt.descripcion)}</p>
      </div>
      <div class="dts-detail-portrait" aria-hidden="true">
        <img src="${detailPortrait}" alt="" onerror="this.onerror=null;this.src='img/logo.webp'">
      </div>
    </section>

    <section class="dts-detail-panel dts-dt-summary">
      <span>Sobre este DT</span>
      <p>${escapeHtml(dt.descripcion)}</p>
    </section>

    <section class="dts-detail-grid">
      <article class="dts-detail-panel dts-detail-media">
        <header>
          <h2>Preview de la cara</h2>
        </header>
        <div class="dts-detail-images">
          <figure>
            <img src="${assetUrl(dt, dt.ingame_img)}" alt="${escapeAttr(dt.nombre)} - preview in-game" onerror="this.onerror=null;this.src='img/logo.webp'">
            <figcaption>Cara in-game</figcaption>
          </figure>
        </div>
      </article>

      <aside class="dts-detail-panel dts-detail-info">
        <header>
          <h2>Ficha</h2>
        </header>
        <dl>
          <div><dt>Equipo</dt><dd>${escapeHtml(dt.equipo)}</dd></div>
          <div><dt>Año</dt><dd>${escapeHtml(dt.anio)}</dd></div>
          <div><dt>Nacionalidad</dt><dd>${escapeHtml(dt.nacionalidad)}</dd></div>
          <div><dt>Continente</dt><dd>${escapeHtml(dt.continente)}</dd></div>
        </dl>
      </aside>
    </section>

    <section class="dts-detail-panel dts-face-editor-panel">
      <header class="dts-editor-head">
        <span>Cara y peinado</span>
        <h2>Valores del editor</h2>
      </header>
      ${renderFaceEditor(dt)}
    </section>

    ${relatedHtml}
    <script>
      document.querySelectorAll('[data-dts-face-tab]').forEach(button => {
        button.addEventListener('click', () => {
          const target = button.getAttribute('data-dts-face-tab');
          document.querySelectorAll('[data-dts-face-tab]').forEach(tab => tab.classList.toggle('is-active', tab === button));
          document.querySelectorAll('[data-dts-face-panel]').forEach(panel => {
            panel.classList.toggle('is-active', panel.getAttribute('data-dts-face-panel') === target);
          });
        });
      });
    </script>
  </main>`;

  return pageShell({
    title: `${dt.nombre} ${dt.anio} - DT PES 2018 Liga Máster | LAqP`,
    description: `${dt.nombre} para PES 2018 Liga Máster: cara recreada, preview in-game, equipo ${dt.equipo}, nacionalidad ${dt.nacionalidad}.`,
    canonicalPath: `/database/DTs/${encodeURIComponent(dt.id)}/`,
    imagePath: assetUrl(dt, dt.ingame_img),
    body,
  });
}

function splitDtList(value) {
  return String(value || '')
    .split('|')
    .map(item => item.trim())
    .filter(Boolean);
}

function renderDtTimeline(dt) {
  const items = splitDtList(dt.trayectoria);
  if (!items.length) return '';
  return `
    <section class="dts-detail-panel dts-manager-timeline">
      <header>
        <span class="dts-section-kicker">Trayectoria</span>
        <h2>Carrera</h2>
      </header>
      <div class="dts-career-table">
        <div class="dts-career-head">
          <span>Temporada</span>
          <span>Club</span>
        </div>
        <ol>
        ${items.map(item => {
          const [years = '', club = '', note = ''] = item.split(':').map(part => part.trim());
          const teamName = dtDisplayTeamName(club || item);
          const shield = dtEscudoUrl(teamName);
          return `<li>
            <span class="dts-timeline-years">${escapeHtml(years)}</span>
            <span class="dts-timeline-club">
              <span class="dts-timeline-crest">${shield ? `<img src="${escapeAttr(shield)}" alt="${escapeAttr(teamName)}" loading="lazy" onerror="this.remove()">` : ''}</span>
              <strong>${escapeHtml(teamName)}</strong>
              ${note ? `<small>${escapeHtml(note)}</small>` : ''}
            </span>
          </li>`;
        }).join('\n')}
        </ol>
      </div>
    </section>`;
}

function renderDtHonors(dt) {
  const items = splitDtList(dt.palmares);
  if (!items.length) return '';
  return `
    <section class="dts-detail-panel dts-manager-honors">
      <header>
        <span class="dts-section-kicker">Palmarés principal</span>
        <h2>Logros destacados</h2>
      </header>
      <div class="dts-honors-grid">
        ${items.map(item => {
          const parts = item.split(':').map(part => part.trim());
          const hasNumber = parts.length > 1 && /^-?\d+/.test(parts[0]);
          const number = hasNumber ? parts.shift() : '';
          const label = parts.join(':') || item;
          return `<article>
            ${number ? `<strong>${escapeHtml(number)}</strong>` : ''}
            <span>${escapeHtml(label)}</span>
          </article>`;
        }).join('\n')}
      </div>
    </section>`;
}

const DT_NATIONALITY_FLAG_IDS = new Map([
  ['argentina', '144'],
  ['brasil', '146'],
  ['brazil', '146'],
  ['espana', '236'],
  ['uruguay', '152'],
  ['chile', '147'],
  ['colombia', '148'],
  ['paraguay', '150'],
  ['peru', '151'],
  ['mexico', '124'],
  ['italia', '215'],
  ['francia', '208'],
  ['alemania', '210'],
  ['belgica', '197'],
  ['portugal', '228'],
  ['inglaterra', '204'],
  ['reino unido', '204'],
  ['paises bajos', '224'],
  ['holanda', '224'],
]);

function dtNationalityFlag(nationality) {
  const flagId = DT_NATIONALITY_FLAG_IDS.get(normalize(nationality));
  const flagSrc = flagId ? `img/flags/${flagId}.webp` : 'img/flags/default.webp';
  return `<img class="dts-flag" src="${flagSrc}" alt="" aria-hidden="true" loading="lazy" onerror="this.onerror=null;this.src='img/flags/default.webp'">`;
}

function managerFactRow(icon, label, value, valuePrefix = '') {
  return `<div>
              <dt><span class="dts-fact-icon" aria-hidden="true">${icon}</span>${escapeHtml(label)}</dt>
              <dd>${valuePrefix}${escapeHtml(value)}</dd>
            </div>`;
}

function detailPage(dt, all) {
  const related = relatedDts(dt, all);
  const detailPortrait = assetUrl(dt, dt.ingame_img || dt.real_img);
  const managerTeamCrest = dtEscudoUrl(dt.equipo) || '';
  const nationalityFlag = dtNationalityFlag(dt.nacionalidad);
  const relatedHtml = related.length ? `
    <section class="dts-detail-panel dts-related">
      <header>
        <h2>DTs relacionados</h2>
      </header>
      <div class="dts-related-grid">${related.map(relatedDtCardHtml).join('\n')}</div>
    </section>` : '';
  const body = `<main id="dts-page" class="dts-shell dts-detail-shell">
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="index.html">Inicio</a>
      <a href="database.html">Base de datos</a>
      <a href="database/DTs/">Directores Técnicos</a>
      <span>${escapeHtml(dt.nombre)}</span>
    </nav>

    <section class="dts-manager-hero">
      <figure class="dts-manager-photo">
        <img src="${detailPortrait}" alt="${escapeAttr(dt.nombre)} - cara in-game" onerror="this.onerror=null;this.src='img/logo.webp'">
        <figcaption>${escapeHtml(dt.nombre)}</figcaption>
      </figure>
      <div class="dts-manager-copy">
        <span class="dts-kicker">Director Técnico</span>
        <h1>${escapeHtml(dt.nombre)}</h1>
        <div class="dts-manager-teamline">
          ${managerTeamCrest ? `<img src="${escapeAttr(managerTeamCrest)}" alt="${escapeAttr(dt.equipo)}" onerror="this.remove()">` : ''}
          <strong>${escapeHtml(dt.equipo)}</strong>
          <span>${escapeHtml(dt.anio)}</span>
        </div>
        <p>${escapeHtml(dt.descripcion)}</p>
        <aside class="dts-manager-facts" aria-label="Ficha de ${escapeAttr(dt.nombre)}">
          <dl>
            ${managerFactRow('📋', 'Ficha', 'Director Técnico')}
            ${managerFactRow('🛡️', 'Equipo', dt.equipo)}
            ${managerFactRow('📅', 'Año', dt.anio)}
            ${managerFactRow('🏳️', 'Nacionalidad', dt.nacionalidad, nationalityFlag)}
            ${managerFactRow('🌎', 'Continente', dt.continente)}
          </dl>
        </aside>
      </div>
    </section>

    ${renderDtTimeline(dt)}
    ${renderDtHonors(dt)}

    <section class="dts-detail-panel dts-face-editor-panel">
      <header class="dts-editor-head">
        <span>Valores del editor</span>
        <h2>Cara y peinado</h2>
      </header>
      ${renderFaceEditor(dt)}
    </section>

    ${relatedHtml}
    <script>
      document.querySelectorAll('[data-dts-face-tab]').forEach(button => {
        button.addEventListener('click', () => {
          const target = button.getAttribute('data-dts-face-tab');
          document.querySelectorAll('[data-dts-face-tab]').forEach(tab => tab.classList.toggle('is-active', tab === button));
          document.querySelectorAll('[data-dts-face-panel]').forEach(panel => {
            panel.classList.toggle('is-active', panel.getAttribute('data-dts-face-panel') === target);
          });
        });
      });
    </script>
  </main>`;

  return pageShell({
    title: `${dt.nombre} ${dt.anio} - DT PES 2018 Liga Master | LAqP`,
    description: `${dt.nombre} para PES 2018 Liga Master: cara recreada, preview in-game, equipo ${dt.equipo}, nacionalidad ${dt.nacionalidad}.`,
    canonicalPath: `/database/DTs/${encodeURIComponent(dt.id)}/`,
    imagePath: assetUrl(dt, dt.ingame_img),
    body,
  });
}

function validateAssets(dt) {
  return [dt.real_img, dt.ingame_img, dt.face_csv]
    .filter(Boolean)
    .filter(file => !fs.existsSync(path.join(dtsDir, dt.sourceFolder, file)));
}

function main() {
  const dts = loadDts();
  if (!dts.length) {
    console.warn('No DT config.csv files found in database/DTs.');
  }

  const warnings = dts.flatMap(dt => validateAssets(dt).map(file => `${dt.id}/${file}`));
  fs.writeFileSync(path.join(dtsDir, 'index.html'), indexPage(dts), 'utf8');

  dts.forEach(dt => {
    const folderPath = path.join(dtsDir, dt.sourceFolder);
    fs.writeFileSync(path.join(folderPath, 'index.html'), detailPage(dt, dts), 'utf8');
  });

  const urls = ['/database/DTs/', ...dts.map(dt => `/database/DTs/${encodeURIComponent(dt.id)}/`)];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(url => `  <url><loc>${SITE_URL}${url}</loc><changefreq>weekly</changefreq><priority>0.75</priority></url>`)
    .join('\n')}\n</urlset>\n`;
  fs.writeFileSync(path.join(rootDir, 'sitemap-dts.xml'), sitemap, 'utf8');

  console.log(`Generated ${dts.length + 1} DT pages in database/DTs.`);
  if (warnings.length) console.warn(`Missing DT assets: ${warnings.join(', ')}`);
}

main();
