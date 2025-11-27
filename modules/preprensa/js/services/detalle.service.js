/**
 * js/services/detalle.service.js
 * Servicio Ajustado con Trazabilidad Completa (Logs).
 */
import supabase from '../../../../core/http/supabase.client.js';
import { log } from './local.db.js'; // Importamos el logger

export const DetalleService = {
    
    // Obtener la tarea y datos generales
    async getTaskById(ordenId) {
        const { data: orden, error: errorOrden } = await supabase
            .from('ordenes')
            .select(`
                *,
                clientes ( razon_social ),
                orden_items ( producto, especificaciones )
            `)
            .eq('id', ordenId)
            .single();

        if (errorOrden || !orden) {
            console.error("[Service] Error cargando orden:", errorOrden);
            return null;
        }

        // Obtener datos de la Fase (Pre-Prensa)
        const { data: fase } = await supabase
            .from('produccion_preprensa')
            .select('*')
            .eq('orden_id', ordenId)
            .maybeSingle();

        // Combinar datos
        return {
            ...orden,
            cliente: orden.clientes?.razon_social,
            producto: orden.orden_items?.[0]?.producto,
            specs: orden.orden_items?.[0]?.especificaciones,
            fase_id: fase?.id,
            checklist: fase?.checklist || {},
            estado_fase: fase?.estado_fase
        };
    },

    async getArchivos(ordenId) {
        const { data } = await supabase
            .from('orden_archivos')
            .select('*')
            .eq('orden_id', ordenId)
            .order('created_at', { ascending: false });
        return data || [];
    },

    async getHistorialChat(ordenId) {
        const { data } = await supabase
            .from('orden_comentarios')
            .select('*')
            .eq('orden_id', ordenId)
            .order('created_at', { ascending: true });
        return data || [];
    },

    // Subir Prueba de Diseño y Solicitar Aprobación
    async subirPruebaYEnvar(ordenId, file) {
        try {
            const fileName = `${ordenId}/PRUEBA_${Date.now()}_${file.name}`;
            const { error: uploadError } = await supabase.storage
                .from('ordenes-files')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('ordenes-files')
                .getPublicUrl(fileName);

            const { error: dbError } = await supabase
                .from('orden_archivos')
                .insert({
                    orden_id: ordenId,
                    tipo_emisor: 'DISENADOR',
                    nombre_archivo: file.name,
                    url_archivo: urlData.publicUrl,
                    version: 1 
                });

            if (dbError) throw dbError;

            // Actualizar Estado Global
            await supabase
                .from('ordenes')
                .update({ estado: 'En Aprobación de Cliente' })
                .eq('id', ordenId);

            // Marcar paso 3 en checklist
            await this.updateChecklist(ordenId, 3, true);

            // --- NUEVO LOG ---
            log('PRUEBA_ENVIADA', `Prueba digital (${file.name}) enviada al cliente para aprobación.`);
            // -----------------

            return { success: true };

        } catch (error) {
            console.error("Error subiendo prueba:", error);
            return { success: false, message: error.message };
        }
    },

    // Actualizar checklist (Pasos 1, 2, 4)
    async updateChecklist(ordenId, stepIndex, isChecked) {
        const { data: fase } = await supabase
            .from('produccion_preprensa')
            .select('checklist')
            .eq('orden_id', ordenId)
            .single();

        const newChecklist = fase?.checklist || {};
        newChecklist[`step_${stepIndex}`] = isChecked;

        const { error } = await supabase
            .from('produccion_preprensa')
            .update({ checklist: newChecklist })
            .eq('orden_id', ordenId);

        // --- NUEVOS LOGS DE PROCESO TÉCNICO ---
        if (!error && isChecked) {
            if (stepIndex === 2) {
                log('REVISION_TECNICA_COMPLETADA', `Archivos validados técnicamente. Listos para prueba.`);
            }
            if (stepIndex === 4) {
                log('PLACAS_GENERADAS', `Juego de placas CTP generado correctamente.`);
            }
        }
        // --------------------------------------

        return { success: !error, error };
    },

    // Finalizar fase y pasar a Prensa
    async completeTask(ordenId) {
        const now = new Date().toISOString();
        
        // 1. Cerrar Pre-Prensa
        await supabase
            .from('produccion_preprensa')
            .update({ estado_fase: 'Completado', fecha_pase_prensa: now })
            .eq('orden_id', ordenId);

        // 2. Crear registro en Prensa
        await supabase
            .from('produccion_prensa') // Nota: Asumiendo que la tabla destino es produccion_prensa (maquinistas)
            .upsert({ 
                orden_id: ordenId,
                estado_fase: 'Pendiente',
                asignado_id: null, // Queda libre en la cola
                fecha_asignacion: now
            }, { onConflict: 'orden_id' });

        // 3. Actualizar Orden Global
        await supabase
            .from('ordenes')
            .update({ estado: 'En prensa' }) 
            .eq('id', ordenId);

        // --- NUEVO LOG DE CAMBIO DE ÁREA ---
        log('ENVIADA_A_PRENSA', `Diseño finalizado. Orden transferida a cola de impresión.`);
        // -----------------------------------

        return { success: true };
    }
};