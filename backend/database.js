const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.NODE_ENV === 'test' 
    ? ':memory:' 
    : path.join(__dirname, 'faucet.db');

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS requests (
            address TEXT PRIMARY KEY,
            last_request INTEGER NOT NULL  -- almacenamos en SEGUNDOS Unix
        )
    `);
});

function canRequest(address) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT last_request FROM requests WHERE address = ?`, 
            [address], 
            (err, row) => {
                if (err) return reject(err);
                if (!row) return resolve(true);

                // COOLDOWN en milisegundos (ej: 86400000 = 24h)
                const cooldownMs = parseInt(process.env.COOLDOWN_MS) || 86400000;
                const nowSeconds = Math.floor(Date.now() / 1000);
                const lastRequestSeconds = row.last_request;

                // Comparamos en milisegundos para precisión
                const elapsedMs = (nowSeconds - lastRequestSeconds) * 1000;
                resolve(elapsedMs > cooldownMs);
            }
        );
    });
}

function saveRequest(address) {
    return new Promise((resolve, reject) => {
        const nowSeconds = Math.floor(Date.now() / 1000); // ✅ Segundos Unix
        db.run(
            `INSERT OR REPLACE INTO requests (address, last_request) VALUES (?, ?)`,
            [address, nowSeconds],
            (err) => {
                if (err) return reject(err);
                resolve();
            }
        );
    });
}

module.exports = { canRequest, saveRequest, db };
