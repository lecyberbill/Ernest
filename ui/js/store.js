class Store {
    constructor() {
        // En mode Tauri / file:// / tauri://, window.location.origin ne pointe pas sur le serveur HTTP 8080
        const isTauriOrCustomScheme = window.location.protocol === 'tauri:' || window.location.protocol === 'file:' || window.location.hostname === 'tauri.localhost';
        this.apiBase = isTauriOrCustomScheme ? 'http://127.0.0.1:8080' : window.location.origin;
    }

    async getSettings() {
        const res = await fetch(`${this.apiBase}/api/settings`);
        return res.json();
    }

    async saveSettings(settings) {
        const res = await fetch(`${this.apiBase}/api/settings`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(settings)
        });
        return res.json();
    }

    async getMemories(projectId) {
        const res = await fetch(`${this.apiBase}/api/memories?project_id=${encodeURIComponent(projectId)}`);
        return res.json();
    }

    async saveMemory(memory) {
        const res = await fetch(`${this.apiBase}/api/memories`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(memory)
        });
        return res.json();
    }

    async getTasks(projectId) {
        const res = await fetch(`${this.apiBase}/api/tasks?project_id=${encodeURIComponent(projectId)}`);
        return res.json();
    }

    async saveTask(task) {
        const res = await fetch(`${this.apiBase}/api/tasks`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(task)
        });
        return res.json();
    }

    async getRuns(projectId) {
        const res = await fetch(`${this.apiBase}/api/runs?project_id=${encodeURIComponent(projectId)}`);
        return res.json();
    }

    async getRunDetails(runId) {
        const res = await fetch(`${this.apiBase}/api/run_details?run_id=${encodeURIComponent(runId)}`);
        return res.json();
    }

    async getTelemetry() {
        const res = await fetch(`${this.apiBase}/api/telemetry`);
        return res.json();
    }
}

export const store = new Store();

