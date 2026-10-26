#!/usr/bin/env node
/**
 * Génère catalogue.js à partir des dossiers bibliotheque/<theme>/*.svg
 *
 *   node outils/generer-catalogue.mjs
 *
 * - Un dossier = un thème. Son fichier _theme.json (facultatif) donne le nom affiché,
 *   la couleur de la pastille, l'ordre et des métadonnées par motif.
 * - Le nom d'un motif vient, par ordre de priorité : _theme.json > balise <title> du SVG > nom du fichier.
 * - Le contenu des SVG est embarqué dans catalogue.js : l'application fonctionne ensuite
 *   en ouvrant simplement index.html, sans serveur (poste de bibliothèque, clé USB…).
 *
 * Aucune dépendance : Node 18 ou plus.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dossierBib = path.join(racine, 'bibliotheque');
const sortie = path.join(racine, 'catalogue.js');
const POIDS_MAX = 400 * 1024; // au-delà, on prévient : le fichier est sans doute trop détaillé pour la découpe

const majuscule = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const nomDepuisFichier = (f) => majuscule(f.replace(/\.svg$/i, '').replace(/[-_]+/g, ' ').trim());
const titreSvg = (txt) => {
  const m = txt.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() || null : null;
};

async function lireJson(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw new Error(`${path.relative(racine, fichier)} : JSON invalide (${e.message})`);
  }
}

const themes = [];
const alertes = [];
let total = 0;

const dossiers = (await readdir(dossierBib, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
  .map((d) => d.name);

for (const dossier of dossiers) {
  const chemin = path.join(dossierBib, dossier);
  const conf = await lireJson(path.join(chemin, '_theme.json'));
  const metas = conf.motifs || {};
  const fichiers = (await readdir(chemin))
    .filter((f) => /\.svg$/i.test(f))
    .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));

  const motifs = [];
  for (const f of fichiers) {
    const brut = await readFile(path.join(chemin, f), 'utf8');
    const svg = brut
      .replace(/^﻿/, '')
      .replace(/<\?xml[\s\S]*?\?>/, '')
      .replace(/<!DOCTYPE[\s\S]*?>/i, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();
    if (!/^<svg[\s>]/i.test(svg)) {
      alertes.push(`${dossier}/${f} : ne commence pas par une balise <svg>, ignoré.`);
      continue;
    }
    if (Buffer.byteLength(svg) > POIDS_MAX) alertes.push(`${dossier}/${f} : fichier lourd (${Math.round(Buffer.byteLength(svg) / 1024)} Ko), à simplifier ?`);
    if (/<image[\s>]/i.test(svg)) alertes.push(`${dossier}/${f} : contient une image matricielle, non découpable.`);
    if (/<text[\s>]/i.test(svg)) alertes.push(`${dossier}/${f} : contient du texte, à convertir en tracés.`);

    const meta = metas[f] || {};
    motifs.push({
      id: `${dossier}/${f.replace(/\.svg$/i, '')}`,
      nom: meta.nom || titreSvg(svg) || nomDepuisFichier(f),
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      largeurCm: typeof meta.largeurCm === 'number' ? meta.largeurCm : null,
      svg,
    });
  }

  for (const cle of Object.keys(metas)) {
    if (!fichiers.includes(cle)) alertes.push(`${dossier}/_theme.json : « ${cle} » ne correspond à aucun fichier.`);
  }

  themes.push({
    id: dossier,
    nom: conf.nom || nomDepuisFichier(dossier),
    couleur: conf.couleur || '#7a8580',
    ordre: Number.isFinite(conf.ordre) ? conf.ordre : 99,
    motifs,
  });
  total += motifs.length;
}

themes.sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr'));

const contenu = `// Fichier généré par outils/generer-catalogue.mjs — ne pas modifier à la main.
// ${new Date().toISOString()} · ${themes.length} thèmes · ${total} motifs
window.CATALOGUE = ${JSON.stringify({ genere: new Date().toISOString(), themes })};
`;
await writeFile(sortie, contenu, 'utf8');

console.log(`catalogue.js : ${themes.length} thèmes, ${total} motifs`);
for (const t of themes) console.log(`  ${t.nom.padEnd(24)} ${String(t.motifs.length).padStart(4)}`);
if (alertes.length) {
  console.log(`\n${alertes.length} point(s) à vérifier :`);
  for (const a of alertes) console.log(`  - ${a}`);
}
