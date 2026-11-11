# Deployment

How to push Katoto to GitHub, build the Windows installer and publish a release.

## 1. Prerequisites

- Windows 10 2004+ (Windows 11 recommended)
- Node.js 20+
- Git
- A GitHub account with access to `ProfileVin/Katoto`
- Optional: [GitHub CLI](https://cli.github.com) (`gh`), signed in with `gh auth login`

## 2. First push to GitHub

1. Create an empty repository at <https://github.com/new>. Set the owner to `ProfileVin` and the name to `Katoto`. Do **not** add a README, .gitignore or license.
2. From the project folder:

   ```bash
   git init
   git add .
   git status                 # check: no API keys, no node_modules/out/dist
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/ProfileVin/Katoto.git
   git push -u origin main
   ```

   Or create the repo and push in one step with the GitHub CLI (after the commit):

   ```bash
   gh repo create ProfileVin/Katoto --private --source=. --push
   ```

### Troubleshooting: `remote: Repository not found`

- **The repo doesn't exist yet.** Create it (step 1), then run `git push -u origin main` again.
- **The URL is wrong.** Copy the URL from the green **Code** button on the repo page and run `git remote set-url origin <url>`.
- **Windows is signed in as a different GitHub account.** Open **Credential Manager → Windows Credentials**, remove the `git:https://github.com` entry, then push again and sign in as `ProfileVin`.

## 3. Pushing updates

```bash
git add .
git commit -m "Describe the change"
git push
```

## 4. Build the installer

```bash
npm ci                 # clean install from package-lock.json
npm test               # unit tests
npm run build:win      # typecheck, bundle to out/, then package with electron-builder
```

This writes the installer to `..\Katoto-dist\Katoto-<version>-setup.exe` (NSIS, x64), a folder next to the project. The build log still prints `dist\...` paths; they point to the same files. The packaging settings are in `electron-builder.yml`.

### Why the output is outside the project

When the output folder is inside the project, the build fails with `EPERM: operation not permitted, rename '...win-unpacked.tmp'`. VS Code is an Electron app: when an extension scans the freshly extracted Electron files, VS Code opens `default_app.asar` and keeps it open, so electron-builder can't rename the folder. Keep `directories.output` in `electron-builder.yml` outside the workspace.

## 5. Release a new version

1. Commit or stash everything. `npm version` refuses to run on a dirty working tree.
2. Bump the version. This updates `package.json` and creates a commit and a `v<version>` tag:

   ```bash
   npm version patch      # or: minor / major
   git push --follow-tags
   ```

3. Build the installer for the new version:

   ```bash
   npm run build:win
   `
4. Publish the GitHub Release with the installer attached:

   ```bash
   gh release create v0.1.1 ../Katoto-dist/Katoto-0.1.1-setup.exe --generate-notes
   ```

   Without `gh`: on GitHub open **Releases → Draft a new release**, pick the tag, upload `..\Katoto-dist\Katoto-<version>-setup.exe`, and publish.

## 6. Installing on a user's machine

1. Download `Katoto-<version>-setup.exe` from the GitHub Release and run it.
2. The installer is not code-signed, so Windows SmartScreen will warn. Click **More info → Run anyway**.
3. On first launch the dashboard opens. Enter the **Anthropic** and **Deepgram** API keys. Keys are encrypted per machine (Windows DPAPI) and are never part of the installer.
4. Create a profile and press **Listen** (Ctrl+Shift+L).

User data lives in `%APPDATA%\Katoto\` and is kept across upgrades. Install the new setup.exe over the old version.

## 7. Release checklist

- [ ] `npm test` passes
- [ ] `npm run build:win` succeeds
- [ ] Version bumped and tag pushed
- [ ] No API keys or secrets committed (`git log -p | grep -i "sk-"` returns nothing)
- [ ] Installer tested on a clean machine: installs, launches, accepts keys, transcribes a test call
- [ ] GitHub Release published with the `.exe` attached
