import * as vscode from 'vscode';
import { MemoryManager } from './memoryManager';
import { MemorySidebarProvider } from './sidebarProvider';

export class FileWatcher {
    private watcher: vscode.FileSystemWatcher;
    private memoryManager: MemoryManager;
    private sidebarProvider: MemorySidebarProvider;
    private debounceTimer: NodeJS.Timeout | undefined;

    constructor(memoryManager: MemoryManager, sidebarProvider: MemorySidebarProvider) {
        this.memoryManager = memoryManager;
        this.sidebarProvider = sidebarProvider;

        // Create watcher for .agents/memory/**/*.md
        this.watcher = vscode.workspace.createFileSystemWatcher(
            '**/.agents/memory/*.md'
        );

        // Register event handlers
        this.watcher.onDidCreate(this.onFileCreated.bind(this));
        this.watcher.onDidChange(this.onFileChanged.bind(this));
        this.watcher.onDidDelete(this.onFileDeleted.bind(this));
    }

    private onFileCreated(uri: vscode.Uri): void {
        console.log(`File created: ${uri.fsPath}`);
        this.debouncedRefresh();
    }

    private onFileChanged(uri: vscode.Uri): void {
        console.log(`File changed: ${uri.fsPath}`);

        // Check if file is enabled and sync
        const fileName = require('path').basename(uri.fsPath);
        const file = this.memoryManager.getFile(fileName);

        if (file?.enabled) {
            this.memoryManager.syncFile(file);
            vscode.window.showInformationMessage(`🔄 Synced: ${fileName}`);
        }
    }

    private onFileDeleted(uri: vscode.Uri): void {
        console.log(`File deleted: ${uri.fsPath}`);

        // Remove from rules if existed
        const fileName = require('path').basename(uri.fsPath);
        const file = this.memoryManager.getFile(fileName);

        if (file?.enabled) {
            // File was synced, need to remove from rules
            const rulesPath = require('path').join(
                this.memoryManager.getRulesDir(),
                fileName
            );
            const fs = require('fs');
            if (fs.existsSync(rulesPath)) {
                fs.unlinkSync(rulesPath);
            }
        }

        this.debouncedRefresh();
    }

    private debouncedRefresh(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.memoryManager.scanFiles();
            this.sidebarProvider.refresh();
        }, 100);
    }

    dispose(): void {
        this.watcher.dispose();
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
    }
}
