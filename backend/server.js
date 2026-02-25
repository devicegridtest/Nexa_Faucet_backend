// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getBalance, sendFaucet, getFaucetAddress } = require('./wallet');
const { canRequest, saveRequest, db } = require('./database');
const { UnitUtils } = require('libnexa-ts');
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET;
const app = express();
const PORT = process.env.PORT || 10000;

// ✅ CORS: URLs limpias
app.use(cors({
    origin: [
        'null',
        'http://localhost:3000',
        'http://127.0.0.1:5500',
        'https://devicegridtest.org'
    ],
    credentials: true,
    optionsSuccessStatus: 200
}));

app.use(express.json());

// ✅ Enviar la clave pública de reCAPTCHA al frontend
app.get('/api/recaptcha-key', (req, res) => {
    const siteKey = process.env.RECAPTCHA_SITE_KEY;

    if (!siteKey) {
        console.warn('⚠️ Falta RECAPTCHA_SITE_KEY en el archivo .env');
        return res.status(500).json({ error: 'RECAPTCHA_SITE_KEY no configurada' });
    }

    res.json({ siteKey });
});


// Middleware de logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// ✅ VALIDACIÓN SIMPLE Y FUNCIONAL (¡LA CLAVE!)
function isValidNexaAddress(address) {
    if (!address || typeof address !== 'string') return false;
    const regex = /^nexa:[a-z0-9]{48,90}$/;
    return regex.test(address);
}

// 🚀 Ruta principal: Enviar fondos
app.post('/faucet', async (req, res) => {
    const { address } = req.body;

    try {
        if (!address || typeof address !== 'string') {
            return res.status(400).json({ error: 'Dirección requerida' });
        }

        if (!isValidNexaAddress(address)) {
            return res.status(400).json({ error: 'Dirección Nexa inválida' });
        }

        const allowed = await canRequest(address);
        if (!allowed) {
            return res.status(429).json({ 
                error: 'Ya solicitaste fondos. Espera 24 horas.' 
            });
        }

        const balance = await getBalance();
        // En la ruta /faucet
        const amount = parseInt(process.env.FAUCET_AMOUNT) || 1000000; 

        if (balance < amount) {
            return res.status(500).json({ 
                error: 'Faucet sin fondos suficientes. Por favor, recárgala manualmente.' 
            });
        }

        let txid;
        try {
            txid = await sendFaucet(address, amount);
            await saveRequest(address);

            const amountInNEXA = UnitUtils.formatNEXA(amount);
            console.log(`✅ Enviado ${amountInNEXA} NEXA a ${address}. TXID: ${txid}`);

            res.json({
                success: true,
                txid,
                amount,
                message: `Enviados ${amountInNEXA} NEXA a ${address}`
            });

        } catch (sendError) {
            console.error('❌ Error al enviar transacción:', sendError.message);
            res.status(500).json({ 
                error: 'No se pudo enviar la transacción. Verifica tu billetera o el saldo.'
            });
        }

    } catch (error) {
        console.error('❌ Error en faucet:', error.message);
        res.status(500).json({ 
            error: 'Error interno del servidor'
        });
    }
});

app.get('/balance', async (req, res) => {
    try {
        const balance = await getBalance(); // en satoshis
        const balanceInNEXA = balance / 100; // convertir a NEXA (1 NEXA = 100 satoshis)

        res.json({
            success: true,
            balance,           // en satoshis (para uso interno si se necesita)
            balanceInNEXA,     //  en NEXA (para mostrar al usuario)
            address: await getFaucetAddress()
        });
    } catch (error) {
        console.error('Error obteniendo saldo:', error);
        res.status(500).json({ error: 'No se pudo obtener saldo' });
    }
});

// 📊 Últimas transacciones
app.get('/transactions', (req, res) => {
    db.all(`
        SELECT address, last_request 
        FROM requests 
        ORDER BY last_request DESC 
        LIMIT 5
    `, [], (err, rows) => {
        if (err) {
            console.error('Error obteniendo transacciones:', err);
            return res.status(500).json({ error: 'Error obteniendo transacciones' });
        }

        const transactions = rows.map(row => ({
            address: row.address,
            date: new Date(row.last_request).toLocaleString('es-ES'),
            shortAddress: row.address.substring(0, 12) + '...'
        }));

        res.json({ success: true, transactions });
    });
});

// 🧹 Limpiar cooldowns
app.post('/clear-cooldown', (req, res) => {
    db.run('DELETE FROM requests', (err) => {
        if (err) {
            console.error('❌ Error al limpiar cooldowns:', err.message);
            return res.status(500).json({ error: 'Error al limpiar cooldowns' });
        }
        console.log('🧹 Todos los cooldowns han sido eliminados');
        res.json({ success: true, message: 'Cooldowns limpiados' });
    });
});

// ⛔ Ruta no encontrada
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
});

// ✅ Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Faucet Backend corriendo en puerto ${PORT}`);


});
