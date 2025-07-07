const express = require("express");
const router = express.Router();
const { pool1 } = require('../db'); 
const nodemailer = require('nodemailer');
require('dotenv').config();
const transporter = nodemailer.createTransport({
    host: process.env.HOSTBREVO,
    port: process.env.PORTBREVO,
    secure: false,
    auth: {
      user: process.env.USERBREVO,
      pass: process.env.PASSBREVO // Paste the real SMTP password from Brevo
    }
  });
router.get('/getallmouvements', async (req, res) => {
    let connection;
    try {
        connection = await pool1.getConnection();

        const [rows] = await connection.query(`
            SELECT 
                m.*,
                u.NOMUSR,
                a.quantitySt,
                a.quantityStInit
            FROM rguig_inventaire_afg.mouvement m
            JOIN rguig_inventaire_afg.users u ON m.idUsr = u.idUser
            JOIN rguig_inventaire_afg.articles a ON m.referenceArticle = a.reference
            ORDER BY m.mvmDate DESC
        `);

        console.log('Fetched mouvements with NOMUSR and quantitySt:', rows);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error getting mouvements:', error);
        res.status(500).json({ message: 'Something went wrong', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});
router.get('/getallmouvementsgraphique', async (req, res) => {
    const { reference } = req.query; // Récupérer la référence depuis les paramètres
    let connection;

    try {
        connection = await pool1.getConnection();
        // Construire la requête SQL avec ou sans filtre
        const query = reference
            ? `
                SELECT *
                FROM rguig_inventaire_afg.mouvement 
              
                WHERE rguig_inventaire_afg.mouvement.referenceArticle = ?
                ORDER BY mvmDate DESC
            `
            : `
                SELECT*
                FROM rguig_inventaire_afg.mouvement 
             
                ORDER BY mvmDate DESC
            `;

        const [rows] = reference
            ? await connection.query(query, [reference]) // Utiliser la référence si présente
            : await connection.query(query);

        console.log('Fetched mouvements:', rows);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error getting mouvement:', error);
        res.status(500).json({ message: 'Something went wrong', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/creationMvm', async (req, res) => {
    let connection;
    try {
        const { typeMvm, quantityMvm, referenceArticle, nOrdre, currentUser } = req.body;

        // Validate required fields
        if (!typeMvm || !quantityMvm || !referenceArticle || !nOrdre || !currentUser) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Get a connection from the pool
        connection = await pool1.getConnection();

        // Vérifie si l'article existe et récupère la quantité actuelle
        const [article] = await connection.query(
            `SELECT quantitySt, quantitySecurity FROM rguig_inventaire_afg.articles WHERE reference = ?`,
            [referenceArticle]
        );
        

        if (!article || article.length === 0) {
            return res.status(404).json({ message: "L'article spécifié n'existe pas." });
        }

        const quantitySt = article[0].quantitySt;
        const quantitySecurity = article[0].quantitySecurity;

        // Vérification de la quantité
        if (typeMvm === 'Sortie' && (quantityMvm > quantitySt || quantitySt ===0  )) {
            return res.status(400).json({
                message: 'Veuillez saisir une quantité égale ou inférieure à la quantité disponible.',
                availableQuantity: quantitySt
            });
        }

        // Calcul des quantités pour le mouvement
        let quantityEntree = 0;
        let quantitySortie = 0;

        if (typeMvm === 'Entree') {
            quantityEntree = quantityMvm;
        } else {
            quantitySortie = quantityMvm;
        }

        // Insérer le mouvement dans la table `mouvement`
        const insertQuery = `
            INSERT INTO rguig_inventaire_afg.mouvement 
            (mvmDate, typeMvm, quantityMvm, referenceArticle, nOrdre, quantityEntree, quantitySortie, idUsr)
            VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?)
        `;
        await connection.query(insertQuery, [
            typeMvm, quantityMvm, referenceArticle, nOrdre, quantityEntree, quantitySortie, currentUser.idUser
        ]);

        const mailOptions = {
            from: 'mohamedrguig26@gmail.com',
            to: 'rguigmed107@gmail.com', // à remplacer
            subject: 'Alerte Mouvement',
            text: `Pour info ! Une ${typeMvm} de  ${quantityMvm} de l'article ${referenceArticle} été effectuer avec success.`
        };

        await transporter.sendMail(mailOptions);
        // Mise à jour de la quantité dans la table `articles`
        let newQuantitySt;
        const quantityStNumber = Number(quantitySt); // Convertir quantitySt en nombre
        const quantityMvmNumber = Number(quantityMvm); // Convertir quantityMvm en nombre
        
        if (typeMvm === 'Entree') {
            newQuantitySt = quantityStNumber + quantityMvmNumber; // Additionner comme des nombres
        } else {
            newQuantitySt = quantityStNumber - quantityMvmNumber; // Soustraire comme des nombres
        }
        await connection.query(
            `UPDATE rguig_inventaire_afg.articles SET quantitySt = ? WHERE reference = ?`,
            [newQuantitySt, referenceArticle]
        );
           // Envoyer un e-mail si stock < stock de sécurité
           if (newQuantitySt < quantitySecurity) {
            const mailOptions = {
                from: 'mohamedrguig26@gmail.com',
                to: 'rguigmed107@gmail.com', // à remplacer
                subject: 'Alerte Stock Critique',
                text: `Attention ! Le stock de l'article ${referenceArticle} est passé à ${newQuantitySt}, inférieur au seuil de sécurité de ${quantitySecurity}.`
            };

            await transporter.sendMail(mailOptions);
        }

        res.status(201).json({
            message: 'Mouvement enregistré avec succès.',
            newQuantitySt
        });
    } catch (error) {
        console.error('Error placing Mvm:', error);
        res.status(500).json({ message: 'Something went wrong', error: error.message });
    } finally {
        // Ensure the connection is released
        if (connection) connection.release();
    }
});
router.get('/getRefMvm', async (req, res) => {
    let connection;
    try {
        // Obtenir une connexion depuis le pool
        connection = await pool1.getConnection();

        // Exécuter la requête pour récupérer les articles
        const [rows] = await connection.query(`
            SELECT reference,title FROM rguig_inventaire_afg.articles
        `);
        console.log('Données récupérées:', rows);
        // Retourner les données dans la réponse
        res.status(200).json(rows);

    } catch (error) {
        console.error('Error getting reference:', error);
        res.status(500).json({ message: 'Something went wrong', error: error.message });
    } finally {
        // Libérer la connexion pour éviter les fuites
        if (connection) connection.release();
    }
});
router.get('/qtstbyref', async (req, res) => {
    let connection;
    try {
        const { reference } = req.query; // Récupérer la référence depuis les paramètres
        connection = await pool1.getConnection();

        // Requête SQL pour récupérer la quantité en stock
        const query = `
            SELECT quantitySt 
            FROM rguig_inventaire_afg.articles
            WHERE reference LIKE ?
        `;
        const [rows] = await connection.query(query, [`${reference}%`]);

        res.status(200).json(rows); // Retourner les données au frontend
    } catch (error) {
        console.error('Error getting data:', error);
        res.status(400).json({ message: 'Something went wrong', error: error.message });
    } finally {
        if (connection) connection.release(); // Libérer la connexion
    }
});
  router.delete('/deletemouvement/:id', async (req, res) => {
    const { id } = req.params;
    let connection;
  
    try {
      connection = await pool1.getConnection();
  
      // 1. Récupérer le mouvement
      const [rows] = await connection.query(
        'SELECT * FROM rguig_inventaire_afg.mouvement WHERE idMvm = ?',
        [id]
      );
  
      if (rows.length === 0) {
        return res.status(404).json({ message: "Le mouvement n'existe pas." });
      }
  
      const mouvement = rows[0];
  
      // 2. Archiver dans mouvementdeleted
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
      );
  
      // 3. Mettre à jour quantitySt dans la table articles
      if (mouvement.typeMvm === 'Entree') {
        await connection.query(
          `UPDATE rguig_inventaire_afg.articles 
           SET quantitySt = quantitySt - ? 
           WHERE reference = ?`,
          [mouvement.quantityMvm, mouvement.referenceArticle]
        );
      } else if (mouvement.typeMvm === 'Sortie') {
        await connection.query(
          `UPDATE rguig_inventaire_afg.articles 
           SET quantitySt = quantitySt + ? 
           WHERE reference = ?`,
          [mouvement.quantityMvm, mouvement.referenceArticle]
        );
      }
  
      // 4. Supprimer le mouvement original
      await connection.query(
        'DELETE FROM rguig_inventaire_afg.mouvement WHERE idMvm = ?',
        [id]
      );
  
      res.status(200).json({ message: 'Mouvement supprimé, archivé et stock mis à jour avec succès.' });
  
    } catch (error) {
      console.error("Erreur lors de la suppression du mouvement :", error);
      res.status(500).json({ message: 'Une erreur est survenue.', error: error.message });
    } finally {
      if (connection) connection.release();
    }
  });


module.exports = router;

/*
  router.put('/updatemouvements/:id', async (req, res) => {
    const { id } = req.params;
    const { typeMvm, quantityMvm, nOrdre } = req.body;

    let connection;
    try {
        connection = await pool1.getConnection();

        // Étape 1 : récupérer l'ancien mouvement
        const [oldMvmRows] = await connection.query(
            'SELECT * FROM rguig_inventaire_afg.mouvement WHERE idMvm = ?',
            [id]
        );

        if (oldMvmRows.length === 0) {
            return res.status(404).json({ message: 'Mouvement non trouvé.' });
        }

        const oldMvm = oldMvmRows[0];
        const referenceArticle = oldMvm.referenceArticle;
        const quantityMvmActuel = Number(oldMvm.quantityMvm);
        const typeMvmActuel = oldMvm.typeMvm;

        // Étape 2 : récupérer le stock actuel
        const [articleRows] = await connection.query(
            'SELECT quantitySt, quantitySecurity FROM rguig_inventaire_afg.articles WHERE reference = ?',
            [referenceArticle]
        );

        if (articleRows.length === 0) {
            return res.status(404).json({ message: "Article non trouvé." });
        }

        const quantityStActuel = Number(articleRows[0].quantitySt);
        const quantitySecurity = Number(articleRows[0].quantitySecurity);

        // Étape 3 : annuler l'effet du mouvement actuel pour obtenir le stock "ancien"
        let quantityStOld;
        if (typeMvmActuel === 'Entree') {
            quantityStOld = quantityStActuel - quantityMvmActuel;
        } else {
            quantityStOld = quantityStActuel + quantityMvmActuel;
        }

        // Sécuriser : stock ne peut pas être négatif
        if (quantityStOld < 0) {
            return res.status(400).json({ message: "Erreur interne: quantité ancienne de stock invalide." });
        }

        const quantityMvmNew = Number(quantityMvm);
        const typeMvmNew = typeMvm;

        // Étape 4 : vérifier si la nouvelle sortie est valide
        if (typeMvmNew === 'Sortie' && quantityMvmNew > quantityStOld) {
            return res.status(400).json({
                message: 'Quantité demandée supérieure à la quantité disponible.',
                availableQuantity: quantityStOld
            });
        }

        // Étape 5 : recalculer le nouveau stock final
        let quantityStFinal;
        if (typeMvmNew === 'Entree') {
            quantityStFinal = quantityStOld + quantityMvmNew;
        } else {
            quantityStFinal = quantityStOld - quantityMvmNew;
        }

        // Étape 6 : calculer entrée/sortie
        const quantityEntree = typeMvmNew === 'Entree' ? quantityMvmNew : 0;
        const quantitySortie = typeMvmNew === 'Sortie' ? quantityMvmNew : 0;

        // Étape 7 : mettre à jour le mouvement
        await connection.query(`
            UPDATE rguig_inventaire_afg.mouvement
            SET typeMvm = ?, quantityMvm = ?, nOrdre = ?, quantityEntree = ?, quantitySortie = ?
            WHERE idMvm = ?
        `, [typeMvmNew, quantityMvmNew, nOrdre, quantityEntree, quantitySortie, id]);

        // Étape 8 : mettre à jour le stock
        await connection.query(`
            UPDATE rguig_inventaire_afg.articles
            SET quantitySt = ?
            WHERE reference = ?
        `, [quantityStFinal, referenceArticle]);

        // Étape 9 : envoi d'alerte si stock critique
        if (quantityStFinal < quantitySecurity) {
            const mailOptions = {
                from: 'mohamedrguig26@gmail.com',
                to: 'rguigmed107@gmail.com',
                subject: 'Alerte Stock Critique',
                text: `Le stock de l'article ${referenceArticle} est maintenant ${quantityStFinal}, inférieur au seuil de sécurité ${quantitySecurity}.`
            };
            await transporter.sendMail(mailOptions);
        }

        res.status(200).json({
            idMvm: id,
            referenceArticle,
            typeMvm: typeMvmNew,
            quantityMvm: quantityMvmNew,
            quantityEntree,
            quantitySortie,
            quantityStFinal,
            nOrdre
        });
        
    } catch (error) {
        console.error('Erreur lors de la mise à jour du mouvement :', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});*/