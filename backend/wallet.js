// wallet.js
require('dotenv').config();
const { Wallet } = require('nexa-wallet-sdk'); // ✅ ¡Cambio clave!

let walletInstance = null;

function getWallet() {
    if (!walletInstance) {
        const mnemonic = process.env.MNEMONIC;
        if (!mnemonic) {
            throw new Error('MNEMONIC no definido en .env');
        }
        walletInstance = new Wallet(mnemonic); // ✅ Funciona igual
    }
    return walletInstance;
}

async function getBalance() {
    const wallet = getWallet();
    try {
        const response = await fetch(`https://api.nexa.org/v1/address/${wallet.address}`);
        const data = await response.json();
        return data.balance;
    } catch (error) {
        console.error('❌ Error al obtener saldo:', error.message);
        throw new Error('No se pudo obtener el saldo de la faucet');
    }
}

async function sendFaucet(toAddress, amountSatoshis) {
    throw new Error(
        '🚫 Envío desde backend no permitido. Recarga la faucet manualmente enviando NEXA a: ' +
        getWallet().address
    );
}

module.exports = { getWallet, getBalance, sendFaucet };