import { signOut, auth } from './firebase-init.js';

/**
 * Renderiza el Sidebar y el Header Móvil en el contenedor especificado.
 * @param {string} activePageId - El ID de la página actual ('dashboard', 'ordenes', 'inventario', 'usuarios')
 */
export function initAdminLayout(activePageId) {
    const layoutContainer = document.getElementById('app-layout');
    
    // 1. Definición del Menú (Fácil de editar)
    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: 'fa-home', href: 'index.html', role: 'all' },
        // --- NUEVO ÍTEM ---
        { id: 'clientes', label: 'Clientes & Medidas', icon: 'fa-address-book', href: 'clientes.html', role: 'all' }, 
        // ------------------
        { id: 'ordenes', label: 'Órdenes Producción', icon: 'fa-tshirt', href: 'ordenes.html', role: 'all' },
        { id: 'talleres', label: 'Talleres Externos', icon: 'fa-industry', href: 'talleres.html', role: 'all' },
        { id: 'inventario', label: 'Inventario & Telas', icon: 'fa-boxes', href: 'inventario.html', role: 'all' },
        { id: 'proveedores', label: 'Proveedores', icon: 'fa-truck', href: 'proveedores.html', role: 'admin' }, // Solo admin/contabilidad
        { id: 'compras', label: 'Registro de Compras', icon: 'fa-shopping-bag', href: 'compras.html', role: 'admin' },
        { id: 'gastos', label: 'Gastos Operativos', icon: 'fa-file-invoice-dollar', href: 'gastos.html', role: 'admin' },
        { id: 'cuentas', label: 'Tesorería', icon: 'fa-university', href: 'cuentas.html', role: 'admin' },
        { id: 'usuarios', label: 'Gestión Usuarios', icon: 'fa-users-cog', href: 'usuarios.html', role: 'all' }
    ];

    // 2. Generar HTML del Sidebar (Escritorio)
    const sidebarHTML = `
        <aside class="hidden md:flex flex-col w-64 bg-black border-r border-gray-900 flex-shrink-0 transition-all duration-300">
            <div class="flex items-center justify-center h-20 border-b border-gray-900">
                <img src="../assets/img/logo.jpg" alt="Soriano" class="h-10 w-10 rounded-full border border-soriano-red mr-3 object-cover">
                <span class="text-xl font-serif text-white tracking-widest">SORIANO</span>
            </div>

            <nav class="flex-1 overflow-y-auto py-6">
                <ul class="space-y-2 px-4">
                    ${menuItems.map(item => {
                        const isActive = item.id === activePageId;
                        // Clases condicionales: Activo (Rojo) vs Inactivo (Gris)
                        const activeClasses = "bg-soriano-red/10 text-soriano-red border-soriano-red/20 shadow-lg shadow-red-900/10";
                        const inactiveClasses = "hover:bg-gray-900 text-gray-400 hover:text-white border-transparent";
                        
                        return `
                        <li class="${item.id === 'usuarios' ? 'admin-only hidden' : ''}"> <a href="${item.href}" class="flex items-center px-4 py-3 rounded-lg transition-all border ${isActive ? activeClasses : inactiveClasses}">
                                <i class="fas ${item.icon} w-6 text-center"></i>
                                <span class="ml-3 font-medium text-sm">${item.label}</span>
                                ${item.id === 'usuarios' ? '<span id="globalPendingBadge" class="hidden ml-auto bg-soriano-red text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">!</span>' : ''}
                            </a>
                        </li>
                        `;
                    }).join('')}
                </ul>
            </nav>

            <div class="border-t border-gray-900 p-4 bg-gray-900/30">
                <div class="flex items-center">
                    <div id="sidebarAvatar" class="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-soriano-red font-bold font-serif border border-gray-700">
                        U
                    </div>
                    <div class="ml-3 overflow-hidden">
                        <p id="sidebarName" class="text-xs font-medium text-white truncate w-24">Cargando...</p>
                        <p id="sidebarRole" class="text-[10px] text-gray-500 capitalize truncate">...</p>
                    </div>
                    <button id="globalLogoutBtn" class="ml-auto text-gray-500 hover:text-soriano-red transition-colors" title="Cerrar Sesión">
                        <i class="fas fa-sign-out-alt"></i>
                    </button>
                </div>
            </div>
        </aside>
    `;

    // 3. Generar HTML del Header (Móvil)
    const mobileHeaderHTML = `
        <header class="md:hidden flex items-center justify-between h-16 bg-black px-4 border-b border-gray-900 flex-shrink-0">
            <div class="flex items-center">
                <img src="../assets/img/logo.jpg" alt="Logo" class="h-8 w-8 rounded-full mr-2 border border-soriano-red">
                <span class="text-lg font-serif text-white">SORIANO</span>
            </div>
            <button id="mobileMenuBtn" class="text-white p-2 focus:outline-none">
                <i class="fas fa-bars text-xl"></i>
            </button>
        </header>

        <div id="mobileMenuOverlay" class="fixed inset-0 z-50 bg-black/90 hidden flex-col p-6 md:hidden">
            <div class="flex justify-end mb-8">
                <button id="closeMobileMenu" class="text-gray-400 hover:text-white">
                    <i class="fas fa-times text-2xl"></i>
                </button>
            </div>
            <nav class="space-y-4 text-center">
                ${menuItems.map(item => `
                    <a href="${item.href}" class="block text-xl py-2 ${item.id === activePageId ? 'text-soriano-red font-bold' : 'text-gray-300'}">
                        ${item.label}
                    </a>
                `).join('')}
                <button id="mobileLogoutBtn" class="block w-full text-xl py-2 text-gray-500 mt-8 border-t border-gray-800 pt-8">
                    Cerrar Sesión
                </button>
            </nav>
        </div>
    `;

    // 4. Inyectar en el DOM
    // Buscamos dónde insertar el sidebar. Asumimos una estructura Flex en el HTML padre.
    // Insertamos el Sidebar AL PRINCIPIO del contenedor
    layoutContainer.insertAdjacentHTML('afterbegin', sidebarHTML);

    // Insertamos el Header móvil ANTES del contenido principal (main)
    const mainContent = layoutContainer.querySelector('main');
    if (mainContent) {
        // Envolvemos el main en un div flex vertical para que el header quede arriba
        const wrapper = document.createElement('div');
        wrapper.className = "flex-1 flex flex-col h-full relative overflow-hidden w-full";
        
        // Movemos el main adentro del wrapper
        mainContent.parentNode.insertBefore(wrapper, mainContent);
        wrapper.innerHTML = mobileHeaderHTML; // Ponemos el header primero
        wrapper.appendChild(mainContent); // Ponemos el contenido después
    }

    // 5. Activar Listeners (Logout y Menú Móvil)
    setupGlobalListeners();
}

function setupGlobalListeners() {
    // Logout Escritorio
    const btn = document.getElementById('globalLogoutBtn');
    if(btn) btn.addEventListener('click', () => handleLogout());

    // Logout Móvil
    const btnMob = document.getElementById('mobileLogoutBtn');
    if(btnMob) btnMob.addEventListener('click', () => handleLogout());

    // Toggle Menú Móvil
    const menuBtn = document.getElementById('mobileMenuBtn');
    const closeBtn = document.getElementById('closeMobileMenu');
    const overlay = document.getElementById('mobileMenuOverlay');

    if(menuBtn && overlay) {
        menuBtn.addEventListener('click', () => overlay.classList.remove('hidden', 'flex'));
        menuBtn.addEventListener('click', () => overlay.classList.add('flex'));
    }
    if(closeBtn && overlay) {
        closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
        closeBtn.addEventListener('click', () => overlay.classList.remove('flex'));
    }
}

async function handleLogout() {
    try {
        await signOut(auth);
        window.location.href = '../auth/login.html';
    } catch (error) {
        console.error("Error al salir:", error);
    }
}

/**
 * Actualiza la información del usuario en el sidebar
 */
export function updateSidebarUser(user, userData) {
    const nameEl = document.getElementById('sidebarName');
    const roleEl = document.getElementById('sidebarRole');
    const avatarEl = document.getElementById('sidebarAvatar');
    const adminItems = document.querySelectorAll('.admin-only');

    if (nameEl && userData) {
        nameEl.textContent = userData.name || user.email;
        roleEl.textContent = userData.department || "Staff";
        avatarEl.textContent = (userData.name || "U").charAt(0).toUpperCase();

        // Mostrar items de admin si corresponde
        if (userData.role === 'admin') {
            adminItems.forEach(el => el.classList.remove('hidden'));
        }
    }
}