# USACO timer

Pomodoro and free timer that logs your USACO hours. Everything is saved in your browser (localStorage), no backend.

## Run locally
Open `index.html` in a browser.

## Publish on GitHub Pages
1. Create a new empty repo on github.com (public, e.g. `usaco-timer`).
2. In this folder:
   ```
   git init
   git add .
   git commit -m "usaco timer"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/usaco-timer.git
   git push -u origin main
   ```
3. Repo Settings > Pages > Source: "Deploy from a branch" > Branch: `main` / `(root)` > Save.
4. Your site goes live at `https://YOUR_USERNAME.github.io/usaco-timer/` in about a minute.

## Heads up
- Data is per browser and per device. Use "Export backup" and "Import backup" to move it or back it up.
- Clearing site data wipes your history.
