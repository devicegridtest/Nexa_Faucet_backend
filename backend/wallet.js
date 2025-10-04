// backend/wallet.js
require('dotenv').config();
const { Wallet, rostrumProvider } = require('nexa-wallet-sdk');
const { UnitUtils } = require('libnexa-ts');

let walletInstance = null;

const getWallet = async () => {
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
};

const getBalance = async () => {
    const wallet = await getWallet();
    const account = wallet.accountStore.getAccount('1.0');
    const rawBalance = account.balance.confirmed;

    // 🔍 Detecta automáticamente la unidad
    if (typeof rawBalance === 'string') {
        // Ej: "100500.00" → NEXA con 2 decimales
        try {
            const sats = UnitUtils.parseNEXA(rawBalance);
            return Number(sats);
        } catch (err) {
            console.error('Error parseando string a satoshis:', err);
            return 0;
        }
    }

    if (typeof rawBalance === 'number') {
        // Ej: 10050000 → asume satoshis
        return Math.floor(rawBalance);
    }

    console.error('Formato de saldo desconocido:', rawBalance);
    return 0;
};

const sendFaucet = async (toAddress, amountSatoshis) => {
    const wallet = await getWallet();
    const account = wallet.accountStore.getAccount('1.0');

    try {
        const tx = await wallet.newTransaction(account)
            .onNetwork('mainnet')
            .sendTo(toAddress, amountSatoshis.toString())
            .populate()
            .sign()
            .build();

        const txid = await wallet.sendTransaction(tx.serialize());
        return txid;
    } catch (error) {
        console.error('❌ Error al enviar NEXA:', error.message);
        throw new Error(`No se pudo enviar: ${error.message}`);
    }
};

const getFaucetAddress = async () => {
    const wallet = await getWallet();
    const account = wallet.accountStore.getAccount('1.0');
    return account.getNewAddress().toString();
};

module.exports = { getWallet, getBalance, sendFaucet, getFaucetAddress };
