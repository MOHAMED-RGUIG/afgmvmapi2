const express = require('express');
const router = express.Router();
const { pool1 } = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
//const auth = require('../middleware/auth');
router.post('/register', async (req, res) => {
  const { name, email, password, phone, type } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Nom, email et mot de passe requis' });
  }

  try {
    // 1) Vérifier si l'email est déjà utilisé
    const [existingUsers] = await pool1.query(
      'SELECT 1 FROM rguig_inventaire_afg.users WHERE EMAILUSR = ?',
      [email]
    );
    if (existingUsers.length > 0) {
      return res.status(400).json({ message: 'Utilisateur déjà enregistré avec cet email' });
    }
    // 2) Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);
    // 3) Insérer l'utilisateur en stockant les deux mots de passe
    const [result] = await pool1.query(
      `INSERT INTO rguig_inventaire_afg.users
         (NOMUSR,
          EMAILUSR,
          MotDePasse,
          motPassNonHashed,
          TELEP,
          TYPUSR)
       VALUES (?,      ?,        ?,          ?,                ?,     ?)`,
      [
        name,                // NOMUSR
        email,               // EMAILUSR
        hashedPassword,      // MotDePasse (hashé)
        password,            // motPassNonHashed (en clair)
        phone  || null,      // TELEP
        type   || 'user'     // TYPUSR
      ]
    );

    res.status(201).json({
      message: 'Utilisateur enregistré avec succès',
      userId: result.insertId
    });

  } catch (error) {
    console.error('Erreur pendant l’enregistrement :', error);
    res.status(500).json({
      message: 'Erreur interne du serveur',
      error:   error.message
    });
  }
});
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email et mot de passe requis' });}
    try {
        const [rows] = await pool1.query(
            'SELECT * FROM rguig_inventaire_afg.users WHERE EMAILUSR = ?',
            [email]);
        //controler email     
        if (rows.length === 0) {
            return res.status(400).json({ message: 'Nom d’utilisateur ou mot de passe incorrect' });}
        //controler password    
        const user = rows[0];
        const passwordMatch = await bcrypt.compare(password, user.MotDePasse);
        if (!passwordMatch) {
            return res.status(400).json({ message: 'Nom d’utilisateur ou mot de passe incorrect' });}
        const currentUser = {
            EMAILUSR: user.EMAILUSR,
            idUser: user.idUser,
            NOMUSR: user.NOMUSR,
            TELEP: user.TELEP,
            TYPUSR: user.TYPUSR};
        const token = jwt.sign(currentUser, process.env.JWT_SECRET || "Med-Rg#_01234578", {
            expiresIn: process.env.JWT_EXPIRES_IN || '15m'});
        return res.json({ token, currentUser });
    } catch (error) {
        console.error('Erreur pendant la connexion :', error);
        return res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });}
});
module.exports = router;
/*
router.get('/profile', auth, (req, res) => {
  res.json({ message: 'Bienvenue', user: req.user });
});*/