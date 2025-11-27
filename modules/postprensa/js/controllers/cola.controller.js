import { PostPrensaColaService } from '../services/cola.service.js';

// Helper user name
const getUsername = () => {
    const session = localStorage.getItem('erp_session');
    return session ? JSON.parse(session).name : '[Equipo Acabados]';
};

export const ColaController = {
    currentPage: 1,
    itemsPerPage: 10,
    myTasks: [],

    init: async function() {
        console.log("ColaController (Acabados) inicializado.");
        const userNameEl = document.getElementById('current-user-name');
        if (userNameEl) userNameEl.textContent = getUsername();
        
        await this.loadMyTasks();
        this.setupEvents();
        window.startPostPrensaTask = this.startTask.bind(this);
    },

    async loadMyTasks() {
        this.myTasks = await PostPrensaColaService.getMyTasks();
        this.applyFilters();
    },

    applyFilters() {
        // (Lógica de paginación original se mantiene igual)
        const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';
        const filtered = this.myTasks.filter(t => t.ot_id.toLowerCase().includes(searchTerm));
        this.renderTable(filtered);
    },

    async startTask(id) {
        const btn = document.getElementById(`btn-action-${id}`);
        if(btn) {
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin mr-1"></i> ...';
            if(window.lucide) window.lucide.createIcons();
        }

        try {
            const res = await PostPrensaColaService.startProcessing(id);
            if(res.success) {
                window.location.hash = `#/calidad/${id}`; 
            }
        } catch (error) {
            if (btn) btn.disabled = false;
            window.UI.showNotification('Error', 'No se pudo iniciar la tarea.');
        }
    },

    renderTable(tasks) {
        const tbody = document.getElementById('tasks-table-body');
        if(!tbody) return;
        tbody.innerHTML = '';

        if (tasks.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-gray-500 italic bg-gray-50">No tienes tareas asignadas.</td></tr>`;
            return;
        }

        tasks.forEach(task => {
            let actionHtml = '';
            const primaryActionClass = "flex items-center justify-center mx-auto px-3 py-1 text-sm bg-red-600 text-white font-semibold rounded-lg shadow-sm hover:bg-red-700 transition";

            if (task.estado === 'Pendiente' || task.estado === 'Asignada' || task.estado === 'En Acabados') {
                // Si está pendiente o asignada, mostramos "Procesar". Si ya está en acabados (pero no terminada), "Continuar"
                const btnText = task.estado === 'En Acabados' ? 'Continuar' : 'Procesar';
                const icon = task.estado === 'En Acabados' ? 'arrow-right-circle' : 'play';
                const onclick = task.estado === 'En Acabados' ? `href="#/calidad/${task.id}"` : `onclick="window.startPostPrensaTask('${task.id}')"`;
                const tag = task.estado === 'En Acabados' ? 'a' : 'button';
                
                actionHtml = `
                    <${tag} ${onclick} id="btn-action-${task.id}" class="${primaryActionClass}">
                        <i data-lucide="${icon}" class="w-4 h-4 mr-1"></i> ${btnText}
                    </${tag}>
                `;
            } else {
                actionHtml = `<a href="#/calidad/${task.id}" class="${primaryActionClass}"><i data-lucide="eye" class="w-4 h-4 mr-1"></i> Ver</a>`;
            }

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-50';
            tr.innerHTML = `
                <td class="px-6 py-4 font-bold text-gray-900">${task.ot_id}</td>
                <td class="px-6 py-4 text-gray-500">${task.cliente}</td>
                <td class="px-6 py-4 text-gray-500">${task.producto}</td>
                <td class="px-6 py-4 font-bold text-gray-700">${task.estacion}</td>
                <td class="px-6 py-4"><span class="px-2 py-1 text-xs rounded-full ${task.badgeColor}">${task.estado}</span></td>
                <td class="px-6 py-4 text-center">${actionHtml}</td>
            `;
            tbody.appendChild(tr);
        });
        if (window.lucide) window.lucide.createIcons();
    },

    setupEvents() {
        document.getElementById('search-input')?.addEventListener('input', () => {
            this.currentPage = 1;
            this.applyFilters();
        });
    }
};