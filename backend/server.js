// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getWallet, getBalance, sendFaucet, getFaucetAddress } = require('./wallet');
const { canRequest, saveRequest, db } = require('./database');
const bech32 = require('bech32');

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ CORS: URLs limpias
app.use(cors({
    origin: [
        'null',
        'http://localhost:3000',
        'http://127.0.0.1:5500',
        'http://127.0.0.1:8080',
        'https://tudominio.com',
        'https://devicegridtest.org'
    ],
    credentials: true,
    optionsSuccessStatus: 200
}));

app.use(express.json());

// Logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Ruta de salud
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Faucet Backend Activo' });
});

// Validación de dirección Nexa
function isValidNexaAddress(address) {
    if (!address || typeof address !== 'string') return false;
    const prefix = 'nexa:';
    if (!address.startsWith(prefix)) return false;
    const bech32Data = address.slice(prefix.length);
    try {
        const { data } = bech32.decode(bech32Data, 702);
        return data.length === 20;
    } catch {
        return false;
    }
}

// 🚀 Enviar fondos
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
            return res.status(429).json({ error: 'Ya solicitaste fondos. Espera 24 horas.' });
        }

        const balance = await getBalance();
        const amount = parseInt(process.env.FAUCET_AMOUNT, 10) || 1; // 1 satoshi = 0.01 NEXA

        if (balance < amount) {
            return res.status(500).json({ error: 'Faucet sin fondos suficientes.' });
        }

        let txid;
        try {
            txid = await sendFaucet(address, amount);
            await saveRequest(address);

            const amountInNEXA = (amount / 100).toFixed(2); // "0.01"
            console.log(`✅ Enviado ${amountInNEXA} NEXA a ${address}. TXID: ${txid}`);

            res.json({
                success: true,
                txid,
                amount,
                message: `Enviados ${amountInNEXA} NEXA a ${address}`
            });

        } catch (sendError) {
            console.error('❌ Error al enviar transacción:', sendError.message);
            res.status(500).json({ error: 'No se pudo enviar la transacción.' });
        }

    } catch (error) {
        console.error('❌ Error en faucet:', error.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// 🔁 Saldo actual
app.get('/balance', async (req, res) => {
    try {
        const balanceInSats = await getBalance(); // Siempre en satoshis
        const balanceInNEXA = (balanceInSats / 100).toFixed(4); // "100500.0000"

        res.json({
            success: true,
            balance: balanceInSats,
            balanceInNEXA,
            address: await getFaucetAddress()
        });
    } catch (error) {
        console.error('Error obteniendo saldo:', error);
        res.status(500).json({ error: 'No se pudo obtener saldo' });
    }
});

// 📊 Transacciones
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

// Ruta no encontrada
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', async () => {
    try {
        const address = await getFaucetAddress();
        console.log(`🚀 Faucet Backend corriendo en puerto ${PORT}`);
        console.log(`🔑 Dirección de la faucet: ${address}`);
    } catch (walletError) {
        console.error('❌ No se pudo cargar la billetera:', walletError.message);
    }
});
