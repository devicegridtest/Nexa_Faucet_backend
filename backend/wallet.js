// wallet.js
require('dotenv').config();
const { Wallet, rostrumProvider } = require('nexa-wallet-sdk');

let walletInstance = null;

async function getWallet() {
    if (!walletInstance) {
        const mnemonic = process.env.MNEMONIC;
        if (!mnemonic) throw new Error('MNEMONIC no definido en .env');

        try {
            // ✅ Conectar primero al nodo de Nexa
            await rostrumProvider.connect('mainnet'); // o 'testnet'

            // ✅ Crear billetera
            walletInstance = new Wallet(mnemonic, 'mainnet');
            await walletInstance.initialize(); // ✅ Descubre cuentas

        } catch (error) {
            console.error('❌ Error al conectar o inicializar billetera:', error);
            throw error;
        }
    }
    return walletInstance;
}

async function getBalance() {
    const wallet = await getWallet();
    const account = wallet.accountStore.getAccount('1.0');
    return account.balance.confirmed;
}

async function sendFaucet(toAddress, amountSatoshis) {
    const wallet = await getWallet();
    const account = wallet.accountStore.getAccount('1.0');

    const tx = await wallet.newTransaction(account)
        .onNetwork('mainnet')
        .sendTo(toAddress, amountSatoshis.toString()) // ✅ manda como string
        .populate()
        .sign()
        .build();

    const txId = await wallet.sendTransaction(tx.serialize());
    return txId;
}

module.exports = { getWallet, getBalance, sendFaucet };