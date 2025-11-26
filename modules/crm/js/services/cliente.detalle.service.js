/**
 * js/services/cliente.detalle.service.js
 * Servicio de Clientes.
 * CORREGIDO: Filtrado de campos inexistentes y detección de duplicados (23505).
 */
import supabase from '../../../../core/http/supabase.client.js';
import { log } from './local.db.js';

const API_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImNqYXp6dGluN0BnbWFpbC5jb20ifQ.5NcXq2oQNzTUSEHiGwzZvCqY57fktdSPdBx9kjkXw8k';

export const ClienteDetalleService = {
    
    async consultarDocumento(numero) {
        if (!numero) return { success: false, message: 'Ingrese un número.' };
        
        const type = numero.length === 8 ? 'dni' : (numero.length === 11 ? 'ruc' : null);
        if (!type) return { success: false, message: 'Longitud inválida.' };

        try {
            const url = `https://dniruc.apisperu.com/api/v1/${type}/${numero}?token=${API_TOKEN}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Error API externa');
            const data = await response.json();

            if (data.success === false) return { success: false, message: 'Documento no encontrado.' };
            return { success: true, data: data, tipo: type };
        } catch (error) {
            console.error("Error API:", error);
            return { success: false, message: 'Error de conexión.' };
        }
    },

    async getClientById(id) {
        const { data, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            console.error("Error obteniendo cliente:", error);
            return null;
        }
        // Adaptador
        return { ...data, ruc: data.ruc_dni };
    },

    async createClient(clientData) {
        try {
            // Objeto LIMPIO para la BD
            const dbClient = {
                tipo_persona: clientData.tipo_persona,
                ruc_dni: clientData.ruc, 
                razon_social: clientData.razon_social,
                nombre_contacto: clientData.nombre_contacto,
                email: clientData.email,
                telefono: clientData.telefono,
                direccion: clientData.direccion,
                departamento: clientData.departamento,
                provincia: clientData.provincia,
                distrito: clientData.distrito,
                ubigeo: clientData.ubigeo,
                estado: 'Activo'
                // NO incluimos 'condicion' ni 'estado_sunat' para evitar error de columna
            };

            const { data, error } = await supabase
                .from('clientes')
                .insert(dbClient)
                .select()
                .single();

            if (error) throw error;

            log('CLIENTE_CREADO', `Cliente: ${clientData.razon_social}`);
            return { success: true, id: data.id };

        } catch (error) {
            console.error("Error crear:", error);
            // Código Postgres para Unique Violation
            if (error.code === '23505') return { success: false, message: 'duplicado' };
            return { success: false, message: error.message };
        }
    },

    async updateClient(id, updates) {
        try {
            const dbUpdates = {
                updated_at: new Date().toISOString()
            };

            // Mapeo manual para asegurar que solo pasen campos válidos
            if (updates.tipo_persona) dbUpdates.tipo_persona = updates.tipo_persona;
            if (updates.ruc) dbUpdates.ruc_dni = updates.ruc;
            if (updates.razon_social) dbUpdates.razon_social = updates.razon_social;
            if (updates.nombre_contacto) dbUpdates.nombre_contacto = updates.nombre_contacto;
            if (updates.email) dbUpdates.email = updates.email;
            if (updates.telefono) dbUpdates.telefono = updates.telefono;
            
            if (updates.direccion !== undefined) dbUpdates.direccion = updates.direccion;
            if (updates.departamento !== undefined) dbUpdates.departamento = updates.departamento;
            if (updates.provincia !== undefined) dbUpdates.provincia = updates.provincia;
            if (updates.distrito !== undefined) dbUpdates.distrito = updates.distrito;
            if (updates.ubigeo !== undefined) dbUpdates.ubigeo = updates.ubigeo;

            const { error } = await supabase
                .from('clientes')
                .update(dbUpdates)
                .eq('id', id);

            if (error) throw error;

            log('CLIENTE_ACTUALIZADO', `ID: ${id}`);
            return { success: true };

        } catch (error) {
            console.error("Error update:", error);
            if (error.code === '23505') return { success: false, message: 'duplicado' };
            return { success: false, message: error.message };
        }
    }
};