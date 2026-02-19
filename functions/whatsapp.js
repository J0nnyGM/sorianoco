const functions = require('firebase-functions');
const admin = require('firebase-admin');
const db = admin.firestore();


exports.verifyWebhook = (req, res) => {
    const verify_token = process.env.WHATSAPP_VERIFY_TOKEN;
    let mode = req.query["hub.mode"];
    let token = req.query["hub.verify_token"];
    let challenge = req.query["hub.challenge"];

    if (mode && token) {
        if (mode === "subscribe" && token === verify_token) {
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.status(400).send("Faltan parámetros");
    }
};

// RECIBIR MENSAJES DEL CLIENTE
exports.processMessage = async (req, res) => {
    let body = req.body;

    if (body.object && body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
        let messageInfo = body.entry[0].changes[0].value.messages[0];
        let contactInfo = body.entry[0].changes[0].value.contacts[0];
        
        let from = messageInfo.from;
        let msg_id = messageInfo.id;
        let timestamp = messageInfo.timestamp;
        let profileName = contactInfo.profile.name;
        
        let msg_type = messageInfo.type || "text";
        let msg_body = "";
        let mediaUrl = null;

        const token = process.env.WHATSAPP_API_TOKEN;

        try {
            // Procesar Textos
            if (msg_type === "text") {
                msg_body = messageInfo.text.body;
            } 
            // Procesar Imágenes o Documentos Entrantes
            else if (msg_type === "image" || msg_type === "document") {
                let mediaId = messageInfo[msg_type].id;
                msg_body = messageInfo[msg_type].caption || (msg_type === "image" ? "📷 Imagen enviada" : "📄 Archivo enviado");
                
                // 1. Obtener URL de descarga desde Meta
                const metaRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const metaData = await metaRes.json();

                if (metaData.url) {
                    // 2. Descargar el archivo binario
                    const mediaRes = await fetch(metaData.url, { headers: { 'Authorization': `Bearer ${token}` } });
                    const buffer = await mediaRes.arrayBuffer();
                    
                    // 3. Subir a nuestro Firebase Storage
                    const bucket = admin.storage().bucket();
                    const ext = msg_type === "image" ? "jpg" : "pdf";
                    const fileName = `whatsapp_inbound/${mediaId}.${ext}`;
                    const file = bucket.file(fileName);
                    
                    await file.save(Buffer.from(buffer), {
                        metadata: { contentType: mediaRes.headers.get('content-type') }
                    });

                    // Generar URL pública amigable de Firebase
                    mediaUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media`;
                }
            } else {
                msg_body = "📦 Tipo de mensaje no soportado en la web (Audio/Ubicación)";
            }

            // Guardar en Firestore
            const batch = db.batch();
            const chatRef = db.collection("whatsapp_chats").doc(from);
            
            batch.set(chatRef, {
                phoneNumber: from,
                profileName: profileName,
                lastMessage: msg_body,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                unreadCount: admin.firestore.FieldValue.increment(1),
                status: 'open'
            }, { merge: true });

            const msgRef = chatRef.collection("messages").doc(msg_id);
            batch.set(msgRef, {
                from: from,
                body: msg_body,
                mediaUrl: mediaUrl, // Guardamos la URL si existe
                timestamp: new Date(timestamp * 1000),
                type: msg_type,
                direction: "inbound"
            });

            await batch.commit();
        } catch (error) {
            console.error("Error guardando mensaje:", error);
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
};

// ENVIAR MENSAJES (Texto, Imágenes o PDFs) DESDE EL CRM
exports.sendMessage = async (reqData, context) => {
    const functions = require('firebase-functions');
    
    let payload = reqData;
    let userAuth = context ? context.auth : undefined;

    // Detectar si Firebase ejecutó esto como V2 (empaquetado)
    if (reqData && reqData.auth !== undefined) {
        payload = reqData.data;
        userAuth = reqData.auth;
    }

    // Validación de seguridad
    if (!userAuth) {
        console.error("Petición sin token. Revisa que el frontend envíe auth.app");
        throw new functions.https.HttpsError('unauthenticated', 'Sin sesión. El usuario no está autenticado.');
    }

    const { to, message, mediaUrl, mediaType, fileName } = payload;

    if (!to) {
        throw new functions.https.HttpsError('invalid-argument', 'Falta el destinatario.');
    }

    const token = process.env.WHATSAPP_API_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;

    // Armar el paquete para la API de Meta
    let metaPayload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
    };

    if (mediaUrl) {
        metaPayload.type = mediaType; 
        metaPayload[mediaType] = { link: mediaUrl };
        
        if (mediaType === 'image' && message) {
            metaPayload[mediaType].caption = message; 
        } else if (mediaType === 'document') {
            metaPayload[mediaType].caption = message || ""; 
            metaPayload[mediaType].filename = fileName || "Documento.pdf"; 
        }
    } else {
        metaPayload.type = "text";
        metaPayload.text = { preview_url: false, body: message };
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(metaPayload)
        });

        const result = await response.json();
        if (result.error) throw new Error(result.error.message);

        // Guardar en Firestore
        const msg_id = result.messages[0].id;
        const chatRef = db.collection("whatsapp_chats").doc(to);
        const msgRef = chatRef.collection("messages").doc(msg_id);

        const batch = db.batch();
        let lastMsgText = mediaUrl ? (mediaType === 'image' ? `📷 Imagen enviada` : `📄 Documento enviado`) : `Tú: ${message}`;
        if (mediaUrl && message) lastMsgText += ` - ${message}`;

        batch.set(chatRef, { lastMessage: lastMsgText, lastUpdated: admin.firestore.FieldValue.serverTimestamp(), status: 'open' }, { merge: true });

        batch.set(msgRef, {
            from: "admin", 
            body: message || "",
            mediaUrl: mediaUrl || null,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            type: mediaType || "text",
            direction: "outbound"
        });

        await batch.commit();
        return { success: true, messageId: msg_id };

    } catch (error) {
        console.error("Error API Meta:", error);
        throw new functions.https.HttpsError('internal', 'Error al enviar a WhatsApp.');
    }
};