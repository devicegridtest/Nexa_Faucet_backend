// backend/wallet.js
require('dotenv').config();
const { Wallet, rostrumProvider } = require('nexa-wallet-sdk');

let walletInstance = null;

const getWallet = async () => {
    if (!walletInstance) {
        const mnemonic = process.env.MNEMONIC;
        if (!mnemonic) throw new Error('MNEMONIC no definido');
        
        await rostrumProvider.connect('mainnet');
        walletInstance = new Wallet(mnemonic, 'mainnet');
        await walletInstance.initialize();
        // ✅ La documentación dice que '1.0' es la cuenta por defecto
    }
    return walletInstance;
};

const getBalance = async () => {
    const wallet = await getWallet();
    const account = wallet.accountStore.getAccount('1.0');
    if (!account) throw new Error('Cuenta 1.0 no disponible. ¿La billetera se inicializó?');

    // ✅ La documentación muestra: account.balance.confirmed
    const raw = account.balance.confirmed;

    if (typeof raw === 'number') return Math.floor(raw);
    if (typeof raw === 'string') {
        const num = parseFloat(raw);
        return isNaN(num) ? 0 : Math.floor(num);
    }
    return 0;
};

const sendFaucet = async (toAddress, amountSatoshis) => {
    const wallet = await getWallet();
    const account = wallet.accountStore.getAccount('1.0');
    if (!account) throw new Error('Cuenta 1.0 no disponible para enviar');

    try {
        // ✅ SIN .setFee() — la documentación oficial NO lo usa
        const tx = await wallet.newTransaction(account)
            .onNetwork('mainnet')
            .sendTo(toAddress, amountSatoshis.toString()) // como string
            .populate() // ← calcula fee automáticamente
            .sign()
            .build();

        return await wallet.sendTransaction(tx.serialize());
    } catch (error) {
        console.error('❌ Error al enviar NEXA:', error.message);
        throw error;
    }
};

const getFaucetAddress = async () => {
    const wallet = await getWallet();
    const account = wallet.accountStore.getAccount('1.0');
    if (!account) throw new Error('Cuenta 1.0 no disponible para dirección');
    return account.getNewAddress().toString();
};

module.exports = { getWallet, getBalance, sendFaucet, getFaucetAddress };
