// backend/wallet.js
require('dotenv').config();
const { Wallet, rostrumProvider } = require('nexa-wallet-sdk');
const { UnitUtils } = require('libnexa-ts');

let walletInstance = null;

async function getWallet() {
    if (!walletInstance) {
        const mnemonic = process.env.MNEMONIC;
        if (!mnemonic) {
            throw new Error('MNEMONIC no definido en .env');
        }

        try {
            await rostrumProvider.connect('mainnet');
            walletInstance = new Wallet(mnemonic, 'mainnet');
            await walletInstance.initialize();
        } catch (error) {
            console.error('❌ Error al crear billetera:', error.message);
            throw error;
        }
    }
    return walletInstance;
}

async function getBalance() {
    const wallet = await getWallet();
    const account = wallet.accountStore.getAccount('1.0');
    
    // El saldo en account.balance.confirmed está en NEXA (ej: "500.00")
    const balanceNEXA = String(account.balance.confirmed);

    try {
        // ✅ Convierte de NEXA (string) a satoshis (bigint)
        const balanceInSats = UnitUtils.parseNEXA(balanceNEXA);
        // Devuelve como número entero (safe para valores < 2^53)
        return Number(balanceInSats);
    } catch (err) {
        console.error('Error al convertir saldo a satoshis:', err);
        return 0;
    }
}

async function sendFaucet(toAddress, amountSatoshis) {
    const wallet = await getWallet();
    const account = wallet.accountStore.getAccount('1.0');

    try {
        // amountSatoshis es un entero (ej: 1 = 0.01 NEXA)
        const tx = await wallet.newTransaction(account)
            .onNetwork('mainnet')
            .sendTo(toAddress, amountSatoshis.toString()) // lib espera string
            .populate()
            .sign()
            .build();

        const txid = await wallet.sendTransaction(tx.serialize());
        return txid;
    } catch (error) {
        console.error('❌ Error al enviar NEXA:', error.message);
        throw new Error(`No se pudo enviar: ${error.message}`);
    }
}

async function getFaucetAddress() {
    const wallet = await getWallet();
    const account = wallet.accountStore.getAccount('1.0');
    // Retorna la dirección en formato string (ej: "nexa:...")
    return account.getNewAddress().toString();
}

module.exports = { getWallet, getBalance, sendFaucet, getFaucetAddress };
