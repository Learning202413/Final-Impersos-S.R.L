/**
 * js/services/orden.detalle.service.js
 * Gestión de creación/edición de Órdenes y Cotizaciones en Supabase.
 */
import supabase from '../../../../core/http/supabase.client.js';
import { log } from './local.db.js';

export const OrdenDetalleService = {
    
    async getOrderById(id) {
        const { data, error } = await supabase
            .from('ordenes')
            .select(`
                *,
                clientes ( id, razon_social, ruc_dni ),
                orden_items ( * )
            `)
            .eq('id', id)
            .single();

        if (error || !data) return null;

        // Adaptador para el controlador
        return {
            ...data,
            cliente_nombre: data.clientes?.razon_social,
            cliente_ruc: data.clientes?.ruc_dni, // Útil si se necesitara
            items: data.orden_items.map(i => ({
                ...i,
                precio: i.precio_unitario, // Adaptador precio_unitario -> precio
                specs: i.especificaciones  // Adaptador especificaciones -> specs
            }))
        };
    },

    async createOrder(orderData) {
        try {
            // --- CAMBIO AQUÍ: GENERACIÓN DE CÓDIGO ---
            
            // 1. Llamamos a la función segura de Supabase para obtener el siguiente COT
            const { data: newCode, error: rpcError } = await supabase
                .rpc('generar_codigo', { tipo_doc: 'COT' });

            if (rpcError) {
                console.error("Error generando correlativo:", rpcError);
                throw new Error("No se pudo generar el número de cotización");
            }

            // -----------------------------------------

            // 2. Insertar Cabecera usando el código generado (newCode)
            const { data: newOrder, error: orderError } = await supabase
                .from('ordenes')
                .insert({
                    codigo: newCode, // <--- Usamos COT-2025-XXXXX
                    ot_id: 'PENDIENTE',
                    cliente_id: orderData.cliente_id,
                    estado: 'En Negociación', // Estado inicial correcto para cotización
                    total: orderData.total,
                    notas: orderData.notas,
                    fecha_creacion: new Date().toISOString()
                })
                .select()
                .single();

            if (orderError) throw orderError;

            // 3. Insertar Ítems (Sin cambios)
            if (orderData.items && orderData.items.length > 0) {
                const itemsToInsert = orderData.items.map(i => ({
                    orden_id: newOrder.id,
                    producto: i.producto,
                    cantidad: i.cantidad,
                    especificaciones: i.specs,
                    precio_unitario: i.precio,
                    subtotal: i.subtotal
                }));

                const { error: itemsError } = await supabase
                    .from('orden_items')
                    .insert(itemsToInsert);
                
                if (itemsError) console.warn("Error guardando items:", itemsError);
            }

            log('COTIZACION_CREADA', `Cotización generada: ${newCode}`);
            return { success: true, id: newOrder.id };

        } catch (error) {
            console.error("Error creando orden:", error);
            return { success: false, message: error.message };
        }
    },

    async updateOrder(id, updates) {
        // 1. Actualizar Cabecera
        const dbUpdates = {
            total: updates.total,
            notas: updates.notas,
            cliente_id: updates.cliente_id,
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('ordenes')
            .update(dbUpdates)
            .eq('id', id);

        if (error) return { success: false, message: error.message };

        // 2. Actualizar Ítems (Estrategia: Borrar anteriores e insertar nuevos)
        // Esto asegura que si el usuario borró una línea, se refleje.
        if (updates.items) {
            await supabase.from('orden_items').delete().eq('orden_id', id);
            
            const newItems = updates.items.map(i => ({
                orden_id: id,
                producto: i.producto,
                cantidad: i.cantidad,
                especificaciones: i.specs,
                precio_unitario: i.precio,
                subtotal: i.subtotal
            }));
            
            await supabase.from('orden_items').insert(newItems);
        }

        log('ORDEN_ACTUALIZADA', `ID: ${id}`);
        return { success: true };
    },

    async convertToOT(id) {
        try {
            // 1. Generar Código OT correlativo desde la BD (Ej: OT-2025-00000001)
            const { data: otId, error: rpcError } = await supabase
                .rpc('generar_codigo', { tipo_doc: 'OT' });

            if (rpcError) {
                console.error("Error generando OT ID:", rpcError);
                throw new Error("No se pudo generar el correlativo de OT");
            }

            // 2. Actualizar la orden existente
            const { error } = await supabase
                .from('ordenes')
                .update({
                    ot_id: otId, // <--- Guardamos el código generado
                    estado: 'Orden creada', // Estado inicial para producción
                    fecha_asignacion_global: new Date().toISOString() // Marca de tiempo
                })
                .eq('id', id);

            if (error) throw error;

            log('CONVERSION_OT', `Cotización convertida a ${otId}`);
            return { success: true, otId };

        } catch (error) {
            console.error("Error al convertir a OT:", error);
            return { success: false, message: error.message };
        }
    },
};