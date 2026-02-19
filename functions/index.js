// functions/index.js (Actualizar)
require('dotenv').config();
const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

const whatsappHelper = require('./whatsapp');

// Webhook para recibir (Lo hicimos en el paso anterior)
exports.webhookWhatsapp = functions.https.onRequest((req, res) => {
    if (req.method === 'GET') return whatsappHelper.verifyWebhook(req, res);
    if (req.method === 'POST') return whatsappHelper.processMessage(req, res);
    return res.status(405).send('Método no permitido');
});

// NUEVO: Función para enviar (Llamada desde el frontend)
exports.sendWhatsappMessage = functions.https.onCall((data, context) => {
    return whatsappHelper.sendMessage(data, context);
});