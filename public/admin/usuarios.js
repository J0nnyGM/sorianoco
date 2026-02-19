import { auth, db, storage, onAuthStateChanged } from '../js/firebase-init.js';
import { collection, getDocs, doc, updateDoc, query, orderBy, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { updateSidebarUser } from '../js/global-components.js';

// --- Referencias DOM ---
const tableBody = document.getElementById('usersTableBody');
const filterAll = document.getElementById('filterAll');
const filterPending = document.getElementById('filterPending');
const badgePending = document.getElementById('badgePending');

// --- Referencias Modal Perfil ---
const profileModal = document.getElementById('userProfileModal');
const profileForm = document.getElementById('userProfileForm');
const profileModalTitle = document.getElementById('profileModalTitle');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const modalStatusDisplay = document.getElementById('modalStatusDisplay');

// Inputs Perfil
const editUserId = document.getElementById('editUserId');
const editUserStatus = document.getElementById('editUserStatus');
const userRole = document.getElementById('userRole');
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');
const userPhone = document.getElementById('userPhone');
const userAddress = document.getElementById('userAddress');

// Inputs Banco
const userBank = document.getElementById('userBank');
const userAccType = document.getElementById('userAccType');
const userAccNumber = document.getElementById('userAccNumber');

// Inputs Nómina
const userSalary = document.getElementById('userSalary');
const userTransport = document.getElementById('userTransport');
const userApplySS = document.getElementById('userApplySS');
const userSSOnMin = document.getElementById('userSSOnMin');
const ssOptions = document.getElementById('ssOptions');
const calcSalud = document.getElementById('calcSalud');
const calcPension = document.getElementById('calcPension');
const smlvDisplay = document.getElementById('smlvDisplay');
const auxTransDisplay = document.getElementById('auxTransDisplay');

// Inputs Foto
const userPhotoInput = document.getElementById('userPhotoInput');
const userPhotoPreview = document.getElementById('userPhotoPreview');
const userPhotoPlaceholder = document.getElementById('userPhotoPlaceholder');
const currentUserPhotoUrl = document.getElementById('currentUserPhotoUrl');

// Modal Suspender
const suspendModal = document.getElementById('suspendModal');
const suspendDesc = document.getElementById('suspendDesc');
const confirmSuspendBtn = document.getElementById('confirmSuspendBtn');

let allUsers = [];
let userToSuspendId = null;

// Constantes Financieras 2026 (Decreto Colombia)
const SMLV_ACTUAL = 1750905; 
const AUX_TRANS_ACTUAL = 249095;

const copFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

// --- 1. Inicialización ---
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../auth/login.html'; return; }
    
    try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if(userSnap.exists()){ updateSidebarUser(user, userSnap.data()); }
    } catch (e) { console.error("Error info", e); }

    // Mostrar valores legales en UI
    if(smlvDisplay) smlvDisplay.textContent = copFormatter.format(SMLV_ACTUAL);
    if(auxTransDisplay) auxTransDisplay.textContent = copFormatter.format(AUX_TRANS_ACTUAL);

    loadUsers();
});

// --- 2. Cargar Usuarios ---
async function loadUsers() {
    try {
        const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        
        allUsers = [];
        let pendingCount = 0;

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            allUsers.push({ id: doc.id, ...data });
            if (data.status === 'pending') pendingCount++;
        });

        updateBadge(pendingCount);
        renderTable(allUsers);

    } catch (error) {
        console.error("Error cargando usuarios:", error);
        if(tableBody) tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-red-500 italic">Error al cargar datos.</td></tr>`;
    }
}

// --- 3. Renderizar Tabla ---
function renderTable(usersList) {
    if (!tableBody) return;
    if (usersList.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-12 text-center text-gray-500 italic">No se encontraron usuarios.</td></tr>`;
        return;
    }

    tableBody.innerHTML = usersList.map(user => {
        let statusClass = "bg-gray-800 text-gray-400 border-gray-700";
        let statusText = "Desconocido";

        if (user.status === 'active') {
            statusClass = "bg-green-900/30 text-green-400 border-green-900";
            statusText = "Activo";
        } else if (user.status === 'pending') {
            statusClass = "bg-yellow-900/30 text-yellow-500 border-yellow-900 animate-pulse";
            statusText = "Pendiente";
        } else if (user.status === 'suspended') {
            statusClass = "bg-red-900/30 text-red-500 border-red-900";
            statusText = "Suspendido";
        }

        const roleText = user.role === 'admin' ? 'Administrador' : 
                         user.role === 'contabilidad' ? 'Contabilidad' : 
                         user.role === 'vendedor' ? 'Vendedor' : 'Sin Rol';

        const avatarHtml = user.photoUrl 
            ? `<img src="${user.photoUrl}" class="h-10 w-10 rounded-xl object-cover border border-gray-700 shadow-sm">`
            : `<div class="h-10 w-10 rounded-xl bg-gray-800 flex items-center justify-center text-sm font-black text-white border border-gray-700 shadow-inner">${(user.name || "U").charAt(0).toUpperCase()}</div>`;

        const dataStr = encodeURIComponent(JSON.stringify(user));

        return `
            <tr class="hover:bg-white/5 transition-colors group border-b border-gray-800/50 last:border-0">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-4">
                        ${avatarHtml}
                        <div>
                            <div class="font-bold text-white text-sm group-hover:text-purple-400 transition">${user.name || "Sin nombre"}</div>
                            <div class="text-[10px] text-gray-500 font-mono mt-0.5">${user.email}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <span class="text-xs font-bold tracking-wider uppercase text-gray-400">
                        ${roleText}
                    </span>
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider rounded border ${statusClass}">
                        ${statusText}
                    </span>
                </td>
                <td class="px-6 py-4 text-right whitespace-nowrap space-x-2">
                    ${user.status === 'pending' ? `
                        <button onclick="window.openProfileModal('${dataStr}', true)" class="text-green-400 hover:text-white text-[10px] uppercase font-bold tracking-widest border border-green-900 bg-green-900/20 px-4 py-2 rounded-lg hover:bg-green-600 transition shadow-sm">
                            Completar Ficha y Activar
                        </button>
                    ` : ''}
                    ${user.status === 'active' ? `
                        <button onclick="window.openProfileModal('${dataStr}', false)" class="w-8 h-8 rounded bg-gray-800 hover:bg-purple-600 hover:text-white text-gray-400 transition inline-flex items-center justify-center border border-gray-700 shadow-sm" title="Editar Ficha">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                        <button onclick="window.confirmSuspend('${user.id}', '${user.name}')" class="w-8 h-8 rounded bg-gray-800 hover:bg-red-900/50 hover:text-red-400 text-gray-400 transition inline-flex items-center justify-center border border-gray-700 shadow-sm" title="Suspender">
                            <i class="fas fa-ban"></i>
                        </button>
                    ` : ''}
                    ${user.status === 'suspended' ? `
                        <button onclick="window.reactivateUser('${user.id}')" class="text-gray-400 hover:text-green-400 text-[10px] uppercase font-bold tracking-widest border border-gray-800 bg-gray-900 px-4 py-2 rounded-lg hover:border-green-900 transition shadow-sm">
                            <i class="fas fa-redo mr-1"></i> Reactivar
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

// --- 4. LÓGICA DEL MODAL DE PERFIL (RRHH) ---

// Preview Foto Local
userPhotoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => { 
            userPhotoPreview.src = e.target.result; 
            userPhotoPreview.classList.remove('hidden'); 
            userPhotoPlaceholder.classList.add('hidden'); 
        };
        reader.readAsDataURL(file);
    }
});

// Botón Mágico: Autocompletar Mínimo Legal
window.autoFillMinimumWage = () => {
    userSalary.value = copFormatter.format(SMLV_ACTUAL);
    userTransport.value = copFormatter.format(AUX_TRANS_ACTUAL);
    calculatePayroll();
};

// Checkbox SS Logic
window.calculatePayroll = () => {
    const isChecked = userApplySS.checked;
    
    if (isChecked) {
        ssOptions.classList.remove('hidden');
        setTimeout(() => ssOptions.classList.remove('opacity-50'), 50);
        
        const isOnMin = userSSOnMin.checked;
        const rawSalary = userSalary.value.replace(/\D/g, '');
        const baseSalary = parseFloat(rawSalary || 0);
        
        let calculationBase = isOnMin ? SMLV_ACTUAL : baseSalary;
        
        // 4% Salud, 4% Pensión
        const eps = Math.round(calculationBase * 0.04);
        const pension = Math.round(calculationBase * 0.04);
        
        calcSalud.textContent = `-${copFormatter.format(eps)}`;
        calcPension.textContent = `-${copFormatter.format(pension)}`;

    } else {
        ssOptions.classList.add('opacity-50');
        setTimeout(() => ssOptions.classList.add('hidden'), 300);
        userSSOnMin.checked = false;
        calcSalud.textContent = `-$0`;
        calcPension.textContent = `-$0`;
    }
};

// Abrir Modal
window.openProfileModal = (dataStr, isActivating) => {
    const data = JSON.parse(decodeURIComponent(dataStr));
    
    profileForm.reset();
    
    editUserId.value = data.id;
    editUserStatus.value = isActivating ? 'active' : data.status; 

    currentUserPhotoUrl.value = data.photoUrl || "";
    if (data.photoUrl) {
        userPhotoPreview.src = data.photoUrl;
        userPhotoPreview.classList.remove('hidden');
        userPhotoPlaceholder.classList.add('hidden');
    } else {
        userPhotoPreview.src = "";
        userPhotoPreview.classList.add('hidden');
        userPhotoPlaceholder.classList.remove('hidden');
    }

    userRole.value = data.role || 'vendedor';
    userName.value = data.name || '';
    userEmail.value = data.email || '';
    userPhone.value = data.phone || '';
    userAddress.value = data.address || '';
    
    userBank.value = data.bankName || '';
    userAccType.value = data.accountType || 'Ahorros';
    userAccNumber.value = data.accountNumber || '';

    // --- NÓMINA (AQUÍ ESTÁ EL CAMBIO) ---
    userSalary.value = data.baseSalary ? copFormatter.format(data.baseSalary) : '';
    
    // Precargar el Auxilio de Transporte por defecto si no tiene uno guardado en BD
    // Respetamos si el administrador explícitamente le guardó $0 anteriormente.
    if (data.transportAllowance !== undefined) {
        userTransport.value = copFormatter.format(data.transportAllowance);
    } else {
        userTransport.value = copFormatter.format(AUX_TRANS_ACTUAL); // Precarga el valor quemado
    }

    userApplySS.checked = data.applySocialSecurity || false;
    userSSOnMin.checked = data.socialSecurityOnMinimum || false;

    calculatePayroll(); 

    profileModalTitle.textContent = isActivating ? "Completar Ficha y Activar" : "Ficha de Empleado";
    saveProfileBtn.innerHTML = isActivating ? '<i class="fas fa-check-circle mr-2"></i> Activar Empleado' : 'Guardar Cambios';
    modalStatusDisplay.innerHTML = isActivating ? '<span class="text-green-500 font-bold"><i class="fas fa-unlock"></i> El usuario tendrá acceso al guardar.</span>' : '';

    profileModal.classList.remove('hidden');
    profileModal.classList.add('flex');
};

window.closeProfileModal = () => {
    profileModal.classList.add('hidden');
    profileModal.classList.remove('flex');
};

// Guardar Perfil
profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveProfileBtn.disabled = true;
    saveProfileBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Guardando...';

    const uid = editUserId.value;
    const rawSal = userSalary.value.replace(/\D/g, '');
    const rawTrans = userTransport.value.replace(/\D/g, '');

    try {
        let photoUrl = currentUserPhotoUrl.value;

        if (userPhotoInput.files[0]) {
            const file = userPhotoInput.files[0];
            const storageRef = ref(storage, `users_photos/${uid}_${Date.now()}`);
            await uploadBytes(storageRef, file);
            photoUrl = await getDownloadURL(storageRef);
        }

        const updateData = {
            status: editUserStatus.value,
            role: userRole.value,
            name: userName.value,
            phone: userPhone.value,
            address: userAddress.value,
            photoUrl: photoUrl,
            
            bankName: userBank.value,
            accountType: userAccType.value,
            accountNumber: userAccNumber.value,
            
            baseSalary: parseFloat(rawSal || 0),
            transportAllowance: parseFloat(rawTrans || 0),
            applySocialSecurity: userApplySS.checked,
            socialSecurityOnMinimum: userSSOnMin.checked,
            updatedAt: new Date().toISOString()
        };

        await updateDoc(doc(db, "users", uid), updateData);
        closeProfileModal();
        loadUsers();

    } catch (error) {
        console.error("Error guardando ficha:", error);
        alert("Error al actualizar la información.");
    } finally {
        saveProfileBtn.disabled = false;
    }
});


// --- 5. SUSPENSIÓN Y REACTIVACIÓN ---
window.confirmSuspend = (uid, name) => {
    userToSuspendId = uid;
    suspendDesc.innerHTML = `Bloquear acceso al sistema para <strong>${name}</strong>`;
    suspendModal.classList.remove('hidden'); suspendModal.classList.add('flex');
};

if(confirmSuspendBtn) {
    confirmSuspendBtn.addEventListener('click', async () => {
        if(!userToSuspendId) return;
        confirmSuspendBtn.disabled = true;
        confirmSuspendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        try {
            await updateDoc(doc(db, "users", userToSuspendId), { status: 'suspended' });
            suspendModal.classList.add('hidden'); suspendModal.classList.remove('flex');
            loadUsers();
        } catch (e) { console.error(e); alert("Error"); } 
        finally { confirmSuspendBtn.disabled = false; confirmSuspendBtn.innerHTML = 'Suspender'; }
    });
}

window.reactivateUser = async (uid) => {
    if(!confirm("¿Reactivar acceso a este usuario?")) return;
    try {
        await updateDoc(doc(db, "users", uid), { status: 'active' });
        loadUsers();
    } catch(e) { console.error(e); }
};

// --- 6. Filtros y Utilidades ---
function updateBadge(count) {
    if(!badgePending) return;
    if (count > 0) {
        badgePending.textContent = count;
        badgePending.classList.remove('hidden');
    } else {
        badgePending.classList.add('hidden');
    }
}

if(filterAll) {
    filterAll.addEventListener('click', () => {
        renderTable(allUsers);
        filterAll.className = "px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition bg-gray-800 text-white shadow-sm border border-gray-700";
        filterPending.className = "px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition text-gray-500 hover:text-white relative";
    });
}

if(filterPending) {
    filterPending.addEventListener('click', () => {
        const pending = allUsers.filter(u => u.status === 'pending');
        renderTable(pending);
        filterPending.className = "px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition bg-gray-800 text-white shadow-sm border border-gray-700 relative";
        filterAll.className = "px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition text-gray-500 hover:text-white";
    });
}

window.formatCurrencyInput = (input) => {
    let value = input.value.replace(/\D/g, ''); 
    if (value === '') { input.value = ''; return; }
    input.value = new Intl.NumberFormat('es-CO').format(parseInt(value));
};