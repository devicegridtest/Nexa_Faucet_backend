// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getBalance, sendFaucet, getFaucetAddress } = require('./wallet');
const { canRequest, saveRequest, db } = require('./database');
const bech32 = require('bech32');
const { UnitUtils } = require('libnexa-ts'); // ✅

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors({
    origin: [
        'null',
        'http://localhost:3000',
        'http://127.0.0.1:5500',
        'https://devicegridtest.org'
    ]
}));
app.use(express.json());

// Validación de dirección
function isValidNexaAddress(address) {
    if (!address?.startsWith('nexa:')) return false;
    try {
        const { data } = bech32.decode(address.slice(5), 702);
        return data.length === 20;
    } catch { return false; }
}

// Saldo
app.get('/balance', async (req, res) => {
    try {
        const sats = await getBalance(); // 10050000
        const nexa = UnitUtils.formatNEXA(sats); // "100500.00"
        res.json({
            success: true,
            balance: sats,
            balanceInNEXA: nexa,
            address: await getFaucetAddress()
        });
    } catch (e) {
        res.status(500).json({ error: 'Saldo no disponible' });
    }
});

// Faucet
app.post('/faucet', async (req, res) => {
    const { address } = req.body;
    if (!isValidNexaAddress(address)) return res.status(400).json({ error: 'Dirección inválida' });
    if (!(await canRequest(address))) return res.status(429).json({ error: 'Espera 24h' });

    const balance = await getBalance();
    const amount = parseInt(process.env.FAUCET_AMOUNT) || 1; // 1 satoshi = 0.01 NEXA

    if (balance < amount) return res.status(500).json({ error: 'Faucet sin fondos' });

    try {
        const txid = await sendFaucet(address, amount);
        await saveRequest(address);
        const amountNEXA = UnitUtils.formatNEXA(amount); // "0.01"
        res.json({ success: true, txid, amount, message: `Enviados ${amountNEXA} NEXA` });
    } catch (e) {
        res.status(500).json({ error: 'Error al enviar' });
    }
});

// Transacciones
app.get('/transactions', (req, res) => {
    db.all(`SELECT address, last_request FROM requests ORDER BY last_request DESC LIMIT 5`, 
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Error en transacciones' });
            res.json({
                success: true,
                transactions: rows.map(r => ({
                    address: r.address,
                    date: new Date(r.last_request).toLocaleString('es-ES'),
                    shortAddress: r.address.substring(0, 12) + '...'
                }))
            });
        });
});

// Limpiar cooldowns
app.post('/clear-cooldown', (req, res) => {
    db.run('DELETE FROM requests', (err) => {
        if (err) return res.status(500).json({ error: 'Error al limpiar' });
        res.json({ success: true, message: 'Cooldowns limpiados' });
    });
});

app.use('*', (req, res) => res.status(404).json({ error: 'No encontrado' }));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Faucet corriendo en puerto ${PORT}`);
});
