# Memory to Rules Sync

A VS Code extension that syncs markdown files from `.agents/memory` to `.agents/rules` for Antigravity AI assistant.

## Features

- **Sidebar UI**: View all memory files in a dedicated sidebar
- **Toggle Sync**: Enable/disable sync for each file individually
- **Real-time Sync**: Files are automatically synced when changed
- **Auto Frontmatter**: Adds YAML frontmatter to files if missing

## Usage

1. **Open Sidebar**: Click the "Memory to Rules" icon in the activity bar
2. **Create Files**: Click the `+` icon to create new memory files
3. **Toggle Sync**: Click on a file to open it, right-click to toggle sync
4. **Refresh**: Click the refresh icon to rescan the memory folder

## Commands

| Command | Description |
|---------|-------------|
| `Memory to Rules: Refresh` | Rescan memory folder for files |
| `Memory to Rules: Sync All` | Sync all enabled files |
| `Memory to Rules: Toggle File` | Enable/disable sync for a file |
| `Memory to Rules: Create New File` | Create a new memory file |

## Folder Structure

```
your-workspace/
├── .agents/
│   ├── memory/      # Source files (edit here)
│   │   └── *.md
│   └── rules/       # Synced files (auto-generated)
│       └── *.md
```

## Installation

### From VSIX
```bash
code --install-extension memory-to-rules-0.1.0.vsix
```

### Development
```bash
npm install
npm run compile
# Press F5 in VS Code to launch extension development host
```

## License

MIT
