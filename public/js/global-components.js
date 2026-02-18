import { auth } from './firebase-init.js';
import { signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

/**
 * Renderiza el Layout Admin (Sidebar Desktop + Bottom Bar Mobile)
 * @param {string} activePageId - ID de la página actual
 */
export function initAdminLayout(activePageId) {
    const layoutContainer = document.getElementById('app-layout');
    
    // --- 1. DEFINICIÓN DEL MENÚ AGRUPADO ---
    const menuGroups = [
        {
            title: "Principal",
            items: [
                { id: 'dashboard', label: 'Dashboard', icon: 'fa-home', href: 'index.html', role: 'all' },
            ]
        },
        {
            title: "Producción & Ventas",
            items: [
                // "Nueva Orden" lo sacamos de la lista normal de escritorio para destacarlo de otra forma o dejarlo como botón de acción
                { id: 'nueva-orden', label: 'Nueva Orden', icon: 'fa-plus-circle', href: 'nueva-orden.html', role: 'all', highlight: true },
                { id: 'ordenes', label: 'Órdenes', icon: 'fa-tshirt', href: 'ordenes.html', role: 'all' },
                { id: 'clientes', label: 'Clientes', icon: 'fa-address-book', href: 'clientes.html', role: 'all' },
            ]
        },
        {
            title: "Inventario & Taller",
            items: [
                { id: 'inventario', label: 'Inventario', icon: 'fa-boxes', href: 'inventario.html', role: 'all' },
                { id: 'talleres', label: 'Talleres', icon: 'fa-industry', href: 'talleres.html', role: 'all' },
            ]
        },
        {
            title: "Administración",
            items: [
                { id: 'proveedores', label: 'Proveedores', icon: 'fa-truck', href: 'proveedores.html', role: 'admin' },
                { id: 'compras', label: 'Compras', icon: 'fa-shopping-bag', href: 'compras.html', role: 'admin' },
                { id: 'gastos', label: 'Gastos', icon: 'fa-file-invoice-dollar', href: 'gastos.html', role: 'admin' },
                { id: 'usuarios', label: 'Usuarios', icon: 'fa-users-cog', href: 'usuarios.html', role: 'admin' }
            ]
        }
    ];

    // --- 2. SIDEBAR (SOLO ESCRITORIO) ---
    const sidebarHTML = `
        <aside class="hidden md:flex flex-col w-64 bg-black border-r border-gray-900 flex-shrink-0 transition-all duration-300 h-full">
            <div class="flex items-center justify-center h-20 border-b border-gray-900 flex-shrink-0">
                <img src="../assets/img/logo.jpg" alt="Soriano" class="h-10 w-10 rounded-full border border-soriano-red mr-3 object-cover">
                <span class="text-xl font-serif text-white tracking-widest">SORIANO</span>
            </div>

            <nav class="flex-1 overflow-y-auto custom-scrollbar py-6">
                <div class="space-y-6 px-4">
                    ${menuGroups.map(group => `
                        <div>
                            <h3 class="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-2 pl-2">${group.title}</h3>
                            <ul class="space-y-1">
                                ${group.items.map(item => {
                                    const isActive = item.id === activePageId;
                                    const isHighlight = item.highlight;
                                    let classes = "flex items-center px-3 py-2.5 rounded-lg transition-all border group ";
                                    
                                    if (isActive) {
                                        classes += "bg-soriano-red/10 text-soriano-red border-soriano-red/20 shadow-lg shadow-red-900/10";
                                    } else if (isHighlight) {
                                        classes += "bg-gray-900 text-green-400 hover:text-white border-transparent hover:bg-gray-800";
                                    } else {
                                        classes += "hover:bg-gray-900 text-gray-400 hover:text-white border-transparent";
                                    }

                                    const liClass = (item.role === 'admin') ? 'admin-only hidden' : '';

                                    return `
                                    <li class="${liClass}"> 
                                        <a href="${item.href}" class="${classes}">
                                            <i class="fas ${item.icon} w-6 text-center text-sm ${isActive ? 'text-soriano-red' : (isHighlight ? 'text-green-500' : 'text-gray-500 group-hover:text-white')}"></i>
                                            <span class="ml-3 font-medium text-sm">${item.label}</span>
                                        </a>
                                    </li>`;
                                }).join('')}
                            </ul>
                        </div>
                    `).join('')}
                </div>
            </nav>

            <div class="border-t border-gray-900 p-4 bg-gray-900/30 flex-shrink-0">
                <div class="flex items-center">
                    <div id="sidebarAvatar" class="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-soriano-red font-bold font-serif border border-gray-700">U</div>
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

    // --- 3. BOTTOM BAR (TIPO APP - SOLO MÓVIL) ---
    // Seleccionamos los items clave para la barra inferior
    const bottomNavHTML = `
        <div class="md:hidden fixed bottom-0 left-0 right-0 h-[70px] bg-[#121214] border-t border-gray-800 flex items-center justify-between px-6 z-50 shadow-2xl safe-area-bottom">
            
            <a href="index.html" class="flex flex-col items-center justify-center w-12 gap-1 ${activePageId === 'dashboard' ? 'text-soriano-red' : 'text-gray-500'}">
                <i class="fas fa-home text-lg"></i>
                <span class="text-[9px] font-medium">Inicio</span>
            </a>

            <a href="ordenes.html" class="flex flex-col items-center justify-center w-12 gap-1 ${activePageId === 'ordenes' ? 'text-soriano-red' : 'text-gray-500'}">
                <i class="fas fa-tshirt text-lg"></i>
                <span class="text-[9px] font-medium">Órdenes</span>
            </a>

            <div class="relative -top-5">
                <a href="nueva-orden.html" class="flex items-center justify-center w-14 h-14 bg-soriano-red rounded-full text-white shadow-lg shadow-red-900/50 border-4 border-[#121214] transform active:scale-95 transition-transform">
                    <i class="fas fa-plus text-xl"></i>
                </a>
            </div>

            <a href="inventario.html" class="flex flex-col items-center justify-center w-12 gap-1 ${activePageId === 'inventario' ? 'text-soriano-red' : 'text-gray-500'}">
                <i class="fas fa-boxes text-lg"></i>
                <span class="text-[9px] font-medium">Stock</span>
            </a>

            <button id="mobileMenuBtn" class="flex flex-col items-center justify-center w-12 gap-1 text-gray-500">
                <i class="fas fa-bars text-lg"></i>
                <span class="text-[9px] font-medium">Menú</span>
            </button>
        </div>

        <div id="mobileMenuOverlay" class="fixed inset-0 z-[60] bg-black/95 hidden flex-col p-6 md:hidden transition-opacity duration-300">
            <div class="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
                <div class="flex items-center">
                    <img src="../assets/img/logo.jpg" class="h-8 w-8 rounded-full border border-soriano-red mr-3">
                    <span class="text-xl font-serif text-white">Menú Completo</span>
                </div>
                <button id="closeMobileMenu" class="w-10 h-10 bg-gray-800 rounded-full text-white flex items-center justify-center">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <nav class="flex-1 overflow-y-auto">
                <div class="grid grid-cols-2 gap-4">
                    <a href="clientes.html" class="bg-gray-900 p-4 rounded-xl flex flex-col items-center justify-center gap-2 border border-gray-800 hover:border-soriano-red transition">
                        <i class="fas fa-address-book text-2xl text-soriano-gold"></i>
                        <span class="text-sm font-bold text-gray-300">Clientes</span>
                    </a>
                    <a href="talleres.html" class="bg-gray-900 p-4 rounded-xl flex flex-col items-center justify-center gap-2 border border-gray-800 hover:border-soriano-red transition">
                        <i class="fas fa-industry text-2xl text-blue-400"></i>
                        <span class="text-sm font-bold text-gray-300">Talleres</span>
                    </a>
                    <a href="gastos.html" class="admin-only hidden bg-gray-900 p-4 rounded-xl flex flex-col items-center justify-center gap-2 border border-gray-800 hover:border-soriano-red transition">
                        <i class="fas fa-file-invoice-dollar text-2xl text-red-400"></i>
                        <span class="text-sm font-bold text-gray-300">Gastos</span>
                    </a>
                    <a href="usuarios.html" class="admin-only hidden bg-gray-900 p-4 rounded-xl flex flex-col items-center justify-center gap-2 border border-gray-800 hover:border-soriano-red transition">
                        <i class="fas fa-users-cog text-2xl text-purple-400"></i>
                        <span class="text-sm font-bold text-gray-300">Usuarios</span>
                    </a>
                </div>
                
                <div class="mt-8 space-y-2">
                    <a href="proveedores.html" class="admin-only hidden block p-3 text-gray-400 hover:text-white border-b border-gray-800"><i class="fas fa-truck w-6"></i> Proveedores</a>
                    <a href="compras.html" class="admin-only hidden block p-3 text-gray-400 hover:text-white border-b border-gray-800"><i class="fas fa-shopping-bag w-6"></i> Compras</a>
                </div>
            </nav>

            <button id="mobileLogoutBtn" class="w-full bg-red-900/20 text-red-400 py-3 rounded-lg mt-4 font-bold border border-red-900/50">
                <i class="fas fa-sign-out-alt mr-2"></i> Cerrar Sesión
            </button>
        </div>
    `;

    // --- 4. INYECCIÓN EN DOM ---
    layoutContainer.insertAdjacentHTML('afterbegin', sidebarHTML);
    document.body.insertAdjacentHTML('beforeend', bottomNavHTML);

    // Ajuste importante: Padding inferior en móvil para que la barra no tape contenido
    const mainContent = layoutContainer.querySelector('main');
    if (mainContent) {
        mainContent.classList.add('pb-[80px]', 'md:pb-0'); // 70px bar + 10px buffer
    }

    // --- 5. LISTENERS ---
    setupGlobalListeners();
}

function setupGlobalListeners() {
    // Logout
    const btn = document.getElementById('globalLogoutBtn');
    const btnMob = document.getElementById('mobileLogoutBtn');
    if(btn) btn.addEventListener('click', handleLogout);
    if(btnMob) btnMob.addEventListener('click', handleLogout);

    // Menú Móvil Overlay
    const menuBtn = document.getElementById('mobileMenuBtn');
    const closeBtn = document.getElementById('closeMobileMenu');
    const overlay = document.getElementById('mobileMenuOverlay');

    if (menuBtn && overlay) {
        menuBtn.addEventListener('click', () => {
            overlay.classList.remove('hidden');
            overlay.classList.add('flex');
        });
    }

    if (closeBtn && overlay) {
        closeBtn.addEventListener('click', () => {
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');
        });
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

export function updateSidebarUser(user, userData) {
    const nameEl = document.getElementById('sidebarName');
    const roleEl = document.getElementById('sidebarRole');
    const avatarEl = document.getElementById('sidebarAvatar');
    const adminItems = document.querySelectorAll('.admin-only');

    if (nameEl && userData) {
        nameEl.textContent = userData.name || user.email.split('@')[0];
        roleEl.textContent = userData.role || "Staff";
        avatarEl.textContent = (userData.name || "U").charAt(0).toUpperCase();

        if (userData.role === 'admin') {
            adminItems.forEach(el => el.classList.remove('hidden'));
        }
    }
}