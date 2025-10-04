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
    
    // ✅ Sincroniza la cuenta con la blockchain
    await account.sync(); // ⚠️ Esto es crucial

    // El saldo en account.balance.confirmed está en NEXA (ej: "500.00")
    const balanceNEXA = String(account.balance.confirmed);

    try {
        // ✅ Convierte de NEXA (string) a satoshis (bigint)
        const balanceInSats = UnitUtils.parseNEXA(balanceNEXA);
        return Number(balanceInSats); // devuelve número entero de satoshis
    } catch (err) {
        console.error('Error convirtiendo saldo a satoshis:', err);
        return 0;
    }
}

async function sendFaucet(toAddress, amountSatoshis) {
    const wallet = await getWallet();
    const account = wallet.accountStore.getAccount('1.0');

    try {
        // ✅ amountSatoshis ya es un número entero (ej: 1 = 0.01 NEXA)
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
}

async function getFaucetAddress() {
    const wallet = await getWallet();
    const account = wallet.accountStore.getAccount('1.0');
    return account.getNewAddress().toString();
}

module.exports = { getWallet, getBalance, sendFaucet, getFaucetAddress };
