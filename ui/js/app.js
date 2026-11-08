import './components/run-console.js?v=4.0';
import './components/chat-view.js?v=4.0';
import './components/memory-grid.js?v=4.0';
import './components/skills-view.js?v=4.0';
import './components/artifacts-view.js?v=4.0';
import './components/task-planner.js?v=4.0';
import './components/evals-view.js?v=4.0';
import './components/settings-view.js?v=4.0';
import './components/context-inspector.js?v=4.0';
import { store } from './store.js';

document.addEventListener('DOMContentLoaded', () => {
    const navButtons = document.querySelectorAll('.sidebar nav button');
    const container = document.getElementById('view-container');

    const views = {
        'run': '<run-console></run-console>',
        'chat': '<chat-view></chat-view>',
        'memories': '<memory-grid></memory-grid>',
        'skills': '<skills-view></skills-view>',
        'artifacts': '<artifacts-view></artifacts-view>',
        'tasks': '<task-planner></task-planner>',
        'evals': '<evals-view></evals-view>',
        'settings': '<settings-view></settings-view>'
    };

    function switchView(viewName) {
        navButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === viewName);
        });
        container.innerHTML = views[viewName] || views['run'];
    }

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    async function updateTelemetry() {
        try {
            const data = await store.getTelemetry();
            const elRuns = document.getElementById('hud-total-runs');
            const elMem = document.getElementById('hud-total-memories');
            const elTools = document.getElementById('hud-total-tools');
            const modelsContainer = document.getElementById('hud-online-models');

            if (elRuns) elRuns.textContent = data.total_runs;
            if (elMem) elMem.textContent = data.total_memories;
            if (elTools) elTools.textContent = data.active_tools;

            if (modelsContainer && data.backends && Array.isArray(data.backends)) {
                modelsContainer.innerHTML = '';
                data.backends.forEach(b => {
                    const isOnline = b.is_online;
                    const dotColor = isOnline ? 'var(--accent-emerald)' : 'var(--text-muted)';
                    const latencyTxt = isOnline && b.latency_ms ? ` (${b.latency_ms}ms)` : (isOnline ? ' (ON)' : ' (OFF)');
                    
                    const pill = document.createElement('div');
                    pill.className = 'metric-pill';
                    pill.style.cssText = `
                        display: flex;
                        align-items: center;
                        gap: 0.4rem;
                        padding: 0.25rem 0.65rem;
                        border: 1px solid ${isOnline ? 'rgba(99, 102, 241, 0.4)' : 'var(--border-subtle)'};
                        background: ${isOnline ? 'rgba(30, 41, 59, 0.6)' : 'rgba(15, 23, 42, 0.4)'};
                        opacity: ${isOnline ? '1' : '0.6'};
                    `;
                    pill.title = `${b.name} • Modèle: ${b.model || 'défaut'}`;

                    pill.innerHTML = `
                        <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:${dotColor};"></span>
                        <span style="font-size:0.75rem; font-family:var(--font-mono); color:var(--text-primary); font-weight:600;">${b.name}</span>
                        <span style="font-size:0.7rem; font-family:var(--font-mono); color:${isOnline ? 'var(--accent-emerald)' : 'var(--text-muted)'};">${latencyTxt}</span>
                    `;
                    modelsContainer.appendChild(pill);
                });
            }
        } catch (e) {
            console.error('Telemetry fetch error', e);
        }
    }

    updateTelemetry();
    window.addEventListener('hernest:run_completed', updateTelemetry);

    // Bouton de rafraîchissement manuel de la sonde dans le HUD
    const btnRefreshHud = document.getElementById('btn-refresh-hud');
    if (btnRefreshHud) {
        btnRefreshHud.addEventListener('click', async () => {
            btnRefreshHud.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Sonde...`;
            await updateTelemetry();
            btnRefreshHud.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Sonde`;
        });
    }

    switchView('run');
});

