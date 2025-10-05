require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { getBalance, sendFaucet, getFaucetAddress } = require('./wallet');
const { canRequest, saveRequest, db } = require('./database');
const { UnitUtils } = require('libnexa-ts');

const app = express();
const PORT = process.env.PORT || 10000;

/* ============================================
   🌐 CORS CONFIG
   ============================================ */
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

/* ============================================
   🧾 Middleware de logging
   ============================================ */
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

/* ============================================
   🧩 Función para validar direcciones Nexa
   ============================================ */
function isValidNexaAddress(address) {
    if (!address || typeof address !== 'string') return false;
    const regex = /^nexa:[a-z0-9]{48,90}$/;
    return regex.test(address);
}

/* ============================================
   🧠 Verificación de reCAPTCHA Invisible (v2)
   ============================================ */
async function verifyRecaptcha(token, remoteip) {
    try {
        const secret = process.env.RECAPTCHA_SECRET;
        if (!secret) {
            console.warn('⚠️ Falta RECAPTCHA_SECRET en .env');
            return { success: false };
        }

        const url = `https://www.google.com/recaptcha/api/siteverify?secret=${secret}&response=${token}&remoteip=${remoteip}`;
        const res = await fetch(url, { method: 'POST' });
        const data = await res.json();
        return data;
    } catch (err) {
        console.error("❌ Error verificando reCAPTCHA:", err);
        return { success: false };
    }
}

/* ============================================
   🚫 Rate Limit en memoria (por IP + dirección)
   ============================================ */
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hora
const MAX_REQUESTS_PER_IP = 3;
const MAX_REQUESTS_PER_ADDRESS = 1;

function rateLimitCheck(ip, address) {
    const now = Date.now();

    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, []);
    }
    if (!rateLimitMap.has(address)) {
        rateLimitMap.set(address, []);
    }

    const clean = (arr) => arr.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    rateLimitMap.set(ip, clean(rateLimitMap.get(ip)));
    rateLimitMap.set(address, clean(rateLimitMap.get(address)));

    if (rateLimitMap.get(ip).length >= MAX_REQUESTS_PER_IP) {
        return `Demasiadas solicitudes desde esta IP (${ip}). Intenta más tarde.`;
    }
    if (rateLimitMap.get(address).length >= MAX_REQUESTS_PER_ADDRESS) {
        return `Esta dirección (${address}) ya reclamó fondos recientemente.`;
    }

    rateLimitMap.get(ip).push(now);
    rateLimitMap.get(address).push(now);
    return null;
}

/* ============================================
   🚀 Ruta principal: Enviar fondos
   ============================================ */
app.post('/faucet', async (req, res) => {
    const { address, token } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    try {
        if (!address || typeof address !== 'string') {
            return res.status(400).json({ error: 'Dirección requerida' });
        }

        if (!isValidNexaAddress(address)) {
            return res.status(400).json({ error: 'Dirección Nexa inválida' });
        }

        // ✅ 1. Verificar reCAPTCHA primero
        if (!token) {
            return res.status(400).json({ error: 'Token reCAPTCHA faltante' });
        }

        const captcha = await verifyRecaptcha(token, ip);
        if (!captcha.success) {
            console.log('🚫 reCAPTCHA falló:', captcha);
            return res.status(403).json({
                error: 'Verificación reCAPTCHA fallida',
                details: captcha['error-codes'] || []
            });
        }

        // ✅ 2. Verificar rate limit local (anti-spam)
        const limitError = rateLimitCheck(ip, address);
        if (limitError) {
            return res.status(429).json({ error: limitError });
        }

        // ✅ 3. Revisar cooldown (24h global en DB)
        const allowed = await canRequest(address);
        if (!allowed) {
            return res.status(429).json({
                error: 'Ya solicitaste fondos. Espera 24 horas.'
            });
        }

        // ✅ 4. Revisar balance y enviar
        const balance = await getBalance();
        const amount = parseInt(process.env.FAUCET_AMOUNT) || 10000; // 100 NEXA = 10,000 satoshis
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

/* ============================================
   🔁 Obtener saldo
   ============================================ */
app.get('/balance', async (req, res) => {
    try {
        const balance = await getBalance();
        const balanceInNEXA = UnitUtils.formatNEXA(balance);

        res.json({
            success: true,
            balance,
            balanceInNEXA,
            address: await getFaucetAddress()
        });
    } catch (error) {
        console.error('Error obteniendo saldo:', error);
        res.status(500).json({ error: 'No se pudo obtener saldo' });
    }
});

/* ============================================
   📊 Últimas transacciones
   ============================================ */
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
            date: row.last_request,
            shortAddress: row.address.substring(0, 12) + '...'
        }));

        res.json({ success: true, transactions });
    });
});

/* ============================================
   🧹 Limpiar cooldowns
   ============================================ */
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

/* ============================================
   ⛔ Ruta no encontrada
   ============================================ */
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
});

/* ============================================
   🚀 Iniciar servidor
   ============================================ */
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Faucet Backend corriendo en puerto ${PORT}`);
});
