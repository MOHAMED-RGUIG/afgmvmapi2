const mysql = require('mysql2/promise');
require("dotenv").config();
// Configuration pour la première base de données (inventaire_afg)
const config2 = {
    host: process.env.DBSERVER,
    user: process.env.USER,
    password: process.env.DBPASS,
    database: process.env.DB1,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};
// Pool pour inventaire_afg
const pool1 = mysql.createPool(config2);
(async () => {
    try {
        const connection = await pool1.getConnection();
        console.log('Connexion réussie à la base de données inventaire_afg');
        connection.release();
    } catch (error) {
        console.error('Erreur de connexion à la base de données  inventaire_afg:', error.message);
    }
})();
module.exports = {pool1};
