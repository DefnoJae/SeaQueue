# SeaQueue

A lightweight **Watch Later** tray for Seanime.

SeaQueue is intentionally separate from your AniList planning list. It gives you a quick place to stash anime you want to come back to without changing their AniList status.

## What it does

- Detects the anime detail page you are currently viewing.
- Shows the anime poster, title, format, year and episode count in the SeaQueue tray.
- Adds or removes the current anime with one click.
- Keeps a persistent local Watch Later queue using Seanime plugin storage.
- Shows up to 5 saved anime as compact poster cards.
- Opens any saved anime directly in Seanime with a Watch button.
- Supports removing individual entries or clearing the full queue.
- Shows the number of saved anime as the tray badge.\n- Automatically removes a saved anime after Seanime successfully marks it as **COMPLETED**.

## Install

Add this manifest URL to Seanime:

```
https://raw.githubusercontent.com/DefnoJae/SeaQueue/refs/heads/main/Manifest.json
```

## Usage

1. Open an anime detail page in Seanime.
2. Open the **SeaQueue** plugin tray.
3. Click **+ Add to SeaQueue**.
4. Open SeaQueue later and click **Watch** beside any saved anime.

## Storage

SeaQueue stores its queue locally through Seanime's plugin `$storage` API. It does not modify your AniList list status.

## Version

Current release: **0.1.5**
