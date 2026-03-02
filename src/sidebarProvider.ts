import * as vscode from 'vscode';
import { MdManager, MdFile, SyncMode } from './mdManager';

/**
 * Tree item for files (clickable to toggle sync)
 */
export class MdTreeItem extends vscode.TreeItem {
    constructor(public readonly file: MdFile) {
        super(file.name, vscode.TreeItemCollapsibleState.None);

        this.contextValue = file.enabled ? 'enabledFile' : 'disabledFile';
        this.iconPath = new vscode.ThemeIcon(
            file.enabled ? 'check-circle' : 'circle-outline',
            file.enabled ? new vscode.ThemeColor('charts.green') : undefined
        );

        const modeIcon = this.getModeIcon(file.syncMode);
        this.description = file.enabled ? `${modeIcon}` : '';

        this.tooltip = this.createTooltip(file);
        this.command = {
            command: 'mdToRules.toggleFile',
            title: 'Toggle Sync',
            arguments: [this]
        };
    }

    private createTooltip(file: MdFile): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${file.name}**\n\n`);
        md.appendMarkdown(`Status: ${file.enabled ? '✅ Syncing' : '⬜ Not synced'}\n\n`);
        md.appendMarkdown(`Mode: ${this.getModeLabel(file.syncMode)}\n\n`);
        md.appendMarkdown('---\n\n');
        md.appendMarkdown('Click: Toggle sync\n');
        md.appendMarkdown('Right-click: More options');
        return md;
    }

    private getModeIcon(mode: SyncMode): string {
        switch (mode) {
            case 'rules': return '📁';
            case 'claude': return '📄';
            case 'both': return '📁📄';
            default: return '';
        }
    }

    private getModeLabel(mode: SyncMode): string {
        switch (mode) {
            case 'rules': return '📁 .agents/rules';
            case 'claude': return '📄 CLAUDE.md';
            case 'both': return '📁📄 Both';
            default: return mode;
        }
    }
}

/**
 * Sidebar provider - minimal UI, just files
 */
export class MdSidebarProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private mdManager: MdManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        const files = this.mdManager.getFiles();

        // Empty state - just show one message
        if (files.length === 0) {
            const item = new vscode.TreeItem('No .md files - click + to create');
            item.iconPath = new vscode.ThemeIcon('info');
            item.contextValue = 'empty';
            return Promise.resolve([item]);
        }

        // Sort: enabled first, then alphabetically
        const sortedFiles = [...files].sort((a, b) => {
            if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        return Promise.resolve(sortedFiles.map(f => new MdTreeItem(f)));
    }
}

// Aliases for backward compatibility
export { MdTreeItem as MemoryTreeItem, MdSidebarProvider as MemorySidebarProvider };
export { MdTreeItem as YamlTreeItem, MdSidebarProvider as YamlSidebarProvider };
