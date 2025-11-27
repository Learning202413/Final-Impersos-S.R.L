import supabase from '../../../../core/http/supabase.client.js';
import { log } from './local.db.js';

const getCurrentUser = () => {
    const session = localStorage.getItem('erp_session');
    return session ? JSON.parse(session) : { id: null, name: 'Anónimo' };
};

export const PostPrensaColaGeneralService = {
    async getIncomingTasks() {
        const { data, error } = await supabase
            .from('ordenes')
            .select(`id, ot_id, codigo, estado, clientes ( razon_social ), orden_items ( producto ), produccion_postprensa ( asignado_id )`)
            .eq('estado', 'En Post-Prensa');

        if (error) return [];

        const incoming = data.filter(o => {
            const fase = o.produccion_postprensa;
            if (!fase || fase.length === 0) return true;
            if (Array.isArray(fase)) return fase[0].asignado_id === null;
            return fase.asignado_id === null;
        });

        return incoming.map(o => ({
            id: o.id, 
            ot_id: (o.ot_id && o.ot_id !== 'PENDIENTE') ? o.ot_id : o.codigo,
            cliente: o.clientes?.razon_social,
            producto: o.orden_items[0]?.producto || 'Varios',
            estacion: 'Acabados Generales',
            estado: 'Listo para Acabados'
        }));
    },

    // VALIDACIÓN 5: Concurrencia
    async assignTaskToMe(ordenId) {
        const user = getCurrentUser();
        if (!user.id) return { success: false, message: "Usuario no identificado" };
        const now = new Date().toISOString();

        // Verificar si ya fue tomada por otro
        const { data: existing } = await supabase
            .from('produccion_postprensa')
            .select('asignado_id')
            .eq('orden_id', ordenId)
            .maybeSingle();

        if (existing && existing.asignado_id !== null) {
            return { success: false, message: "Otro operador acaba de tomar esta tarea." };
        }

        const { error } = await supabase
            .from('produccion_postprensa')
            .upsert({
                orden_id: ordenId,
                asignado_id: user.id,
                estado_fase: 'En Acabados',
                fecha_asignacion: now,
                checklist: { paso1: false, paso2: false, paso3: false } 
            }, { onConflict: 'orden_id' });

        if (!error) {
            await supabase.from('ordenes').update({ estado: 'En Acabados' }).eq('id', ordenId);
            log('TAREA_TOMADA_POST', `Post-Prensa asignada a ${user.name}`);
            return { success: true };
        }
        
        return { success: false, message: error.message };
    }
};