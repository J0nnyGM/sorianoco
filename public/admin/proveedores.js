import { auth, db, onAuthStateChanged } from '../js/firebase-init.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { updateSidebarUser } from '../js/global-components.js';

// DOM
const tableBody = document.getElementById('suppliersTableBody');
const modal = document.getElementById('supplierModal');
const form = document.getElementById('supplierForm');
const modalTitle = document.getElementById('modalTitle');

// Inputs
const idInput = document.getElementById('supplierId');
const companyInput = document.getElementById('companyName');
const nitInput = document.getElementById('companyNit');
const catInput = document.getElementById('category');
const contactInput = document.getElementById('contactName');
const phoneInput = document.getElementById('contactPhone');
const emailInput = document.getElementById('contactEmail');
const addressInput = document.getElementById('address');

// Init
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = '../auth/login.html';
        return;
    }
    // Sidebar
    import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js")
        .then(({ getDoc }) => getDoc(doc(db, "users", user.uid)))
        .then(snap => { if(snap.exists()) updateSidebarUser(user, snap.data()) });

    subscribeSuppliers();
});

function subscribeSuppliers() {
    const q = query(collection(db, "suppliers"), orderBy("companyName"));

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-gray-500">No hay proveedores registrados.</td></tr>`;
            return;
        }

        tableBody.innerHTML = snapshot.docs.map(doc => {
            const data = doc.data();
            return `
                <tr class="hover:bg-gray-800/50 transition-colors group border-b border-gray-800/50">
                    <td class="px-6 py-4">
                        <div class="font-bold text-white">${data.companyName}</div>
                        <div class="text-xs text-gray-500">${data.nit || 'NIT Pendiente'}</div>
                    </td>
                    <td class="px-6 py-4">
                        <div class="text-sm text-gray-300">${data.contactName || '-'}</div>
                        <div class="text-xs text-gray-500 flex items-center mt-1">
                            <i class="fas fa-phone mr-1"></i> ${data.phone}
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="px-2 py-1 rounded text-xs border border-gray-700 bg-gray-800 text-gray-400 capitalize">
                            ${data.category}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-right space-x-2">
                        <button onclick="window.editSupplier('${doc.id}', '${encodeURIComponent(JSON.stringify(data))}')" 
                            class="text-soriano-gold hover:text-white transition p-2" title="Editar">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                        <button onclick="window.deleteSupplier('${doc.id}', '${data.companyName}')" 
                            class="text-gray-600 hover:text-red-500 transition p-2" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    });
}

// CREATE / UPDATE
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = idInput.value;
    const data = {
        companyName: companyInput.value,
        nit: nitInput.value,
        category: catInput.value,
        contactName: contactInput.value,
        phone: phoneInput.value,
        email: emailInput.value,
        address: addressInput.value,
        updatedAt: serverTimestamp()
    };

    try {
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
    }
});

// MODALS
window.openModal = () => {
    form.reset();
    idInput.value = "";
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
    emailInput.value = data.email || "";
    addressInput.value = data.address || "";
    
    modalTitle.textContent = "Editar Proveedor";
    modal.classList.remove('hidden'); modal.classList.add('flex');
};

window.closeModal = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };
window.deleteSupplier = async (id, name) => { 
    if(confirm(`¿Eliminar a ${name}?`)) await deleteDoc(doc(db, "suppliers", id)); 
};