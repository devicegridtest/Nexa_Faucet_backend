// ===== CONFIGURACIÓN =====
const CONFIG = {
    API_BASE: 'https://nexa-faucet.onrender.com', // ✅ Corregido: sin espacios
    UPDATE_INTERVAL: 30000, // 30 segundos
    FETCH_TIMEOUT: 10000, // 10 segundos
    AMOUNT: '1000', // Cantidad consistente con el diseño
    ADDRESS_REGEX: /^nexa:[a-z0-9]{48,}$/
};

// ===== UTILIDADES =====
class Utils {
    static showMessage(element, text, type) {
        element.textContent = text;
        element.className = `message ${type}`;
        element.style.display = 'block';
        
        // Animación de entrada
        element.style.opacity = '0';
        element.style.transform = 'translateY(-10px)';
        requestAnimationFrame(() => {
            element.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            element.style.opacity = '1';
            element.style.transform = 'translateY(0)';
        });
        
        setTimeout(() => {
            element.style.opacity = '0';
            element.style.transform = 'translateY(-10px)';
            setTimeout(() => element.style.display = 'none', 300);
        }, 8000);
    }

    static isValidAddress(address) {
        return CONFIG.ADDRESS_REGEX.test(address.trim());
    }

    static async fetchWithTimeout(url, options = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    static formatDate(date) {
        return new Date(date).toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
    }
}

// ===== SERVICIOS =====
class FaucetService {
    constructor() {
        this.siteKey = null;
        this.isReady = false;
    }

    async init() {
        try {
            await this.loadRecaptchaKey();
            this.isReady = true;
        } catch (error) {
            console.error('⚠️ Error initializing faucet:', error);
        }
    }

    async loadRecaptchaKey() {
        const response = await Utils.fetchWithTimeout(
            `${CONFIG.API_BASE}/api/recaptcha-key`
        );
        
        if (!response.ok) throw new Error('Failed to load reCAPTCHA key');
        
        const data = await response.json();
        this.siteKey = data.siteKey;
        
        if (!this.siteKey) {
            throw new Error('No siteKey received from backend');
        }
    }

    async getBalance() {
        const response = await Utils.fetchWithTimeout(
            `${CONFIG.API_BASE}/balance`
        );
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        return await response.json();
    }

    async getTransactions() {
        const response = await Utils.fetchWithTimeout(
            `${CONFIG.API_BASE}/transactions`
        );
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        return await response.json();
    }

    async requestFaucet(address, recaptchaToken) {
        const response = await Utils.fetchWithTimeout(
            `${CONFIG.API_BASE}/faucet`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address, token: recaptchaToken })
            }
        );
        
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Unknown error');
        }
        
        return data;
    }
}

// ===== MANEJADORES DE DOM =====
class UIHandler {
    constructor(service) {
        this.service = service;
        this.elements = {
            addressInput: document.getElementById('address'),
            requestBtn: document.getElementById('requestBtn'),
            messageDiv: document.getElementById('message'),
            balanceElement: document.getElementById('balance'),
            donationAddress: document.getElementById('donationAddress'),
            copyBtn: document.getElementById('copyBtn'),
            transactionsGrid: document.getElementById('transactionsGrid')
        };
        
        this.isProcessing = false;
    }

    async initialize() {
        await this.service.init();
        await this.loadInitialData();
        this.setupEventListeners();
        this.startAutoUpdates();
    }

    async loadInitialData() {
        try {
            // Cargar balance y dirección de donación en paralelo
            const [balanceData] = await Promise.all([
                this.service.getBalance().catch(() => null),
                this.loadDonationAddress().catch(() => null),
                this.loadTransactions().catch(() => null)
            ]);

            if (balanceData && balanceData.success) {
                this.updateBalanceDisplay(balanceData);
            } else {
                this.elements.balanceElement.textContent = 'Offline';
            }
        } catch (error) {
            console.error('Error loading initial data:', error);
        }
    }

    async loadDonationAddress() {
        if (!this.elements.donationAddress) return;

        try {
            const data = await this.service.getBalance();
            if (data.success && data.address) {
                this.elements.donationAddress.textContent = data.address;
            } else {
                this.elements.donationAddress.textContent = 'Not available';
            }
        } catch (error) {
            console.error('Error loading donation address:', error);
            this.elements.donationAddress.textContent = 'Failed to load';
        }
    }

    async loadTransactions() {
        if (!this.elements.transactionsGrid) return;

        try {
            const data = await this.service.getTransactions();
            
            if (data.success && Array.isArray(data.transactions) && data.transactions.length > 0) {
                this.renderTransactions(data.transactions);
            } else {
                this.elements.transactionsGrid.innerHTML = `
                    <div class="skeleton-card" style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
                        <p style="color: var(--text-secondary);">No recent transactions</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading transactions:', error);
            this.elements.transactionsGrid.innerHTML = `
                <div class="skeleton-card" style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
                    <p style="color: var(--error);">Error loading transactions</p>
                </div>
            `;
        }
    }

    renderTransactions(transactions) {
        this.elements.transactionsGrid.innerHTML = '';
        
        transactions.slice(0, 6).forEach((tx, index) => {
            const delay = index * 100; // Staggered animation
            
            const card = document.createElement('div');
            card.className = 'transaction-card';
            card.style.animationDelay = `${delay}ms`;
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                    <span style="color: var(--success); font-weight: 600;">${(tx.amount / 100).toFixed(2)} NEXA</span>
                    <span style="background: rgba(102, 204, 255, 0.1); color: #66ccff; padding: 2px 8px; border-radius: 12px; font-size: 0.85rem;">
                        ${tx.type || 'Faucet'}
                    </span>
                </div>
                <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px; margin-bottom: 10px; font-family: monospace; font-size: 0.85rem; word-break: break-all;">
                    ${tx.shortAddress || 'N/A'}
                </div>
                <div style="color: var(--text-secondary); font-size: 0.85rem; display: flex; justify-content: space-between;">
                    <span>🕒 ${Utils.formatDate(tx.date)}</span>
                    ${tx.txid ? `<span style="color: var(--accent); cursor: pointer;" onclick="navigator.clipboard.writeText('${tx.txid}')">📋</span>` : ''}
                </div>
            `;
            
            this.elements.transactionsGrid.appendChild(card);
        });
    }

    updateBalanceDisplay(data) {
        if (data.balanceInNEXA !== undefined) {
            this.elements.balanceElement.textContent = data.balanceInNEXA;
        } else {
            this.elements.balanceElement.textContent = 'Error';
        }
    }

    setupEventListeners() {
        // Botón de solicitud
        this.elements.requestBtn.addEventListener('click', () => this.handleFaucetRequest());
        
        // Botón de copiar
        if (this.elements.copyBtn) {
            this.elements.copyBtn.addEventListener('click', () => this.handleCopyAddress());
        }
        
        // Validación en tiempo real
        if (this.elements.addressInput) {
            this.elements.addressInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.trim();
            });
            
            this.elements.addressInput.addEventListener('paste', (e) => {
                setTimeout(() => {
                    e.target.value = e.target.value.trim();
                }, 10);
            });
        }
    }

    async handleFaucetRequest() {
        if (this.isProcessing) return;
        
        const address = this.elements.addressInput?.value.trim();
        
        // Validaciones
        if (!address) {
            Utils.showMessage(this.elements.messageDiv, '⚠️ Please enter a Nexa address', 'error');
            return;
        }
        
        if (!Utils.isValidAddress(address)) {
            Utils.showMessage(this.elements.messageDiv, '⚠️ Invalid address. Must start with "nexa:"', 'error');
            return;
        }
        
        if (!this.service.isReady || !this.service.siteKey) {
            Utils.showMessage(this.elements.messageDiv, '⚠️ Service not ready. Please wait...', 'error');
            return;
        }
        
        // Procesar solicitud
        this.isProcessing = true;
        this.setButtonState(true);
        
        try {
            // Ejecutar reCAPTCHA
            const token = await grecaptcha.execute(this.service.siteKey, { 
                action: 'faucet_request' 
            });
            
            // Enviar solicitud
            const result = await this.service.requestFaucet(address, token);
            
            // Mostrar éxito
            const amount = (result.amount / 100).toFixed(4);
            const shortTxid = result.txid ? `${result.txid.substring(0, 12)}...` : 'N/A';
            const formattedDate = Utils.formatDate(new Date());
            
            Utils.showMessage(
                this.elements.messageDiv,
                `✅ Sent ${amount} NEXA! TX: ${shortTxid} 🕒 ${formattedDate}`,
                'success'
            );
            
            // Limpiar input
            if (this.elements.addressInput) {
                this.elements.addressInput.value = '';
            }
            
            // Actualizar balance
            const balanceData = await this.service.getBalance();
            if (balanceData.success) {
                this.updateBalanceDisplay(balanceData);
            }
            
        } catch (error) {
            console.error('Faucet request failed:', error);
            Utils.showMessage(
                this.elements.messageDiv,
                `❌ ${error.message || 'Request failed. Try again.'}`,
                'error'
            );
        } finally {
            this.isProcessing = false;
            this.setButtonState(false);
        }
    }

    handleCopyAddress() {
        const address = this.elements.donationAddress?.textContent.trim();
        
        if (!address || address.includes('Loading') || address.includes('Failed')) {
            Utils.showMessage(this.elements.messageDiv, '⚠️ Address not available yet', 'error');
            return;
        }
        
        navigator.clipboard.writeText(address).then(() => {
            const originalText = this.elements.copyBtn.textContent;
            this.elements.copyBtn.textContent = '✅ Copied!';
            this.elements.copyBtn.style.background = 'var(--success)';
            
            setTimeout(() => {
                this.elements.copyBtn.textContent = originalText;
                this.elements.copyBtn.style.background = '';
            }, 2000);
        }).catch(() => {
            Utils.showMessage(this.elements.messageDiv, '❌ Failed to copy', 'error');
        });
    }

    setButtonState(isLoading) {
        if (!this.elements.requestBtn) return;
        
        this.elements.requestBtn.disabled = isLoading;
        
        if (isLoading) {
            this.elements.requestBtn.innerHTML = `
                <span class="loader small" style="border-top-color: white; margin-right: 8px;"></span>
                Verifying...
            `;
            this.elements.requestBtn.style.opacity = '0.8';
        } else {
            this.elements.requestBtn.innerHTML = `Request ${CONFIG.AMOUNT} NEXA`;
            this.elements.requestBtn.style.opacity = '1';
        }
    }

    startAutoUpdates() {
        // Actualizar balance cada 30 segundos
        setInterval(async () => {
            try {
                const data = await this.service.getBalance();
                if (data.success) this.updateBalanceDisplay(data);
            } catch (error) {
                console.warn('Balance update failed:', error);
            }
        }, CONFIG.UPDATE_INTERVAL);
        
        // Actualizar transacciones cada 30 segundos
        setInterval(() => this.loadTransactions(), CONFIG.UPDATE_INTERVAL);
    }
}

// ===== INICIALIZACIÓN =====
document.addEventListener('DOMContentLoaded', () => {
    const faucetService = new FaucetService();
    const uiHandler = new UIHandler(faucetService);
    
    uiHandler.initialize().catch(error => {
        console.error('Failed to initialize faucet:', error);
        const messageDiv = document.getElementById('message');
        if (messageDiv) {
            Utils.showMessage(messageDiv, '⚠️ Failed to load faucet. Please refresh.', 'error');
        }
    });
    
    // Precarga de reCAPTCHA
    if (typeof grecaptcha !== 'undefined') {
        grecaptcha.ready(() => {
            console.log('✅ reCAPTCHA is ready');
        });
    }
});

// ===== MANEJO DE ERRORES GLOBAL =====
window.addEventListener('error', (event) => {
    if (event.message.includes('fetch')) {
        console.error('Network error detected:', event.message);
    }
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});