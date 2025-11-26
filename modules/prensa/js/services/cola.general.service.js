/**
 * js/services/cola.general.service.js
 * Servicio con Validación de Concurrencia.
 */
import supabase from '../../../../core/http/supabase.client.js';
import { log } from './local.db.js';

const getCurrentUser = () => {
    const session = localStorage.getItem('erp_session');
    return session ? JSON.parse(session) : { id: null, name: 'Anónimo' };
};

export const ColaGeneralService = {
    async getIncomingTasks() {
        const { data, error } = await supabase
            .from('ordenes')
            .select(`
                id, ot_id, codigo, estado,
                clientes ( razon_social ),
                orden_items ( producto ),
                produccion_prensa ( asignado_id )
            `)
            .eq('estado', 'En prensa');

        if (error) {
            console.error("Error cargando cola general:", error);
            return [];
        }

        const incoming = data.filter(o => {
            const fase = o.produccion_prensa;
            if (!fase || fase.length === 0) return true;
            if (Array.isArray(fase)) return fase[0].asignado_id === null;
            return fase.asignado_id === null;
        });

        return incoming.map(o => ({
            id: o.id,
            ot_id: (o.ot_id && o.ot_id !== 'PENDIENTE') ? o.ot_id : o.codigo,
            cliente: o.clientes?.razon_social || 'General',
            maquina: 'Offset-A (Sugerida)',
            producto: (o.orden_items && o.orden_items[0]) ? o.orden_items[0].producto : 'Varios',
            estado: 'Listo para Impresión'
        }));
    },

    // VALIDACIÓN 6: Concurrencia (Evitar race condition)
    async assignTaskToMe(ordenId) {
        const user = getCurrentUser();
        if (!user.id) return { success: false, message: "Usuario no identificado" };
        const now = new Date().toISOString();

        // Intentamos actualizar SOLO si asignado_id es nulo (o no existe el registro)
        // Primero verificamos si existe registro "huerfano" en produccion_prensa
        const { data: existing } = await supabase
            .from('produccion_prensa')
            .select('id, asignado_id')
            .eq('orden_id', ordenId)
            .maybeSingle();

        if (existing && existing.asignado_id !== null) {
            // Alguien lo tomó milisegundos antes
            return { success: false, message: "Esta tarea acaba de ser tomada por otro operador." };
        }

        // Si llegamos aquí, está libre. Hacemos UPSERT seguro.
        const { error } = await supabase
            .from('produccion_prensa')
            .upsert({
                orden_id: ordenId,
                asignado_id: user.id,
                estado_fase: 'Asignada a Prensa',
                fecha_asignacion: now,
                maquina_asignada: 'Offset-A'
            }, { onConflict: 'orden_id' });

        if (error) return { success: false, message: error.message };

        await supabase.from('ordenes').update({ estado: 'Asignada a Prensa' }).eq('id', ordenId);
        
        log('TAREA_TOMADA_PRENSA', `Operador ${user.name} tomó la orden ${ordenId}`);
        return { success: true };
    }
};