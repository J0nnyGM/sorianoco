import { auth, db, storage, onAuthStateChanged } from '../js/firebase-init.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { updateSidebarUser } from '../js/global-components.js';

// --- DOM ELEMENTS ---
const tableBody = document.getElementById('inventoryTableBody');
const itemsCount = document.getElementById('itemsCount');
const inventoryValueDisplay = document.getElementById('inventoryValueDisplay');
const searchInput = document.getElementById('searchInput');
const filterType = document.getElementById('filterType');

// Modal Elements
const modal = document.getElementById('itemModal');
const modalTitle = document.getElementById('modalTitle');
const saveBtn = document.getElementById('saveBtn');

// Inputs Form
const itemIdInput = document.getElementById('itemId');
const classificationSelect = document.getElementById('classification');
const typeSelect = document.getElementById('itemType');
const nameInput = document.getElementById('itemName');
const skuInput = document.getElementById('itemSku');
const costInput = document.getElementById('itemCost');
const priceInput = document.getElementById('itemPrice'); // PRECIO VENTA
const currentImageUrl = document.getElementById('currentImageUrl');

// Imagen
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');
const imageIcon = document.getElementById('imageIcon');

// Stock Sections
const simpleStockSection = document.getElementById('simpleStockSection');
const sizesStockSection = document.getElementById('sizesStockSection');
const sizesContainer = document.getElementById('sizesContainer'); 
const totalSizesDisplay = document.getElementById('totalSizesDisplay');
const itemQty = document.getElementById('itemQty');
const itemUnit = document.getElementById('itemUnit');
const itemMin = document.getElementById('itemMin');

// --- DATA ---
let inventoryCache = [];

const categories = {
    material: ['Tela', 'Hilo', 'Botón/Cierre', 'Adorno', 'Empaque', 'Otro'],
    producto: ['Camisa', 'Chaqueta', 'Pantalón', 'Blazer', 'Chaleco', 'Calzado', 'Accesorio']
};

const sizeConfigs = {
    'Camisa': ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    'Chaqueta': ['34', '36', '38', '40', '42', '44'],
    'Pantalón': ['28', '30', '32', '34', '36', '38', '40', '42'],
    'Blazer': ['34', '36', '38', '40', '42', '44'],
    'Chaleco': ['34', '36', '38', '40', '42', '44'],
    'Calzado': ['38', '39', '40', '41', '42'],
    'Accesorio': ['Única']
};

const copFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

// --- 1. INIT ---
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../auth/login.html'; return; }
    
    import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js")
        .then(({ getDoc }) => getDoc(doc(db, "users", user.uid)))
        .then(snap => { if(snap.exists()) updateSidebarUser(user, snap.data()) });

    subscribeInventory();
});

// --- 2. LÓGICA UI ---
searchInput.addEventListener('input', applyFilters);
filterType.addEventListener('change', applyFilters);

function applyFilters() {
    const term = searchInput.value.toLowerCase();
    const type = filterType.value;

    const filtered = inventoryCache.filter(item => {
        const matchesTerm = item.name.toLowerCase().includes(term) || 
                            (item.sku && item.sku.toLowerCase().includes(term)) ||
                            item.type.toLowerCase().includes(term);
        const matchesType = type === 'all' || item.classification === type;
        return matchesTerm && matchesType;
    });
    renderTable(filtered);
}

// Función global para formatear inputs de moneda
window.formatCurrencyInput = (input) => {
    let value = input.value.replace(/\D/g, ''); 
    if (value === '') { input.value = ''; return; }
    input.value = new Intl.NumberFormat('es-CO').format(parseInt(value));
};

classificationSelect.addEventListener('change', () => { populateCategories(); updateFormUI(); });
typeSelect.addEventListener('change', renderSizeInputs); 

imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.src = e.target.result;
            imagePreview.classList.remove('hidden');
            imageIcon.classList.add('hidden');
        };
        reader.readAsDataURL(file);
    }
});

function populateCategories() {
    const type = classificationSelect.value;
    typeSelect.innerHTML = '';
    categories[type].forEach(cat => {
        typeSelect.innerHTML += `<option value="${cat}">${cat}</option>`;
    });
    if(type === 'producto') renderSizeInputs();
}

function updateFormUI() {
    const type = classificationSelect.value;
    if (type === 'producto') {
        simpleStockSection.classList.add('hidden');
        sizesStockSection.classList.remove('hidden');
        renderSizeInputs();
    } else {
        simpleStockSection.classList.remove('hidden');
        sizesStockSection.classList.add('hidden');
    }
}

function renderSizeInputs() {
    const category = typeSelect.value;
    const sizes = sizeConfigs[category] || ['Única'];
    
    sizesContainer.innerHTML = sizes.map(size => `
        <div>
            <label class="text-[10px] text-center block text-gray-400 mb-1">${size}</label>
            <input type="number" min="0" data-size="${size}" class="size-input w-full bg-black border border-gray-700 rounded text-center text-sm h-9 focus:border-soriano-gold outline-none" placeholder="0" oninput="if(this.value < 0) this.value = 0;">
        </div>
    `).join('');

    document.querySelectorAll('.size-input').forEach(input => {
        input.addEventListener('input', calculateTotalStock);
    });
    calculateTotalStock();
}

function calculateTotalStock() {
    let total = 0;
    document.querySelectorAll('.size-input').forEach(i => total += parseFloat(i.value || 0));
    totalSizesDisplay.textContent = total;
}

// --- 3. DATABASE ---
function subscribeInventory() {
    const q = query(collection(db, "inventory"), orderBy("name"));
    onSnapshot(q, (snapshot) => {
        inventoryCache = [];
        snapshot.forEach(doc => inventoryCache.push({ id: doc.id, ...doc.data() }));
        applyFilters();
    });
}

function renderTable(list) {
    itemsCount.textContent = `${list.length} ítems`;
    let totalValue = 0;

    if (list.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-gray-500 italic">No hay resultados.</td></tr>`;
        inventoryValueDisplay.textContent = "Valor Total: $0";
        return;
    }

    tableBody.innerHTML = list.map(data => {
        const isProduct = data.classification === 'producto';
        const totalQty = parseFloat(data.quantity || 0);
        totalValue += totalQty * (data.cost || 0);

        // Stock Visual
        let stockHtml = '';
        if (isProduct && data.sizes) {
            const sizesHtml = Object.entries(data.sizes)
                .filter(([_, qty]) => qty > 0)
                .map(([size, qty]) => `<span class="text-[10px] bg-gray-800 border border-gray-600 px-1.5 py-0.5 rounded text-gray-300 mr-1">${size}:${qty}</span>`)
                .join('');
            stockHtml = `<div class="flex flex-wrap justify-end gap-1 mb-1">${sizesHtml || '<span class="text-red-500 text-xs">Agotado</span>'}</div><div class="text-[10px] text-gray-500">Total: <strong>${totalQty}</strong></div>`;
        } else {
            const isLow = totalQty <= parseFloat(data.minStock || 0);
            stockHtml = `<div class="${isLow ? 'text-red-400 font-bold' : 'text-white'} text-sm">${totalQty} ${data.unit}</div>`;
        }

        // Imagen
        const imgHtml = data.imageUrl 
            ? `<img src="${data.imageUrl}" class="w-10 h-10 rounded-lg object-cover border border-gray-700 cursor-pointer hover:scale-150 transition z-10" onclick="window.open('${data.imageUrl}')">` 
            : `<div class="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-gray-600 border border-gray-700"><i class="fas fa-box"></i></div>`;

        return `
            <tr class="hover:bg-white/5 transition border-b border-gray-800/50 group">
                <td class="px-6 py-4">${imgHtml}</td>
                <td class="px-6 py-4">
                    <div class="font-bold text-white text-sm group-hover:text-soriano-gold transition">${data.name}</div>
                    <div class="text-xs text-gray-500 font-mono tracking-wide mt-0.5 bg-gray-900 inline-block px-1.5 rounded border border-gray-800">${data.sku}</div>
                </td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 rounded text-xs border border-gray-700 bg-gray-800 text-gray-300 capitalize">${data.type}</span>
                </td>
                <td class="px-6 py-4 text-right">${stockHtml}</td>
                <td class="px-6 py-4 text-right text-green-400 font-mono text-sm">${copFormatter.format(data.cost || 0)}</td>
                <td class="px-6 py-4 text-right text-soriano-gold font-mono text-sm font-bold">${copFormatter.format(data.price || 0)}</td>
                <td class="px-6 py-4 text-right whitespace-nowrap">
                    <div class="flex justify-end gap-2">
                        <button onclick="window.editItem('${data.id}')" class="w-8 h-8 rounded bg-gray-800 hover:bg-soriano-gold hover:text-black text-gray-400 transition flex items-center justify-center" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                        <button onclick="window.deleteItem('${data.id}', '${data.name}')" class="w-8 h-8 rounded bg-gray-800 hover:bg-red-900/50 hover:text-red-400 text-gray-500 transition flex items-center justify-center" title="Eliminar"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    inventoryValueDisplay.textContent = `Valor Costo: ${copFormatter.format(totalValue)}`;
}

// --- 4. GUARDAR ---
saveBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    
    if (!nameInput.value) { alert("Nombre requerido"); return; }
    
    const originalContent = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Guardando...';
    saveBtn.disabled = true;

    try {
        const id = itemIdInput.value;
        const classification = classificationSelect.value;
        
        let finalSku = skuInput.value.trim().toUpperCase();
        if (!finalSku) {
            const prefix = nameInput.value.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'ITM';
            finalSku = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
        }

        const cost = parseInt(costInput.value.replace(/\D/g, '')) || 0;
        const price = parseInt(priceInput.value.replace(/\D/g, '')) || 0;

        let data = {
            classification,
            name: nameInput.value,
            sku: finalSku,
            type: typeSelect.value,
            cost: cost,
            price: price, // NUEVO CAMPO
            updatedAt: serverTimestamp()
        };

        // Imagen
        let imageUrl = currentImageUrl.value;
        if (imageInput.files[0]) {
            const file = imageInput.files[0];
            const storageRef = ref(storage, `inventory/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            imageUrl = await getDownloadURL(storageRef);
        }
        data.imageUrl = imageUrl || null;

        if (classification === 'producto') {
            const sizesObj = {};
            let total = 0;
            document.querySelectorAll('.size-input').forEach(input => {
                const val = parseFloat(input.value || 0);
                if (val > 0) sizesObj[input.dataset.size] = val;
                total += val;
            });
            data.sizes = sizesObj;
            data.quantity = total;
            data.unit = 'und';
            data.minStock = 0;
        } else {
            data.quantity = parseFloat(itemQty.value || 0);
            data.unit = itemUnit.value;
            data.minStock = parseFloat(itemMin.value || 0);
            data.sizes = null;
        }

        if (id) {
            await updateDoc(doc(db, "inventory", id), data);
        } else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, "inventory"), data);
        }
        closeModal();

    } catch (error) {
        console.error("Error:", error);
        alert("Error al guardar: " + error.message);
    } finally {
        saveBtn.innerHTML = originalContent;
        saveBtn.disabled = false;
    }
});

// --- 5. MODALES ---
window.openModal = () => {
    document.getElementById('inventoryForm').reset();
    itemIdInput.value = "";
    currentImageUrl.value = "";
    
    // Reset Imagen
    imagePreview.src = "";
    imagePreview.classList.add('hidden');
    imageIcon.classList.remove('hidden');
    
    // HABILITAR EL COSTO (En creación sí se permite editar)
    costInput.disabled = false;
    costInput.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-900');
    costInput.placeholder = "0";

    classificationSelect.value = "material";
    populateCategories();
    updateFormUI();
    
    modalTitle.textContent = "Nuevo Ítem";
    modal.classList.remove('hidden'); modal.classList.add('flex');
};

window.editItem = (id, dataString) => {
    // Manejar string decodificado o búsqueda en cache
    let data;
    if (typeof dataString === 'string') {
        try {
            data = JSON.parse(decodeURIComponent(dataString));
        } catch(e) {
            data = inventoryCache.find(i => i.id === id);
        }
    } else {
        data = inventoryCache.find(i => i.id === id);
    }
    
    itemIdInput.value = id;
    nameInput.value = data.name;
    skuInput.value = data.sku;
    
    // Cargar costos
    costInput.value = new Intl.NumberFormat('es-CO').format(data.cost || 0);
    priceInput.value = new Intl.NumberFormat('es-CO').format(data.price || 0);

    // BLOQUEAR EL COSTO (En edición no se permite editar)
    costInput.disabled = true;
    costInput.classList.add('opacity-50', 'cursor-not-allowed', 'bg-gray-900');

    classificationSelect.value = data.classification || 'material';
    populateCategories();
    typeSelect.value = data.type;
    updateFormUI();

    if (data.imageUrl) {
        currentImageUrl.value = data.imageUrl;
        imagePreview.src = data.imageUrl;
        imagePreview.classList.remove('hidden');
        imageIcon.classList.add('hidden');
    } else {
        currentImageUrl.value = "";
        imagePreview.classList.add('hidden');
        imageIcon.classList.remove('hidden');
    }

    if (data.classification === 'producto') {
        renderSizeInputs();
        if (data.sizes) {
            document.querySelectorAll('.size-input').forEach(input => {
                input.value = data.sizes[input.dataset.size] || '';
            });
        }
        calculateTotalStock();
    } else {
        itemQty.value = data.quantity;
        itemUnit.value = data.unit;
        itemMin.value = data.minStock;
    }

    modalTitle.textContent = "Editar Ítem";
    modal.classList.remove('hidden'); modal.classList.add('flex');
};

window.closeModal = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };
window.deleteItem = async (id, name) => { if(confirm(`¿Eliminar "${name}"?`)) await deleteDoc(doc(db, "inventory", id)); };