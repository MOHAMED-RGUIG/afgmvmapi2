const express = require("express");
const router = express.Router();
const { pool1 } = require('../db'); 
const JsBarcode = require('jsbarcode');
const { createCanvas } = require('canvas');
const fs = require('fs');
const streamifier = require('streamifier');
 const cloudinary = require('../cloudinary');   // adapte le chemin selon ton dossier
 const nodemailer = require('nodemailer');
 const transporter = nodemailer.createTransport({
     host: process.env.HOSTBREVO,
     port: process.env.PORTBREVO,
     secure: false,
     auth: {
       user: process.env.USERBREVO,
       pass: process.env.PASSBREVO // Paste the real SMTP password from Brevo
     }
   });
router.post('/creationArticle', async (req, res) => {
    let connection;
    try {
        const {
            title, quantitySt, unit, categorie, location, quantitySecurity,
            dispositionA, dispositionB, articleType,typeMachine, imagePath, currentUser
        } = req.body;

        // Validate required fields
/*
        if (!title || !quantitySt || !unit || !categorie || !location  || !quantitySecurity ||
            !dispositionA || !dispositionB || !articleType || !typeMachine|| !imagePath ||  !currentUser || !currentUser.idUser) {
            return res.status(400).json({ message: 'Missing required fields' });
        }*/

        // Get a connection from the pool
        connection = await pool1.getConnection();

        // Calculate values for `isCritic`
        const isCritic = quantitySt == 0 || quantitySt <= quantitySecurity ? 1 : 0;

        // Insert the article into the database
        const query = `
            INSERT INTO rguig_inventaire_afg.articles 
            (title, quantitySt, unit, categorie, location,is_critic, quantitySecurity, 
             dispositionA, dispositionB, articleType, image, typeMachine, dateCreationArticle, idUsr,quantityStInit)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?,?)
        `;
        const [result] = await connection.query(query, [
            title, quantitySt, unit, categorie, location, isCritic, quantitySecurity,
            dispositionA, dispositionB, articleType,imagePath, typeMachine, currentUser.idUser,quantitySt
        ]);
           // Get the automatically generated idArticle
        const idArticle = result.insertId;
        // Generate the reference using location and idArticle
        const reference = `${location}-${idArticle}-${typeMachine}`;
        const mailOptions = {
          from: 'mohamedrguig26@gmail.com',
          to: 'rguigmed107@gmail.com', // à remplacer
          subject: 'Alerte Article',
          text: `Pour info ! L'article ${reference} est créer avec success.`
      };

      await transporter.sendMail(mailOptions);
       // === Génération du QR ou Code-Barres (selon ta méthode existante) ===
        const canvas = createCanvas();
        JsBarcode(canvas, reference, { format: 'CODE128' });
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


        res.status(201).json({ message: 'Article enregistré, QR code uploadé', qrUrl: cloudinaryUrl });        console.log(imagePath);
    } catch (error) {
        console.error('Error placing order:', error);
        res.status(500).json({ message: 'Something went wrong', error: error.message });
    } finally {
        // Ensure the connection is released
        if (connection) connection.release();
    }
});
router.get('/getallarticles', async (req, res) => {
    let connection;
    try {
      connection = await pool1.getConnection();
      const [rows] = await connection.query(`SELECT  rguig_inventaire_afg.articles.*, rguig_inventaire_afg.users.NOMUSR  FROM rguig_inventaire_afg.articles
      JOIN rguig_inventaire_afg.users ON rguig_inventaire_afg.articles.idUsr = rguig_inventaire_afg.users.idUser
            ORDER BY dateCreationArticle DESC`);
      res.status(200).json(rows);
    } catch (error) {
      console.error('Error getting articles:', error);
      res.status(500).json({ message: 'Something went wrong', error: error.message });
    } finally {
      if (connection) connection.release();
    }
  });
router.put('/updatearticles/:id', async (req, res) => {
  const { id } = req.params;
  const {
    title,
    quantitySt,
    unit,
    categorie,
    quantitySecurity,
    dispositionA,
    dispositionB,
    articleType,
    image,
    typeMachine,
  } = req.body;

  let connection;
  try {
    connection = await pool1.getConnection();

    // Validation des données entrantes
    if (!id ) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Calcul du champ isCritic
    const isCritic = quantitySt == 0 || quantitySt <= quantitySecurity ? 1 : 0;

    const query = `
      UPDATE rguig_inventaire_afg.articles
      SET title = ?, 
          quantitySt = ?, 
          unit = ?, 
          categorie = ?, 
          is_critic = ?, 
          quantitySecurity = ?, 
          dispositionA = ?, 
          dispositionB = ?, 
          articleType = ?, 
          image = ?, 
          typeMachine = ?
      WHERE idArticle = ?
    `;

    await connection.query(query, [
      title,
      quantitySt,
      unit,
      categorie,
      isCritic,
      quantitySecurity,
      dispositionA,
      dispositionB,
      articleType,
      image,
      typeMachine,
      id,
    ]);

    res.status(200).json({ message: 'Article updated successfully' });
  } catch (error) {
    console.error('Error updating article:', error);
    res.status(500).json({ message: 'Something went wrong', error: error.message });
  } finally {
    if (connection) connection.release();
  }
});
router.delete('/deletearticle/:id', async (req, res) => {
  const { id } = req.params;

  let connection;
  try {
    connection = await pool1.getConnection();

    // 1. Vérifie si l'article existe
    const [rows] = await connection.query(
      'SELECT * FROM rguig_inventaire_afg.articles WHERE idArticle = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "L'article n'existe pas." });
    }

    const article = rows[0];
 // 2. Récupérer tous les mouvements liés à cet article
    const [mouvements] = await connection.query(
      'SELECT * FROM rguig_inventaire_afg.mouvement WHERE referenceArticle = ?',
      [article.reference]
    );

    for (const mouvement of mouvements) {
      // 2.1 Archiver chaque mouvement dans mouvementdeleted
      await connection.query(
        `INSERT INTO rguig_inventaire_afg.mouvementdeleted 
          (idMvm, idUsr, mvmDate, nOrdre, quantityEntree, quantityMvm, quantitySortie, referenceArticle, typeMvm)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          mouvement.idMvm,
          mouvement.idUsr,
          mouvement.mvmDate,
          mouvement.nOrdre,
          mouvement.quantityEntree,
          mouvement.quantityMvm,
          mouvement.quantitySortie,
          mouvement.referenceArticle,
          mouvement.typeMvm
        ]
      );    };
       // 2.3 Supprimer les mouvements liés
    await connection.query(
      'DELETE FROM rguig_inventaire_afg.mouvement WHERE referenceArticle = ?',
      [article.reference]
    );

    // 2. Insérer dans articlesdeleted
    await connection.query(
      `INSERT INTO rguig_inventaire_afg.articlesdeleted (
        articleType, categorie, codeBarre, dateCreationArticle,
        dispositionA, dispositionB, idArticle, idUsr, image,
        is_critic, location, quantitySecurity, quantitySt,
        quantityStInit, reference, title, typeMachine, unit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        article.articleType,
        article.categorie,
        article.codeBarre,
        article.dateCreationArticle,
        article.dispositionA,
        article.dispositionB,
        article.idArticle,
        article.idUsr,
        article.image,
        article.is_critic,
        article.location,
        article.quantitySecurity,
        article.quantitySt,
        article.quantityStInit,
        article.reference,
        article.title,
        article.typeMachine,
        article.unit
      ]
    );

    // 3. Supprimer l'article de la table d'origine
    await connection.query(
      'DELETE FROM rguig_inventaire_afg.articles WHERE idArticle = ?',
      [id]
    );

    res.status(200).json({ message: 'Article supprimé et archivé avec succès.' });
  } catch (error) {
    console.error("Erreur lors de la suppression de l'article :", error);
    res.status(500).json({ message: 'Une erreur est survenue.', error: error.message });
  } finally {
    if (connection) connection.release();
  }
});
module.exports = router;

