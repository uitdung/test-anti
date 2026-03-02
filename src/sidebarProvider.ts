import * as vscode from 'vscode';
import { MdManager, MdFile, SyncMode } from './mdManager';

export class MdTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly file?: MdFile,
        public readonly itemType?: 'file' | 'info' | 'action' | 'header'
    ) {
        super(label, collapsibleState);

        if (file) {
            this.tooltip = this.createFileTooltip(file);
            this.description = file.enabled 
                ? `${this.getModeIcon(file.syncMode)} Synced` 
                : '⬜ Click to enable';
            this.contextValue = file.enabled ? 'enabledFile' : 'disabledFile';
            this.iconPath = new vscode.ThemeIcon(
                file.enabled ? 'check' : 'circle-outline'
            );

            this.command = {
                command: 'mdToRules.toggleFile',
                title: 'Toggle Sync',
                arguments: [this]
            };
        } else if (itemType === 'info' || itemType === 'action') {
            this.contextValue = itemType;
            this.tooltip = label;
            this.iconPath = new vscode.ThemeIcon(itemType === 'action' ? 'arrow-right' : 'info');
        }
    }

    private createFileTooltip(file: MdFile): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`### ${file.name}\n\n`);
        md.appendMarkdown(`**Status:** ${file.enabled ? '✅ Enabled' : '⬜ Disabled'}\n\n`);
        md.appendMarkdown(`**Sync Mode:** ${this.getModeDescription(file.syncMode)}\n\n`);
        md.appendMarkdown(`**Last Modified:** ${file.lastModified.toLocaleString()}\n\n`);
        md.appendMarkdown('---\n\n');
        md.appendMarkdown('**Actions:**\n');
        md.appendMarkdown('- Click to toggle sync on/off\n');
        md.appendMarkdown('- Right-click for more options\n');
        return md;
    }

    private getModeDescription(mode: SyncMode): string {
        switch (mode) {
            case 'rules': return '📁 Rules folder (.agents/rules)';
            case 'claude': return '📄 CLAUDE.md section';
            case 'both': return '📁📄 Both locations';
            default: return mode;
        }
    }

    private getModeIcon(mode: SyncMode): string {
        switch (mode) {
            case 'rules': return '📁';
            case 'claude': return '📄';
            case 'both': return '📁📄';
            default: return '';
        }
    }
}

export class MdSidebarProvider implements vscode.TreeDataProvider<MdTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MdTreeItem | undefined | null | void> =
        new vscode.EventEmitter<MdTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MdTreeItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private mdManager: MdManager;

    constructor(mdManager: MdManager) {
        this.mdManager = mdManager;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: MdTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: MdTreeItem): Thenable<MdTreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        const files = this.mdManager.getFiles();
        const sourceFolder = this.mdManager.getSourceFolder();
        const sourceFolderName = sourceFolder.split(/[/\\]/).pop() || sourceFolder;

        if (files.length === 0) {
            return Promise.resolve([
                new MdTreeItem('📦 Getting Started', vscode.TreeItemCollapsibleState.None, undefined, 'header'),
                new MdTreeItem(`📂 Source: ${sourceFolderName}`, vscode.TreeItemCollapsibleState.None, undefined, 'info'),
                new MdTreeItem('─'.repeat(30), vscode.TreeItemCollapsibleState.None, undefined, 'info'),
                new MdTreeItem('💡 No markdown files found', vscode.TreeItemCollapsibleState.None, undefined, 'info'),
                new MdTreeItem('Click + to create a new file', vscode.TreeItemCollapsibleState.None, undefined, 'action'),
                new MdTreeItem('or add .md files to source folder', vscode.TreeItemCollapsibleState.None, undefined, 'info'),
                new MdTreeItem('─'.repeat(30), vscode.TreeItemCollapsibleState.None, undefined, 'info'),
                new MdTreeItem('📋 How to use:', vscode.TreeItemCollapsibleState.None, undefined, 'header'),
                new MdTreeItem('1. Click on a file to enable sync', vscode.TreeItemCollapsibleState.None, undefined, 'info'),
                new MdTreeItem('2. Right-click to change sync mode', vscode.TreeItemCollapsibleState.None, undefined, 'info'),
                new MdTreeItem('📁 → .agents/rules (Antigravity)', vscode.TreeItemCollapsibleState.None, undefined, 'info'),
                new MdTreeItem('📄 → CLAUDE.md (Claude Code)', vscode.TreeItemCollapsibleState.None, undefined, 'info'),
                new MdTreeItem('─'.repeat(30), vscode.TreeItemCollapsibleState.None, undefined, 'info'),
                new MdTreeItem('✨ HTML comments are auto-removed', vscode.TreeItemCollapsibleState.None, undefined, 'info'),
                new MdTreeItem('<!-- comment --> will be stripped', vscode.TreeItemCollapsibleState.None, undefined, 'info'),
            ]);
        }

        const items: MdTreeItem[] = [];
        
        items.push(new MdTreeItem(
            `📂 ${sourceFolderName} (${files.length} files)`,
            vscode.TreeItemCollapsibleState.None,
            undefined,
            'header'
        ));

        const sortedFiles = files.sort((a, b) => {
            if (a.enabled !== b.enabled) {
                return a.enabled ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });

        for (const file of sortedFiles) {
            items.push(new MdTreeItem(file.name, vscode.TreeItemCollapsibleState.None, file));
        }

        const enabledCount = files.filter(f => f.enabled).length;
        if (enabledCount === 0) {
            items.push(new MdTreeItem('─'.repeat(30), vscode.TreeItemCollapsibleState.None, undefined, 'info'));
            items.push(new MdTreeItem('💡 Click a file to enable sync', vscode.TreeItemCollapsibleState.None, undefined, 'action'));
        }

        return Promise.resolve(items);
    }
}

// Re-export with old names for backward compatibility
export { MdTreeItem as MemoryTreeItem, MdSidebarProvider as MemorySidebarProvider };
export { MdTreeItem as YamlTreeItem, MdSidebarProvider as YamlSidebarProvider };
