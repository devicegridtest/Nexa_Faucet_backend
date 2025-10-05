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

        // ✅ Deriva y almacena la cuenta 1.0 explícitamente
        const account = await walletInstance.deriveAccount("m/44'/1022'/0'/0/0");
        walletInstance.accountStore.setAccount('1.0', account);
    }
    return walletInstance;
};

const getBalance = async () => {
    const wallet = await getWallet();
    const account = wallet.accountStore.getAccount('1.0');
    
    // ✅ Sincroniza para obtener saldo actualizado
    await account.sync();
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

    try {
        // ✅ SIN .setFee() — el SDK lo calcula automáticamente
        const tx = await wallet.newTransaction(account)
            .onNetwork('mainnet')
            .sendTo(toAddress, amountSatoshis.toString())
            .populate()
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
    return account.getNewAddress().toString();
};

module.exports = { getWallet, getBalance, sendFaucet, getFaucetAddress };
