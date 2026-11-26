# Centre CFS : nouveau site web

Site statique généré, rapide et sécurisé. 48 pages : accueil, catalogue filtrable, 22 fiches formation, 8 pages domaines, agenda, inscription, formations en entreprise, location de salles, le centre, FAQ, 4 articles, contact, pages légales, 404.

## Contenu du dossier

- `site/` : le site prêt à mettre en ligne. C'est ce dossier qu'on envoie chez l'hébergeur.
- `sources/` : le générateur, pour modifier le contenu et reconstruire le site.

## Mettre en ligne

1. Hébergement Apache avec PHP 8.1 ou plus et HTTPS (Combell, OVHcloud, o2switch, Infomaniak…).
2. Envoyer **tout le contenu** de `site/` à la racine du domaine, y compris le fichier caché `.htaccess`.
3. Dans `site/api/`, copier `config.sample.php` en `config.php` et remplir :
   - `to` : adresse qui reçoit les demandes (info@centrecfs.be) ;
   - `from` : adresse d'envoi du domaine (no-reply@centrecfs.be) ;
   - `salt` : une longue chaîne aléatoire.
4. Configurer SPF, DKIM et DMARC sur le domaine pour que les e-mails n'arrivent pas en spam.
5. Tester les deux formulaires (Contact et Inscription).
6. Ajouter le site dans Google Search Console et Bing Webmaster Tools, puis envoyer `https://centrecfs.be/sitemap.xml`.

## Prévisualiser en local

Les liens du site sont absolus (`/formations/…`) : il faut un petit serveur, pas un double-clic.

```
cd site
php -S localhost:8000        # formulaires compris (sans envoi réel d'e-mail)
# ou : python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000.

## Modifier le contenu

Tout le contenu est dans `sources/content.py` : formations, prix, durées, sessions, FAQ, articles, coordonnées.

- Ajouter une session : dans la formation concernée, ajouter une ligne à `sessions`, par exemple `("2027-01-14", None, "engis")` (une journée) ou `("2027-01-14", "2027-01-15", "charleroi")` (deux jours). Les dates passées disparaissent automatiquement du site.
- Ajouter un prix : remplacer `"prix": None` par `"prix": 275`.
- Ajouter des photos : déposer `salle-01.jpg`, `salle-02.jpg`, `salle-03.jpg` (1200 × 900 px) dans `sources/src/assets/img/`.
- Compléter le numéro BCE : `"bce": "BE 0xxx.xxx.xxx"` dans `SITE`.

Puis reconstruire :

```
cd sources
npm install                                   # une seule fois : récupère les polices Barlow
pip install playwright rcssmin rjsmin fonttools brotli
python3 -m playwright install chromium       # une seule fois
./make.sh                                     # reconstruit out/site/
```

Le fichier `api/config.php` n'est jamais écrasé par la reconstruction si vous ne copiez que les autres fichiers ; gardez-le de côté.

## Fichiers techniques

| Fichier | Rôle |
|---|---|
| `src/assets/css/main.css` | Styles (jetons de la charte en tête de fichier) |
| `src/assets/js/main.js` | Menu, filtres, sessions, formulaires (sans librairie) |
| `src/api/contact.php` | Traitement sécurisé des formulaires |
| `src/htaccess.txt` | HTTPS, redirections depuis l'ancien WordPress, en-têtes de sécurité, cache |
| `build.py` | Générateur des pages, du sitemap et des données structurées |
| `render_assets.py` | Favicons, logo PNG et images de partage (Open Graph) |
| `logo.py` | Génère toutes les versions du logo (SVG) |

## À compléter avant la mise en ligne

- Numéro BCE et hébergeur (mentions légales).
- Durée de conservation des données (confidentialité).
- Prix et durées manquants (affichés « Sur devis » / « Nous consulter » en attendant).
- Photos des salles et des formations.
