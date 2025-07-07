// config/cloudinary.js
require("dotenv").config();
const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDNAMECLOUDINARY,
  api_key: process.env.APIKEYCLOUDINARY,
  api_secret: process.env.APISECRETCLOUDINARY,
});

module.exports = cloudinary;
