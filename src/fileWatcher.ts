import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MdManager } from './mdManager';
import { MdSidebarProvider } from './sidebarProvider';

export class FileWatcher implements vscode.Disposable {
    private watcher: vscode.FileSystemWatcher | undefined;
    private mdManager: MdManager;
    private sidebarProvider: MdSidebarProvider;
    private debounceTimer: NodeJS.Timeout | undefined;
    private currentSourceFolder: string;

    constructor(mdManager: MdManager, sidebarProvider: MdSidebarProvider) {
        this.mdManager = mdManager;
        this.sidebarProvider = sidebarProvider;
        
        // Get initial source folder
        this.currentSourceFolder = this.getSourceFolder();
        
        // Create watcher
        this.createWatcher();

        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('mdToRules.sourceFolder')) {
                const newFolder = this.getSourceFolder();
                if (newFolder !== this.currentSourceFolder) {
                    console.log(`Source folder changed: ${this.currentSourceFolder} → ${newFolder}`);
                    this.currentSourceFolder = newFolder;
                    this.createWatcher();
                    mdManager.scanFiles();
                    sidebarProvider.refresh();
                }
            }
        });
    }

    private getSourceFolder(): string {
        const config = vscode.workspace.getConfiguration('mdToRules');
        return config.get<string>('sourceFolder', '.agents/memory');
    }

    private createWatcher(): void {
        // Dispose old watcher
        if (this.watcher) {
            this.watcher.dispose();
        }

        console.log(`Creating watcher for: ${this.currentSourceFolder}/**/*.md`);

        // Create new watcher
        this.watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(
                vscode.workspace.workspaceFolders![0],
                `${this.currentSourceFolder}/**/*.md`
            )
        );

        // Register event handlers
        this.watcher.onDidCreate(this.onFileCreated.bind(this));
        this.watcher.onDidChange(this.onFileChanged.bind(this));
        this.watcher.onDidDelete(this.onFileDeleted.bind(this));
    }

    private onFileCreated(uri: vscode.Uri): void {
        console.log(`MD file created: ${uri.fsPath}`);
        this.debouncedRefresh();
    }

    private onFileChanged(uri: vscode.Uri): void {
        console.log(`MD file changed: ${uri.fsPath}`);

        const fileName = path.basename(uri.fsPath);
        const file = this.mdManager.getFile(fileName);

        if (file?.enabled) {
            console.log(`Syncing enabled file: ${fileName}`);
            this.mdManager.syncFile(file);
            const modeDesc = this.getModeDescription(file.syncMode);
            vscode.window.showInformationMessage(`🔄 Synced: ${fileName} → ${modeDesc}`);
        } else {
            console.log(`File not enabled or not found: ${fileName}`);
        }
    }

    private onFileDeleted(uri: vscode.Uri): void {
        console.log(`MD file deleted: ${uri.fsPath}`);

        const fileName = path.basename(uri.fsPath);
        const file = this.mdManager.getFile(fileName);

        if (file?.enabled) {
            const rulesPath = path.join(this.mdManager.getRulesFolder(), fileName);
            if (fs.existsSync(rulesPath)) {
                fs.unlinkSync(rulesPath);
            }
        }

        this.debouncedRefresh();
    }

    private getModeDescription(mode: string): string {
        switch (mode) {
            case 'rules': return '.agents/rules';
            case 'claude': return 'CLAUDE.md';
            case 'both': return '.agents/rules + CLAUDE.md';
            default: return mode;
        }
    }

    private debouncedRefresh(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.mdManager.scanFiles();
            this.sidebarProvider.refresh();
        }, 100);
    }

    dispose(): void {
        if (this.watcher) {
            this.watcher.dispose();
        }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
    }
}
