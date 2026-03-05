# Mini site Django - Arbre généalogique

## Fonctionnalités
- Gestion d'environ 100 à 200 personnes via SQLite.
- Ajout/modification depuis l'interface web.
- Champs : prénom, date de naissance, date de décès (optionnel), statut, photo.
- Gestion des relations père, mère, enfants et conjoint(e) depuis un formulaire.
- Arbre interactif (zoom + déplacement souris) avec D3.js.
- Affichage photo + nom + dates sur chaque personne dans la vue arbre.
- Export de l'arbre en image PNG et en PDF depuis l'interface.
- Mise à jour automatique : chaque modification est prise en compte immédiatement dans l'API `/api/arbre/` et donc dans la vue arbre.

## Lancer le projet
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Accès:
- Liste des personnes : `http://127.0.0.1:8000/`
- Arbre visuel : `http://127.0.0.1:8000/arbre/`
- Admin Django : `http://127.0.0.1:8000/admin/`
