import { auth, db, storage, onAuthStateChanged } from '../js/firebase-init.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { updateSidebarUser } from '../js/global-components.js';

// DOM
const tableBody = document.getElementById('suppliersTableBody');
const mainSearch = document.getElementById('mainSearch');
const kpiTotal = document.getElementById('kpiTotal');
const kpiTalleres = document.getElementById('kpiTalleres');

const modal = document.getElementById('supplierModal');
const form = document.getElementById('supplierForm');
const modalTitle = document.getElementById('modalTitle');
const saveBtn = document.getElementById('saveBtn');

// Inputs Básicos
const idInput = document.getElementById('supplierId');
const companyInput = document.getElementById('companyName');
const nitInput = document.getElementById('companyNit');
const catInput = document.getElementById('category');
const contactInput = document.getElementById('contactName');
const phoneInput = document.getElementById('contactPhone');
const addressInput = document.getElementById('address');

// Inputs Financieros
const bankName = document.getElementById('bankName');
const accountType = document.getElementById('accountType');
const accountNumber = document.getElementById('accountNumber');
const accountKey = document.getElementById('accountKey');
const qrInput = document.getElementById('qrInput');
const qrPreview = document.getElementById('qrPreview');
const qrIcon = document.getElementById('qrIcon');
const currentQrUrl = document.getElementById('currentQrUrl');

let suppliersCache = [];

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../auth/login.html'; return; }
    import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js")
        .then(({ getDoc }) => getDoc(doc(db, "users", user.uid)))
        .then(snap => { if(snap.exists()) updateSidebarUser(user, snap.data()) });
    subscribeSuppliers();
});

function subscribeSuppliers() {
    const q = query(collection(db, "suppliers"), orderBy("companyName"));
    onSnapshot(q, (snapshot) => {
        suppliersCache = [];
        let talleresCount = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            suppliersCache.push(data);
            if(data.category === 'taller') talleresCount++;
        });
        kpiTotal.textContent = suppliersCache.length;
        kpiTalleres.textContent = talleresCount;
        renderTable(suppliersCache);
    });
}

mainSearch.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = suppliersCache.filter(s => 
        s.companyName.toLowerCase().includes(term) || 
        (s.contactName && s.contactName.toLowerCase().includes(term)) ||
        (s.nit && s.nit.toLowerCase().includes(term))
    );
    renderTable(filtered);
});

function renderTable(list) {
    if (list.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-gray-500">No se encontraron resultados.</td></tr>`;
        return;
    }

    tableBody.innerHTML = list.map(data => {
        let catColor = 'bg-gray-800 text-gray-400 border-gray-700';
        if(data.category === 'taller') catColor = 'bg-blue-900/30 text-blue-400 border-blue-900';
        if(data.category === 'telas') catColor = 'bg-green-900/30 text-green-400 border-green-900';
        
        // CORRECCIÓN: Botones siempre visibles (se quitó la opacidad condicional)
        return `
            <tr class="hover:bg-white/5 transition-colors border-b border-gray-800/50">
                <td class="px-6 py-4">
                    <div class="font-bold text-white">${data.companyName}</div>
                    <div class="text-[10px] text-gray-500 font-mono mt-0.5">NIT: ${data.nit || 'Pendiente'}</div>
                </td>
                <td class="px-6 py-4">
                    <div class="text-sm text-gray-300 font-medium">${data.contactName || '-'}</div>
                    <div class="text-[10px] text-gray-500 flex items-center mt-1 font-mono">
                        <i class="fas fa-phone mr-1"></i> ${data.phone}
                    </div>
                </td>
                <td class="px-6 py-4">
                    <span class="px-2.5 py-1 rounded text-[10px] border font-bold uppercase tracking-wider ${catColor}">
                        ${data.category}
                    </span>
                </td>
                <td class="px-6 py-4 text-right whitespace-nowrap">
                    <div class="flex justify-end gap-2">
                        <a href="proveedor-detalle.html?id=${data.id}" class="w-8 h-8 rounded bg-gray-800 hover:bg-blue-900/50 hover:text-blue-400 text-gray-400 transition flex items-center justify-center border border-gray-700" title="Ver Perfil y Pagos">
                            <i class="fas fa-eye"></i>
                        </a>
                        <button onclick="window.editSupplier('${data.id}', '${encodeURIComponent(JSON.stringify(data))}')" class="w-8 h-8 rounded bg-gray-800 hover:bg-soriano-gold hover:text-black text-gray-400 transition flex items-center justify-center border border-gray-700" title="Editar">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                        <button onclick="window.deleteSupplier('${data.id}', '${data.companyName}')" class="w-8 h-8 rounded bg-gray-800 hover:bg-red-900/50 hover:text-red-400 text-gray-400 transition flex items-center justify-center border border-gray-700" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Preview QR Image
qrInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => { qrPreview.src = e.target.result; qrPreview.classList.remove('hidden'); qrIcon.classList.add('hidden'); };
        reader.readAsDataURL(file);
    }
});

// CREATE / UPDATE
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Guardando...';
    
    const id = idInput.value;
    try {
        let qrUrl = currentQrUrl.value;
        if (qrInput.files[0]) {
            const file = qrInput.files[0];
            const storageRef = ref(storage, `proveedores_qr/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            qrUrl = await getDownloadURL(storageRef);
        }

        const data = {
            companyName: companyInput.value,
            nit: nitInput.value,
            category: catInput.value,
            contactName: contactInput.value,
            phone: phoneInput.value,
            address: addressInput.value,
            // Datos Financieros
            bankName: bankName.value,
            accountType: accountType.value,
            accountNumber: accountNumber.value,
            accountKey: accountKey.value,
            qrUrl: qrUrl,
            updatedAt: serverTimestamp()
        };

        if (id) {
            await updateDoc(doc(db, "suppliers", id), data);
        } else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, "suppliers"), data);
        }
        closeModal();
    } catch (error) {
        console.error("Error:", error);
        alert("Error al guardar proveedor.");
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Guardar";
    }
});

// MODALS
window.openModal = () => {
    form.reset();
    idInput.value = "";
    currentQrUrl.value = "";
    qrPreview.src = ""; qrPreview.classList.add('hidden'); qrIcon.classList.remove('hidden');
    modalTitle.textContent = "Nuevo Proveedor";
    modal.classList.remove('hidden'); modal.classList.add('flex');
};

window.editSupplier = (id, dataString) => {
    const data = JSON.parse(decodeURIComponent(dataString));
    idInput.value = id;
    companyInput.value = data.companyName;
    nitInput.value = data.nit || "";
    catInput.value = data.category;
    contactInput.value = data.contactName || "";
    phoneInput.value = data.phone;
    addressInput.value = data.address || "";
    
    bankName.value = data.bankName || "";
    accountType.value = data.accountType || "Ahorros";
    accountNumber.value = data.accountNumber || "";
    accountKey.value = data.accountKey || "";

    if (data.qrUrl) {
        currentQrUrl.value = data.qrUrl;
        qrPreview.src = data.qrUrl;
        qrPreview.classList.remove('hidden');
        qrIcon.classList.add('hidden');
    } else {
        currentQrUrl.value = "";
        qrPreview.src = "";
        qrPreview.classList.add('hidden');
        qrIcon.classList.remove('hidden');
    }

    modalTitle.textContent = "Editar Proveedor";
    modal.classList.remove('hidden'); modal.classList.add('flex');
};

window.closeModal = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };
window.deleteSupplier = async (id, name) => { 
    if(confirm(`¿Eliminar al proveedor ${name}?`)) await deleteDoc(doc(db, "suppliers", id)); 
};