import { CalidadService } from '../services/calidad.service.js';

export const CalidadController = {
    currentTaskId: null,
    taskData: null,

    init: async function(params) {
        this.currentTaskId = params[0];
        if (this.currentTaskId) {
            this.taskData = await CalidadService.getTaskData(this.currentTaskId); 
            await this.renderView();
            this.setupEvents();
        }
    },

    async renderView() {
        const task = this.taskData;
        if (!task) return;

        document.getElementById('ot-header').textContent = `Control de Calidad: ${task.ot_id}`;
        document.getElementById('client-name').textContent = task.cliente_nombre || '-';
        if(task.items && task.items.length > 0) {
             document.getElementById('product-name').textContent = task.items[0].producto;
             document.getElementById('product-specs').textContent = task.items[0].specs || 'N/A';
        }

        if (!task.avance_postprensa) task.avance_postprensa = { paso1: false, paso2: false, paso3: false };
        
        this.updateStepButton('btn-step-1', 1, task.avance_postprensa.paso1);
        this.updateStepButton('btn-step-2', 2, task.avance_postprensa.paso2);
        this.updateStepButton('btn-step-3', 3, task.avance_postprensa.paso3);

        // Habilitación visual
        if (task.avance_postprensa.paso1 && !task.avance_postprensa.paso2) {
            document.getElementById('btn-step-2')?.removeAttribute('disabled');
        }
        if (task.avance_postprensa.paso2 && !task.avance_postprensa.paso3) {
            document.getElementById('btn-step-3')?.removeAttribute('disabled');
        }

        this.checkQCVisibility();
    },

    updateStepButton(btnId, stepNum, isDone) {
        const btn = document.getElementById(btnId);
        const iconEl = document.getElementById(`icon-step-${stepNum}`);
        if (!btn) return;

        if (isDone) {
            btn.disabled = true;
            btn.textContent = 'Terminado';
            btn.className = 'mt-2 px-4 py-2 bg-green-600 text-white font-semibold rounded-lg shadow-md cursor-not-allowed';
            if(iconEl) {
                iconEl.className = 'absolute flex items-center justify-center w-8 h-8 bg-green-200 rounded-full -left-4 ring-8 ring-white';
                iconEl.innerHTML = '<i data-lucide="check" class="w-5 h-5 text-green-700"></i>';
            }
        }
    },

    checkQCVisibility() {
        const avance = this.taskData.avance_postprensa;
        if (avance && avance.paso1 && avance.paso2 && avance.paso3) {
            document.getElementById('qc-section')?.classList.remove('hidden');
            document.getElementById('qc-waiting-msg')?.classList.add('hidden');
        } else {
            document.getElementById('qc-section')?.classList.add('hidden');
            document.getElementById('qc-waiting-msg')?.classList.remove('hidden');
        }
        if(window.lucide) window.lucide.createIcons();
    },

    async handleStepClick(stepKey, btnId) {
        const btn = document.getElementById(btnId);
        const originalHtml = btn.innerHTML;
        
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin inline mr-2"></i> Guardando...';
        if(window.lucide) window.lucide.createIcons();

        const response = await CalidadService.updateStep(this.currentTaskId, stepKey, this.taskData.avance_postprensa);
        
        if (response.success) {
            // Actualizar estado local
            this.taskData.avance_postprensa = response.avance_postprensa;
            this.renderView();
            
            if(stepKey === 'paso1') window.UI.showNotification('Avance', 'Corte completado.');
            if(stepKey === 'paso2') window.UI.showNotification('Avance', 'Encolado completado.');
            if(stepKey === 'paso3') window.UI.showNotification('Fase Productiva', 'Habilitando Control de Calidad...');
        } else {
            // Error de validación o red
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            window.UI.showNotification('Bloqueo de Flujo', response.message);
        }
    },

    setupEvents() {
        document.getElementById('btn-step-1')?.addEventListener('click', () => this.handleStepClick('paso1', 'btn-step-1'));
        document.getElementById('btn-step-2')?.addEventListener('click', () => this.handleStepClick('paso2', 'btn-step-2'));
        document.getElementById('btn-step-3')?.addEventListener('click', () => this.handleStepClick('paso3', 'btn-step-3'));

        // Aprobación de QC
        document.getElementById('btn-approve-qc')?.addEventListener('click', () => {
            // Validar que checkboxes estén marcados (Idea 2 implementada)
            const checks = document.querySelectorAll('#qc-section input[type="checkbox"]');
            const allChecked = Array.from(checks).every(c => c.checked);
            
            if (!allChecked) {
                window.UI.showNotification('Control de Calidad', 'Debe marcar todos los puntos de control para aprobar.');
                return;
            }

            document.getElementById('decision-buttons').classList.add('hidden');
            document.getElementById('btn-complete-order').classList.remove('hidden');
            window.UI.showNotification('Calidad Aprobada', 'Liberación autorizada. Finalice la orden.');
        });

        // Rechazo de QC
        document.getElementById('btn-reject-qc')?.addEventListener('click', () => {
            const comments = document.querySelector('#qc-section textarea').value.trim();
            if (!comments) {
                window.UI.showNotification('Atención', 'Debe ingresar un comentario explicando el motivo del rechazo.');
                return;
            }
            window.UI.showNotification('Reportado', 'Incidencia notificada a Producción.');
        });

        // Finalizar Orden (Punto de No Retorno)
        document.getElementById('btn-complete-order')?.addEventListener('click', () => {
             window.UI.showConfirmModal(
                 'Finalizar Orden',
                 '¿Está seguro de liberar esta orden para despacho? Esta acción cerrará el flujo productivo.',
                 'Sí, Finalizar',
                 async () => {
                     const btn = document.getElementById('btn-complete-order');
                     btn.disabled = true; btn.innerHTML = 'Finalizando...';

                     const result = await CalidadService.completeOrder(this.currentTaskId);
                     
                     if (result.success) {
                         window.UI.showNotification('Completado', 'Orden enviada a despacho/almacén.');
                         setTimeout(() => window.location.hash = '#/cola', 1500);
                     } else {
                         btn.disabled = false; btn.innerHTML = 'Empaquetar y Completar';
                         window.UI.showNotification('Error', result.message || 'No se pudo finalizar.');
                     }
                 }
             );
        });
    }
};