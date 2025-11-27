/**
 * js/controllers/operador.controller.js
 * Controlador con Validaciones de UI y Feedback.
 */
import { OperadorService } from '../services/operador.service.js';

export const OperadorController = {
    currentTaskId: null,

    init: async function(params) {
        this.currentTaskId = params[0];
        if (this.currentTaskId) {
            await this.loadData();
            this.setupEvents();
        }
    },

    async loadData() {
        const task = await OperadorService.getTaskById(this.currentTaskId);
        if (!task) return;

        document.getElementById('task-ot-id').textContent = task.ot_id;
        document.getElementById('ot-header').textContent = `Terminal: ${task.ot_id}`;
        document.getElementById('task-client').textContent = task.cliente || '-';
        document.getElementById('task-product').textContent = task.producto || '-';
        document.getElementById('task-paper').textContent = task.paper || '-';

        const isPrepStarted = task.tiempos.prep || task.estado_prensa === 'En Preparación';
        const isPrintStarted = task.tiempos.print || task.estado_prensa === 'Imprimiendo';
        const isFinished = task.estado_prensa === 'En Post-Prensa' || task.estado_prensa === 'Completado';

        if (isPrepStarted) {
            document.getElementById('time-prep-start').textContent = task.tiempos.prep || 'Iniciado';
            const btnPrep = document.getElementById('btn-start-prep');
            btnPrep.disabled = true; 
            btnPrep.classList.add('opacity-50', 'cursor-not-allowed'); 
            
            const btnPrint = document.getElementById('btn-start-print');
            if (!isPrintStarted) {
                btnPrint.disabled = false;
                btnPrint.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }

        if (isPrintStarted) {
            document.getElementById('time-print-start').textContent = task.tiempos.print || 'Iniciado';
            const btnPrint = document.getElementById('btn-start-print');
            btnPrint.disabled = true; 
            btnPrint.classList.add('opacity-50', 'cursor-not-allowed'); 
            
            const btnFinish = document.getElementById('btn-finish-job');
            if (!isFinished) {
                btnFinish.disabled = false;
                btnFinish.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }
    },

    setupEvents() {
        const id = this.currentTaskId;

        // 1. BOTÓN PREPARACIÓN
        document.getElementById('btn-start-prep')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-start-prep');
            const originalContent = btn.innerHTML;
            
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="w-6 h-6 animate-spin"></i>';
            if(window.lucide) window.lucide.createIcons();

            const res = await OperadorService.startPreparation(id);
            
            if (res.success) {
                if(window.UI) window.UI.showNotification('Iniciado', 'Preparación de máquina registrada.');
                this.loadData(); 
            } else {
                if(window.UI) window.UI.showNotification('Error', res.message);
                btn.disabled = false;
                btn.innerHTML = originalContent;
            }
        });

        // 2. BOTÓN IMPRESIÓN
        document.getElementById('btn-start-print')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-start-print');
            const originalContent = btn.innerHTML;
            
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="w-6 h-6 animate-spin"></i>';
            if(window.lucide) window.lucide.createIcons();

            const res = await OperadorService.startPrinting(id);
            
            if (res.success) {
                if(window.UI) window.UI.showNotification('Imprimiendo', 'La producción ha comenzado.');
                this.loadData();
            } else {
                if(window.UI) window.UI.showNotification('Error', res.message);
                btn.disabled = false;
                btn.innerHTML = originalContent;
            }
        });

        // 3. BOTÓN FINALIZAR (Abre Modal)
        document.getElementById('btn-finish-job')?.addEventListener('click', () => {
            if (window.showFinishModal) window.showFinishModal();
        });

        // 4. Manejo de Submit de Modales
        if (this._submitHandler) document.body.removeEventListener('submit', this._submitHandler);

        this._submitHandler = async (e) => {
            // Formulario Finalizar
            if (e.target && e.target.id === 'finish-form') {
                e.preventDefault();
                
                // Validación UI rápida antes de enviar
                const consumo = document.getElementById('consumo-real')?.value;
                const desperdicio = document.getElementById('desperdicio')?.value;
                
                if (!consumo || parseInt(consumo) <= 0) {
                    if(window.UI) window.UI.showNotification('Atención', 'Ingrese un consumo válido.');
                    return;
                }

                const btn = document.getElementById('confirm-finish-button');
                const originalText = btn.innerHTML;
                btn.disabled = true; btn.textContent = 'Validando...';

                // Llamada al servicio con validaciones de negocio
                const res = await OperadorService.finishJob(id, consumo, desperdicio);

                if (res.success) {
                    if(window.hideFinishModal) window.hideFinishModal();
                    if(window.UI) window.UI.showNotification('Finalizado', 'OT completada y enviada a Acabados.');
                    setTimeout(() => window.location.hash = '#/cola', 1500);
                } else {
                    // Error de validación (ej. desperdicio > consumo)
                    if(window.UI) window.UI.showNotification('Error Validación', res.message);
                    btn.disabled = false; btn.innerHTML = originalText;
                }
            }

            // Formulario Incidencia
            if (e.target && e.target.id === 'incident-form') {
                e.preventDefault();
                const type = document.getElementById('incident-type')?.value;
                const details = document.getElementById('incident-details')?.value;
                
                if (!details) {
                    if(window.UI) window.UI.showNotification('Atención', 'Detalle la incidencia.');
                    return;
                }

                const res = await OperadorService.reportIncident(id, details, type);
                
                if (res.success) {
                    if(window.hideIncidentModal) window.hideIncidentModal();
                    if(window.UI) window.UI.showNotification('Reportado', 'Incidencia registrada en bitácora.');
                } else {
                    if(window.UI) window.UI.showNotification('Error', 'Error al guardar incidencia.');
                }
            }
        };
        document.body.addEventListener('submit', this._submitHandler);
    }
};