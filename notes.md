# During development: npm run dev OR npm run dev -- --open
# For production: run npm run build, then npm run preview to serve the generated dist pages.
# The built pages in dist will reference CSS, not SCSS.
# http://localhost:5173


# GIT Commands
# Vérifier où tu es
git status
git branch

# Créer une nouvelle branche
git switch -c feature/URL-paste-issue

# Changer de branche
git switch main
git switch feature/home-briefing

# Merge une branche dans main
git switch main
git merge feature/URL-paste-issue
git push origin main

# Supprimer la branche - Quand tout est fusionné :
git branch -d feature/home-briefing