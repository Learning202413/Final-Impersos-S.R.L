/**
 * js/controllers/cliente.detalle.controller.js
 * Controlador Robusto: Validaciones estrictas, coherencia fiscal y notificaciones.
 */
import { ClienteDetalleService } from '../services/cliente.detalle.service.js';

export const ClienteDetalleController = {
    fiscalData: {}, 

    init: async function(params) {
        const clientId = params[0];
        const isEditMode = !!clientId;
        this.fiscalData = {}; 

        console.log(`ClienteDetalleController inicializado.`);
        this.setupTabs();
        
        const headerEl = document.getElementById('client-header');
        const form = document.getElementById('client-form');
        let currentForm = form;

        if (form) {
            const newForm = form.cloneNode(true); 
            form.parentNode.replaceChild(newForm, form);
            currentForm = newForm;

            this.setupClientTypeLogic(currentForm);

            const searchBtn = currentForm.querySelector('#btn-search-doc');
            if (searchBtn) {
                searchBtn.addEventListener('click', () => this.handleSearch());
            }

            currentForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveAndRedirect(currentForm, clientId, false);
            });
        }

        const linkBtn = document.getElementById('btn-create-quote');
        if (linkBtn) {
            if (isEditMode) {
                linkBtn.href = `#/orden-detalle/new/${clientId}`;
            } else {
                linkBtn.removeAttribute('href'); 
                linkBtn.style.cursor = 'pointer'; 
                linkBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation(); 
                    await this.saveAndRedirect(currentForm, null, true);
                });
            }
        }

        if (isEditMode) {
            headerEl.textContent = 'Cargando datos...';
            const client = await ClienteDetalleService.getClientById(clientId);
            
            if (client) {
                headerEl.textContent = `Editando: ${client.razon_social}`;
                // Guardamos datos fiscales en memoria
                this.fiscalData = {
                    direccion: client.direccion || '',
                    departamento: client.departamento || '',
                    provincia: client.provincia || '',
                    distrito: client.distrito || '',
                    ubigeo: client.ubigeo || '',
                    // Estos campos solo existen si actualizaste la BD, si no, se ignoran sin error
                    condicion: client.condicion || '',
                    estado_sunat: client.estado_sunat || ''
                };
                this.populateForm(client, currentForm);
            } else {
                window.UI.showNotification('Error', 'Cliente no encontrado.');
                setTimeout(() => window.location.hash = '#/clientes', 1500);
            }
        } else {
            headerEl.textContent = 'Crear Nuevo Cliente';
            currentForm?.reset();
            this.updateFormUI('NATURAL');
        }
        
        if (window.lucide) window.lucide.createIcons();
    },

    async handleSearch() {
        const inputRuc = document.getElementById('ruc');
        const inputName = document.getElementById('razon_social');
        const iconSearch = document.querySelector('#btn-search-doc i');
        const btnSearch = document.getElementById('btn-search-doc');

        const docNum = inputRuc.value.trim();

        // --- VALIDACIONES PREVIAS A LA API ---
        if (!docNum) {
            window.UI.showNotification('Atención', 'Ingrese un número para buscar.');
            return;
        }
        if (!/^\d+$/.test(docNum)) {
             window.UI.showNotification('Error', 'El documento debe contener solo números.');
             return;
        }
        if (docNum.length !== 8 && docNum.length !== 11) {
            window.UI.showNotification('Error', 'El documento debe tener 8 (DNI) u 11 (RUC) dígitos.');
            return;
        }

        // UI Loading
        const originalIcon = iconSearch ? iconSearch.getAttribute('data-lucide') : 'search';
        if(iconSearch) {
            iconSearch.setAttribute('data-lucide', 'loader-2');
            iconSearch.classList.add('animate-spin');
            if(window.lucide) window.lucide.createIcons();
        }
        btnSearch.disabled = true;

        const result = await ClienteDetalleService.consultarDocumento(docNum);

        // Restore UI
        btnSearch.disabled = false;
        if(iconSearch) {
            iconSearch.classList.remove('animate-spin');
            iconSearch.setAttribute('data-lucide', originalIcon);
            if(window.lucide) window.lucide.createIcons();
        }

        if (result.success) {
            const data = result.data;
            window.UI.showNotification('Éxito', 'Datos encontrados y autocompletados.');

            if (result.tipo === 'dni') {
                const fullName = `${data.nombres} ${data.apellidoPaterno} ${data.apellidoMaterno}`.trim();
                inputName.value = fullName;
                this.fiscalData = { tipo_doc: 'DNI' }; 
                
                // Auto-seleccionar Natural
                const radioNatural = document.querySelector('input[name="tipo_persona"][value="NATURAL"]');
                if(radioNatural) { radioNatural.checked = true; this.updateFormUI('NATURAL'); }

            } else {
                inputName.value = data.razonSocial;
                this.fiscalData = {
                    tipo_doc: 'RUC',
                    direccion: data.direccion || '',
                    departamento: data.departamento || '',
                    provincia: data.provincia || '',
                    distrito: data.distrito || '',
                    ubigeo: data.ubigeo || '',
                    estado_sunat: data.estado || '',
                    condicion: data.condicion || ''
                };

                // Auto-seleccionar Juridica
                const radioJuridica = document.querySelector('input[name="tipo_persona"][value="JURIDICA"]');
                if(radioJuridica) { radioJuridica.checked = true; this.updateFormUI('JURIDICA'); }
            }
        } else {
            window.UI.showNotification('Error', result.message);
        }
    },

    setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                tabButtons.forEach(btn => {
                    btn.classList.remove('tab-active', 'border-red-600', 'text-red-600');
                    btn.classList.add('border-transparent', 'text-gray-500');
                });
                tabContents.forEach(content => content.classList.add('hidden'));

                const tabId = e.currentTarget.dataset.tab;
                e.currentTarget.classList.remove('border-transparent', 'text-gray-500'); 
                e.currentTarget.classList.add('tab-active', 'border-red-600', 'text-red-600'); 
                document.getElementById(`tab-${tabId}`)?.classList.remove('hidden');
            });
        });
        document.querySelector('[data-tab="details"]')?.click();
    },

    setupClientTypeLogic(form) {
        const radios = form.querySelectorAll('input[name="tipo_persona"]');
        radios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.updateFormUI(e.target.value);
            });
        });
    },

    updateFormUI(type) {
        const lblDoc = document.getElementById('lbl-doc');
        const inputRuc = document.getElementById('ruc');
        const hintDoc = document.getElementById('hint-doc');
        const lblName = document.getElementById('lbl-name');
        const inputName = document.getElementById('razon_social');
        const lblContact = document.getElementById('lbl-contact');
        const inputContact = document.getElementById('nombre_contacto');
        const hintContact = document.getElementById('hint-contact');
        const inputEmail = document.getElementById('email');
        const inputPhone = document.getElementById('telefono');
        const lblPhone = document.getElementById('lbl-phone');

        if (type === 'NATURAL') {
            lblDoc.innerHTML = 'DNI / Identificación Personal <span class="text-red-500">*</span>';
            inputRuc.placeholder = 'Ej: 12345678';
            inputRuc.setAttribute('maxlength', '8');
            hintDoc.textContent = 'Debe tener 8 dígitos.';
            lblName.innerHTML = 'Nombre Completo <span class="text-red-500">*</span>';
            inputName.placeholder = 'Ej: Juan Pérez Gómez';
            lblContact.innerHTML = 'Contacto Referencia (Opcional)';
            inputContact.placeholder = 'Ej: María López';
            inputContact.required = false;
            if(hintContact) {
                hintContact.textContent = '(Solo si quieres agregar un contacto alterno)';
                hintContact.classList.remove('hidden');
            }
            inputEmail.placeholder = 'Ej: juanperez@gmail.com';
            inputPhone.placeholder = 'Ej: 987654321';
            lblPhone.innerHTML = 'Teléfono <span class="text-red-500">*</span>';
        } else {
            lblDoc.innerHTML = 'RUC / Identificación Fiscal <span class="text-red-500">*</span>';
            inputRuc.placeholder = 'Ej: 20123456789';
            inputRuc.setAttribute('maxlength', '11');
            hintDoc.textContent = 'Debe tener 11 dígitos.';
            lblName.innerHTML = 'Razón Social / Empresa <span class="text-red-500">*</span>';
            inputName.placeholder = 'Ej: Industrias S.A.C.';
            lblContact.innerHTML = 'Contacto Referencia <span class="text-red-500">*</span>';
            inputContact.placeholder = 'Ej: Juan Pérez';
            inputContact.required = true;
            if(hintContact) hintContact.classList.add('hidden');
            inputEmail.placeholder = 'contacto@empresa.com';
            inputPhone.placeholder = '+51 999 999 999';
        }
    },

    populateForm(client, form) {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val || '';
        };

        let tipo = client.tipo_persona;
        if (!tipo) tipo = (client.ruc && client.ruc.length === 8) ? 'NATURAL' : 'JURIDICA';

        const radio = form.querySelector(`input[name="tipo_persona"][value="${tipo}"]`);
        if (radio) {
            radio.checked = true;
            this.updateFormUI(tipo); 
        }

        setVal('ruc', client.ruc);
        setVal('razon_social', client.razon_social);
        setVal('nombre_contacto', client.nombre_contacto);
        setVal('email', client.email);
        setVal('telefono', client.telefono);
    },

    async saveAndRedirect(form, id, goToQuote) {
        const selectedType = form.querySelector('input[name="tipo_persona"]:checked')?.value || 'JURIDICA';
        const rucVal = form.querySelector('#ruc').value.trim();
        const razonVal = form.querySelector('#razon_social').value.trim();
        const contactoVal = form.querySelector('#nombre_contacto').value.trim();
        const emailVal = form.querySelector('#email').value.trim();
        const telVal = form.querySelector('#telefono').value.trim();

        // --- 1. VALIDACIONES DE LÓGICA DE NEGOCIO ---

        // Campos Vacíos
        if (!rucVal || !razonVal || !emailVal) {
            window.UI.showNotification('Atención', 'Complete los campos obligatorios marcados con (*).');
            return;
        }

        // Integridad Numérica
        if (!/^\d+$/.test(rucVal)) {
            window.UI.showNotification('Error', 'El documento debe contener solo números.');
            return;
        }

        // Coherencia: Persona Natural vs DNI (8 dígitos)
        if (selectedType === 'NATURAL' && rucVal.length !== 8) {
            window.UI.showNotification('Error', 'El DNI debe tener exactamente 8 dígitos.');
            return;
        } 

        // Coherencia: Persona Jurídica vs RUC (11 dígitos)
        if (selectedType === 'JURIDICA') {
            if (rucVal.length !== 11) {
                window.UI.showNotification('Error', 'El RUC debe tener exactamente 11 dígitos.');
                return;
            }
            // Validación extra: RUC debe empezar con 10 o 20 (típicamente)
            if (!rucVal.startsWith('10') && !rucVal.startsWith('20')) {
                 window.UI.showNotification('Atención', 'Un RUC válido suele empezar con 10 o 20.');
            }
            if (!contactoVal) {
                window.UI.showNotification('Atención', 'El contacto es obligatorio para empresas.');
                return;
            }
        }

        const formData = {
            tipo_persona: selectedType,
            ruc: rucVal,
            razon_social: razonVal,
            nombre_contacto: contactoVal,
            email: emailVal,
            telefono: telVal,
            // Datos fiscales adicionales desde la API o memoria
            ...this.fiscalData 
        };

        try {
            let finalId = id;
            if (id) {
                // UPDATE
                const res = await ClienteDetalleService.updateClient(id, formData);
                if (!res.success) {
                    if (res.message === 'duplicado') {
                         window.UI.showNotification('Error', 'Este número de documento ya está registrado.');
                         return;
                    }
                    throw new Error(res.message);
                }
                window.UI.showNotification('Éxito', 'Cliente actualizado correctamente.');
            } else {
                // CREATE
                const res = await ClienteDetalleService.createClient(formData);
                if (!res.success) {
                    if (res.message === 'duplicado') {
                         window.UI.showNotification('Error', 'El cliente ya existe en la base de datos.');
                         return;
                    }
                    throw new Error(res.message);
                }
                finalId = res.id;
                window.UI.showNotification('Éxito', 'Cliente registrado correctamente.');
            }
            
            if (goToQuote && finalId) {
                setTimeout(() => window.location.hash = `#/orden-detalle/new/${finalId}`, 500);
            } else {
                setTimeout(() => window.location.hash = '#/clientes', 1000);
            }

        } catch (error) {
            console.error(error);
            window.UI.showNotification('Error', error.message || 'Ocurrió un error inesperado.');
        }
    }
};