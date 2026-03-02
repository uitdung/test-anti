# MD to Rules Sync

A VS Code extension that syncs markdown files to `.agents/rules` or `CLAUDE.md` for Antigravity and Claude Code AI assistants.

## Features

- **HTML Comment Removal**: Automatically strips `<!-- comments -->` from synced content
- **UI Folder Selection**: Choose your source folder via settings or quick pick
- **3 Sync Modes**:
  - 📁 **Rules**: Save to `.agents/rules/{filename}.md`
  - 📄 **CLAUDE.md**: Append/replace section in `CLAUDE.md`
  - 📁📄 **Both**: Sync to both locations
- **Real-time Sync**: Files are automatically synced when changed
- **XML Section Tags**: CLAUDE.md sections wrapped in `<rule-file>` tags for clear boundaries

## Usage

1. **Open Sidebar**: Click the "MD to Rules" icon in the activity bar
2. **Select Source Folder**: Click the folder icon to choose your source folder
3. **Create Files**: Click the `+` icon to create new markdown files
4. **Toggle Sync**: Click on a file to enable/disable sync
5. **Change Mode**: Right-click a file → "Change Sync Mode" to select destination

## Commands

| Command | Description |
|---------|-------------|
| `Refresh` | Rescan source folder for files |
| `Sync All` | Sync all enabled files |
| `Select Source Folder` | Choose a different source folder |
| `Change Sync Mode` | Change sync destination for a file |
| `Create New File` | Create a new markdown file |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `mdToRules.sourceFolder` | `.agents/memory` | Source folder containing markdown files |
| `mdToRules.defaultSyncMode` | `rules` | Default sync destination (`rules`, `claude`, `both`) |
| `mdToRules.claudeFilePath` | `CLAUDE.md` | Path to CLAUDE.md file |
| `mdToRules.rulesFolder` | `.agents/rules` | Destination folder for rules |

## HTML Comment Removal

Source files can contain HTML comments that will be stripped during sync:

```markdown
---
name: my-rule
---

# My Rule

<!-- This comment will be removed -->

Content here is preserved.

<!--
  Multi-line comments
  are also removed
-->

## Section

```html
<!-- Comments in code blocks are preserved -->
```
```

**What gets removed:**
- `<!-- single line comments -->`
- `<!-- multi-line comments -->`
- Comments **outside** code blocks

**What stays:**
- Comments inside ```` ``` ```` code blocks
- All other markdown content

## Folder Structure

```
your-workspace/
├── .agents/
│   ├── memory/         # Source files (.md)
│   │   └── *.md
│   └── rules/          # Synced files (auto-generated)
│       └── *.md
├── CLAUDE.md           # Optional: Sections will be added here
└── ...
```

## CLAUDE.md Section Format

When syncing to CLAUDE.md, sections are wrapped in XML tags:

```markdown
<rule-file name="filename">
Markdown content here (HTML comments removed)...
</rule-file>

<rule-file name="another-file">
More content...
</rule-file>
```

- **Why XML tags?** Clearly delimits each file's content regardless of internal markdown headings
- If section exists: **Replaced entirely** (entire `<rule-file>` block)
- If section doesn't exist: **Appended at end**

## Auto-Create

The extension automatically creates:
- `.agents/memory/` folder (if missing)
- `.agents/rules/` folder (when first sync to rules)
- `CLAUDE.md` file (when first sync to CLAUDE.md)

## Installation

### Build VSIX
```bash
npm install
npm run compile
npm run package
```

### Install Extension
```bash
code --install-extension md-to-rules-sync-0.3.0.vsix
```

### Development Mode
```bash
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

## Changelog

### 0.3.0
- Simplified: Only support .md source files
- Removed YAML conversion complexity
- HTML comment removal (`<!-- -->`)
- XML section tags for CLAUDE.md (`<rule-file>`)
- Clean, focused design

### 0.2.0
- Added YAML to MD conversion (removed in 0.3.0)
- Added 3 sync modes

### 0.1.0
- Initial release

## License

MIT
