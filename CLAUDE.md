# iNaturalist Link Manager - Firefox Extension

## Project Overview
A Firefox extension for managing links to iNaturalist observations. Supports two main use cases:
1. **TODOs** - Observations needing action (respond to comment, make ID)
2. **Research** - Observations collected for later evaluation/export

## Workflow with Beads
- Use `bd list` to see current issues
- Use `bd show <id>` to see issue details before working on it
- Use `bd update <id> --status in_progress` when starting work
- Use `bd update <id> --status done` when complete
- Create new issues with `bd create "description"`
- Let Jeff review plans before creating files

## Technical Decisions
- Data stored in browser local storage
- Export/backup to JSON file
- Research items capture metadata (species, observer, date, etc.)
- TODO items are lightweight (just URL and optional note)

## Extension Structure (planned)
```
/
├── manifest.json          # Firefox extension manifest (v2 or v3)
├── sidebar/               # Sidebar UI
├── background/            # Background scripts
├── content/               # Content scripts for inaturalist.org
└── lib/                   # Shared utilities
```

## Commands
- `npm run dev` - Run in Firefox with auto-reload
- `npm run lint` - Lint with web-ext
- `npm run build` - Build unsigned zip
- `npm run sign` - Sign via AMO (requires `.env` with `AMO_API_KEY` and `AMO_API_SECRET`)

## Release Process
1. Bump version in both `manifest.json` and `package.json`
2. Commit all changes
3. `npm run sign` - produces a signed `.xpi` in `web-ext-artifacts/`
4. `gh release create v<version> web-ext-artifacts/*.xpi --title "v<version>" --notes "..."` - creates GitHub release with the signed `.xpi` attached
