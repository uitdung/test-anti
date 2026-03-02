import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MdManager, SyncMode } from './mdManager';
import { MdSidebarProvider, MdTreeItem } from './sidebarProvider';
import { FileWatcher } from './fileWatcher';

let mdManager: MdManager;
let sidebarProvider: MdSidebarProvider;
let fileWatcher: FileWatcher;

export function activate(context: vscode.ExtensionContext) {
    console.log('MD to Rules Sync extension is now active!');

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        console.log('No workspace folder found');
        return;
    }

    // Initialize manager
    mdManager = new MdManager(workspaceRoot, context);

    // Initialize sidebar (simple, without drag-drop)
    sidebarProvider = new MdSidebarProvider(mdManager);
    vscode.window.createTreeView('mdToRulesSidebar', {
        treeDataProvider: sidebarProvider,
        showCollapseAll: false
    });

    // Initialize file watcher
    fileWatcher = new FileWatcher(mdManager, sidebarProvider);

    // Register commands
    const commands = [
        // Refresh file list
        vscode.commands.registerCommand('mdToRules.refresh', () => {
            mdManager.scanFiles();
            sidebarProvider.refresh();
            vscode.window.showInformationMessage('📁 Files refreshed');
        }),

        // Toggle file sync (click on file)
        vscode.commands.registerCommand('mdToRules.toggleFile', (item: MdTreeItem) => {
            if (item.file) {
                const wasEnabled = item.file.enabled;
                const newState = mdManager.toggleFile(item.file.name);
                sidebarProvider.refresh();
                
                if (wasEnabled && !newState) {
                    // Disabled - file was removed from destinations
                    vscode.window.showInformationMessage(
                        `⬜ Disabled & removed: ${item.file.name}`
                    );
                } else if (!wasEnabled && newState) {
                    // Enabled - file was synced
                    const modeDesc = getModeDescription(item.file.syncMode);
                    vscode.window.showInformationMessage(
                        `✅ Enabled: ${item.file.name} → ${modeDesc}`
                    );
                }
            }
        }),

        // Sync all enabled files
        vscode.commands.registerCommand('mdToRules.syncAll', async () => {
            const result = await mdManager.syncAll();
            let message = `🔄 Synced ${result.synced} files`;
            if (result.skipped > 0) message += `, skipped ${result.skipped}`;
            if (result.errors > 0) message += `, ${result.errors} errors`;
            vscode.window.showInformationMessage(message);
        }),

        // Open file
        vscode.commands.registerCommand('mdToRules.openFile', async (item: MdTreeItem) => {
            if (item.file) {
                const uri = vscode.Uri.file(item.file.path);
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc);
            }
        }),

        // Create new file
        vscode.commands.registerCommand('mdToRules.createFile', async () => {
            const fileName = await vscode.window.showInputBox({
                prompt: 'Enter file name (without .md extension)',
                placeHolder: 'e.g., my-new-rule'
            });

            if (fileName) {
                const result = await mdManager.createFile(fileName);
                if (result.success) {
                    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(result.path!));
                    await vscode.window.showTextDocument(doc);
                    mdManager.scanFiles();
                    sidebarProvider.refresh();
                    vscode.window.showInformationMessage(`✅ Created ${fileName}.md`);
                } else {
                    vscode.window.showErrorMessage(result.error || 'Failed to create file');
                }
            }
        }),

        // Select source folder
        vscode.commands.registerCommand('mdToRules.selectSourceFolder', async () => {
            const folders = await getWorkspaceFolders(workspaceRoot);
            
            const selected = await vscode.window.showQuickPick(
                folders.map(f => ({
                    label: f.name,
                    description: f.path,
                    detail: f.hasMd ? '📁 Contains .md files' : 'Empty folder'
                })),
                {
                    placeHolder: 'Select source folder for markdown files',
                    title: 'Source Folder Selection'
                }
            );

            if (selected) {
                const relativePath = path.relative(workspaceRoot, selected.description || '');
                await mdManager.setSourceFolder(relativePath || selected.label);
                mdManager.scanFiles();
                sidebarProvider.refresh();
                vscode.window.showInformationMessage(`📁 Source folder: ${selected.label}`);
            }
        }),

        // Change sync mode
        vscode.commands.registerCommand('mdToRules.changeSyncMode', async (item: MdTreeItem) => {
            if (!item.file) return;

            const modes = [
                { label: '📁 Rules Folder', description: 'Save to .agents/rules/', mode: 'rules' as SyncMode },
                { label: '📄 CLAUDE.md', description: 'Append/replace section in CLAUDE.md', mode: 'claude' as SyncMode },
                { label: '📁📄 Both', description: 'Save to both locations', mode: 'both' as SyncMode }
            ];

            const selected = await vscode.window.showQuickPick(
                modes.map(m => ({
                    label: m.label,
                    description: m.description,
                    mode: m.mode,
                    picked: item.file!.syncMode === m.mode
                })),
                { placeHolder: `Select sync mode for ${item.file.name}`, title: 'Sync Mode' }
            );

            if (selected) {
                mdManager.changeSyncMode(item.file.name, selected.mode);
                sidebarProvider.refresh();
                vscode.window.showInformationMessage(`📝 ${item.file.name}: ${selected.label}`);
            }
        }),

        // Show help popup
        vscode.commands.registerCommand('mdToRules.showHelp', async () => {
            const help = `**MD to Rules Sync - How to use**

1. **Add files** to \`.agents/memory/\` (or your selected source folder)
2. **Click on a file** in the sidebar → enables sync
3. **Right-click** → change sync mode:
   - 📁 **Rules**: \`.agents/rules/\` folder
   - 📄 **CLAUDE.md**: Section in CLAUDE.md
   - 📁📄 **Both**: Both locations

**What happens:**
- HTML comments \`<!-- -->\` are removed
- File is copied to destination(s)
- Auto-syncs when you edit the file

**Disable sync:**
- Click on file again → stops sync AND removes from destinations

**Settings:** Check VS Code Settings → "MD to Rules"`;
            
            const result = await vscode.window.showInformationMessage(
                'MD to Rules Sync',
                { modal: true, detail: help },
                'Open Settings'
            );
            
            if (result === 'Open Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'mdToRules');
            }
        }),

        // Set source folder from Explorer context menu
        vscode.commands.registerCommand('mdToRules.setFolderFromExplorer', async (uri: vscode.Uri) => {
            if (!uri || !fs.existsSync(uri.fsPath)) return;
            
            const stat = fs.statSync(uri.fsPath);
            if (!stat.isDirectory()) {
                vscode.window.showWarningMessage('Please select a folder');
                return;
            }
            
            const relativePath = path.relative(workspaceRoot, uri.fsPath);
            const displayPath = relativePath || uri.fsPath;
            
            const confirm = await vscode.window.showInformationMessage(
                `Set source folder to: ${displayPath}?`,
                'Yes', 'No'
            );
            
            if (confirm === 'Yes') {
                await mdManager.setSourceFolder(relativePath || uri.fsPath);
                mdManager.scanFiles();
                sidebarProvider.refresh();
                vscode.window.showInformationMessage(`📁 Source folder: ${displayPath}`);
            }
        })
    ];

    context.subscriptions.push(...commands);

    // Initial scan
    mdManager.scanFiles();
    sidebarProvider.refresh();
}

function getModeDescription(mode: SyncMode): string {
    switch (mode) {
        case 'rules': return '.agents/rules';
        case 'claude': return 'CLAUDE.md';
        case 'both': return 'both locations';
        default: return mode;
    }
}

async function getWorkspaceFolders(workspaceRoot: string): Promise<{ name: string; path: string; hasMd: boolean }[]> {
    const folders: { name: string; path: string; hasMd: boolean }[] = [];
    
    function scanDir(dir: string, depth: number = 0) {
        if (depth > 3) return;
        
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    const fullPath = path.join(dir, entry.name);
                    const files = fs.readdirSync(fullPath);
                    const hasMd = files.some(f => f.endsWith('.md'));
                    const relativePath = path.relative(workspaceRoot, fullPath);
                    
                    if (!relativePath.includes('node_modules')) {
                        folders.push({
                            name: relativePath,
                            path: fullPath,
                            hasMd
                        });
                        
                        scanDir(fullPath, depth + 1);
                    }
                }
            }
        } catch (error) {
            // Ignore permission errors
        }
    }

    // Add defaults
    folders.push({
        name: '.agents/memory (default)',
        path: path.join(workspaceRoot, '.agents/memory'),
        hasMd: false
    });
    
    const rootFiles = fs.readdirSync(workspaceRoot);
    const rootHasMd = rootFiles.some(f => f.endsWith('.md'));
    folders.push({
        name: '. (workspace root)',
        path: workspaceRoot,
        hasMd: rootHasMd
    });

    scanDir(workspaceRoot);
    
    return folders;
}

export function deactivate() {
    console.log('MD to Rules Sync extension deactivated');
    if (fileWatcher) {
        fileWatcher.dispose();
    }
}
