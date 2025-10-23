const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// ===============================
// 📂 Ruta segura a la base de datos
// ===============================
const dbPath = process.env.NODE_ENV === 'test'
    ? ':memory:' // para test unitarios
    : path.join(__dirname, 'faucet.db');

// ===============================
// 💾 Conexión a la base de datos
// ===============================
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error al conectar con la base de datos:', err.message);
    } else {
        console.log(`✅ Base de datos abierta en ${dbPath}`);
    }
});

// ===============================
// 🧱 Crear tabla si no existe
// ===============================
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS requests (
            address TEXT PRIMARY KEY,
            last_request INTEGER NOT NULL
        )
    `, (err) => {
        if (err) {
            console.error('❌ Error al crear tabla requests:', err.message);
        } else {
            console.log('🗃️ Tabla "requests" lista.');
        }
    });
});

// ===============================
// ⏳ Verificar si puede reclamar
// ===============================
function canRequest(address) {
    return new Promise((resolve, reject) => {
        if (!address) return reject(new Error('Dirección no proporcionada'));

        db.get(
            `SELECT last_request FROM requests WHERE address = ?`,
            [address],
            (err, row) => {
                if (err) return reject(err);

                // Si no existe registro, puede reclamar
                if (!row) return resolve(true);

                const cooldown = parseInt(process.env.COOLDOWN_MS, 10) || 86400000; // 24h
                const now = Date.now();
                const last = Number(row.last_request) || 0;

                // Devuelve true si ya pasó el tiempo de espera
                resolve((now - last) > cooldown);
            }
        );
    });
}

// ===============================
// 💾 Guardar o actualizar reclamo
// ===============================
function saveRequest(address) {
    return new Promise((resolve, reject) => {
        if (!address) return reject(new Error('Dirección no proporcionada'));

        const now = Date.now();

        // Reemplaza o inserta según exista el registro
        db.run(
            `INSERT INTO requests (address, last_request)
             VALUES (?, ?)
             ON CONFLICT(address) DO UPDATE SET last_request = excluded.last_request`,
            [address, now],
            (err) => {
                if (err) {
                    console.error('❌ Error al guardar solicitud:', err.message);
                    return reject(err);
                }
                console.log(`✅ Registro actualizado: ${address} → ${new Date(now).toLocaleString('es-ES')}`);
                resolve();
            }
        );
    });
}

// ===============================
// 📤 Exportar funciones y conexión
// ===============================
module.exports = { canRequest, saveRequest, db };
