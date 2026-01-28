# iNaturalist Link Manager

A Firefox extension for managing links to iNaturalist observations. Save observations as TODOs (to respond to comments, make IDs) or Research items (to evaluate/export later), and view your iNaturalist notifications without leaving the page.

## Features

- **TODO list** - Save observations you need to act on, with optional notes
- **Research collection** - Collect observations with metadata (species, observer, location) for later review
- **Notifications** - View mentions, comments, and IDs from iNaturalist in a dropdown overlay or the sidebar
- **Keyboard shortcuts** - Quick-add the current observation as TODO (`Alt+Ctrl+T`) or Research (`Alt+Ctrl+R`)
- **Export/Import** - Back up your data as JSON

## Install

This extension is self-distributed (not on addons.mozilla.org).

1. Download the latest `.xpi` file from [Releases](https://github.com/jeffdc/inat-extension/releases)
2. In Firefox, go to `about:addons`
3. Click the gear icon and select **Install Add-on From File...**
4. Select the downloaded `.xpi` file

## Usage

- Click the sidebar icon or use `View > Sidebar > iNat Links` to open the sidebar
- Navigate to any iNaturalist observation and use the sidebar's **Add Current Page** button or keyboard shortcuts
- Click the notification bell on iNaturalist to see your notifications in the extension's dropdown

## Development

Requires [Node.js](https://nodejs.org/) and Firefox.

```bash
npm install

# Run in Firefox with auto-reload
npm run dev

# Lint
npm run lint

# Build unsigned zip
npm run build

# Sign via AMO (requires AMO_API_KEY and AMO_API_SECRET in .env)
npm run sign
```

## License

MIT
