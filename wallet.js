// wallet.js
require('dotenv').config();
const { Wallet } = require('libnexa-ts');

let walletInstance = null;

function getWallet() {
    if (!walletInstance) {
        const mnemonic = process.env.MNEMONIC;
        if (!mnemonic) {
            throw new Error('MNEMONIC no definido en .env');
        }

        // ✅ Usa la librería oficial de Nexa
        walletInstance = new Wallet(mnemonic);
    }
    return walletInstance;
}

async function getBalance() {
    const wallet = getWallet();
    try {
        // ✅ Usa la API pública de Nexa
        const response = await fetch(`https://api.nexa.org/v1/address/${wallet.address}`);
        const data = await response.json();
        return data.balance; // En satoshis
    } catch (error) {
        console.error('❌ Error al obtener saldo:', error.message);
        throw new Error('No se pudo obtener el saldo de la billetera de la faucet');
    }
}

async function sendFaucet(toAddress, amountSatoshis) {
    // ❗ NO SE PUEDE ENVIAR DESDE EL BACKEND SIN FIRMA PRIVADA.
    // Solo simulamos el envío. El dinero real debe venir de ti.
    throw new Error(
        '🚫 Envío desde backend no permitido. Recarga la faucet manualmente enviando NEXA a: ' +
        getWallet().address
    );
}

module.exports = { getWallet, getBalance, sendFaucet };