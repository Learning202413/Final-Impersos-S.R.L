/**
 * js/controllers/orden.detalle.controller.js
 * Controller Updated:
 * - Validation: Mandatory Client (ID check), Total > 0, Required Specs.
 * - Security: Edition blocking if OT is in production or invoiced.
 * - Notifications: Admin-style Toasts.
 */
import { OrdenDetalleService } from '../services/orden.detalle.service.js';
import { ClientesService } from '../services/clientes.service.js'; 
import { FacturacionService } from '../services/facturacion.service.js';

export const OrdenDetalleController = {
    currentOrderId: null,
    clientType: 'JURIDICA', 

    init: async function(params) {
        const param1 = params[0];
        const isNewMode = !param1 || param1 === 'new';
        const preselectedClientId = isNewMode ? params[1] : null;
        const viewMode = (!isNewMode && params[1]) ? params[1] : 'view'; 
        this.currentOrderId = isNewMode ? null : param1;
        
        const formContainer = document.getElementById('order-form-container');
        const headerTitle = document.getElementById('order-header');

        if (formContainer) formContainer.classList.remove('hidden');
        if (headerTitle) headerTitle.textContent = 'Cargando datos...';

        try {
            if (!isNewMode) {
                const order = await OrdenDetalleService.getOrderById(this.currentOrderId);
                
                if (order) {
                    // Determine Client Type for Tax Logic
                    const fullClient = await ClientesService.getClientById(order.cliente_id);
                    if (fullClient) {
                        const isNatural = (fullClient.tipo_persona === 'NATURAL') || 
                                          (!fullClient.tipo_persona && fullClient.ruc && fullClient.ruc.length === 8);
                        this.clientType = isNatural ? 'NATURAL' : 'JURIDICA';
                    }

                    this.populateForm(order);
                    this.configureButtonsForExisting(order, viewMode);
                } else {
                    window.UI.showNotification('Error', 'Orden no encontrada.');
                    return;
                }
            } else {
                this.setupNewOrderUI();
                this.toggleButtonGroups('new'); 
                if (preselectedClientId) {
                    const client = await ClientesService.getClientById(preselectedClientId);
                    if (client) this.setClientSelection(client);
                }
            }

            this.setupEvents(this.currentOrderId);
            this.setupClientSearch(); 
            if (window.lucide) window.lucide.createIcons();
            
        } catch (error) {
            console.error("Error en OrdenDetalleController:", error);
            window.UI.showNotification('Error', 'Ocurrió un problema al cargar.');
        }
    },

    async processInvoiceGeneration(type) {
        if (!this.currentOrderId) return;
        
        // 1. Double Check Status
        const order = await OrdenDetalleService.getOrderById(this.currentOrderId);
        if (order.estado_facturacion === 'Facturado') {
             window.UI.showNotification('Error', 'Esta orden ya ha sido facturada previamente.');
             return;
        }

        // 2. Notification "Processing" (Simulated via Toast)
        window.UI.showNotification('Atención', `Generando ${type}, por favor espere...`);
        
        const result = await FacturacionService.generateDocumentFromOT(this.currentOrderId, type);
        
        if (result.success) {
            window.UI.showNotification('Éxito', result.message);
            // Reload view to update buttons
            this.init([this.currentOrderId, 'view']); 
        } else {
            window.UI.showNotification('Error', result.message);
        }
    },

    toggleHeaderFields(showOT) {
        const codeDisplay = document.getElementById('display-code');
        const otDisplay = document.getElementById('display-ot-id');
        
        if (showOT) {
            codeDisplay?.parentElement.parentElement.classList.add('hidden');
            otDisplay?.parentElement.parentElement.classList.remove('hidden');
        } else {
            codeDisplay?.parentElement.parentElement.classList.remove('hidden');
            otDisplay?.parentElement.parentElement.classList.add('hidden');
        }
    },

    setupNewOrderUI() {
        const header = document.getElementById('order-header');
        if(header) header.textContent = 'Crear Nueva Cotización';
        const displayCode = document.getElementById('display-code');
        if(displayCode) displayCode.textContent = 'BORRADOR';
        
        this.toggleHeaderFields(false);
        
        const container = document.getElementById('product-lines-container');
        if (container) {
            container.innerHTML = ''; 
            this.addProductRow(); 
        }
        this.calculateTotal();
    },

    populateForm(order) {
        const otStatuses = [
            'Orden creada', 
            'En Pre-prensa', 'Diseño Pendiente', 'En diseño', 'En Aprobación de Cliente', 'Diseño Aprobado',
            'En prensa', 'Asignada a Prensa', 'En Preparación', 'Imprimiendo',
            'En Post-Prensa', 'En post-prensa', 'En Acabados', 'En Control de Calidad',
            'Completado'
        ];
        const isOT = otStatuses.includes(order.estado);

        const header = document.getElementById('order-header');
        if(header) {
            if (isOT && order.ot_id && order.ot_id !== 'PENDIENTE') {
                header.textContent = `Orden de Trabajo: ${order.ot_id}`;
            } else {
                header.textContent = `Cotización: ${order.codigo}`;
            }
        }
        
        document.getElementById('display-code').textContent = order.codigo;
        document.getElementById('display-ot-id').textContent = order.ot_id;
        document.getElementById('client-id-hidden').value = order.cliente_id;
        document.getElementById('client-search').value = order.cliente_nombre;
        document.getElementById('notas_internas').value = order.notas || '';

        this.toggleHeaderFields(isOT);

        const container = document.getElementById('product-lines-container');
        if (container) {
            container.innerHTML = '';
            if (order.items && order.items.length > 0) {
                order.items.forEach(item => this.addProductRow(item));
            } else {
                this.addProductRow();
            }
        }
        this.calculateTotal();
    },

    configureButtonsForExisting(order, mode) {
        const status = order.estado;
        const productionStatuses = [
            'Orden creada', 
            'En Pre-prensa', 'Diseño Pendiente', 'En diseño', 'En Aprobación de Cliente', 'Diseño Aprobado',
            'En prensa', 'Asignada a Prensa', 'En Preparación', 'Imprimiendo',
            'En Post-Prensa', 'En post-prensa', 'En Acabados', 'En Control de Calidad',
            'Completado'
        ];
        
        // BLOCK EDITING if it's in production, rejected, or invoiced
        const isProduction = productionStatuses.includes(status);
        const isRejected = status === 'Rechazada' || status === 'Cancelada';
        const isInvoiced = order.estado_facturacion === 'Facturado';
        
        const shouldBlock = isProduction || isRejected || isInvoiced || mode === 'view';
        
        this.setFormReadOnly(shouldBlock);

        if (isProduction) {
            this.toggleButtonGroups('ot', status, order);
        } else if (isRejected) {
            this.toggleButtonGroups('rejected');
        } else {
            if (mode === 'edit') {
                this.toggleButtonGroups('edit');
            } else {
                this.toggleButtonGroups('view');
            }
        }
    },

    toggleButtonGroups(scenario, status, orderData = null) {
        const editActions = document.getElementById('edit-actions'); 
        const viewActions = document.getElementById('view-actions'); 
        const otActions = document.getElementById('ot-actions');     
        const rejectedActions = document.getElementById('rejected-actions');
        const conversionActions = document.getElementById('conversion-actions'); 
        const btnAddLine = document.getElementById('btn-add-line');
        const btnReject = document.getElementById('btn-reject-quote');
        const btnConvert = document.getElementById('btn-convert-ot');
        const btnInvoice = document.getElementById('btn-generate-invoice');

        // Reset visibility
        editActions?.classList.add('hidden');
        viewActions?.classList.add('hidden');
        otActions?.classList.add('hidden');
        rejectedActions?.classList.add('hidden');
        conversionActions?.classList.add('hidden'); 
        btnAddLine?.classList.add('hidden');
        
        if(btnReject) btnReject.classList.remove('hidden');
        if(btnConvert) btnConvert.classList.remove('hidden');

        switch (scenario) {
            case 'new': 
            case 'edit': 
                editActions?.classList.remove('hidden');
                conversionActions?.classList.remove('hidden'); 
                btnAddLine?.classList.remove('hidden');
                break;
            case 'view': 
                viewActions?.classList.remove('hidden');
                conversionActions?.classList.remove('hidden'); 
                break;
            case 'ot': 
                otActions?.classList.remove('hidden');
                
                if (btnInvoice) {
                    if (status === 'Completado') {
                        btnInvoice.classList.remove('hidden');
                        if (orderData && orderData.estado_facturacion === 'Facturado') {
                            btnInvoice.disabled = true;
                            btnInvoice.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4 inline mr-2"></i> Facturado`;
                            btnInvoice.classList.remove('bg-green-600', 'hover:bg-green-700', 'bg-blue-600', 'hover:bg-blue-700');
                            btnInvoice.classList.add('bg-green-400', 'cursor-not-allowed');
                        } else {
                            btnInvoice.disabled = false;
                            // VISUAL FISCAL CONSISTENCY
                            if (this.clientType === 'NATURAL') {
                                btnInvoice.innerHTML = `<i data-lucide="receipt" class="w-4 h-4 inline mr-2"></i> Emitir Boleta`;
                                btnInvoice.classList.remove('bg-blue-600', 'hover:bg-blue-700'); 
                                btnInvoice.classList.add('bg-green-600', 'hover:bg-green-700'); 
                            } else {
                                btnInvoice.innerHTML = `<i data-lucide="file-text" class="w-4 h-4 inline mr-2"></i> Emitir Factura`;
                                btnInvoice.classList.remove('bg-green-600', 'hover:bg-green-700');
                                btnInvoice.classList.add('bg-blue-600', 'hover:bg-blue-700');
                            }
                            btnInvoice.classList.remove('bg-green-400', 'cursor-not-allowed');
                        }
                    } else {
                        btnInvoice.classList.add('hidden');
                    }
                }
                break;
            case 'rejected':
                 rejectedActions?.classList.remove('hidden');
                 break;
        }
    },

    setFormReadOnly(isReadOnly) {
        const formInputs = document.querySelectorAll('input, select, textarea');
        formInputs.forEach(el => el.disabled = isReadOnly);
        
        const searchInput = document.getElementById('client-search');
        if(searchInput) {
            if(isReadOnly) {
                searchInput.classList.add('bg-gray-100', 'text-gray-500', 'cursor-not-allowed');
                searchInput.classList.remove('bg-white', 'cursor-pointer');
            } else {
                searchInput.classList.remove('bg-gray-100', 'text-gray-500', 'cursor-not-allowed');
                searchInput.classList.add('bg-white', 'cursor-pointer');
            }
        }
        
        const deleteButtons = document.querySelectorAll('.btn-delete-line');
        deleteButtons.forEach(btn => {
            if (isReadOnly) btn.classList.add('hidden');
            else btn.classList.remove('hidden');
        });
    },

    setupClientSearch() {
        const input = document.getElementById('client-search');
        const hiddenInput = document.getElementById('client-id-hidden');
        const resultsDiv = document.getElementById('client-results-dropdown');
        const loadingIcon = document.getElementById('client-loading-icon');
        const icon = document.getElementById('client-search-icon');
        
        if (!input || !resultsDiv) return;
        
        // If read-only (e.g., in production), disable search interaction
        if (input.disabled) return;

        const performSearch = async (query) => {
            icon?.classList.add('hidden'); loadingIcon?.classList.remove('hidden');
            try { const results = await ClientesService.searchClients(query); this.renderSearchResults(results); } 
            catch (err) { console.error(err); } finally { icon?.classList.remove('hidden'); loadingIcon?.classList.add('hidden'); }
        };
        const onInteract = () => { if (resultsDiv.classList.contains('hidden') && !input.disabled) performSearch(input.value); };
        
        input.removeEventListener('click', onInteract);
        input.addEventListener('click', onInteract); input.addEventListener('focus', onInteract);
        
        let timeout;
        input.addEventListener('input', (e) => { 
            clearTimeout(timeout); hiddenInput.value = ''; 
            timeout = setTimeout(() => performSearch(e.target.value), 200); 
        });
        document.addEventListener('click', (e) => { if (!input.contains(e.target) && !resultsDiv.contains(e.target)) resultsDiv.classList.add('hidden'); });
    },

    renderSearchResults(results) {
        const resultsDiv = document.getElementById('client-results-dropdown');
        resultsDiv.innerHTML = '';
        if (results.length === 0) resultsDiv.innerHTML = '<div class="p-3 text-sm text-gray-500 text-center italic">No se encontraron clientes.</div>';
        else {
            results.forEach(client => {
                const isNatural = (client.tipo_persona === 'NATURAL') || 
                                  (!client.tipo_persona && client.ruc && client.ruc.length === 8);
                const labelDoc = isNatural ? 'DNI' : 'RUC';
                const icon = isNatural ? 'user' : 'building-2';

                const div = document.createElement('div');
                div.className = 'px-4 py-3 hover:bg-red-50 cursor-pointer transition border-b border-gray-50 last:border-b-0 flex items-center group';
                
                div.innerHTML = `
                    <div class="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 mr-3 group-hover:bg-red-100 group-hover:text-red-600 transition-colors">
                        <i data-lucide="${icon}" class="w-4 h-4"></i>
                    </div>
                    <div>
                        <div class="font-bold text-gray-800 text-sm group-hover:text-red-700 transition">${client.razon_social}</div>
                        <div class="text-xs text-gray-500">${labelDoc}: ${client.ruc}</div>
                    </div>
                `;
                
                div.addEventListener('click', () => { 
                    this.setClientSelection(client); 
                    resultsDiv.classList.add('hidden'); 
                });
                resultsDiv.appendChild(div);
            });
            if(window.lucide) window.lucide.createIcons();
        }
        resultsDiv.classList.remove('hidden');
    },

    setClientSelection(client) { 
        document.getElementById('client-search').value = client.razon_social; 
        document.getElementById('client-id-hidden').value = client.id;
        this.clientType = (client.tipo_persona === 'NATURAL' || (!client.tipo_persona && client.ruc.length === 8)) ? 'NATURAL' : 'JURIDICA';
    },

    addProductRow(data = null) {
        const container = document.getElementById('product-lines-container');
        if (!container) return;
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 transition-colors item-row group';
        
        const isFormDisabled = document.getElementById('notas_internas')?.disabled;
        const hideDeleteClass = isFormDisabled ? 'hidden' : '';
        const inputClass = "block w-full px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 text-sm transition-shadow";

        row.innerHTML = `
            <td class="px-4 py-3 align-top">
                <input type="text" value="${data?.producto || ''}" placeholder="Ej: Volantes A5" class="form-input ${inputClass} item-name font-medium text-gray-800" required>
            </td>
            <td class="px-4 py-3 align-top">
                <input type="number" value="${data?.cantidad || 1}" min="1" class="form-input ${inputClass} text-right item-qty" required>
            </td>
            <td class="px-4 py-3 align-top">
                <textarea rows="1" class="form-input ${inputClass} text-xs item-specs resize-none" placeholder="Papel couché 150gr...">${data?.specs || ''}</textarea>
            </td>
            <td class="px-4 py-3 align-top">
                <div class="relative">
                     <span class="absolute left-2 top-1.5 text-gray-400 text-xs">S/</span>
                     <input type="number" value="${data?.precio || 0}" min="0" step="0.01" class="form-input ${inputClass} pl-6 text-right item-price" required>
                </div>
            </td>
            <td class="px-4 py-3 align-top text-right text-sm font-bold text-gray-800 item-subtotal pt-2">S/ 0.00</td>
            <td class="px-4 py-3 align-top text-center pt-1.5">
                <button type="button" class="btn-delete-line text-gray-400 hover:text-red-600 transition ${hideDeleteClass}" title="Eliminar fila">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </td>
        `;
        container.appendChild(row);
        if (window.lucide) window.lucide.createIcons();
        this.calculateRowSubtotal(row);
    },

    calculateRowSubtotal(row) {
        const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
        const price = parseFloat(row.querySelector('.item-price').value) || 0;
        const subtotal = qty * price;
        row.querySelector('.item-subtotal').textContent = `S/ ${subtotal.toFixed(2)}`;
        return subtotal;
    },

    calculateTotal() {
        const rows = document.querySelectorAll('.item-row');
        let total = 0;
        rows.forEach(row => { total += this.calculateRowSubtotal(row); });
        const displayTotal = document.getElementById('display-total');
        if (displayTotal) displayTotal.textContent = `S/ ${total.toFixed(2)}`;
        return total;
    },

    gatherFormData() {
        const clientId = document.getElementById('client-id-hidden').value;
        const clientName = document.getElementById('client-search').value;
        const rows = document.querySelectorAll('.item-row');
        const items = []; let total = 0;
        
        rows.forEach(row => {
            const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
            const price = parseFloat(row.querySelector('.item-price').value) || 0;
            const subtotal = qty * price;
            const name = row.querySelector('.item-name').value.trim();
            const specs = row.querySelector('.item-specs').value.trim();
            
            if(name) { // Only add valid rows
                items.push({ producto: name, cantidad: qty, specs: specs, precio: price, subtotal: subtotal });
                total += subtotal;
            }
        });
        
        return { cliente_id: clientId, cliente_nombre: clientName, notas: document.getElementById('notas_internas').value, items: items, total: total };
    },

    setupEvents(currentId) {
        const form = document.getElementById('order-form');
        if (form) {
            const newForm = form.cloneNode(true);
            form.parentNode.replaceChild(newForm, form);
            this.setupClientSearch();

            newForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const data = this.gatherFormData();
                
                // --- VALIDATIONS ---
                
                // 1. Mandatory Client (Ghost Client check)
                if (!data.cliente_id || data.cliente_nombre.trim() === '') { 
                    window.UI.showNotification('Atención', 'Debe seleccionar un cliente válido del buscador.'); 
                    return; 
                }
                
                // 2. Empty Items
                if (data.items.length === 0) { 
                    window.UI.showNotification('Error', 'Debe agregar al menos un producto con nombre.'); 
                    return; 
                }
                
                // 3. Specs Validation (Production Logic)
                const hasEmptySpecs = data.items.some(i => !i.specs);
                if (hasEmptySpecs) {
                    window.UI.showNotification('Atención', 'Por favor, detalle las especificaciones (papel, acabados) para Producción.');
                    return;
                }

                // 4. Zero Value
                if (data.total <= 0) { 
                    window.UI.showNotification('Error', 'El monto total no puede ser S/ 0.00.'); 
                    return; 
                }

                if (currentId) {
                    await OrdenDetalleService.updateOrder(currentId, data);
                    window.UI.showNotification('Éxito', 'Cotización actualizada correctamente.');
                } else {
                    const res = await OrdenDetalleService.createOrder(data);
                    if (res.success) {
                        window.UI.showNotification('Éxito', 'Cotización creada.');
                        setTimeout(() => window.location.hash = `#/orden-detalle/${res.id}/view`, 500);
                    }
                }
            });

            newForm.querySelector('#btn-add-line')?.addEventListener('click', () => { this.addProductRow(); this.calculateTotal(); });
            document.getElementById('product-lines-container')?.addEventListener('click', (e) => {
                if(e.target.closest('.btn-delete-line')) { e.target.closest('tr').remove(); this.calculateTotal(); }
            });
            document.getElementById('product-lines-container')?.addEventListener('input', (e) => {
                if (e.target.matches('.item-qty, .item-price')) this.calculateTotal();
            });
        }

        const bindBtn = (id, handler) => {
            const btn = document.getElementById(id);
            if(btn) {
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
                newBtn.addEventListener('click', handler);
            }
        };

        bindBtn('btn-cancel-nav', () => window.location.hash = '#/ordenes');
        bindBtn('btn-back-view', () => window.location.hash = '#/ordenes');
        bindBtn('btn-back-ot', () => window.location.hash = '#/ordenes');
        bindBtn('btn-back-rejected', () => window.location.hash = '#/ordenes'); 

        bindBtn('btn-convert-ot', async () => {
            const performConversion = async (targetId) => {
                window.UI.showConfirmModal(
                    'Confirmar Producción', 
                    '¿Está seguro de convertir esta cotización en <b>Orden de Trabajo (OT)</b>? Esto notificará al área de Producción.', 
                    'Sí, Generar OT', 
                    async () => {
                        const res = await OrdenDetalleService.convertToOT(targetId);
                        if (res.success) {
                            window.UI.showNotification('Éxito', `Orden generada: <b>${res.otId}</b>. Enviada a producción.`);
                            this.init([targetId, 'view']);
                        } else {
                            window.UI.showNotification('Error', 'No se pudo generar la OT.');
                        }
                    }
                );
            };

            if (!currentId) {
                const data = this.gatherFormData();
                if (!data.cliente_id) return window.UI.showNotification('Atención', 'Seleccione cliente.');
                if (data.total <= 0) return window.UI.showNotification('Error', 'Monto inválido.');
                
                const saveRes = await OrdenDetalleService.createOrder(data);
                if (saveRes.success) performConversion(saveRes.id);
            } else {
                performConversion(currentId);
            }
        });

        bindBtn('btn-reject-quote', async () => {
             if (!currentId) return;
             window.UI.showConfirmModal('Rechazar', '¿Marcar como rechazada/cancelada?', 'Sí, Rechazar', async () => {
                 await OrdenDetalleService.rejectQuote(currentId);
                 window.UI.showNotification('Atención', 'La cotización ha sido archivada como Rechazada.');
                 window.location.hash = '#/ordenes';
             });
        });

        bindBtn('btn-generate-invoice', () => {
            const docType = this.clientType === 'NATURAL' ? 'BOLETA' : 'FACTURA';
            const docName = this.clientType === 'NATURAL' ? 'Boleta de Venta' : 'Factura Electrónica';
            const colorClass = this.clientType === 'NATURAL' ? 'text-green-600' : 'text-blue-600';
            
            const coherenceMsg = this.clientType === 'NATURAL' 
                ? 'Cliente es <b>Persona Natural</b>, corresponde emitir <b>Boleta</b>.'
                : 'Cliente es <b>Empresa</b>, corresponde emitir <b>Factura</b>.';

            const modalHtml = `
                <p class="text-gray-600 text-sm mb-4">
                    ${coherenceMsg}
                </p>
                <div class="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center mb-4">
                    <p class="text-xs text-gray-500 uppercase font-bold tracking-wider">Documento a Generar</p>
                    <p class="text-lg font-bold ${colorClass} mt-1">${docName}</p>
                </div>
                <p class="text-xs text-gray-400 italic">Esta acción enviará el documento a SUNAT/OSE.</p>
            `;
            
            window.UI.showConfirmModal(
                `Emitir Comprobante`,
                modalHtml,
                `Sí, Emitir ${docType}`,
                () => {
                    this.processInvoiceGeneration(docType);
                }
            );
        });
    }
};