import { store } from '../store.js';

export class EvalsView extends HTMLElement {
    constructor() {
        super();
        this.isRunning = false;
    }

    connectedCallback() {
        this.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                <!-- En-tête & Déclencheur du Benchmark -->
                <div class="card" style="margin-bottom: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.85rem; margin-bottom: 1rem;">
                        <div>
                            <h2 style="display: flex; align-items: center; gap: 0.5rem;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
                                Harnais d'Évaluation Automatisé (Agentic Evals)
                            </h2>
                            <p class="card-desc" style="margin-bottom: 0;">Banc d'essai automatisé : taux de réussite, fidélité aux outils, vitesse d'inférence et dérives comportementales.</p>
                        </div>
                        <button class="btn-primary" id="btn-run-benchmark" style="padding: 0.45rem 1.15rem; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.4rem;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                            Lancer l'Évaluation Complète
                        </button>
                    </div>

                    <!-- Cartouches KPIs de synthèse -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.85rem;" id="eval-kpi-summary">
                        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 0.85rem;">
                            <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Taux de Succès</div>
                            <div style="font-size: 1.4rem; font-weight: 700; color: var(--accent-emerald); font-family: var(--font-mono);" id="kpi-success-rate">-- %</div>
                        </div>
                        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 0.85rem;">
                            <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Score Moyen</div>
                            <div style="font-size: 1.4rem; font-weight: 700; color: var(--accent-cyan); font-family: var(--font-mono);" id="kpi-avg-score">-- / 1.0</div>
                        </div>
                        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 0.85rem;">
                            <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Durée Totale</div>
                            <div style="font-size: 1.4rem; font-weight: 700; color: var(--accent-amber); font-family: var(--font-mono);" id="kpi-total-time">-- s</div>
                        </div>
                        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 0.85rem;">
                            <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Tokens Consommés</div>
                            <div style="font-size: 1.4rem; font-weight: 700; color: var(--primary); font-family: var(--font-mono);" id="kpi-total-tokens">--</div>
                        </div>
                    </div>
                </div>

                <!-- Grille des scénarios exécutés lors de la dernière session -->
                <div class="card" style="margin-bottom: 0;">
                    <h2 style="display: flex; align-items: center; gap: 0.5rem;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                        Scénarios de Test Standardisés
                    </h2>
                    <p class="card-desc">Couverture des capacités fondamentales : Raisonnement, Primitives Mémoires, Terminal OS et Artefacts.</p>
                    
                    <div id="benchmark-status-indicator" style="display: none; padding: 0.75rem; background: rgba(99, 102, 241, 0.1); border: 1px solid var(--primary); border-radius: var(--radius-sm); margin-bottom: 1rem; font-family: var(--font-mono); font-size: 0.82rem; color: var(--accent-cyan);">
                        Évaluation en cours sur le modèle actif... Veuillez patienter.
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th style="width: 140px;">Scénario</th>
                                <th style="width: 110px;">Catégorie</th>
                                <th>Objectif & Outils Attendus</th>
                                <th style="width: 90px; text-align: center;">Statut</th>
                                <th style="width: 90px; text-align: right;">Score</th>
                                <th style="width: 110px; text-align: right;">Durée</th>
                            </tr>
                        </thead>
                        <tbody id="eval-scenarios-body">
                            <tr><td colspan="6" style="color: var(--text-muted); text-align: center; padding: 1.5rem;">Cliquez sur « Lancer l'Évaluation Complète » pour exécuter le banc d'essai.</td></tr>
                        </tbody>
                    </table>
                </div>

                <!-- Historique des sessions d'évaluations passées -->
                <div class="card">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                        <h2 style="margin-bottom: 0; display: flex; align-items: center; gap: 0.5rem;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            Historique des Audits & Benchmarks
                        </h2>
                        <button class="btn-secondary" id="btn-refresh-history" style="font-size: 0.78rem; padding: 0.25rem 0.65rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                            Actualiser
                        </button>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 70px;">ID</th>
                                <th style="width: 130px;">Scénario</th>
                                <th style="width: 140px;">Moteur / Modèle</th>
                                <th style="width: 90px; text-align: center;">Verdict</th>
                                <th style="width: 80px; text-align: right;">Score</th>
                                <th style="width: 90px; text-align: right;">Tokens</th>
                                <th style="width: 140px;">Date & Heure</th>
                            </tr>
                        </thead>
                        <tbody id="eval-history-body">
                            <tr><td colspan="7" style="color: var(--text-muted); text-align: center; padding: 1rem;">Chargement de l'historique...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this.querySelector('#btn-run-benchmark').addEventListener('click', () => this.runBenchmark());
        this.querySelector('#btn-refresh-history').addEventListener('click', () => this.loadHistory());
        this.loadHistory();
    }

    async runBenchmark() {
        if (this.isRunning) return;
        this.isRunning = true;
        const btn = this.querySelector('#btn-run-benchmark');
        const indicator = this.querySelector('#benchmark-status-indicator');
        const scenariosBody = this.querySelector('#eval-scenarios-body');

        btn.disabled = true;
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Exécution...`;
        indicator.style.display = 'block';
        scenariosBody.innerHTML = `<tr><td colspan="6" style="color: var(--accent-cyan); text-align: center; padding: 2rem; font-family: var(--font-mono);">Exécution séquentielle des scénarios agentiques en cours...</td></tr>`;

        try {
            const res = await fetch('/api/evals/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const data = await res.json();

            // Mettre à jour les KPIs
            this.querySelector('#kpi-success-rate').textContent = `${data.success_rate}%`;
            this.querySelector('#kpi-avg-score').textContent = `${data.average_score} / 1.0`;
            this.querySelector('#kpi-total-time').textContent = `${data.total_duration_sec} s`;
            this.querySelector('#kpi-total-tokens').textContent = data.total_tokens_consumed.toLocaleString();

            // Remplir le tableau des scénarios
            scenariosBody.innerHTML = '';
            (data.results || []).forEach(r => {
                const tr = document.createElement('tr');
                const isPass = r.status === 'passed';
                const statusBadge = isPass 
                    ? '<span class="badge badge-emerald">PASS</span>'
                    : '<span class="badge" style="background: rgba(244,63,94,0.2); color: var(--accent-rose); border: 1px solid var(--accent-rose);">FAIL</span>';
                
                tr.innerHTML = `
                    <td style="font-family: var(--font-mono); font-size: 0.78rem; font-weight: 600;">${r.scenario_id}</td>
                    <td><span class="badge badge-primary">${r.category}</span></td>
                    <td>
                        <strong style="color: var(--text-primary); font-size: 0.82rem;">${r.title}</strong>
                        <div style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono); margin-top: 0.2rem;">
                            Outils attendus: [${(r.expected_tools || []).join(', ') || 'Aucun'}] • Utilisés: [${(r.tools_used || []).join(', ') || 'Aucun'}]
                        </div>
                    </td>
                    <td style="text-align: center;">${statusBadge}</td>
                    <td style="text-align: right; font-family: var(--font-mono); font-weight: 700; color: ${isPass ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">${r.score}</td>
                    <td style="text-align: right; font-family: var(--font-mono); color: var(--text-muted);">${(r.duration_ms / 1000).toFixed(1)} s</td>
                `;
                scenariosBody.appendChild(tr);
            });

            this.loadHistory();
        } catch (e) {
            scenariosBody.innerHTML = `<tr><td colspan="6" style="color: var(--accent-rose); text-align: center; padding: 1.5rem;">Erreur lors de l'exécution: ${e.message}</td></tr>`;
        } finally {
            this.isRunning = false;
            btn.disabled = false;
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Lancer l'Évaluation Complète`;
            indicator.style.display = 'none';
        }
    }

    async loadHistory() {
        const historyBody = this.querySelector('#eval-history-body');
        try {
            const res = await fetch('/api/evals/history');
            const list = await res.json();
            historyBody.innerHTML = '';
            if (!list || list.length === 0) {
                historyBody.innerHTML = `<tr><td colspan="7" style="color: var(--text-muted); text-align: center; padding: 1rem;">Aucun audit archivé.</td></tr>`;
                return;
            }

            list.forEach(item => {
                const tr = document.createElement('tr');
                const isPass = item.status === 'passed';
                const statusBadge = isPass 
                    ? '<span class="badge badge-emerald" style="font-size: 0.65rem;">PASS</span>'
                    : '<span class="badge" style="background: rgba(244,63,94,0.15); color: var(--accent-rose); font-size: 0.65rem;">FAIL</span>';

                tr.innerHTML = `
                    <td style="font-family: var(--font-mono); color: var(--text-muted); font-size: 0.72rem;">#${item.id}</td>
                    <td style="font-family: var(--font-mono); font-size: 0.78rem;">${item.scenario_id}</td>
                    <td style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--accent-cyan);">${item.model || item.backend}</td>
                    <td style="text-align: center;">${statusBadge}</td>
                    <td style="text-align: right; font-family: var(--font-mono); font-weight: 600;">${item.score}</td>
                    <td style="text-align: right; font-family: var(--font-mono); color: var(--text-muted); font-size: 0.72rem;">${item.total_tokens || 0}</td>
                    <td style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-muted);">${item.created_at || ''}</td>
                `;
                historyBody.appendChild(tr);
            });
        } catch (e) {
            historyBody.innerHTML = `<tr><td colspan="7" style="color: var(--accent-rose); font-size: 0.8rem; text-align: center;">Erreur: ${e.message}</td></tr>`;
        }
    }
}

customElements.define('evals-view', EvalsView);

