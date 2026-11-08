import { store } from '../store.js';

export class SkillsView extends HTMLElement {
    constructor() {
        super();
        this.selectedTool = null;
    }

    connectedCallback() {
        this.innerHTML = `
            <div class="card">
                <h2 style="display: flex; align-items: center; gap: 0.5rem;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                    Registre des Compétences & Outils (Skills)
                </h2>
                <p class="card-desc">Toutes les fonctions disponibles pour l'agent ReAct : primitives système intégrées, compétences auto-générées et serveurs MCP tiers.</p>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 200px;">Nom de l'Outil</th>
                            <th style="width: 110px;">Type</th>
                            <th>Description</th>
                            <th style="width: 140px;">Point d'entrée</th>
                            <th style="width: 100px;">Action</th>
                        </tr>
                    </thead>
                    <tbody id="skills-table-body">
                        <tr><td colspan="5" style="color: var(--text-muted); text-align: center; padding: 2rem;">Chargement des compétences...</td></tr>
                    </tbody>
                </table>
            </div>

            <!-- Banc d'essai interactif & inspecteur de signature -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-top: 1.5rem;">
                <div class="card" style="margin-bottom: 0;">
                    <h2 style="display: flex; align-items: center; gap: 0.5rem;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        Paramètres & Schéma JSON
                    </h2>
                    <pre id="tool-schema-view" style="background: rgba(0,0,0,0.4); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); font-family: var(--font-mono); font-size: 0.8rem; color: var(--accent-cyan); overflow-x: auto; height: 260px;">Cliquez sur un outil ci-dessus pour inspecter sa signature.</pre>
                </div>

                <div class="card" style="margin-bottom: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                        <h2 style="margin-bottom: 0; display: flex; align-items: center; gap: 0.5rem;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.31L4.2 18.4A2 2 0 0 0 5.89 21h12.22a2 2 0 0 0 1.69-2.6L14 9.31V2z"></path><line x1="8.5" y1="2" x2="15.5" y2="2"></line><line x1="6.5" y1="14" x2="17.5" y2="14"></line></svg>
                            Banc d'Essai Unitaire
                        </h2>
                        <button class="btn-primary" id="btn-run-tool-test" style="padding: 0.35rem 0.85rem; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem;" disabled>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                            Tester l'Outil
                        </button>
                    </div>
                    <p class="card-desc" style="margin-bottom: 0.5rem;">Saisissez les arguments au format JSON pour tester directement l'exécution de l'outil sélectionné :</p>
                    <textarea id="tool-args-input" placeholder='{"query": "test", ...}' style="width: 100%; height: 95px; background: rgba(0,0,0,0.4); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); color: #fde68a; font-family: var(--font-mono); font-size: 0.8rem; padding: 0.6rem; margin-bottom: 0.5rem; resize: none;"></textarea>
                    
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Résultat de l'exécution :</div>
                    <pre id="tool-test-result" style="background: rgba(0,0,0,0.6); padding: 0.65rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); font-family: var(--font-mono); font-size: 0.78rem; color: var(--accent-emerald); overflow-y: auto; height: 95px; margin: 0;">En attente de test...</pre>
                </div>
            </div>
        `;

        this.querySelector('#btn-run-tool-test').addEventListener('click', () => this.runToolTest());
        this.loadTools();
    }

    async loadTools() {
        const tbody = this.querySelector('#skills-table-body');
        try {
            const res = await fetch('/api/tools');
            const tools = await res.json();
            tbody.innerHTML = '';
            if (!tools || tools.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="color: var(--text-muted); text-align: center; padding: 2rem;">Aucun outil disponible.</td></tr>';
                return;
            }

            tools.forEach(t => {
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                const typeBadge = t.execution_type === 'builtin' 
                    ? '<span class="badge badge-primary">Primitive</span>' 
                    : (t.name.startsWith('mcp__') ? '<span class="badge badge-amber">MCP</span>' : '<span class="badge badge-emerald">Script</span>');
                
                tr.innerHTML = `
                    <td><strong style="color: var(--text-primary); font-family: var(--font-mono);">${t.name}</strong></td>
                    <td>${typeBadge}</td>
                    <td style="color: var(--text-secondary); font-size: 0.85rem;">${t.description}</td>
                    <td><code style="font-size: 0.75rem; color: var(--accent-amber);">${t.entrypoint}</code></td>
                    <td><button class="btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Sélectionner</button></td>
                `;

                const selectTool = () => {
                    this.selectedTool = t;
                    this.querySelectorAll('tbody tr').forEach(row => row.style.background = 'transparent');
                    tr.style.background = 'rgba(255, 255, 255, 0.05)';
                    
                    let parsedSchema = t.schema_json;
                    try {
                        if (typeof t.schema_json === 'string') parsedSchema = JSON.parse(t.schema_json);
                        this.querySelector('#tool-schema-view').textContent = JSON.stringify(parsedSchema, null, 2);
                    } catch (e) {
                        this.querySelector('#tool-schema-view').textContent = t.schema_json;
                    }

                    // Pré-remplir des exemples d'arguments
                    const sampleArgs = {};
                    if (parsedSchema && parsedSchema.properties) {
                        for (const [propName, propDef] of Object.entries(parsedSchema.properties)) {
                            sampleArgs[propName] = propDef.type === 'integer' ? 10 : (propDef.type === 'boolean' ? true : `valeur_${propName}`);
                        }
                    }
                    this.querySelector('#tool-args-input').value = JSON.stringify(sampleArgs, null, 2);
                    this.querySelector('#btn-run-tool-test').disabled = false;
                };

                tr.addEventListener('click', selectTool);
                tbody.appendChild(tr);
            });
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="5" style="color: var(--accent-rose); text-align: center;">Erreur: ${e.message}</td></tr>`;
        }
    }

    async runToolTest() {
        if (!this.selectedTool) return;
        const btn = this.querySelector('#btn-run-tool-test');
        const resultView = this.querySelector('#tool-test-result');
        const argsRaw = this.querySelector('#tool-args-input').value.trim();

        let parsedArgs = {};
        if (argsRaw) {
            try {
                parsedArgs = JSON.parse(argsRaw);
            } catch (e) {
                alert(`Arguments JSON invalides: ${e.message}`);
                return;
            }
        }

        btn.disabled = true;
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Test...`;
        resultView.textContent = "Exécution unitaire en cours...";

        try {
            const res = await fetch('/api/tools/test', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    name: this.selectedTool.name,
                    args: parsedArgs
                })
            });

            const data = await res.json();
            if (res.ok && data.status === 'ok') {
                const outStr = typeof data.result === 'object' ? JSON.stringify(data.result, null, 2) : data.result;
                resultView.style.color = 'var(--accent-emerald)';
                resultView.textContent = outStr;
            } else {
                resultView.style.color = 'var(--accent-rose)';
                resultView.textContent = `Erreur: ${data.error || 'Échec du test'}`;
            }
        } catch (e) {
            resultView.style.color = 'var(--accent-rose)';
            resultView.textContent = `Erreur réseau: ${e.message}`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Tester l'Outil`;
        }
    }
}
customElements.define('skills-view', SkillsView);
