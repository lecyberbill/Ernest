import { store } from '../store.js';

export class TaskPlanner extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <div class="card">
                <h2><span>⏱</span> Planificateur de Tâches Périodiques</h2>
                <p class="card-desc">Ordonnancement autonome des missions récurrentes délégué au planificateur système natif de l'hôte.</p>

                <div style="display: grid; grid-template-columns: 1.2fr 160px 2fr auto; gap: 0.75rem; margin-bottom: 1.5rem;">
                    <input type="text" id="task-name" placeholder="Nom (ex: sync_veille_techno)" />
                    <input type="text" id="task-cron" placeholder="0 2 * * *" value="0 2 * * *" style="font-family: var(--font-mono);" />
                    <input type="text" id="task-prompt" placeholder="Instruction agentique à déclencher..." />
                    <button class="btn-primary" id="btn-add-task">
                        <span>+</span> Programmer
                    </button>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 220px;">Nom de la Tâche</th>
                            <th style="width: 140px;">Fréquence</th>
                            <th>Instruction Déclenchée</th>
                            <th style="width: 170px;">Dernière Exécution</th>
                            <th style="width: 110px;">Statut</th>
                        </tr>
                    </thead>
                    <tbody id="task-table-body">
                        <tr><td colspan="5" style="color: var(--text-muted); text-align: center;">Chargement des tâches...</td></tr>
                    </tbody>
                </table>
            </div>
        `;

        this.querySelector('#btn-add-task').addEventListener('click', () => this.addTask());
        this.loadTasks();
    }

    async loadTasks() {
        const tbody = this.querySelector('#task-table-body');
        try {
            const tasks = await store.getTasks('default_workspace');
            tbody.innerHTML = '';
            if (!tasks || tasks.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="color: var(--text-muted); text-align: center; padding: 2rem;">Aucune tâche programmée dans l\'OS.</td></tr>';
                return;
            }
            tasks.forEach(t => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong style="color: var(--text-primary);">${t.name}</strong></td>
                    <td><code style="color: var(--accent-cyan); font-family: var(--font-mono);">${t.cron_expr}</code></td>
                    <td style="color: var(--text-secondary);">${t.prompt}</td>
                    <td style="color: var(--text-muted); font-size: 0.82rem; font-family: var(--font-mono);">${t.last_run_at || 'Jamais'}</td>
                    <td><span class="badge ${t.is_active ? 'badge-emerald' : 'badge-amber'}">${t.is_active ? 'Actif' : 'Inactif'}</span></td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="5" style="color: var(--accent-rose); text-align: center;">Erreur: ${e.message}</td></tr>`;
        }
    }

    async addTask() {
        const name = this.querySelector('#task-name').value.trim();
        const cron_expr = this.querySelector('#task-cron').value.trim();
        const prompt = this.querySelector('#task-prompt').value.trim();
        if (!name || !cron_expr || !prompt) return;

        await store.saveTask({
            project_id: 'default_workspace',
            name,
            cron_expr,
            prompt
        });
        this.querySelector('#task-name').value = '';
        this.querySelector('#task-prompt').value = '';
        this.loadTasks();
    }
}
customElements.define('task-planner', TaskPlanner);
