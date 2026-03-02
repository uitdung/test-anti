import * as vscode from 'vscode';
import { MemoryManager, MemoryFile } from './memoryManager';
import { MemorySidebarProvider, MemoryTreeItem } from './sidebarProvider';
import { FileWatcher } from './fileWatcher';

let memoryManager: MemoryManager;
let sidebarProvider: MemorySidebarProvider;
let fileWatcher: FileWatcher;

export function activate(context: vscode.ExtensionContext) {
    console.log('Memory to Rules extension is now active!');

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        console.log('No workspace folder found');
        return;
    }

    // Initialize manager
    memoryManager = new MemoryManager(workspaceRoot, context);

    // Initialize sidebar
    sidebarProvider = new MemorySidebarProvider(memoryManager);
    const treeView = vscode.window.createTreeView('memoryToRulesSidebar', {
        treeDataProvider: sidebarProvider,
        showCollapseAll: false
    });

    // Initialize file watcher
    fileWatcher = new FileWatcher(memoryManager, sidebarProvider);

    // Register commands
    const commands = [
        // Refresh
        vscode.commands.registerCommand('memoryToRules.refresh', () => {
            memoryManager.scanFiles();
            sidebarProvider.refresh();
            vscode.window.showInformationMessage('📁 Memory files refreshed');
        }),

        // Toggle file sync
        vscode.commands.registerCommand('memoryToRules.toggleFile', (item: MemoryTreeItem) => {
            if (item.file) {
                const newState = memoryManager.toggleFile(item.file.name);
                sidebarProvider.refresh();
                vscode.window.showInformationMessage(
                    `${newState ? '✅ Enabled' : '⬜ Disabled'} sync for ${item.file.name}`
                );
            }
        }),

        // Sync all enabled files
        vscode.commands.registerCommand('memoryToRules.syncAll', async () => {
            const result = await memoryManager.syncAll();
            vscode.window.showInformationMessage(
                `🔄 Synced ${result.synced} files, skipped ${result.skipped} files`
            );
        }),

        // Open memory file
        vscode.commands.registerCommand('memoryToRules.openMemoryFile', async (item: MemoryTreeItem) => {
            if (item.file) {
                const uri = vscode.Uri.file(item.file.path);
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc);
            }
        }),

        // Create new memory file
        vscode.commands.registerCommand('memoryToRules.createMemoryFile', async () => {
            const fileName = await vscode.window.showInputBox({
                prompt: 'Enter file name (without .md extension)',
                placeHolder: 'e.g., my-new-rule'
            });

            if (fileName) {
                const result = await memoryManager.createFile(fileName);
                if (result.success) {
                    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(result.path!));
                    await vscode.window.showTextDocument(doc);
                    sidebarProvider.refresh();
                    vscode.window.showInformationMessage(`✅ Created ${fileName}.md`);
                } else {
                    vscode.window.showErrorMessage(result.error || 'Failed to create file');
                }
            }
        })
    ];

    context.subscriptions.push(...commands, treeView);

    // Initial scan
    memoryManager.scanFiles();
    sidebarProvider.refresh();
}

export function deactivate() {
    console.log('Memory to Rules extension deactivated');
    if (fileWatcher) {
        fileWatcher.dispose();
    }
}
