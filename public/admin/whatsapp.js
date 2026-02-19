import { auth, db, storage, onAuthStateChanged } from '../js/firebase-init.js';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, where, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-functions.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { updateSidebarUser } from '../js/global-components.js';
// NUEVO: Vincular Functions estrictamente a la app inicializada


const functions = getFunctions(auth.app);


// Contenedores Principales
const crmHeader = document.getElementById('crmHeader');
const chatsListContainer = document.getElementById('chatsListContainer'); 
const chatWindow = document.getElementById('chatWindow'); 

const chatsList = document.getElementById('chatsList');
const messagesList = document.getElementById('messagesList');
const currentChatName = document.getElementById('currentChatName');
const currentChatPhone = document.getElementById('currentChatPhone');
const currentChatAvatar = document.getElementById('currentChatAvatar');
const btnResolveChat = document.getElementById('btnResolveChat');
const clientCrmInfo = document.getElementById('clientCrmInfo'); 

const searchChat = document.getElementById('searchChat');
const tabOpen = document.getElementById('tabOpen');
const tabResolved = document.getElementById('tabResolved');

const messageInput = document.getElementById('messageInput');
const btnSendMessage = document.getElementById('btnSendMessage');
const sessionExpiredAlert = document.getElementById('sessionExpiredAlert'); 

const mediaInput = document.getElementById('mediaInput');
const attachmentPreview = document.getElementById('attachmentPreview');
const attachmentName = document.getElementById('attachmentName');
const attachmentSize = document.getElementById('attachmentSize');
const attachmentIcon = document.getElementById('attachmentIcon');
const btnRemoveAttachment = document.getElementById('btnRemoveAttachment');

let activeChatId = null;
let messagesUnsubscribe = null;
let pendingFile = null; 
let chatsCache = [];
let currentFilter = 'open'; 

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = '../auth/login.html'; return; }
    import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js")
        .then(({ getDoc }) => getDoc(doc(db, "users", user.uid)))
        .then(snap => { if(snap.exists()) updateSidebarUser(user, snap.data()) });
    
    subscribeToChats();
});

window.setChatFilter = (status) => {
    currentFilter = status;
    if (status === 'open') {
        tabOpen.className = "flex-1 py-3 md:py-2 text-xs font-bold text-green-400 border-b-2 border-green-500 transition";
        tabResolved.className = "flex-1 py-3 md:py-2 text-xs font-bold text-gray-500 border-b-2 border-transparent hover:text-gray-300 transition";
    } else {
        tabResolved.className = "flex-1 py-3 md:py-2 text-xs font-bold text-green-400 border-b-2 border-green-500 transition";
        tabOpen.className = "flex-1 py-3 md:py-2 text-xs font-bold text-gray-500 border-b-2 border-transparent hover:text-gray-300 transition";
    }
    renderChats();
};

searchChat.addEventListener('input', renderChats);

function subscribeToChats() {
    const q = query(collection(db, "whatsapp_chats"), orderBy("lastUpdated", "desc"));
    onSnapshot(q, (snapshot) => {
        chatsCache = [];
        snapshot.forEach(doc => {
            let data = doc.data();
            data.id = doc.id;
            chatsCache.push(data);
        });
        renderChats();
    });
}

function renderChats() {
    const searchTerm = (searchChat.value || '').toLowerCase();
    
    const filteredChats = chatsCache.filter(chat => {
        const matchesStatus = (chat.status || 'open') === currentFilter;
        const pName = (chat.profileName || '').toLowerCase();
        const pPhone = (chat.phoneNumber || '').toLowerCase();
        
        const matchesSearch = pName.includes(searchTerm) || pPhone.includes(searchTerm);
        return matchesStatus && matchesSearch;
    });

    if(filteredChats.length === 0) {
        chatsList.innerHTML = `<div class="p-6 text-center text-gray-500 text-sm">No hay conversaciones en esta vista.</div>`;
        return;
    }

    let html = '';
    filteredChats.forEach(chat => {
        let dateStr = '';
        if (chat.lastUpdated) {
            const dateObj = typeof chat.lastUpdated.toDate === 'function' ? chat.lastUpdated.toDate() : new Date(chat.lastUpdated.seconds * 1000);
            dateStr = dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }

        const isUnread = chat.unreadCount > 0;
        const bgClass = activeChatId === chat.id ? 'bg-gray-800 border-l-4 border-green-500' : 'hover:bg-white/5 border-l-4 border-transparent';
        const initial = (chat.profileName || 'U').charAt(0).toUpperCase();
        
        const safeName = (chat.profileName || 'Desconocido').replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const safeSeconds = chat.lastUpdated?.seconds || 0;

        html += `
            <div class="p-4 cursor-pointer transition ${bgClass} flex items-center gap-3" onclick="window.openChat('${chat.id}', '${safeName}', '${chat.status || 'open'}', ${safeSeconds})">
                <div class="w-12 h-12 rounded-full bg-gray-700 flex-shrink-0 flex items-center justify-center text-white font-bold relative">
                    ${initial}
                    ${isUnread ? `<span class="absolute -top-1 -right-1 bg-green-500 text-black text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold border-2 border-[#18181b]">${chat.unreadCount}</span>` : ''}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-baseline mb-1">
                        <h4 class="text-white font-bold text-sm truncate">${chat.profileName || 'Desconocido'}</h4>
                        <span class="text-[10px] text-gray-500">${dateStr}</span>
                    </div>
                    <p class="text-xs ${isUnread ? 'text-white font-bold' : 'text-gray-500'} truncate">${chat.lastMessage || ''}</p>
                </div>
            </div>
        `;
    });
    chatsList.innerHTML = html;
}

// LOGICA MÓVIL: Cerrar Chat y Volver a Lista
window.closeChatMobile = () => {
    chatsListContainer.classList.remove('max-md:hidden');
    chatWindow.classList.add('max-md:hidden');
    if (crmHeader) crmHeader.classList.remove('max-md:hidden');
    
    // Restaurar Menú Inferior de App (definido en global-components)
    const bottomNav = document.querySelector('.safe-area-bottom');
    if (bottomNav) bottomNav.classList.remove('max-md:hidden');
    
    activeChatId = null;
    renderChats(); 
};

window.openChat = async (phoneId, profileName, status, lastUpdatedSeconds) => {
    activeChatId = phoneId;
    
    // LÓGICA MÓVIL: Maximizar Chat
    chatsListContainer.classList.add('max-md:hidden');
    chatWindow.classList.remove('max-md:hidden');
    if (crmHeader) crmHeader.classList.add('max-md:hidden');
    
    // Ocultar Menú Inferior Global para que el teclado no colapse mal la pantalla
    const bottomNav = document.querySelector('.safe-area-bottom');
    if (bottomNav) bottomNav.classList.add('max-md:hidden');

    currentChatName.textContent = profileName;
    currentChatPhone.textContent = phoneId;
    currentChatAvatar.textContent = (profileName || 'U').charAt(0).toUpperCase();
    
    let isSessionExpired = false;
    if (lastUpdatedSeconds > 0) {
        const lastUpdatedDate = new Date(lastUpdatedSeconds * 1000);
        const diffHours = Math.abs(new Date() - lastUpdatedDate) / 36e5;
        if (diffHours > 24) isSessionExpired = true;
    }

    if (isSessionExpired) {
        sessionExpiredAlert.classList.remove('hidden');
        messageInput.disabled = true;
        messageInput.placeholder = "Sesión caducada (+24 hrs).";
        btnSendMessage.disabled = true;
        mediaInput.disabled = true;
    } else {
        sessionExpiredAlert.classList.add('hidden');
        messageInput.disabled = false;
        messageInput.placeholder = "Mensaje...";
        mediaInput.disabled = false;
    }

    clientCrmInfo.innerHTML = '<i class="fas fa-circle-notch fa-spin text-gray-500 text-xs mr-2"></i>';
    clientCrmInfo.classList.remove('hidden');
    clientCrmInfo.classList.add('flex');

    try {
        const clientsRef = collection(db, "clients");
        const qClient = query(clientsRef, where("phone", "==", phoneId));
        const querySnapshot = await getDocs(qClient);

        if (!querySnapshot.empty) {
            const clientData = querySnapshot.docs[0];
            const name = clientData.data().name || clientData.data().nombre || 'Cliente';
            const clientId = clientData.id;
            const safeCName = name.replace(/'/g, "\\'");

            // Interfaz responsiva para los botones de perfil (Texto oculto en móvil pequeño)
            clientCrmInfo.innerHTML = `
                <div class="flex items-center gap-1.5 md:gap-2">
                    <a href="cliente-detalle.html?id=${clientId}" class="bg-blue-900/30 text-blue-400 border border-blue-800 p-1.5 md:px-3 md:py-1.5 rounded-lg text-xs hover:bg-blue-900/50 transition flex items-center gap-1.5" title="Ver Perfil">
                        <i class="fas fa-user"></i> <span class="hidden md:inline">${name}</span>
                    </a>
                    <button onclick="window.viewClientOrders('${clientId}', '${safeCName}')" class="bg-soriano-gold/20 text-soriano-gold border border-soriano-gold/50 p-1.5 md:px-3 md:py-1.5 rounded-lg text-xs hover:bg-soriano-gold/40 transition flex items-center gap-1.5 shadow-lg shadow-soriano-gold/10" title="Ver Órdenes">
                        <i class="fas fa-shopping-bag"></i> <span class="hidden md:inline">Órdenes</span>
                    </button>
                </div>
            `;
        } else {
            clientCrmInfo.innerHTML = `
                <a href="clientes.html?new=${phoneId}&name=${encodeURIComponent(profileName)}" class="bg-gray-800 text-gray-400 border border-gray-700 p-1.5 md:px-3 md:py-1.5 rounded-lg text-xs hover:bg-gray-700 hover:text-white transition flex items-center gap-1.5">
                    <i class="fas fa-user-plus"></i> <span class="hidden md:inline">Registrar</span>
                </a>
            `;
        }
    } catch (error) {
        console.error("Error buscando cliente:", error);
        clientCrmInfo.classList.add('hidden');
    }

    btnResolveChat.classList.remove('hidden');
    if(status === 'resolved') {
        btnResolveChat.innerHTML = '<i class="fas fa-reply md:hidden"></i><span class="hidden md:inline">Reabrir Chat</span>';
        btnResolveChat.classList.add('text-green-400');
    } else {
        btnResolveChat.innerHTML = '<i class="fas fa-check md:hidden"></i><span class="hidden md:inline">Marcar Resuelto</span>';
        btnResolveChat.classList.remove('text-green-400');
    }

    await updateDoc(doc(db, "whatsapp_chats", phoneId), { unreadCount: 0 }).catch(e=>console.log("Error quitando unread:", e));

    if(messagesUnsubscribe) messagesUnsubscribe();

    messagesList.innerHTML = '<div class="text-center text-gray-500 text-sm mt-10"><i class="fas fa-circle-notch fa-spin"></i> Cargando conversación...</div>';

    const qMsg = query(collection(db, `whatsapp_chats/${phoneId}/messages`), orderBy("timestamp", "asc"));
    
    messagesUnsubscribe = onSnapshot(qMsg, (snapshot) => {
        messagesList.innerHTML = '';
        
        snapshot.forEach(doc => {
            const msg = doc.data();
            
            let timeStr = '';
            if (msg.timestamp) {
                const dateObj = typeof msg.timestamp.toDate === 'function' ? msg.timestamp.toDate() : new Date(msg.timestamp);
                timeStr = dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            }

            const isOutbound = msg.direction === 'outbound'; 
            const bubbleClass = isOutbound 
                ? 'bg-green-800 text-green-50 rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl ml-auto' 
                : 'bg-gray-800 text-gray-200 rounded-tl-2xl rounded-tr-2xl rounded-br-2xl';

            let mediaHtml = '';
            if (msg.type === 'image' && msg.mediaUrl) {
                mediaHtml = `<img src="${msg.mediaUrl}" class="rounded-lg mb-2 max-w-full cursor-pointer border border-gray-600/50 hover:opacity-90" onclick="window.open('${msg.mediaUrl}', '_blank')">`;
            } else if (msg.type === 'document' && msg.mediaUrl) {
                mediaHtml = `<a href="${msg.mediaUrl}" target="_blank" class="flex items-center gap-2 bg-black/30 p-2 rounded-lg mb-2 hover:bg-black/50 transition border border-gray-600/50"><i class="fas fa-file-pdf text-red-400 text-2xl"></i><span class="text-xs underline truncate w-32">Ver Documento</span></a>`;
            }

            // CORRECCIÓN: break-words para evitar desbordamiento horizontal en móvil
            const textHtml = msg.body ? `<p class="text-sm break-words">${msg.body}</p>` : '';

            messagesList.innerHTML += `
                <div class="flex w-full mb-4">
                    <div class="max-w-[85%] md:max-w-[75%] p-3 shadow-md ${bubbleClass}">
                        ${mediaHtml}
                        ${textHtml}
                        <span class="text-[10px] ${isOutbound ? 'text-green-300' : 'text-gray-500'} block text-right mt-1">${timeStr}</span>
                    </div>
                </div>
            `;
        });
        messagesList.scrollTop = messagesList.scrollHeight;
        renderChats(); 
    });
};

window.insertQuickReply = (text) => {
    if (messageInput.disabled) return;
    messageInput.value = messageInput.value ? messageInput.value + " " + text : text;
    messageInput.focus();
    btnSendMessage.disabled = false;
};

mediaInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 16 * 1024 * 1024) { alert("El archivo es muy pesado. Máximo 16MB."); return; }

    pendingFile = file;
    attachmentName.textContent = file.name;
    attachmentSize.textContent = (file.size / 1024 / 1024).toFixed(2) + ' MB';
    
    if (file.type.includes('image')) attachmentIcon.className = "fas fa-file-image text-2xl text-blue-400";
    else attachmentIcon.className = "fas fa-file-pdf text-2xl text-red-400";

    attachmentPreview.classList.remove('hidden');
    attachmentPreview.classList.add('flex');
    btnSendMessage.disabled = false;
});

btnRemoveAttachment.addEventListener('click', () => {
    pendingFile = null;
    mediaInput.value = '';
    attachmentPreview.classList.add('hidden');
    attachmentPreview.classList.remove('flex');
    btnSendMessage.disabled = messageInput.value.trim() === '';
});

messageInput.addEventListener('input', () => { btnSendMessage.disabled = messageInput.value.trim() === ''; });
messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!btnSendMessage.disabled) btnSendMessage.click(); }});

btnSendMessage.addEventListener('click', async () => {
    const text = messageInput.value.trim();
    if (!text && !pendingFile) return;

    messageInput.disabled = true; btnSendMessage.disabled = true; btnSendMessage.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

    try {
        let mediaUrl = null; let mediaType = "text";
        if (pendingFile) {
            mediaType = pendingFile.type.includes('image') ? 'image' : 'document';
            const storageRef = ref(storage, `whatsapp_outbound/${Date.now()}_${pendingFile.name}`);
            await uploadBytes(storageRef, pendingFile);
            mediaUrl = await getDownloadURL(storageRef);
        }

        const sendMsgFunction = httpsCallable(functions, 'sendWhatsappMessage');
        await sendMsgFunction({ to: activeChatId, message: text, mediaUrl: mediaUrl, mediaType: mediaType, fileName: pendingFile ? pendingFile.name : null });
        
        messageInput.value = ''; btnRemoveAttachment.click(); 
    } catch (error) {
        console.error("Error al enviar:", error); alert("Error al enviar. Inténtalo de nuevo.");
    } finally {
        messageInput.disabled = false; messageInput.focus(); btnSendMessage.innerHTML = '<i class="fas fa-paper-plane"></i>'; btnSendMessage.disabled = true;
    }
});

btnResolveChat.addEventListener('click', async () => {
    if(!activeChatId) return;
    const isResolved = btnResolveChat.textContent.trim().includes("Reabrir");
    const newStatus = isResolved ? 'open' : 'resolved';
    try { await updateDoc(doc(db, "whatsapp_chats", activeChatId), { status: newStatus }); } 
    catch (error) { console.error("Error:", error); }
});

window.viewClientOrders = async (clientId, clientName) => {
    const panel = document.getElementById('clientOrdersPanel');
    const overlay = document.getElementById('clientOrdersOverlay');
    const title = document.getElementById('clientOrdersTitle');
    const listContainer = document.getElementById('clientOrdersList');
    const linkFullProfile = document.getElementById('linkFullProfile');

    title.textContent = `Órdenes de ${clientName}`;
    linkFullProfile.href = `cliente-detalle.html?id=${clientId}`;
    
    listContainer.innerHTML = '<div class="text-center py-12"><i class="fas fa-circle-notch fa-spin text-soriano-gold text-3xl mb-4"></i><p class="text-sm text-gray-400">Buscando historial...</p></div>';
    
    overlay.classList.remove('hidden');
    setTimeout(() => {
        panel.classList.remove('translate-x-full');
        panel.classList.add('translate-x-0');
    }, 10);

    try {
        const ordersRef = collection(db, "orders");
        const qOrders = query(ordersRef, where("clientId", "==", clientId));
        const snap = await getDocs(qOrders);

        if (snap.empty) {
            listContainer.innerHTML = `
                <div class="text-center py-12 text-gray-500">
                    <i class="fas fa-box-open text-5xl mb-4 opacity-20"></i>
                    <p class="text-sm">Este cliente aún no tiene órdenes registradas.</p>
                </div>`;
            return;
        }

        let orders = [];
        snap.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
        orders.sort((a, b) => {
            const timeA = a.createdAt ? (a.createdAt.seconds || 0) : 0;
            const timeB = b.createdAt ? (b.createdAt.seconds || 0) : 0;
            return timeB - timeA;
        });

        const copFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

        let html = '';
        orders.forEach(order => {
            let dateStr = 'Fecha desconocida';
            if (order.createdAt) {
                const dateObj = typeof order.createdAt.toDate === 'function' ? order.createdAt.toDate() : new Date(order.createdAt.seconds * 1000);
                dateStr = dateObj.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
            }

            const statusColors = {
                'recibido': 'bg-gray-800 text-gray-300 border-gray-600',
                'proceso': 'bg-blue-900/30 text-blue-400 border-blue-800',
                'prueba': 'bg-purple-900/30 text-purple-400 border-purple-800',
                'terminado': 'bg-green-900/30 text-green-400 border-green-800',
                'entregado': 'bg-soriano-gold/20 text-soriano-gold border-soriano-gold/50'
            };
            const currentStatus = order.status || 'recibido';
            const badgeClass = statusColors[currentStatus] || 'bg-gray-800 text-white border-gray-600';

            const orderIdText = order.orderNumber ? `Orden #${order.orderNumber}` : `Orden (Sin consecutivo)`;
            const total = order.total ? copFormatter.format(order.total) : '$0';

            html += `
                <div class="bg-black border border-gray-800 p-4 rounded-xl hover:border-soriano-gold/50 transition group relative overflow-hidden">
                    <div class="absolute left-0 top-0 bottom-0 w-1 ${badgeClass.split(' ')[0]}"></div>
                    <div class="pl-2 flex flex-col gap-2">
                        <div class="flex justify-between items-start">
                            <h4 class="text-white font-bold text-sm">${orderIdText}</h4>
                            <span class="text-[9px] px-2 py-0.5 rounded uppercase font-bold border ${badgeClass}">${currentStatus}</span>
                        </div>
                        
                        <div class="flex justify-between items-end mt-1">
                            <p class="text-xs text-gray-500"><i class="far fa-calendar-alt mr-1"></i> ${dateStr}</p>
                            <p class="text-sm font-mono text-gray-300 font-bold">${total}</p>
                        </div>

                        <div class="mt-2 pt-3 border-t border-gray-800/50">
                            <a href="orden-detalle.html?id=${order.id}" target="_blank" class="w-full text-center py-2 bg-gray-900 hover:bg-gray-800 text-gray-300 text-xs rounded-lg transition font-bold block">
                                Ver Detalles <i class="fas fa-external-link-alt ml-1"></i>
                            </a>
                        </div>
                    </div>
                </div>
            `;
        });
        listContainer.innerHTML = html;

    } catch (error) {
        console.error("Error cargando órdenes:", error);
        listContainer.innerHTML = '<div class="text-center text-red-500 py-8 text-sm"><i class="fas fa-exclamation-circle text-2xl mb-2"></i><br>Error al cargar.</div>';
    }
};

window.closeOrdersPanel = () => {
    const panel = document.getElementById('clientOrdersPanel');
    const overlay = document.getElementById('clientOrdersOverlay');
    panel.classList.remove('translate-x-0');
    panel.classList.add('translate-x-full');
    setTimeout(() => { overlay.classList.add('hidden'); }, 300);
};