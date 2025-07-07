require("dotenv").config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require("multer");
const path = require("path");
const db = require("./db");
const app = express();

app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors({
    origin:["http://localhost:3000","http://192.168.167.126:3000"],
    methods:["POST","GET","PUT","DELETE"],
    }));

const cloudinary = require('./cloudinary');   
const { CloudinaryStorage } = require('multer-storage-cloudinary');
    // Créer le stockage Cloudinary
const storageCloudinary = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: 'afg-images', // tu peux changer ce nom
            allowed_formats: ['jpg', 'jpeg', 'png'],
        },
    });   
const uploadCloudinary = multer({ storage: storageCloudinary });
const articlesRoute = require('./routes/articlesRoute');
const userRoute = require('./routes/userRoute');
const mvmRoute = require('./routes/mvmRoute');
const csvRoute = require('./routes/importcsv');
const excelRoute = require('./routes/importExcel');
const exportExcelCsvRoute = require('./routes/exportExcelCsvRoute');
app.use('/api/exportExcelCsvRoute', exportExcelCsvRoute);
app.use('/api/articles/', articlesRoute);
app.use('/api/users/', userRoute);
app.use('/api/mvm/', mvmRoute);
app.use('/api/csv/', csvRoute);
app.use('/api/excel/', excelRoute);

//image:
/*const storage1 = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "public/images");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Nom unique
    },
});*/
//qrcode
const storage2 = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "public/images/qr");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Nom unique
    },
});
const upload2 = multer({ storage: storage2 });
// Route pour uploader une image
app.post("/upload", uploadCloudinary.single("image"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "Aucun fichier n'a été téléchargé" });
    }
    // Cloudinary retourne automatiquement l'URL sécurisée
    const imagePath = req.file.path;
    res.json({ path: imagePath });
});
// Route pour uploader qr
app.post("/uploadqr", upload2.single("image"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "Aucun fichier n'a été téléchargé" });
    }
    const qrPath = `/images/qr/${req.file.filename}`;
    res.json({ path: qrPath }); // Retourne le chemin de l'image
});

// Rendre le dossier public accessible statiquement
app.use("/images", express.static(path.join(__dirname, "public/images")));
app.use("/images/qr", express.static(path.join(__dirname, "public/images/qr")));
app.get("/", async (req, res) => {
    res.send("Server working!!!");
});
const port = process.env.PORT || 5000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
