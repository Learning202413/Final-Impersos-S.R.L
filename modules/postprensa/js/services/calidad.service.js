/**
 * js/services/calidad.service.js (Post-Prensa)
 * Servicio con Validaciones de Negocio y Logs de Calidad.
 */
import supabase from '../../../../core/http/supabase.client.js';
import { log } from './local.db.js';

export const CalidadService = {
    
    async getTaskData(ordenId) {
        const { data, error } = await supabase
            .from('ordenes')
            .select(`*, clientes ( razon_social ), orden_items ( producto, especificaciones ), produccion_postprensa ( * )`)
            .eq('id', ordenId)
            .single();

        if (error || !data) return null;

        const fase = (data.produccion_postprensa && data.produccion_postprensa[0]) 
            ? data.produccion_postprensa[0] : null;

        const defaultChecklist = { paso1: false, paso2: false, paso3: false };
        const dbChecklist = (fase && fase.checklist) ? fase.checklist : {};
        const finalChecklist = { ...defaultChecklist, ...dbChecklist };

        return {
            id: data.id,
            ot_id: data.ot_id || data.codigo,
            cliente_nombre: data.clientes?.razon_social,
            items: [{ producto: data.orden_items[0]?.producto, specs: data.orden_items[0]?.especificaciones }],
            estado: data.estado,
            avance_postprensa: finalChecklist
        };
    },

    // VALIDACIÓN 1: Secuencia Estricta del Checklist
    async updateStep(ordenId, stepKey, currentAvance) {
        const { data: fase } = await supabase.from('produccion_postprensa').select('checklist').eq('orden_id', ordenId).single();
        const safeAvance = { paso1: false, paso2: false, paso3: false, ...fase.checklist };

        // Reglas de dependencia
        if (stepKey === 'paso2' && !safeAvance.paso1) {
            return { success: false, message: "Debes completar el Corte (Paso 1) antes del Engrapado." };
        }
        if (stepKey === 'paso3' && !safeAvance.paso2) {
            return { success: false, message: "Debes completar el Engrapado (Paso 2) antes de Empaquetar." };
        }

        const newChecklist = { ...safeAvance, [stepKey]: true };
        const now = new Date().toISOString();
        
        let updates = { checklist: newChecklist };
        let globalStatus = null;

        // Actualización de estados según progreso
        if (stepKey === 'paso3') {
            updates.estado_fase = 'En Control de Calidad';
            updates.fecha_inicio_calidad = now;
            globalStatus = 'En Control de Calidad';
        } else {
            // Si marcamos paso 1 o 2, aseguramos que el estado sea 'En Acabados'
            updates.estado_fase = 'En Acabados';
            if (!safeAvance.paso1 && !safeAvance.paso2) { // Si es la primera acción
                 updates.fecha_inicio_acabados = now;
            }
        }

        const { error } = await supabase.from('produccion_postprensa').update(updates).eq('orden_id', ordenId);

        if (error) return { success: false, message: error.message };

        if (globalStatus) {
            await supabase.from('ordenes').update({ estado: globalStatus }).eq('id', ordenId);
        }

        // --- NUEVO LOG UNIFICADO ---
        // Registramos avance si se completa un paso físico (1 o 2)
        if (stepKey === 'paso1' || stepKey === 'paso2') {
            log('EN_ACABADOS', `Avance registrado en procesos de terminación (Paso: ${stepKey} completado).`);
        }
        // ---------------------------

        return { success: true, avance_postprensa: newChecklist };
    },

    // --- NUEVAS FUNCIONES DE CALIDAD ---
    
    async approveQualityCheck(ordenId) {
        // Solo registramos el log de la decisión humana
        await log('CALIDAD_APROBADA', `Inspector validó la calidad del producto terminado. OT: ${ordenId}`);
        return { success: true };
    },

    async rejectQualityCheck(ordenId, comments) {
        // Registramos el rechazo y el motivo
        await log('CALIDAD_RECHAZADA', `Producto rechazado en QC. Motivo: ${comments}. OT: ${ordenId}`);
        return { success: true };
    },

    // -----------------------------------

    // VALIDACIÓN 2: Integridad Final
    async completeOrder(ordenId) {
        const { data: fase } = await supabase.from('produccion_postprensa').select('checklist, estado_fase').eq('orden_id', ordenId).single();
        
        if (!fase.checklist?.paso3) {
            return { success: false, message: "No se puede finalizar. Falta completar el empaquetado." };
        }
        if (fase.estado_fase === 'Completado') {
            return { success: false, message: "Esta orden ya fue finalizada anteriormente." };
        }

        const now = new Date().toISOString();
        
        await supabase.from('produccion_postprensa')
            .update({ estado_fase: 'Completado', fecha_fin_proceso: now })
            .eq('orden_id', ordenId);

        const { error } = await supabase.from('ordenes')
            .update({ estado: 'Completado', fecha_asignacion_global: null }) 
            .eq('id', ordenId);

        if (!error) log('ORDEN_COMPLETADA', `Orden ${ordenId} liberada por Post-Prensa para despacho.`);
        return { success: !error };
    }
};