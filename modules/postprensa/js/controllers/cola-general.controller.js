import { PostPrensaColaGeneralService } from '../services/cola-general.service.js';

export const ColaGeneralController = {
    currentPage: 1,
    itemsPerPage: 10,
    allTasks: [], 

    init: async function() {
        console.log("ColaGeneralController (Post-Prensa) inicializado.");
        await this.loadTasks();
        this.setupEvents();
    },

    async loadTasks() {
        const tableBody = document.getElementById('tasks-table-body');
        if (tableBody) tableBody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-gray-500 italic bg-gray-50">Cargando tareas...</td></tr>';
        const tasks = await PostPrensaColaGeneralService.getIncomingTasks();
        this.allTasks = tasks || [];
        this.applyFilters();
    },

    applyFilters() {
        const searchTerm = document.getElementById('search-general-input')?.value.toLowerCase() || '';
        const filtered = this.allTasks.filter(task => 
            (task.ot_id && task.ot_id.toLowerCase().includes(searchTerm)) || 
            (task.cliente && task.cliente.toLowerCase().includes(searchTerm))
        );
        // Renderizado simplificado
        this.renderTable(filtered);
    },

    renderTable(tasks) {
        const tableBody = document.getElementById('tasks-table-body');
        if (!tableBody) return;
        tableBody.innerHTML = '';

        if (tasks.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-500 italic bg-gray-50">No hay tareas pendientes.</td></tr>`;
            return;
        }

        tasks.forEach(task => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50 transition duration-150 group';
            row.dataset.otId = task.id;
            row.innerHTML = `
                <td class="px-6 py-4 font-bold text-gray-900">${task.ot_id}</td>
                <td class="px-6 py-4 text-gray-500">${task.cliente}</td>
                <td class="px-6 py-4 font-bold text-gray-700">${task.estacion}</td>
                <td class="px-6 py-4 text-gray-500">${task.producto}</td>
                <td class="px-6 py-4"><span class="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Listo</span></td>
                <td class="px-6 py-4 text-center">
                    <button class="btn-take-task px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition">Tomar</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
        if(window.lucide) window.lucide.createIcons();
    },

    setupEvents() {
        document.getElementById('search-general-input')?.addEventListener('input', () => this.applyFilters());

        document.getElementById('tasks-table-body')?.addEventListener('click', async (e) => {
            const btn = e.target.closest('.btn-take-task');
            if (btn) {
                const row = btn.closest('tr');
                const id = row.dataset.otId;
                
                btn.disabled = true;
                btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin w-3 h-3"></i>';
                if(window.lucide) window.lucide.createIcons();

                const res = await PostPrensaColaGeneralService.assignTaskToMe(id);

                if (res.success) {
                    window.UI.showNotification('Tarea Asignada', 'Trabajo movido a "Mis Tareas".');
                    row.remove();
                    await this.loadTasks();
                } else {
                    window.UI.showNotification('Error', res.message);
                    btn.disabled = false;
                    btn.textContent = 'Tomar';
                }
            }
        });
    }
};