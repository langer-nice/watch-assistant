# During development: npm run dev OR npm run dev -- --open
# For production: run npm run build, then npm run preview to serve the generated dist pages.
# The built pages in dist will reference CSS, not SCSS.
# http://localhost:5173


# Owner masking
https://watch-assistant-omega.vercel.app/?owner=1


# GIT Commands
# Vérifier où tu es
git status
git branch

# Créer une nouvelle branche
git switch -c feature/micro

# Changer de branche
git switch master
git switch feature/micro

# Merge une branche dans master
git switch master
git merge feature/micro
git push origin master

# Supprimer la branche - Quand tout est fusionné :
git branch -d feature/micro