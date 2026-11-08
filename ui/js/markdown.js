/**
 * Rendu Markdown standard de haute fidélité (Zero-Build)
 * Utilise Marked.js local lorsqu'il est présent (support 100% GFM, tableaux parfaits, code blocks, listes imbriquées),
 * avec repli automatique sur le moteur natif regex si nécessaire.
 */

export function renderMarkdown(md) {
    if (!md) return '';

    // Utilisation de Marked.js embarqué localement (standard de l'industrie)
    if (typeof window !== 'undefined' && window.marked && typeof window.marked.parse === 'function') {
        try {
            window.marked.setOptions({
                gfm: true,
                breaks: true
            });
            const rendered = window.marked.parse(md);
            return `<div class="markdown-body">${rendered}</div>`;
        } catch (e) {
            console.warn('Fallback markdown parsing', e);
        }
    }

    // Moteur de repli natif
    let text = md
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Tableaux
    const lines = text.split(/\r?\n/);
    const outputLines = [];
    let tableRows = [];

    const isTableRow = (l) => l.trim().startsWith('|') && l.trim().endsWith('|');
    const isTableSep = (l) => l.trim().startsWith('|') && l.includes('---');

    const flushTable = () => {
        if (tableRows.length === 0) return;
        let html = '<div style="overflow-x: auto; margin: 1rem 0;"><table class="md-table">';
        if (tableRows.length >= 2 && isTableSep(tableRows[1])) {
            const headerCols = tableRows[0].split('|').slice(1, -1);
            html += '<thead><tr>';
            headerCols.forEach(col => { html += `<th>${col.trim()}</th>`; });
            html += '</tr></thead><tbody>';
            for (let i = 2; i < tableRows.length; i++) {
                const cols = tableRows[i].split('|').slice(1, -1);
                html += '<tr>';
                cols.forEach(col => { html += `<td>${col.trim()}</td>`; });
                html += '</tr>';
            }
            html += '</tbody>';
        }
        html += '</table></div>';
        outputLines.push(html);
        tableRows = [];
    };

    for (const line of lines) {
        if (isTableRow(line)) {
            tableRows.push(line);
        } else {
            if (tableRows.length > 0) flushTable();
            outputLines.push(line);
        }
    }
    if (tableRows.length > 0) flushTable();
    text = outputLines.join('\n');

    text = text.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    text = text.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    text = text.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    text = text.replace(/\n\n+/g, '<br><br>');

    return `<div class="markdown-body">${text}</div>`;
}
