import { store } from '../store.js';

export class ContextInspector extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <div class="context-inspector-pane">
                <h3 style="margin-top: 0; display: flex; align-items: center; gap: 0.5rem;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    Historique des Exécutions
                </h3>
                <div class="history-list" id="runs-history-list">
                    <div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 1rem;">Chargement de l'historique...</div>
                </div>

                <h3 style="display: flex; align-items: center; gap: 0.5rem;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="9" y1="18" x2="15" y2="18"></line><line x1="10" y1="22" x2="14" y2="22"></line><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"></path></svg>
                    Inspecteur de Trace Sélectée
                </h3>
                <div id="selected-run-detail" style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-secondary); background: #040711; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 0.75rem; min-height: 120px; max-height: 200px; overflow-y: auto;">
                    Cliquez sur un run ci-dessus pour inspecter son audit complet.
                </div>
            </div>
        `;

        this.loadHistory();
        window.addEventListener('hernest:run_completed', () => this.loadHistory());
    }

    async loadHistory() {
        const list = this.querySelector('#runs-history-list');
        try {
            const runs = await store.getRuns('default_workspace');
            list.innerHTML = '';
            if (!runs || runs.length === 0) {
                list.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center;">Aucun run archivé.</div>';
                return;
            }

            runs.forEach(r => {
                const item = document.createElement('div');
                item.className = 'history-card';
                const statusColor = r.status === 'success' ? 'var(--accent-emerald)' : 'var(--accent-rose)';
                item.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                        <span style="font-weight: 700; color: ${statusColor}; font-family: var(--font-mono);">${r.status.toUpperCase()}</span>
                        <span style="color: var(--text-muted); font-size: 0.72rem;">${r.created_at ? r.created_at.split(' ')[1] : ''}</span>
                    </div>
                    <div style="color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500;">
                        ${r.prompt}
                    </div>
                    <div style="color: var(--text-muted); font-size: 0.72rem; margin-top: 0.25rem; font-family: var(--font-mono);">
                        ID: ${r.id} • Modèle: ${r.model}
                    </div>
                `;
                item.addEventListener('click', () => {
                    this.querySelectorAll('.history-card').forEach(c => c.classList.remove('selected'));
                    item.classList.add('selected');
                    this.showRunDetails(r.id);

                    // Si la vue courante est la console, restaurer les traces dans le terminal principal
                    const runConsole = document.querySelector('run-console');
                    if (runConsole) {
                        this.restoreRunInConsole(runConsole, r.id);
                    }
                });
                list.appendChild(item);
            });
        } catch (e) {
            list.innerHTML = `<div style="color: var(--accent-rose); font-size: 0.8rem;">Erreur: ${e.message}</div>`;
        }
    }

    async restoreRunInConsole(runConsole, runId) {
        const terminal = runConsole.querySelector('#terminal');
        if (!terminal) return;
        terminal.innerHTML = '';
        try {
            const data = await store.getRunDetails(runId);
            if (!data || !data.traces || data.traces.length === 0) {
                terminal.innerHTML = '<div style="color: var(--text-muted);">Aucune trace archivée pour ce run.</div>';
                return;
            }
            if (data.run) {
                runConsole.appendTrace('thought', `Audit historique du Run [${data.run.id}] : "${data.run.prompt}" (Statut: ${data.run.status.toUpperCase()})`);
            }
            for (const t of data.traces) {
                const prefix = t.tool_name ? `[${t.tool_name}]` : `[${t.step_type.toUpperCase()}]`;
                runConsole.appendTrace(t.step_type, `${prefix} ${t.payload}`, t.timestamp);
            }
        } catch (e) {
            terminal.innerHTML = `<div style="color: var(--accent-rose);">Erreur de restauration: ${e.message}</div>`;
        }
    }

    async showRunDetails(runId) {
        const detailBox = this.querySelector('#selected-run-detail');
        detailBox.innerHTML = '<div style="color: var(--text-muted);">Chargement des traces...</div>';
        try {
            const data = await store.getRunDetails(runId);
            if (!data || !data.traces || data.traces.length === 0) {
                detailBox.innerHTML = '<div>Aucune trace trouvée pour ce run.</div>';
                return;
            }
            detailBox.innerHTML = data.traces.map(t => {
                const color = t.step_type === 'thought' ? '#93c5fd' : (t.step_type === 'tool_call' ? '#fde68a' : (t.step_type === 'tool_output' ? '#a7f3d0' : '#ffffff'));
                return `<div style="margin-bottom: 0.5rem; border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom: 0.4rem;">
                    <div style="color: ${color}; font-weight: 600;">[Étape ${t.step_order}] ${t.step_type} ${t.tool_name ? '('+t.tool_name+')' : ''}</div>
                    <div style="color: #cbd5e1; word-break: break-all; margin-top: 0.2rem;">${t.payload}</div>
                </div>`;
            }).join('');
        } catch (e) {
            detailBox.innerHTML = `<div style="color: var(--accent-rose);">Erreur: ${e.message}</div>`;
        }
    }
}
customElements.define('context-inspector', ContextInspector);

