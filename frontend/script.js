document.addEventListener('DOMContentLoaded', async () => {
    const addressInput = document.getElementById('address');
    const requestBtn = document.getElementById('requestBtn');
    const messageDiv = document.getElementById('message');
    const API_BASE = 'https://nexa-faucet.onrender.com';

    // =============== LOAD reCAPTCHA SITE KEY ===============
    let SITE_KEY = null;
    try {
        const res = await fetch(`${API_BASE}/api/recaptcha-key`);
        const data = await res.json();
        SITE_KEY = data.siteKey;
        if (!SITE_KEY) console.error('⚠️ No se recibió siteKey desde el backend.');
    } catch (err) {
        console.error('Error al obtener siteKey:', err);
    }

    // =============== BALANCE ===============
    async function updateBalance() {
        try {
            const response = await fetch(`${API_BASE}/balance`);
            if (!response.ok) throw new Error('HTTP ' + response.status);

            const data = await response.json();
            document.getElementById('balance').textContent =
                data.success && data.balanceInNEXA !== undefined
                    ? data.balanceInNEXA
                    : 'Error';
        } catch (error) {
            console.error('Error updating balance:', error);
            document.getElementById('balance').textContent = 'Offline';
        }
    }

    updateBalance();
    setInterval(updateBalance, 30000);

    // =============== UTILS ===============
    function showMessage(text, type) {
        messageDiv.textContent = text;
        messageDiv.className = 'message ' + type;
        messageDiv.style.display = 'block';
        setTimeout(() => (messageDiv.style.display = 'none'), 8000);
    }

    function isValidNexaAddress(address) {
        const regex = /^nexa:[a-z0-9]{48,}$/;
        return regex.test(address);
    }

    // =============== FAUCET REQUEST ===============
    requestBtn.addEventListener('click', async () => {
        const address = addressInput.value.trim();

        if (!address) {
            showMessage('⚠️ Ingresa una dirección Nexa válida.', 'error');
            return;
        }

        if (!isValidNexaAddress(address)) {
            showMessage('⚠️ Dirección Nexa inválida. Debe empezar con "nexa:"', 'error');
            return;
        }

        if (!SITE_KEY) {
            showMessage('⚠️ Error: No se pudo cargar reCAPTCHA.', 'error');
            return;
        }

        requestBtn.disabled = true;
        requestBtn.textContent = 'Verificando...';

        try {
            // Ejecutar reCAPTCHA invisible
            const token = await grecaptcha.execute(SITE_KEY, { action: 'faucet_request' });

            // Enviar solicitud al backend con el token
            const response = await fetch(`${API_BASE}/faucet`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address, token }),
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Unknown error');
            }

            const amount = data.amount ? (data.amount / 100).toFixed(4) : '0.0000';
            const shortTxid = data.txid ? data.txid.substring(0, 12) + '...' : 'N/A';
            const now = new Date();
            const formattedDate = now.toLocaleString('en-EN', {
                dateStyle: 'medium',
                timeStyle: 'medium',
            });

            showMessage(`✅ Sent ${amount} NEXA! TX: ${shortTxid} 🕒 ${formattedDate}`, 'success');
        } catch (error) {
            console.error(error);
            showMessage('❌ ' + error.message, 'error');
        } finally {
            requestBtn.disabled = false;
            requestBtn.textContent = 'Request 100 NEXA';
        }
    });

    // =============== DONATION ADDRESS ===============
    async function loadDonationAddress() {
        const donationElement = document.getElementById('donationAddress');
        if (!donationElement) return;

        donationElement.textContent = 'Loading...';

        try {
            const response = await fetch(`${API_BASE}/balance`);
            if (!response.ok) throw new Error('Could not connect to server');

            const data = await response.json();
            donationElement.textContent = data.success && data.address ? data.address : 'Not available';
        } catch (error) {
            console.error('Error loading donation address:', error);
            donationElement.textContent = 'Failed, try again later.';
        }
    }

    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const donationElement = document.getElementById('donationAddress');
            const address = donationElement?.textContent.trim();
            if (!address || address.includes('Loading')) {
                alert('Address not available yet. Please wait.');
                return;
            }
            navigator.clipboard.writeText(address).then(() => {
                copyBtn.textContent = 'Copied!';
                setTimeout(() => (copyBtn.textContent = '📋 Copy'), 2000);
            });
        });
    }

    // =============== LIVE TRANSACTIONS ===============
    async function loadTransactions() {
        try {
            const response = await fetch(`${API_BASE}/transactions`);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            const grid = document.getElementById('transactionsGrid');
            if (!grid) return;

            grid.innerHTML = '';
            if (data.success && Array.isArray(data.transactions) && data.transactions.length > 0) {
                data.transactions.forEach(tx => {
                    const card = document.createElement('div');
                    card.className = 'transaction-card';
                    card.innerHTML = `
                        <h3>🔑 Address</h3>
                        <div class="address">${tx.shortAddress || 'N/A'}</div>
                        <div class="date">🕒 ${tx.date || 'N/A'}</div>
                    `;
                    grid.appendChild(card);
                });
            } else {
                grid.innerHTML = '<p style="text-align:center;color:#aaa">No hay transacciones recientes</p>';
            }
        } catch (error) {
            console.error('Error cargando transacciones:', error);
            const grid = document.getElementById('transactionsGrid');
            if (grid) {
                grid.innerHTML = '<p style="text-align:center;color:#ff6b6b">Error al cargar transacciones</p>';
            }
        }
    }

    loadDonationAddress();
    loadTransactions();
    setInterval(loadTransactions, 30000);
});
