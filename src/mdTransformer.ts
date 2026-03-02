/**
 * Markdown Content Transformer
 * - Removes HTML comments <!-- -->
 * - Preserves everything else (frontmatter, content, code blocks)
 */

export interface TransformResult {
    content: string;
    commentsRemoved: number;
}

/**
 * Remove HTML comments from markdown content
 * Preserves comments inside code blocks
 */
export function removeHtmlComments(content: string): TransformResult {
    let commentsRemoved = 0;
    
    // Track code blocks and their positions
    const codeBlockRanges: Array<{start: number, end: number}> = [];
    const codeBlockRegex = /```[\s\S]*?```/g;
    let match;
    
    while ((match = codeBlockRegex.exec(content)) !== null) {
        codeBlockRanges.push({ start: match.index, end: match.index + match[0].length });
    }
    
    // Remove HTML comments (including multi-line) but not inside code blocks
    const result = content.replace(/<!--[\s\S]*?-->/g, (comment, offset) => {
        // Check if this comment is inside a code block
        for (const range of codeBlockRanges) {
            if (offset >= range.start && offset < range.end) {
                return comment; // Keep comment inside code block
            }
        }
        
        commentsRemoved++;
        return '';
    });
    
    // Clean up multiple blank lines
    const finalContent = result.replace(/\n{3,}/g, '\n\n');
    
    return {
        content: finalContent,
        commentsRemoved
    };
}

/**
 * Check if content has YAML frontmatter
 */
export function hasFrontmatter(content: string): boolean {
    return content.trim().startsWith('---');
}

/**
 * Extract frontmatter metadata
 */
export function extractMetadata(content: string): { name: string; description: string } {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);
    
    if (!match) {
        return { name: '', description: '' };
    }
    
    const frontmatter = match[1];
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    
    return {
        name: nameMatch ? nameMatch[1].trim() : '',
        description: descMatch ? descMatch[1].trim() : ''
    };
}

/**
 * Add frontmatter to content if missing
 */
export function ensureFrontmatter(content: string, name: string, description: string = ''): string {
    if (hasFrontmatter(content)) {
        return content;
    }
    
    return `---
name: ${name}
description: ${description}
---

${content}`;
}

/**
 * Extract filename without extension
 */
export function extractFileName(filePath: string): string {
    const parts = filePath.split(/[/\\]/);
    const filename = parts[parts.length - 1];
    return filename.replace(/\.md$/i, '');
}
