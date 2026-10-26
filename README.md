# Kit biblio.deco — kit Cricut

Webapp de biblio.gironde pour préparer des motifs de décoration (Noël, Pâques, été, jeux vidéo, fête de la musique…) à découper avec une Cricut.

L'équipe choisit un motif dans une bibliothèque thématique, règle la taille en centimètres et le nombre d'exemplaires, regroupe plusieurs motifs sur une planche, puis télécharge **un seul SVG aux dimensions réelles** à importer dans Cricut Design Space.

> Cricut ne propose pas d'interface permettant à un site web d'envoyer un fichier directement à la machine. Le fichier préparé s'importe dans Design Space (Importer → Parcourir → Ajouter au canevas → Créer).

## Utilisation

- **Sans installation** : ouvrir `index.html` dans un navigateur. Cela fonctionne hors ligne, sur un poste de bibliothèque ou depuis une clé USB, car le catalogue est embarqué dans `catalogue.js`.
- **En ligne** : publier le dépôt sur GitHub Pages. Le workflow `.github/workflows/pages.yml` régénère le catalogue et déploie à chaque push sur `main`.

Fonctions :
- **Réglages** : choix de la machine (Maker/Explore 30×30 et 30×60, Joy, Joy Xtra) et de la matière. Le tapis conseillé, la zone de découpe et le miroir automatique pour le flex thermocollant en découlent.
- **Aperçu** du motif sur le tapis, avec une grille en centimètres.
- **Contrôles avant découpe** :
  - motif trop grand pour le tapis ;
  - détails trop fins ;
  - texte non vectorisé ;
  - image matricielle ;
  - traits sans remplissage ;
  - nombre de couleurs, c'est-à-dire le nombre de matériaux à découper.
- **Planche** multi-motifs avec placement automatique, mémorisée dans le navigateur.
- **Import ponctuel** d'un SVG local, par bouton ou par glisser-déposer. Il est rangé dans « Mes imports » et reste propre au navigateur.
- **Unités d'export** en mm (par défaut), en pouces ou en px à 72 ppi, à régler dans le *Mode d'emploi* si Design Space affiche une taille inattendue.

## Ajouter des motifs

1. Déposer les fichiers `.svg` dans le dossier du thème : `bibliotheque/noel/`, `bibliotheque/paques/`…
2. Lancer :
   ```bash
   node outils/generer-catalogue.mjs
   ```
   Cette commande demande Node 18 ou plus et aucune dépendance. Elle réécrit `catalogue.js` et signale les fichiers à corriger (texte, image matricielle, poids excessif).
3. Recharger la page.

### Créer un nouveau thème

Créer un dossier `bibliotheque/<identifiant>/` avec un fichier `_theme.json` :

```json
{
  "nom": "Nuit de la lecture",
  "couleur": "#3b4cca",
  "ordre": 95,
  "motifs": {
    "lune-livre.svg": { "nom": "Lune et livre", "tags": ["nuit", "lune"], "largeurCm": 15 }
  }
}
```

Tous les champs sont facultatifs :
- `ordre` règle la position du thème dans la liste.
- `motifs` ajoute un nom, des mots-clés de recherche et une largeur par défaut pour chaque fichier.

Sans ces métadonnées, le nom affiché vient de la balise `<title>` du SVG, ou à défaut du nom de fichier.

### Préparer des SVG compatibles Cricut

- Une couleur de remplissage correspond à un calque, donc à un matériau.
- Les textes doivent être convertis en tracés (Inkscape : *Chemin → Objet en chemin*).
- Les formes doivent être remplies. Pour un trait, Design Space découpe la ligne centrale et ignore son épaisseur.
- Aucune image matricielle (PNG, JPG) ne doit être intégrée.
- Il faut un `viewBox`. Une taille physique (`width="120mm"`) sert de taille par défaut.

## Structure

```
index.html                  page unique
css/app.css                 styles (thème clair/sombre)
js/app.js                   logique : catalogue, aperçu, contrôles, export
catalogue.js                généré — ne pas modifier à la main
bibliotheque/<thème>/       SVG + _theme.json
outils/generer-catalogue.mjs
.github/workflows/pages.yml génération + déploiement GitHub Pages
```

Les tailles de zone de découpe indiquées dans `js/app.js` (objet `MACHINES`) sont approximatives. Elles sont à ajuster si besoin selon le parc de machines du réseau.
