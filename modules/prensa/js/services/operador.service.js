/**
 * js/services/operador.service.js
 * Servicio de Operador de Prensa con Validaciones de Negocio.
 */
import supabase from '../../../../core/http/supabase.client.js';
import { log } from './local.db.js';

const getCurrentUser = () => {
    const session = localStorage.getItem('erp_session');
    return session ? JSON.parse(session) : { id: null, name: 'Operador' };
};

export const OperadorService = {
    async getTaskById(ordenId) {
        const { data, error } = await supabase
            .from('ordenes')
            .select(`
                *,
                clientes ( razon_social ),
                orden_items ( producto, especificaciones ),
                produccion_prensa ( * )
            `)
            .eq('id', ordenId)
            .single();

        if (error || !data) return null;

        const fase = (data.produccion_prensa && data.produccion_prensa[0]) 
            ? data.produccion_prensa[0] 
            : { estado_fase: 'Desconocido' };

        const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('es-PE') : null;

        return {
            id: data.id,
            ot_id: data.ot_id || data.codigo,
            cliente: data.clientes?.razon_social,
            producto: (data.orden_items && data.orden_items[0]) ? data.orden_items[0].producto : 'Varios',
            paper: (data.orden_items && data.orden_items[0]) ? data.orden_items[0].especificaciones : 'N/A',
            estado_prensa: data.estado, // Estado global sincronizado
            tiempos: {
                prep: fmtTime(fase.fecha_inicio_prep),
                print: fmtTime(fase.fecha_inicio_impresion)
            }
        };
    },

    // VALIDACIÓN 1: Integridad de Flujo (Check de Placas)
    async checkPrerequisites(ordenId) {
        // Verificamos si Pre-Prensa marcó el checklist final.
        // Asumimos que si el estado global llegó a "Asignada a Prensa", Pre-Prensa hizo su trabajo,
        // pero podemos hacer una doble verificación si tenemos acceso a la tabla 'produccion_preprensa'.
        const { data } = await supabase
            .from('produccion_preprensa')
            .select('checklist')
            .eq('orden_id', ordenId)
            .maybeSingle();
        
        if (data && data.checklist) {
            // Asumiendo que el paso 4 es "Generación de Placas"
            if (!data.checklist.step_4 && !data.checklist['4']) { 
                return { success: false, message: "Alerta: Pre-Prensa no ha marcado 'Placas Generadas' en el sistema." };
            }
        }
        return { success: true };
    },

    async startPreparation(ordenId) {
        const user = getCurrentUser();
        const now = new Date().toISOString();
        
        // Validación de Pre-requisitos
        const prereq = await this.checkPrerequisites(ordenId);
        if (!prereq.success) return prereq;

        // UPSERT para iniciar
        const { error } = await supabase.from('produccion_prensa')
            .upsert({ 
                orden_id: ordenId,
                asignado_id: user.id,
                estado_fase: 'En Preparación', 
                fecha_inicio_prep: now,
                fecha_asignacion: now 
            }, { onConflict: 'orden_id' });
        
        if (error) return { success: false, message: error.message };

        await supabase.from('ordenes').update({ estado: 'En Preparación' }).eq('id', ordenId);
        
        return { success: true };
    },

    async startPrinting(ordenId) {
        const user = getCurrentUser();
        const now = new Date().toISOString();

        // VALIDACIÓN 2: Estado Estricto
        // No se puede imprimir si no se ha preparado
        const { data: current } = await supabase
            .from('produccion_prensa')
            .select('estado_fase')
            .eq('orden_id', ordenId)
            .single();

        if (current?.estado_fase !== 'En Preparación') {
            return { success: false, message: "Debe iniciar la Preparación antes de Imprimir." };
        }

        const { error } = await supabase.from('produccion_prensa')
            .update({ 
                estado_fase: 'Imprimiendo', 
                fecha_inicio_impresion: now 
            })
            .eq('orden_id', ordenId);

        if (error) return { success: false, message: error.message };

        await supabase.from('ordenes').update({ estado: 'Imprimiendo' }).eq('id', ordenId);
        
        return { success: true };
    },

    async reportIncident(ordenId, details, type) {
        const user = getCurrentUser();
        const { error } = await supabase.from('incidencias').insert({
            orden_id: ordenId,
            tipo: type,
            detalle: details,
            reportado_por: user.id,
            fecha_reporte: new Date().toISOString()
        });
        
        if (!error) log('INCIDENCIA_PRENSA', `${type}: ${details}`);
        return { success: !error };
    },

    async finishJob(ordenId, consumo, desperdicio) {
        const now = new Date().toISOString();
        const user = getCurrentUser();
        const consumoInt = parseInt(consumo) || 0;
        const desperdicioInt = parseInt(desperdicio) || 0;

        // VALIDACIÓN 3: Estado previo correcto
        const { data: current } = await supabase
            .from('produccion_prensa')
            .select('estado_fase, fecha_inicio_impresion')
            .eq('orden_id', ordenId)
            .single();

        if (current?.estado_fase !== 'Imprimiendo') {
            return { success: false, message: "La orden no está en estado de impresión activa." };
        }

        // VALIDACIÓN 4: Coherencia de Insumos
        if (desperdicioInt >= consumoInt) {
            return { success: false, message: "El desperdicio no puede ser mayor o igual al consumo total." };
        }
        if (consumoInt <= 0) {
            return { success: false, message: "El consumo debe ser mayor a cero." };
        }

        // VALIDACIÓN 5: Tiempo Mínimo (Anti-Click accidental)
        const startTime = new Date(current.fecha_inicio_impresion).getTime();
        const endTime = new Date().getTime();
        const minutesDiff = (endTime - startTime) / 60000;
        
        if (minutesDiff < 1) { // Menos de 1 minuto
             // No bloqueamos, pero podríamos registrar un warning en el log
             log('ALERTA_TIEMPO', `Orden ${ordenId} finalizada en ${minutesDiff.toFixed(1)} min.`);
        }
        
        // 1. Cerrar Prensa
        const { error: errPrensa } = await supabase
            .from('produccion_prensa')
            .update({ 
                estado_fase: 'Completado',
                fecha_fin_prensa: now,
                consumo_papel: consumoInt,
                desperdicio_papel: desperdicioInt
            })
            .eq('orden_id', ordenId);

        if (errPrensa) return { success: false, message: "Error DB Prensa: " + errPrensa.message };

        // 2. Inicializar Post-Prensa
        const { error: errPost } = await supabase
            .from('produccion_postprensa')
            .upsert({ 
                orden_id: ordenId,
                estado_fase: 'Pendiente', 
                checklist: { paso1: false, paso2: false, paso3: false },
                asignado_id: null,
                fecha_asignacion: now
            }, { onConflict: 'orden_id' });

        if (errPost) return { success: false, message: "Error iniciando Acabados" };

        // 3. Actualizar Global
        await supabase.from('ordenes').update({ estado: 'En Post-Prensa' }).eq('id', ordenId);

        log('FIN_IMPRESION', `Orden ${ordenId} finalizada. Consumo: ${consumoInt}, Merma: ${desperdicioInt}`);
        return { success: true };
    }
};