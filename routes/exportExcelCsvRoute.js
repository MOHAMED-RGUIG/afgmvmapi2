const express = require('express');
const path = require('path');
const router = express.Router();

// Excel
router.get('/export-module.xlsx', (req, res) => {
  const filePath = path.join(__dirname, '../exports/module.xlsx');
  res.download(filePath, 'module.xlsx');
});

// CSV
router.get('/export-module.csv', (req, res) => {
  const filePath = path.join(__dirname, '../exports/module.csv');
  res.download(filePath, 'module.csv');
});

module.exports = router;
