==================================================

<h1 align="center">Docker Cheat Sheet (General)</h1>

• Show running containers: `docker ps`

• Show all containers: `docker ps -a`

• Show images: `docker images`

• Pull an image: `docker pull <image>:<tag>`

• Build an image: `docker build -t <name>:<tag> .`

• Run a container: `docker run --name <name> -p 8080:80 -d <image>:<tag>`

• Stop a container: `docker stop <name_or_id>`

• Start a container: `docker start <name_or_id>`

• Restart a container: `docker restart <name_or_id>`

• Remove a container: `docker rm <name_or_id>`

• Remove an image: `docker rmi <image_or_id>`

• View container logs: `docker logs -f <name_or_id>`

• Execute a command in a running container:

```
docker exec -it <name_or_id> /bin/sh
```

• Copy file to container: `docker cp ./local.txt <name_or_id>:/path/in/container/`

• Copy file from container: `docker cp <name_or_id>:/path/in/container/file.txt ./`

• Show disk usage: `docker system df`

• Cleanup unused data (careful): `docker system prune`

<h1 align="center" style="padding-top: 255px;">Development vs. Production</h1>

• npm run dev: Serves assets from RAM; supports Hot Module Replacement (HMR).

• npm run build: Compiles assets into `public/build` for production.

The Difference: npm run dev vs. npm run build

In a Laravel + Docker setup, you use these two commands for completely different stages of your work.

| Feature      | npm run dev (What you see now)                                             | npm run build                                            |
|:-------------|:---------------------------------------------------------------------------|:---------------------------------------------------------|
| Purpose      | Coding & Debugging.                                                        | Launching / Production.                                  |
| Speed        | Instant. You save a file, and the browser updates without a refresh (HMR). | Slow. It has to "crunch" every file into a tiny package. |
| File Output  | No physical files are created. Everything is kept in the computer's RAM.   | Creates permanent files in `public/build/assets/`.       |
| The Debugbar | Works best here because nothing is minified.                               | Debugbar should usually be off here.                     |
| Optimization | None. Code is raw and easy to read.                                        | Highly optimized, minified, and "shuffled" for speed.    |

# 🐳 Duka Docker Workflow

Use these commands from your **Mac terminal** (not inside the container) to manage the application.

### 🚀 Development & Assets

| Task                     | Command                                           |
|:-------------------------|:--------------------------------------------------|
| **Start Dev Server**     | `docker exec -it Duka npm run dev -- --host`      |
| **Build for Production** | `docker exec -it Duka npm run build`              |
| **Install JS Package**   | `docker exec -it Duka npm install <package-name>` |

### 🐘 PHP & Laravel

| Task                     | Command                                                |
|:-------------------------|:-------------------------------------------------------|
| **Run Migrations**       | `docker exec -it Duka php artisan migrate`             |
| **Install PHP Package**  | `docker exec -it Duka composer require <package-name>` |
| **Clear All Caches**     | `docker exec -it Duka php artisan optimize:clear`      |
| **Open Container Shell** | `docker exec -it Duka /bin/sh`                         |

---

### 💡 Troubleshooting the "White Screen"

If the site is white while running `npm run dev`, try these in order:

1. **Nuke Build folder:** `docker exec -it Duka rm -rf public/build`
2. **Clear Views:** `docker exec -it Duka php artisan view:clear`
3. **Restart Vite:** `docker exec -it Duka npm run dev -- --host`

> **Note:** Never run `npm install` or `npm run dev` directly on your Mac. Always use the `docker exec` commands above
> to prevent architecture mismatches.

Docker Commands (Using Duka Container Name)

• Composer: `docker exec -it Duka composer install`

• Artisan cache clear: `docker exec -it Duka php artisan config:clear`

• Migrate: `docker exec -it Duka php artisan migrate`

• Run Vite dev: `docker exec -it Duka npm run dev`

• Build assets: `docker exec -it Duka npm run build`

• Open shell: `docker exec -it Duka /bin/sh`

================================================================================

<h1 align="center" style="padding-top: 255px;">Markdown Tips for Notes</h1>

1. Code Snippets: Use triple backticks with the language name for syntax highlighting.

```

echo "Hello Laravel";

```

2. Terminal/Bash: Use `bash` for command line notes.

```

docker ps

```

3. Bold & Italic: Use `**Bold**` for emphasis and `*Italic*` for terms.

4. Headings: Use `#` for main titles, `##` for sections, and `###` for sub-sections.

5. Horizontal Rules: Use `---` to create a divider line between topics.

6. Task Lists: Create clickable checkboxes:

• Install Debugbar

• Configure Vite

7. Tables: Organize comparison data: | Command | Usage | | :--- | :--- | | dev | Live coding | | build | Production |

8. Links: Use `[Text](URL)` to reference documentation.

9. Blockquotes: Use `>` for warnings or tips.

> Tip: Always clear config cache after changing .env!

10. Inline Code: Use single backticks `like this` for file names or variables (e.g., `.env`).

```
docker compose exec app npm run dev -- --host 0.0.0.0 --port 5177

docker compose exec app sh -lc "NODE_OPTIONS=--max-old-space-size=4096 npm run build"


```
