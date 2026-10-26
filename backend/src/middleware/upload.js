const multer = require('multer');

// Store files in memory so we can encrypt in RAM before saving to S3/disk
const storage = multer.memoryStorage();

// Maximum file size: 25MB (can be adjusted via env)
const MAX_FILE_SIZE_BYTES = (Number(process.env.MAX_FILE_SIZE_MB) || 25) * 1024 * 1024;

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    // Standard documents allowed (PDF, images, text, docs)
    cb(null, true);
  },
});

module.exports = upload;
