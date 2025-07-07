const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { createCanvas } = require('canvas');
const JsBarcode = require('jsbarcode');
const fs = require('fs');
const path = require('path');
const streamifier = require('streamifier');
const { pool1 } = require('../db'); // Assurez-vous que votre fichier db est correctement configuré
const router = express.Router();
// Configuration de multer pour uploader le fichier Excel
const upload = multer({ dest: 'uploads/' });
const cloudinary = require('../cloudinary');   // adapte le chemin selon ton dossier
// 📌 Route pour importer un fichier Excel et insérer les articles dans la base de données
router.post('/import-excel', upload.single('file'), async (req, res) => {
    let connection;
    try {        
        let currentUser;
        try {
            currentUser = JSON.parse(req.body.currentUser);
        } catch (e) {
            return res.status(400).json({ message: 'Champ currentUser mal formé ou manquant' });
        }
        
        if (!currentUser?.idUser) {
            return res.status(400).json({ message: 'ID utilisateur manquant dans currentUser' });
        }
        // Vérifier si un fichier a été fourni
        if (!req.file) {
            return res.status(400).json({ message: 'Aucun fichier Excel fourni' });
        }
    

        // Lire le fichier Excel
        const filePath = path.join(__dirname, '..', req.file.path);
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet);

        // Obtenir une connexion à la base de données
        connection = await pool1.getConnection();
        const barcodeUrls = [];
        // Parcourir les lignes du fichier Excel et insérer les données
        for (const row of rows) {
            const {
                title, quantitySt, unit, categorie, location, quantitySecurity,
                dispositionA, dispositionB, articleType, typeMachine,image
            } = row;

            // Validation des champs requis
            if (!title || !quantitySt || !unit || !categorie || !location || !quantitySecurity ||
                !dispositionA || !dispositionB || !articleType || !typeMachine ) {
                console.warn(`Ligne ignorée : ${JSON.stringify(row)}`);
                continue;
            }
            
            // Calculer la valeur de `isCritic`
            const isCritic = quantitySt == 0 || quantitySt <= quantitySecurity ? 1 : 0;

            // Insérer l'article dans la base de données
            const query = `
                INSERT INTO rguig_inventaire_afg.articles 
                (title, quantitySt, unit, categorie, location, is_critic, quantitySecurity, 
                 dispositionA, dispositionB, articleType, image, typeMachine, dateCreationArticle, idUsr)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
            `;
            
            const [result] = await connection.query(query, [
                title, quantitySt, unit, categorie, location, isCritic, quantitySecurity,
                dispositionA, dispositionB, articleType, image, typeMachine, currentUser.idUser
            ]);

            // Récupérer l'idArticle généré automatiquement
            const idArticle = result.insertId;

            // Générer la référence et le code-barres
            const reference = `${location}-${idArticle}-${typeMachine}`;
            const canvas = createCanvas();
            JsBarcode(canvas, reference, { format: 'CODE128' });

            // Sauvegarder le code-barres en tant qu'image
            const barcodePath = path.join(__dirname, '..', 'public', 'barcodes', `${reference}.png`);
            const buffer = canvas.toBuffer('image/png');
            // === Upload vers Cloudinary ===
            const uploadResult = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'barcodes' },
            (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );
        streamifier.createReadStream(buffer).pipe(uploadStream);
      });
  
      const cloudinaryUrl = uploadResult.secure_url;
  
          // Update the article with the generated reference and barcode path
          await connection.query(`
              UPDATE rguig_inventaire_afg.articles 
              SET reference = ?, codeBarre = ? 
              WHERE idArticle = ?
          `, [reference, cloudinaryUrl, idArticle]);
  
          barcodeUrls.push({ title, reference, qrUrl: cloudinaryUrl });
     
        }
        const uploadsDir = path.join(__dirname, '..', 'uploads');

        if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir);
        } else {
        fs.readdirSync(uploadsDir).forEach(file => {
            try {
            fs.unlinkSync(path.join(uploadsDir, file));
            } catch (e) {
            console.error(`Erreur suppression fichier ${file}:`, e.message);
            }
        });
        }
       if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
        }

        res.status(201).json({
            message: 'Données Excel importées avec succès',
            articles: barcodeUrls
          });    }
           catch (error) {
        console.error('Erreur lors de l\'importation Excel:', error);
        res.status(500).json({ message: 'Une erreur est survenue', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;
