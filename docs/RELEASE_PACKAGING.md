# Packaging and Updater Workflow

This document defines the Windows release workflow for Special Organizer. Do not commit GitHub tokens, signing private keys, account credentials, or private release notes.

## Windows Installer

- Bundle target: Tauri NSIS setup executable.
- Build command: `npm run tauri:build`.
- Expected output directory: `src-tauri/target/release/bundle/nsis/`.
- Expected installer pattern: `*-setup.exe`.
- Updater signatures are generated beside the installer when signing is configured.

`src-tauri/tauri.conf.json` is configured with:

- `bundle.active: true`
- `bundle.targets: ["nsis"]`
- `bundle.createUpdaterArtifacts: true`
- `bundle.windows.nsis.installMode: "currentUser"`

## GitHub Releases Updater

The configured updater endpoint is:

```text
https://github.com/charleshuang337/special-organizer/releases/latest/download/latest.json
```

The release must upload a `latest.json` asset that follows the shape in `docs/release/latest.example.json`.

For Windows x64, the static JSON key is `windows-x86_64`. Its `url` must point to the downloadable release asset and its `signature` must contain the text contents of the generated `.sig` file.

## Signing

Tauri updater signatures cannot be disabled. The public key is safe to commit, but the private key is secret.

Generate or reuse a key outside the repository:

```powershell
npm run tauri signer generate -- -w "$env:USERPROFILE\.tauri\special-organizer.key"
```

Then:

1. Copy the generated public key into `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`.
2. Keep the private key outside the repository.
3. Set the private key only in the release shell or CI secret:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY="Path or content of the private key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD="Optional password"
npm run tauri:build
```

Do not store these environment variables in `.env` for release builds.

## One-Click Data Cleanup

Use `scripts/clear-special-organizer-data.cmd` for a double-click cleanup package, or run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\clear-special-organizer-data.ps1
```

The script refuses to delete anything unless the user types:

```text
DELETE SPECIAL ORGANIZER DATA
```

Declared cleanup scope:

- `%APPDATA%\com.specialorganizer.app`
- `%LOCALAPPDATA%\com.specialorganizer.app`

This includes the local SQLite database, app data, logs, and local WebView cache for this app identifier only. It does not uninstall the application binary.

Verify the cleanup target list without deleting:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\clear-special-organizer-data.ps1 -DryRun
```

## Required User Inputs From The 2026-04-26 Project

Provide these before the first real GitHub-backed release:

- GitHub account access for `charleshuang337/special-organizer`.
- Release tag naming policy, for example `v0.1.1`.
- Whether the previous project already has a `latest.json` layout to migrate.
- Updater public key content, or confirmation to generate a new key.
- Signing private key path or CI secret name. Do not paste the private key into source files.
- Signing private key password handling, if the key is password-protected.
- Exact release asset naming expected by the old project or deployment notes.
- Whether GitHub Actions should be added later for release automation.

## Release Checklist

1. Replace updater endpoint and public key placeholders.
2. Set signing environment variables in the release shell or CI secrets.
3. Run `npm run build`.
4. Run `npm run tauri:build`.
5. Upload the NSIS installer, generated `.sig`, and `latest.json` to the GitHub Release.
6. Install the generated `*-setup.exe` on a clean Windows user profile.
7. In the app, use `检查更新`, `下载更新`, and `安装更新` against a newer test release.
8. Run the cleanup script dry run, then confirm deletion only on a disposable test profile.

## References

- Tauri updater plugin: https://v2.tauri.app/plugin/updater/
- Tauri Windows installer guide: https://v2.tauri.app/distribute/windows-installer/
