/**
 * js/services/calidad.service.js (Post-Prensa)
 * Servicio con Validaciones de Negocio (Secuencia, QC, Finalización).
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
        // Leer estado actual real de la BD para evitar fraudes desde consola
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

        if (stepKey === 'paso3') {
            updates.estado_fase = 'En Control de Calidad';
            updates.fecha_inicio_calidad = now;
            globalStatus = 'En Control de Calidad';
        }

        const { error } = await supabase.from('produccion_postprensa').update(updates).eq('orden_id', ordenId);

        if (error) return { success: false, message: error.message };

        if (globalStatus) {
            await supabase.from('ordenes').update({ estado: globalStatus }).eq('id', ordenId);
        }

        return { success: true, avance_postprensa: newChecklist };
    },

    // VALIDACIÓN 2: Integridad Final (QC Check)
    async completeOrder(ordenId) {
        // Verificar que realmente esté en paso 3
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

        if (!error) log('ORDEN_COMPLETADA', `Orden ${ordenId} liberada por Post-Prensa.`);
        return { success: !error };
    }
};