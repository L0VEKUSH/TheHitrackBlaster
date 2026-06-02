const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { protectAdmin } = require("../middleware/auth");

const uploadDir = path.join(__dirname, "..", "public", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

// Optional S3-backed uploads. Configure these env vars in production when using S3:
// UPLOAD_S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
const USE_S3 = Boolean(process.env.UPLOAD_S3_BUCKET && process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
let s3Client;
let PutObjectCommand;
if (USE_S3) {
  try {
    const { S3Client, PutObjectCommand: POC } = require("@aws-sdk/client-s3");
    s3Client = new S3Client({ region: process.env.AWS_REGION });
    PutObjectCommand = POC;
    console.log("🔁 Uploads: using S3 bucket", process.env.UPLOAD_S3_BUCKET);
  } catch (err) {
    console.error("⚠️ Failed to initialize S3 client:", err.message);
  }
}

const memoryStorage = multer.memoryStorage();
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: USE_S3 && s3Client ? memoryStorage : diskStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Only images (jpeg, jpg, png, webp) are allowed"));
  }
});

router.post("/image", protectAdmin, upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  // If using S3, upload buffer to S3 and return the public URL
  if (USE_S3 && s3Client && PutObjectCommand) {
    try {
      const bucket = process.env.UPLOAD_S3_BUCKET;
      const region = process.env.AWS_REGION;
      const key = `uploads/${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(req.file.originalname)}`;

      const params = {
        Bucket: bucket,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        ACL: "public-read"
      };

      await s3Client.send(new PutObjectCommand(params));

      const imageUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
      return res.json({ success: true, imageUrl });
    } catch (err) {
      console.error("⚠️ S3 upload failed:", err.message);
      // fall through to disk fallback
    }
  }

  // Disk fallback
  const savedPath = path.join(uploadDir, req.file.filename || "");
  // If using memoryStorage fallback, write file to disk
  if (req.file.buffer && !req.file.path) {
    try {
      const filename = req.file.fieldname + "-" + Date.now() + path.extname(req.file.originalname);
      const outPath = path.join(uploadDir, filename);
      fs.writeFileSync(outPath, req.file.buffer);
      const imageUrl = `/uploads/${filename}`;
      return res.json({ success: true, imageUrl });
    } catch (err) {
      console.error("⚠️ Failed to write upload to disk:", err.message);
      return res.status(500).json({ success: false, message: "Failed to save uploaded file" });
    }
  }

  const imageUrl = `/uploads/${req.file.filename}`;
  res.json({ success: true, imageUrl });
});

module.exports = router;
