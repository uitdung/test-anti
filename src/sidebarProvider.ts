import * as vscode from 'vscode';
import { MemoryManager, MemoryFile } from './memoryManager';

export class MemoryTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly file?: MemoryFile
    ) {
        super(label, collapsibleState);

        if (file) {
            this.tooltip = `${file.name}\nLast modified: ${file.lastModified.toLocaleString()}\n\nClick to toggle sync`;
            this.description = file.enabled ? '✅ Synced' : '⬜ Disabled';
            this.contextValue = file.enabled ? 'enabledFile' : 'disabledFile';
            this.iconPath = new vscode.ThemeIcon(
                file.enabled ? 'check' : 'circle-outline'
            );

            // Click action - toggle sync
            this.command = {
                command: 'memoryToRules.toggleFile',
                title: 'Toggle Sync',
                arguments: [this]
            };
        }
    }
}

export class MemorySidebarProvider implements vscode.TreeDataProvider<MemoryTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MemoryTreeItem | undefined | null | void> =
        new vscode.EventEmitter<MemoryTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MemoryTreeItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private memoryManager: MemoryManager;

    constructor(memoryManager: MemoryManager) {
        this.memoryManager = memoryManager;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: MemoryTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: MemoryTreeItem): Thenable<MemoryTreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        const files = this.memoryManager.getFiles();

        if (files.length === 0) {
            return Promise.resolve([
                new MemoryTreeItem(
                    '📂 No memory files found',
                    vscode.TreeItemCollapsibleState.None
                ),
                new MemoryTreeItem(
                    '💡 Click + to create a new file',
                    vscode.TreeItemCollapsibleState.None
                )
            ]);
        }

        // Sort: enabled first, then alphabetically
        const sortedFiles = files.sort((a, b) => {
            if (a.enabled !== b.enabled) {
                return a.enabled ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });

        const items = sortedFiles.map(file =>
            new MemoryTreeItem(
                file.name,
                vscode.TreeItemCollapsibleState.None,
                file
            )
        );

        return Promise.resolve(items);
    }
}
