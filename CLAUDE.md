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
- `npm run build` - Build extension (TBD)
- `npm run dev` - Development mode (TBD)
