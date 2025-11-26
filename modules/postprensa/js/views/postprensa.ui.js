/**
 * js/views/postprensa.ui.js
 * Lógica global de UI para Post-Prensa (Estandarizada).
 */

const UI = (function() {
    
    // --- Sidebar ---
    function setSidebarState(isVisible) {
        const sidebarEl = document.getElementById('sidebar-menu');
        const mainContentEl = document.getElementById('main-content');
        const toggleIconEl = document.querySelector('#sidebar-toggle i');
        if (!mainContentEl || !sidebarEl) return;

        if (isVisible) {
            sidebarEl.classList.remove('-translate-x-full');
            mainContentEl.classList.add('ml-64');
            mainContentEl.classList.remove('ml-0');
        } else {
            sidebarEl.classList.add('-translate-x-full');
            mainContentEl.classList.remove('ml-64');
            mainContentEl.classList.add('ml-0');
        }
        
        if (toggleIconEl) {
            toggleIconEl.setAttribute('data-lucide', isVisible ? 'menu' : 'chevrons-right'); 
            if (window.lucide) window.lucide.createIcons(); 
        }
    }

    function toggleSidebar() {
        const sidebarEl = document.getElementById('sidebar-menu');
        if (!sidebarEl) return;
        setSidebarState(sidebarEl.classList.contains('-translate-x-full'));
    }

    // --- Modales Genéricos ---
    function showModal(containerId, contentId = null) {
        const container = document.getElementById(containerId);
        if (contentId) {
            const contentSource = document.getElementById(contentId);
            if (contentSource && container) container.innerHTML = contentSource.innerHTML;
        }
        if (container) {
            if (window.lucide) window.lucide.createIcons();
            container.classList.remove('hidden');
        }
    }

    function hideModal(modalId) {
        const container = document.getElementById(modalId);
        if (container) {
            container.classList.add('hidden');
            container.innerHTML = '';
        }
    }

    // --- NUEVO: Modal de Confirmación (Estilo Escudo/Admin) ---
    function showConfirmModal(title, messageOrHtml, confirmButtonText, callback) {
        const container = document.getElementById('confirm-modal-container');
        if (!container) return;

        container.innerHTML = '';
        container.classList.remove('hidden');

        const isHtmlContent = /<[a-z][\s\S]*>/i.test(messageOrHtml);
        const messageClass = isHtmlContent ? 'mb-6' : 'mb-8 text-gray-600';

        const modalHtml = `
            <div class="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 text-center transform scale-100 animate-fade-in border border-gray-100">
                <div class="mx-auto flex items-center justify-center mb-5">
                    <div class="p-3 bg-red-50 rounded-full ring-8 ring-red-50/50">
                        <i data-lucide="shield-alert" class="w-10 h-10 text-red-600"></i>
                    </div>
                </div>
                <h3 class="text-xl font-extrabold text-gray-900 mb-2">${title}</h3>
                <div class="text-sm ${messageClass}">${messageOrHtml}</div>
                <div class="flex items-center justify-center gap-3">
                    <button type="button" onclick="window.UI.hideModal('confirm-modal-container')" class="w-1/2 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 font-semibold text-sm transition-all shadow-sm">
                        Cancelar
                    </button>
                    <button id="confirm-action-btn" class="w-1/2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold text-sm shadow-md hover:shadow-lg transition-all border border-transparent">
                        ${confirmButtonText}
                    </button>
                </div>
            </div>
        `;

        container.innerHTML = modalHtml;
        if (window.lucide) window.lucide.createIcons();

        document.getElementById('confirm-action-btn').addEventListener('click', () => {
            callback();
            hideModal('confirm-modal-container');
        });
    }

    // --- NUEVO: Notificaciones Toast ---
    function showNotification(title, message) {
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            container.className = 'fixed bottom-4 right-4 z-[60] flex flex-col gap-3 pointer-events-none';
            document.body.appendChild(container);
        }

        const isError = title.toLowerCase().includes('error') || title.toLowerCase().includes('atención') || title.toLowerCase().includes('bloqueo');
        const borderColor = isError ? 'border-red-500' : 'border-green-500';
        const iconName = isError ? 'alert-circle' : 'check-circle';
        const iconColor = isError ? 'text-red-500' : 'text-green-500';

        const toast = document.createElement('div');
        toast.className = `pointer-events-auto bg-white border-l-4 ${borderColor} shadow-2xl rounded-lg p-4 w-80 flex items-start transform transition-all duration-500 translate-y-10 opacity-0`;
        
        toast.innerHTML = `
            <div class="flex-shrink-0">
                <i data-lucide="${iconName}" class="w-6 h-6 ${iconColor}"></i>
            </div>
            <div class="ml-3 w-0 flex-1 pt-0.5">
                <p class="text-sm font-bold text-gray-900">${title}</p>
                <p class="mt-1 text-sm text-gray-500">${message}</p>
            </div>
            <div class="ml-4 flex-shrink-0 flex">
                <button class="bg-white rounded-md inline-flex text-gray-400 hover:text-gray-500 focus:outline-none btn-close-toast">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>
        `;

        container.appendChild(toast);
        if (window.lucide) window.lucide.createIcons();

        requestAnimationFrame(() => toast.classList.remove('translate-y-10', 'opacity-0'));

        const closeToast = () => {
            toast.classList.add('opacity-0', 'translate-x-full'); 
            setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 500);
        };

        toast.querySelector('.btn-close-toast').addEventListener('click', closeToast);
        setTimeout(closeToast, 4000);
    }

    function setSidebarVisible() { setSidebarState(true); }
    function setSidebarHidden() { setSidebarState(false); }

    function initGlobalEvents() {
        if (window.lucide) window.lucide.createIcons();
        
        const toggleButton = document.getElementById('sidebar-toggle');
        toggleButton?.removeEventListener('click', toggleSidebar); 

        if (toggleButton) {
            window.UI = UI; 
            window.showModal = showModal;
            window.hideModal = hideModal;
            toggleButton.addEventListener('click', toggleSidebar);
        }
    }

    return {
        toggleSidebar, showModal, hideModal, showConfirmModal, showNotification,
        initGlobalEvents, setSidebarVisible, setSidebarHidden
    };
})();

export { UI };