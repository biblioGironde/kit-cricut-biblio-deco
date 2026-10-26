/* Kit biblio.deco — préparation de motifs SVG pour la découpe Cricut.
   Fonctionne sans serveur : le catalogue est chargé depuis catalogue.js (généré par outils/generer-catalogue.mjs). */
(() => {
  'use strict';

  // ---------------------------------------------------------------- Référentiels
  // Dimensions en cm. La zone de découpe est légèrement plus petite que le tapis (valeurs approximatives).
  const MACHINES = {
    maker:   { nom: 'Maker / Explore · tapis 30 × 30', tapis: [30.5, 30.5], zone: [29.2, 29.2] },
    maker60: { nom: 'Maker / Explore · tapis 30 × 60', tapis: [30.5, 61],   zone: [29.2, 59.7] },
    joyxtra: { nom: 'Joy Xtra · tapis 21,6 × 30,5',    tapis: [21.6, 30.5], zone: [20.9, 29.2] },
    joy:     { nom: 'Joy · tapis 11,4 × 16,5',         tapis: [11.4, 16.5], zone: [10.8, 15.9] },
  };
  const TAPIS = {
    light:    { nom: 'LightGrip (bleu)',    couleur: 'var(--tapis-light)' },
    standard: { nom: 'StandardGrip (vert)', couleur: 'var(--tapis-standard)' },
    strong:   { nom: 'StrongGrip (violet)', couleur: 'var(--tapis-strong)' },
  };
  const MATIERES = {
    papier:      { nom: 'Papier, papier calque',        tapis: 'light' },
    cartonnette: { nom: 'Cartonnette, papier cartonné', tapis: 'standard' },
    vinyle:      { nom: 'Vinyle adhésif',               tapis: 'standard' },
    flex:        { nom: 'Flex thermocollant (textile)', tapis: 'standard', miroir: true },
    feutrine:    { nom: 'Feutrine, carton épais',       tapis: 'strong' },
  };
  const MARGE_MM = 5;            // espace entre deux motifs sur la planche
  const TAILLE_DEFAUT_CM = 10;
  const CLE_STOCKAGE = 'biblio-deco-v1';
  const THEME_IMPORTS = { id: 'imports', nom: 'Mes imports', couleur: '#7a8580' };

  // ---------------------------------------------------------------- Utilitaires
  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs = {}, ...enfants) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of enfants.flat()) if (c != null && c !== false) e.append(c);
    return e;
  };
  const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  const cm = (n) => nf.format(n);
  const arrondi = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
  const fx = (n) => String(arrondi(n, 4));
  const sansAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const slug = (s) => sansAccent(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'motif';
  const echapper = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function longueurMm(v) {
    if (!v) return null;
    const m = String(v).trim().match(/^([\d.]+)\s*(mm|cm|in|pt|pc|px)?$/i);
    if (!m) return null;
    const facteurs = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96 };
    return parseFloat(m[1]) * facteurs[(m[2] || 'px').toLowerCase()];
  }

  const ctxCouleur = document.createElement('canvas').getContext('2d');
  function normaliserCouleur(c) {
    ctxCouleur.fillStyle = '#000000';
    ctxCouleur.fillStyle = c;
    return ctxCouleur.fillStyle;
  }

  // ---------------------------------------------------------------- Catalogue
  const catalogue = window.CATALOGUE || { themes: [] };
  const etat = {
    theme: 'tous',
    recherche: '',
    selection: null,
    reglages: { machine: 'maker', matiere: 'cartonnette', unite: 'mm' },
    planche: [],   // { id, largeurCm, hauteurCm, quantite, miroir }
    imports: [],   // { id, nom, svg, themeId }
  };
  let prep = null;  // réglages du motif sélectionné
  const analyses = new Map();

  function tousLesThemes() {
    const t = catalogue.themes.map((th) => ({ ...th, motifs: th.motifs.map((m) => ({ ...m, themeId: th.id })) }));
    if (etat.imports.length) t.push({ ...THEME_IMPORTS, motifs: etat.imports });
    return t;
  }
  let themes = tousLesThemes();
  const indexMotifs = () => new Map(themes.flatMap((t) => t.motifs).map((m) => [m.id, m]));
  let motifsParId = indexMotifs();
  const themeDe = (m) => themes.find((t) => t.id === m.themeId) || THEME_IMPORTS;

  function analyseDe(motif) {
    if (!analyses.has(motif.id)) analyses.set(motif.id, analyser(motif.svg));
    return analyses.get(motif.id);
  }

  // ---------------------------------------------------------------- Analyse et nettoyage SVG
  function nettoyer(racine) {
    racine.querySelectorAll('script, foreignObject, iframe, object, embed, audio, video, metadata').forEach((n) => n.remove());
    [...racine.getElementsByTagName('*')].filter((e) => /^(sodipodi|inkscape):/.test(e.nodeName)).forEach((n) => n.remove());
    for (const e of [racine, ...racine.getElementsByTagName('*')]) {
      for (const a of [...e.attributes]) {
        const nom = a.name.toLowerCase();
        const val = a.value.trim().toLowerCase();
        if (nom.startsWith('on')) e.removeAttribute(a.name);
        else if ((nom === 'href' || nom === 'xlink:href') && !val.startsWith('#') && !val.startsWith('data:image/')) e.removeAttribute(a.name);
      }
    }
  }

  function remplissage(e) {
    const st = e.getAttribute('style') || '';
    const m = st.match(/(?:^|;)\s*fill\s*:\s*([^;]+)/i);
    return (m ? m[1] : e.getAttribute('fill') || '').trim().toLowerCase();
  }
  function contour(e) {
    const st = e.getAttribute('style') || '';
    const m = st.match(/(?:^|;)\s*stroke\s*:\s*([^;]+)/i);
    return (m ? m[1] : e.getAttribute('stroke') || '').trim().toLowerCase();
  }

  function listerCouleurs(racine) {
    const ensemble = new Set();
    const ajouter = (c) => {
      c = (c || '').trim().toLowerCase();
      if (!c || ['none', 'transparent', 'currentcolor', 'inherit'].includes(c) || c.startsWith('url(')) return;
      ensemble.add(normaliserCouleur(c));
    };
    const css = [...racine.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    for (const m of css.matchAll(/(?:^|[;{\s])fill\s*:\s*([^;}!]+)/gi)) ajouter(m[1]);
    for (const e of [racine, ...racine.getElementsByTagName('*')]) {
      if (e.hasAttribute('fill') || /fill\s*:/i.test(e.getAttribute('style') || '')) ajouter(remplissage(e));
    }
    if (!ensemble.size && racine.querySelector('path, rect, circle, ellipse, polygon')) ensemble.add('#000000');
    return [...ensemble];
  }

  function analyser(texte) {
    const doc = new DOMParser().parseFromString(texte, 'image/svg+xml');
    const r = doc.documentElement;
    if (!r || r.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) {
      return { erreur: 'Fichier SVG illisible.' };
    }
    nettoyer(r);

    const wMm = longueurMm(r.getAttribute('width'));
    const hMm = longueurMm(r.getAttribute('height'));
    let vb = (r.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || vb.some((n) => !isFinite(n)) || vb[2] <= 0 || vb[3] <= 0) {
      const w = wMm ? (wMm / 25.4) * 96 : parseFloat(r.getAttribute('width')) || 100;
      const h = hMm ? (hMm / 25.4) * 96 : parseFloat(r.getAttribute('height')) || 100;
      vb = [0, 0, w, h];
    }

    const alertes = [];
    if (r.querySelector('text')) alertes.push(['attention', 'Contient du texte : convertissez-le en tracés avant import, sinon Design Space remplace la police ou ignore le texte.']);
    if (r.querySelector('image')) alertes.push(['erreur', 'Contient une image matricielle : elle ne peut pas être découpée.']);
    const traits = [...r.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line')]
      .filter((e) => (e.localName === 'line' || remplissage(e) === 'none') && contour(e) && contour(e) !== 'none').length;
    if (traits) alertes.push(['info', `${traits} tracé${traits > 1 ? 's' : ''} sans remplissage : la lame suit la ligne centrale, l'épaisseur du trait est ignorée.`]);

    // Attributs de présentation portés par la racine, à reporter sur le groupe exporté
    const attrsRacine = ['fill', 'stroke', 'stroke-width', 'fill-rule', 'style', 'opacity', 'class']
      .filter((a) => r.hasAttribute(a))
      .map((a) => `${a}="${echapper(r.getAttribute(a))}"`).join(' ');
    const serialiseur = new XMLSerializer();
    const interieur = [...r.childNodes].map((n) => serialiseur.serializeToString(n)).join('')
      .replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '');

    r.setAttribute('viewBox', vb.join(' '));
    r.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const apercu = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serialiseur.serializeToString(r));

    return {
      vb, interieur, attrsRacine, apercu, alertes,
      ratio: vb[3] / vb[2],
      tailleCm: wMm && hMm ? [wMm / 10, hMm / 10] : null,
      couleurs: listerCouleurs(r),
    };
  }

  // Préfixe identifiants et classes pour que plusieurs motifs cohabitent dans un même fichier
  function prefixer(markup, p) {
    return markup
      .replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, a, css, c) =>
        a + css.replace(/\.(-?[_a-zA-Z][\w-]*)(?=[^{}]*\{)/g, `.${p}$1`) + c)
      .replace(/\bid="([^"]+)"/g, `id="${p}$1"`)
      .replace(/url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/g, `url(#${p}$1)`)
      .replace(/((?:xlink:)?href)="#([^"]+)"/g, `$1="#${p}$2"`)
      .replace(/\bclass="([^"]+)"/g, (_, cls) => `class="${cls.trim().split(/\s+/).map((c) => p + c).join(' ')}"`);
  }

  // ---------------------------------------------------------------- Placement sur le tapis
  function developper(entrees) {
    const copies = [];
    for (const e of entrees) {
      const motif = motifsParId.get(e.id);
      if (!motif) continue;
      const a = analyseDe(motif);
      if (a.erreur) continue;
      for (let i = 0; i < e.quantite; i++) copies.push({ w: e.largeurCm * 10, h: e.hauteurCm * 10, entree: e, motif, a });
    }
    return copies.sort((p, q) => q.h - p.h);
  }

  function placer(copies) {
    const largeurZone = MACHINES[etat.reglages.machine].zone[0] * 10;
    let x = 0, y = 0, hLigne = 0, largeur = 0;
    const positions = copies.map((c) => {
      if (x > 0 && x + c.w > largeurZone) { x = 0; y += hLigne + MARGE_MM; hLigne = 0; }
      const pos = { ...c, x, y };
      x += c.w + MARGE_MM;
      hLigne = Math.max(hLigne, c.h);
      largeur = Math.max(largeur, x - MARGE_MM);
      return pos;
    });
    return { positions, largeur, hauteur: y + hLigne };
  }

  function construireSvg(entrees, titre) {
    const { positions, largeur, hauteur } = placer(developper(entrees));
    if (!positions.length) return null;
    const groupes = positions.map((p, i) => {
      const { vb, interieur, attrsRacine } = p.a;
      const sx = p.w / vb[2], sy = p.h / vb[3];
      const pre = `m${i + 1}-`;
      const placement = p.entree.miroir
        ? `translate(${fx(p.x + p.w)} ${fx(p.y)}) scale(${fx(-sx)} ${fx(sy)})`
        : `translate(${fx(p.x)} ${fx(p.y)}) scale(${fx(sx)} ${fx(sy)})`;
      return `<g id="${slug(p.motif.nom)}-${i + 1}" transform="${placement} translate(${fx(-vb[0])} ${fx(-vb[1])})"${attrsRacine ? ' ' + prefixer(attrsRacine, pre) : ''}>\n${prefixer(interieur, pre)}\n</g>`;
    });
    const W = arrondi(largeur, 3), H = arrondi(hauteur, 3);
    const unite = etat.reglages.unite;
    const dim = unite === 'in'
      ? [`${fx(W / 25.4)}in`, `${fx(H / 25.4)}in`]
      : unite === 'px72'
        ? [fx((W / 25.4) * 72), fx((H / 25.4) * 72)]
        : [`${W}mm`, `${H}mm`];
    return {
      texte: `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${dim[0]}" height="${dim[1]}" viewBox="0 0 ${W} ${H}">\n<title>${echapper(titre)}</title>\n${groupes.join('\n')}\n</svg>\n`,
      largeurCm: W / 10, hauteurCm: H / 10,
    };
  }

  // ---------------------------------------------------------------- Aperçu du tapis (SVG)
  function apercuTapis(positions, debordement) {
    const m = MACHINES[etat.reglages.machine];
    const couleur = TAPIS[MATIERES[etat.reglages.matiere].tapis].couleur;
    const [tw, th] = m.tapis.map((v) => v * 10);
    const [zw, zh] = m.zone.map((v) => v * 10);
    const ox = (tw - zw) / 2, oy = (th - zh) / 2;
    const parts = [];
    parts.push(`<rect x="0" y="0" width="${tw}" height="${th}" rx="4" style="fill:${couleur}"/>`);
    for (let x = 10; x < zw; x += 10) parts.push(`<line x1="${ox + x}" y1="${oy}" x2="${ox + x}" y2="${oy + zh}" stroke="var(--tapis-grille)" stroke-width="${x % 50 ? 0.25 : 0.6}"/>`);
    for (let y = 10; y < zh; y += 10) parts.push(`<line x1="${ox}" y1="${oy + y}" x2="${ox + zw}" y2="${oy + y}" stroke="var(--tapis-grille)" stroke-width="${y % 50 ? 0.25 : 0.6}"/>`);
    parts.push(`<rect x="${ox}" y="${oy}" width="${zw}" height="${zh}" fill="none" style="stroke:${debordement ? 'var(--erreur)' : 'var(--tapis-grille)'}" stroke-width="${debordement ? 1.2 : 0.6}" stroke-dasharray="3 2"/>`);
    for (let x = 50; x <= zw; x += 50) parts.push(`<text x="${ox + x}" y="-4" text-anchor="middle">${x / 10}</text>`);
    for (let y = 50; y <= zh; y += 50) parts.push(`<text x="-4" y="${oy + y + 2.2}" text-anchor="end">${y / 10}</text>`);
    parts.push(`<text x="-4" y="-4" text-anchor="end">cm</text>`);
    for (const p of positions) {
      const x = ox + p.x, y = oy + p.y;
      const t = p.entree.miroir ? ` transform="translate(${2 * x + p.w} 0) scale(-1 1)"` : '';
      parts.push(`<image href="${p.a.apercu}" x="${fx(x)}" y="${fx(y)}" width="${fx(p.w)}" height="${fx(p.h)}" preserveAspectRatio="none"${t}/>`);
    }
    const hVue = Math.max(th, oy + positions.reduce((mx, p) => Math.max(mx, p.y + p.h), 0) + 4);
    return `<svg class="tapis" viewBox="-20 -14 ${tw + 24} ${hVue + 18}" role="img" aria-label="Aperçu du tapis de découpe">${parts.join('')}</svg>`;
  }

  // ---------------------------------------------------------------- Contrôles de taille
  function controleTaille(lCm, hCm) {
    const [zw, zh] = MACHINES[etat.reglages.machine].zone;
    const tient = (lCm <= zw && hCm <= zh) || (lCm <= zh && hCm <= zw);
    const alertes = [];
    if (!tient) alertes.push(['erreur', `Trop grand pour ce tapis : zone de découpe ${cm(zw)} × ${cm(zh)} cm environ.`]);
    else if (lCm > zw) alertes.push(['info', 'Le motif tiendra en le tournant d’un quart de tour dans Design Space.']);
    if (Math.min(lCm, hCm) < 1.5) alertes.push(['attention', 'Très petit : les détails fins risquent de se déchirer à la découpe.']);
    return { tient, alertes };
  }

  function tailleInitiale(motif, a) {
    const [zw, zh] = MACHINES[etat.reglages.machine].zone;
    let l = motif.largeurCm || (a.tailleCm && a.tailleCm[0] >= 1 ? a.tailleCm[0] : TAILLE_DEFAUT_CM);
    let h = l * a.ratio;
    const echelle = Math.min(1, zw / l, zh / h);
    l *= echelle; h *= echelle;
    return [arrondi(l), arrondi(h)];
  }

  const remplacer = (cible, ...enfants) => cible.replaceChildren(...enfants.filter((c) => c != null && c !== false));

  // ---------------------------------------------------------------- Rendu : réglages
  function remplirSelect(select, options, valeur) {
    select.replaceChildren(...Object.entries(options).map(([k, o]) => el('option', { value: k, text: o.nom || o })));
    select.value = valeur;
  }

  function rendreReglages() {
    remplirSelect($('#reglage-machine'), MACHINES, etat.reglages.machine);
    remplirSelect($('#reglage-matiere'), MATIERES, etat.reglages.matiere);
    $('#reglage-unite').value = etat.reglages.unite;
  }

  // ---------------------------------------------------------------- Rendu : thèmes
  function rendreThemes() {
    const total = themes.reduce((s, t) => s + t.motifs.length, 0);
    const items = [{ id: 'tous', nom: 'Tous les motifs', couleur: null, motifs: { length: total } }, ...themes];
    $('#liste-themes').replaceChildren(...items.map((t) => el('li', {},
      el('button', {
        type: 'button', class: 'theme-btn', 'aria-current': String(etat.theme === t.id),
        onclick: () => { etat.theme = t.id; rendreThemes(); rendreGrille(); },
      },
        el('span', { class: 'pastille', style: t.couleur ? `--c:${t.couleur}` : 'background:transparent;border:1.5px solid var(--encre-douce)' }),
        el('span', { class: 'theme-nom', text: t.nom }),
        el('span', { class: 'theme-nb', text: String(t.motifs.length) }),
      ))));
  }

  // ---------------------------------------------------------------- Rendu : grille
  function motifsFiltres() {
    const q = sansAccent(etat.recherche.trim());
    const source = etat.theme === 'tous' ? themes : themes.filter((t) => t.id === etat.theme);
    return source.flatMap((t) => t.motifs).filter((m) => {
      if (!q) return true;
      const texte = sansAccent([m.nom, ...(m.tags || []), themeDe(m).nom].join(' '));
      return q.split(/\s+/).every((mot) => texte.includes(mot));
    });
  }

  function rendreGrille() {
    const liste = motifsFiltres();
    const total = themes.reduce((s, t) => s + t.motifs.length, 0);
    $('#compteur').textContent = total ? `${liste.length} motif${liste.length > 1 ? 's' : ''}` : '';
    const grille = $('#grille');
    const vide = $('#vide');

    if (!liste.length) {
      grille.replaceChildren();
      vide.hidden = false;
      const themeCourant = themes.find((t) => t.id === etat.theme);
      if (!total) {
        vide.innerHTML = `<h2>La bibliothèque est encore vide</h2>
          <p>Déposez vos fichiers SVG dans les dossiers <code>bibliotheque/&lt;thème&gt;/</code>, puis lancez <code>node outils/generer-catalogue.mjs</code> pour les faire apparaître ici.</p>
          <p>Pour essayer tout de suite, glissez un fichier SVG sur cette page ou utilisez <strong>Importer un SVG</strong>.</p>`;
      } else if (etat.recherche) {
        vide.innerHTML = `<h2>Aucun motif ne correspond</h2><p>Essayez un autre mot, ou cherchez dans tous les thèmes.</p>`;
      } else {
        vide.innerHTML = `<h2>Aucun motif dans « ${echapper(themeCourant ? themeCourant.nom : '')} »</h2>
          <p>Ajoutez des SVG dans <code>bibliotheque/${echapper(etat.theme)}/</code> puis régénérez le catalogue.</p>`;
      }
      return;
    }
    vide.hidden = true;
    grille.replaceChildren(...liste.map((m) => {
      const a = analyseDe(m);
      const th = themeDe(m);
      return el('button', {
        type: 'button', class: 'motif', 'aria-pressed': String(etat.selection === m.id),
        onclick: () => selectionner(m.id, true),
      },
        el('span', { class: 'motif-vignette' },
          a.erreur ? el('span', { class: 'note', text: 'SVG illisible' }) : el('img', { src: a.apercu, alt: '', loading: 'lazy' })),
        el('span', {},
          el('span', { class: 'motif-nom', text: m.nom }),
          etat.theme === 'tous' ? el('span', { class: 'motif-theme' }, el('span', { class: 'pastille', style: `--c:${th.couleur}` }), th.nom) : null),
      );
    }));
  }

  // ---------------------------------------------------------------- Rendu : préparation
  function selectionner(id, defiler) {
    const motif = motifsParId.get(id);
    if (!motif) return;
    const a = analyseDe(motif);
    etat.selection = id;
    const [l, h] = a.erreur ? [TAILLE_DEFAUT_CM, TAILLE_DEFAUT_CM] : tailleInitiale(motif, a);
    prep = { id, largeurCm: l, hauteurCm: h, verrou: true, quantite: 1, miroir: !!MATIERES[etat.reglages.matiere].miroir };
    rendreGrille();
    rendrePreparation();
    if (defiler && window.matchMedia('(max-width: 760px)').matches) $('#preparation').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const iconeVerrou = (ferme) => `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="${ferme ? 'M8 11V8a4 4 0 0 1 8 0v3' : 'M8 11V8a4 4 0 0 1 7.5-2'}"/></svg>`;

  function rendrePreparation() {
    const zone = $('#preparation');
    const motif = prep && motifsParId.get(prep.id);
    if (!motif) {
      remplacer(zone, 
        el('div', {},
          el('h2', { id: 'prep-titre', text: 'Préparer une découpe' }),
          el('p', { class: 'sous-titre', text: 'Choisissez un motif dans la bibliothèque.' })),
        el('div', { html: apercuTapis([], false) }),
        legendeTapis());
      return;
    }
    const a = analyseDe(motif);
    const th = themeDe(motif);
    if (a.erreur) {
      remplacer(zone, el('h2', { id: 'prep-titre', text: motif.nom }), el('ul', { class: 'alertes' }, ligneAlerte(['erreur', a.erreur])));
      return;
    }
    const entree = { id: motif.id, largeurCm: prep.largeurCm, hauteurCm: prep.hauteurCm, quantite: prep.quantite, miroir: prep.miroir };
    const { positions } = placer(developper([entree]));
    const ctrl = controleTaille(prep.largeurCm, prep.hauteurCm);
    const matiere = MATIERES[etat.reglages.matiere];

    const largeur = el('input', { id: 'prep-largeur', type: 'number', min: '0.5', max: '200', step: '0.1', value: prep.largeurCm, inputmode: 'decimal' });
    const hauteur = el('input', { id: 'prep-hauteur', type: 'number', min: '0.5', max: '200', step: '0.1', value: prep.hauteurCm, inputmode: 'decimal' });
    const majTaille = (source) => {
      const l = parseFloat(largeur.value), h = parseFloat(hauteur.value);
      if (source === 'l' && l > 0) { prep.largeurCm = arrondi(l); if (prep.verrou) prep.hauteurCm = arrondi(l * a.ratio); }
      if (source === 'h' && h > 0) { prep.hauteurCm = arrondi(h); if (prep.verrou) prep.largeurCm = arrondi(h / a.ratio); }
      rendrePreparation();
      const cible = $(source === 'l' ? '#prep-largeur' : '#prep-hauteur');
      cible.focus();
    };
    largeur.addEventListener('change', () => majTaille('l'));
    hauteur.addEventListener('change', () => majTaille('h'));

    const [zw, zh] = MACHINES[etat.reglages.machine].zone;
    const prereglages = [5, 10, 15, 20].filter((v) => v <= zw).map((v) => [`${v} cm`, v]);
    const lMax = arrondi(Math.min(zw, zh / a.ratio) - 0.05);

    const alertes = [...ctrl.alertes, ...a.alertes];
    if (matiere.miroir && !prep.miroir) alertes.unshift(['attention', 'Flex thermocollant : activez le miroir, la face collante se découpe à l’envers.']);

    remplacer(zone, 
      el('div', { class: 'carte-entete' },
        el('div', {},
          el('h2', { id: 'prep-titre', text: motif.nom }),
          el('p', { class: 'sous-titre' }, el('span', { class: 'pastille', style: `--c:${th.couleur}` }), th.nom))),
      el('div', { html: apercuTapis(positions, !ctrl.tient) }),
      legendeTapis(),
      el('div', { class: 'dimensions' },
        el('label', { class: 'champ', for: 'prep-largeur' }, el('span', { text: 'Largeur (cm)' }), largeur),
        el('button', {
          type: 'button', class: 'verrou', 'aria-pressed': String(prep.verrou),
          'aria-label': prep.verrou ? 'Proportions verrouillées' : 'Proportions libres', title: prep.verrou ? 'Proportions verrouillées' : 'Proportions libres',
          html: iconeVerrou(prep.verrou),
          onclick: () => { prep.verrou = !prep.verrou; if (prep.verrou) prep.hauteurCm = arrondi(prep.largeurCm * a.ratio); rendrePreparation(); },
        }),
        el('label', { class: 'champ', for: 'prep-hauteur' }, el('span', { text: 'Hauteur (cm)' }), hauteur)),
      el('div', { class: 'prereglages', role: 'group', 'aria-label': 'Largeurs rapides' },
        [...prereglages, ['Largeur max', lMax]].map(([lib, v]) => el('button', {
          type: 'button', text: lib,
          onclick: () => { prep.verrou = true; prep.largeurCm = arrondi(v); prep.hauteurCm = arrondi(v * a.ratio); rendrePreparation(); },
        }))),
      el('div', { class: 'ligne-options' },
        el('label', { class: 'champ', for: 'prep-quantite' }, el('span', { text: 'Exemplaires' }),
          el('input', {
            id: 'prep-quantite', type: 'number', min: '1', max: '100', step: '1', value: prep.quantite,
            onchange: (e) => { prep.quantite = Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)); rendrePreparation(); $('#prep-quantite').focus(); },
          })),
        el('label', { class: 'case' },
          el('input', { id: 'prep-miroir', type: 'checkbox', checked: prep.miroir, onchange: (e) => { prep.miroir = e.target.checked; rendrePreparation(); } }),
          'Miroir')),
      el('div', { class: 'couleurs' },
        el('span', { text: `${a.couleurs.length} couleur${a.couleurs.length > 1 ? 's' : ''} → ${a.couleurs.length} matériau${a.couleurs.length > 1 ? 'x' : ''} à découper` }),
        el('div', { class: 'nuancier' }, a.couleurs.map((c) => el('span', { class: 'nuance', style: `background:${c}`, title: c })))),
      alertes.length ? el('ul', { class: 'alertes' }, alertes.map(ligneAlerte)) : null,
      el('div', { class: 'actions' },
        el('button', { type: 'button', class: 'bouton', disabled: !ctrl.tient, onclick: ajouterALaPlanche }, 'Ajouter à la planche'),
        el('button', {
          type: 'button', class: 'bouton bouton-secondaire', disabled: !ctrl.tient,
          onclick: () => exporter([entree], `${slug(motif.nom)}_${cm(prep.largeurCm)}x${cm(prep.hauteurCm)}cm`, motif.nom),
        }, 'Télécharger ce motif')),
    );
  }

  function legendeTapis() {
    const m = MACHINES[etat.reglages.machine];
    const t = TAPIS[MATIERES[etat.reglages.matiere].tapis];
    return el('div', { class: 'tapis-legende' },
      el('span', { class: 'infos-tapis' }, el('span', { class: 'pastille', style: `background:${t.couleur}` }), 'Tapis ', el('strong', { text: t.nom })),
      el('span', { text: `zone ≈ ${cm(m.zone[0])} × ${cm(m.zone[1])} cm` }));
  }

  function ligneAlerte([niveau, texte]) {
    return el('li', { class: `alerte alerte-${niveau}` }, el('span', { text: texte }));
  }

  // ---------------------------------------------------------------- Planche
  function ajouterALaPlanche() {
    if (!prep) return;
    const meme = etat.planche.find((e) => e.id === prep.id && e.largeurCm === prep.largeurCm && e.hauteurCm === prep.hauteurCm && e.miroir === prep.miroir);
    if (meme) meme.quantite += prep.quantite;
    else etat.planche.push({ id: prep.id, largeurCm: prep.largeurCm, hauteurCm: prep.hauteurCm, quantite: prep.quantite, miroir: prep.miroir });
    sauver();
    rendrePlanche();
    toast(`${motifsParId.get(prep.id).nom} ajouté à la planche`);
  }

  function rendrePlanche() {
    const zone = $('#planche');
    etat.planche = etat.planche.filter((e) => motifsParId.has(e.id));
    const nb = etat.planche.reduce((s, e) => s + e.quantite, 0);
    const entete = el('div', { class: 'carte-entete' },
      el('div', {},
        el('h2', { id: 'planche-titre', text: 'Planche' }),
        el('p', { class: 'sous-titre', text: nb ? `${nb} découpe${nb > 1 ? 's' : ''} · un seul fichier pour Design Space` : 'Regroupez plusieurs motifs dans un seul fichier.' })),
      nb ? el('button', { type: 'button', class: 'bouton bouton-discret bouton-icone', onclick: () => { etat.planche = []; sauver(); rendrePlanche(); } }, 'Vider') : null);

    if (!nb) {
      remplacer(zone, entete, el('p', { class: 'planche-vide', text: 'Réglez un motif puis « Ajouter à la planche ». Vous pourrez mélanger les thèmes et les tailles.' }));
      return;
    }
    const { positions, hauteur } = placer(developper(etat.planche));
    const zh = MACHINES[etat.reglages.machine].zone[1] * 10;
    const nbTapis = Math.max(1, Math.ceil((hauteur - 0.01) / zh));
    const alertes = [];
    if (nbTapis > 1) alertes.push(['info', `La planche dépasse un tapis : Design Space répartira les motifs sur ${nbTapis} tapis environ.`]);
    if (MATIERES[etat.reglages.matiere].miroir && etat.planche.some((e) => !e.miroir)) alertes.push(['attention', 'Flex thermocollant : certains motifs ne sont pas en miroir.']);
    const trop = etat.planche.filter((e) => !controleTaille(e.largeurCm, e.hauteurCm).tient);
    if (trop.length) alertes.push(['erreur', `${trop.length} motif${trop.length > 1 ? 's sont trop grands' : ' est trop grand'} pour ce tapis.`]);

    remplacer(zone, 
      entete,
      el('ul', { class: 'planche-liste' }, etat.planche.map((e, i) => {
        const m = motifsParId.get(e.id);
        return el('li', { class: 'planche-ligne' },
          el('img', { src: analyseDe(m).apercu, alt: '' }),
          el('div', {},
            el('div', { class: 'planche-ligne-nom' }, m.nom, e.miroir ? el('span', { class: 'badge', text: 'miroir' }) : null),
            el('div', { class: 'planche-ligne-detail', text: `${cm(e.largeurCm)} × ${cm(e.hauteurCm)} cm · × ${e.quantite}` })),
          el('button', { type: 'button', 'aria-label': `Retirer ${m.nom}`, onclick: () => { etat.planche.splice(i, 1); sauver(); rendrePlanche(); } }, 'Retirer'));
      })),
      el('div', { html: apercuTapis(positions.filter((p) => p.y < zh), false) }),
      alertes.length ? el('ul', { class: 'alertes' }, alertes.map(ligneAlerte)) : null,
      el('div', { class: 'actions' },
        el('button', {
          type: 'button', class: 'bouton', disabled: trop.length > 0,
          onclick: () => exporter(etat.planche, `planche-biblio-deco_${new Date().toISOString().slice(0, 10)}`, 'Planche biblio.deco'),
        }, 'Télécharger la planche'),
        el('a', { class: 'bouton bouton-secondaire', href: 'https://design.cricut.com/', target: '_blank', rel: 'noopener' }, 'Ouvrir Design Space ↗')),
    );
  }

  // ---------------------------------------------------------------- Export
  function exporter(entrees, nomFichier, titre) {
    const res = construireSvg(entrees, titre);
    if (!res) { toast('Rien à exporter'); return; }
    const nom = `${nomFichier}.svg`;
    const url = URL.createObjectURL(new Blob([res.texte], { type: 'image/svg+xml' }));
    const a = el('a', { href: url, download: nom });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`${nom} téléchargé · ${cm(res.largeurCm)} × ${cm(res.hauteurCm)} cm. Importez-le dans Design Space.`);
  }

  // ---------------------------------------------------------------- Import local
  async function importerFichiers(fichiers) {
    const svgs = [...fichiers].filter((f) => /\.svg$/i.test(f.name) || f.type === 'image/svg+xml');
    if (!svgs.length) { toast('Seuls les fichiers SVG sont acceptés'); return; }
    let dernier = null;
    for (const f of svgs) {
      const texte = await f.text();
      const nomBase = f.name.replace(/\.svg$/i, '');
      const nom = (texte.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]?.trim() || nomBase.replace(/[-_]+/g, ' ');
      const id = `imports/${slug(nomBase)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      const motif = { id, nom, svg: texte, themeId: 'imports', tags: [] };
      if (analyser(texte).erreur) { toast(`${f.name} : fichier SVG illisible`); continue; }
      etat.imports.push(motif);
      dernier = id;
    }
    if (!dernier) return;
    themes = tousLesThemes();
    motifsParId = indexMotifs();
    etat.theme = 'imports';
    sauver();
    rendreThemes();
    selectionner(dernier, true);
    toast(svgs.length > 1 ? `${svgs.length} fichiers importés` : 'Fichier importé');
  }

  // ---------------------------------------------------------------- Stockage local
  function charger() {
    try {
      const d = JSON.parse(localStorage.getItem(CLE_STOCKAGE) || '{}');
      if (d.reglages) {
        if (MACHINES[d.reglages.machine]) etat.reglages.machine = d.reglages.machine;
        if (MATIERES[d.reglages.matiere]) etat.reglages.matiere = d.reglages.matiere;
        if (['mm', 'in', 'px72'].includes(d.reglages.unite)) etat.reglages.unite = d.reglages.unite;
      }
      if (Array.isArray(d.imports)) etat.imports = d.imports;
      if (Array.isArray(d.planche)) etat.planche = d.planche;
    } catch { /* stockage indisponible : on continue sans */ }
  }
  function sauver() {
    try {
      localStorage.setItem(CLE_STOCKAGE, JSON.stringify({ reglages: etat.reglages, planche: etat.planche, imports: etat.imports }));
    } catch { /* quota ou navigation privée */ }
  }

  // ---------------------------------------------------------------- Notifications
  let minuteur;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('visible');
    clearTimeout(minuteur);
    minuteur = setTimeout(() => t.classList.remove('visible'), 3800);
  }

  // ---------------------------------------------------------------- Démarrage
  function init() {
    charger();
    themes = tousLesThemes();
    motifsParId = indexMotifs();
    rendreReglages();
    rendreThemes();
    rendreGrille();
    rendrePreparation();
    rendrePlanche();

    $('#reglage-machine').addEventListener('change', (e) => { etat.reglages.machine = e.target.value; sauver(); rendrePreparation(); rendrePlanche(); });
    $('#reglage-matiere').addEventListener('change', (e) => {
      etat.reglages.matiere = e.target.value;
      if (prep) prep.miroir = !!MATIERES[e.target.value].miroir;
      sauver(); rendrePreparation(); rendrePlanche();
    });
    $('#reglage-unite').addEventListener('change', (e) => { etat.reglages.unite = e.target.value; sauver(); toast('Unité d’export mise à jour'); });
    $('#recherche').addEventListener('input', (e) => { etat.recherche = e.target.value; rendreGrille(); });
    $('#btn-aide').addEventListener('click', () => $('#aide').showModal());
    $('#btn-importer').addEventListener('click', () => $('#fichier-import').click());
    $('#fichier-import').addEventListener('change', (e) => { importerFichiers(e.target.files); e.target.value = ''; });

    let profondeur = 0;
    document.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { profondeur++; document.body.classList.add('zone-depot-active'); } });
    document.addEventListener('dragleave', () => { profondeur = Math.max(0, profondeur - 1); if (!profondeur) document.body.classList.remove('zone-depot-active'); });
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => {
      e.preventDefault(); profondeur = 0; document.body.classList.remove('zone-depot-active');
      if (e.dataTransfer?.files?.length) importerFichiers(e.dataTransfer.files);
    });
  }

  init();
})();
