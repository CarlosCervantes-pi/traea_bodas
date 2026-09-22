const express = require('express');
const multer = require('multer');
const mysql = require('mysql2/promise');
const sharp = require('sharp');
const archiver = require('archiver');
const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const crypto = require('crypto');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());

const REGION = 'us-east-1';
const BUCKET_NAME = 'bodas-fotos-carlos-12345'; // DEBE COINCIDIR CON EL BUCKET QUE CREES EN AWS

const s3 = new S3Client({ region: REGION });
const secrets = new SecretsManagerClient({ region: REGION });

let pool;

async function getDBSecret() {
    const response = await secrets.send(new GetSecretValueCommand({ SecretId: 'db-secret' }));
    return JSON.parse(response.SecretString);
}

async function initDB() {
    if (!pool) {
        const dbCreds = await getDBSecret();
        const connection = await mysql.createConnection({
            host: dbCreds.host,
            user: dbCreds.username,
            password: dbCreds.password
        });
        await connection.query(`CREATE DATABASE IF NOT EXISTS bodas;`);
        await connection.query(`USE bodas;`);
        await connection.query(`
            CREATE TABLE IF NOT EXISTS events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255),
                type VARCHAR(255),
                date VARCHAR(255)
            );
        `);
        await connection.query(`
            CREATE TABLE IF NOT EXISTS photos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                event_id INT,
                message TEXT,
                original_path VARCHAR(255),
                polaroid_path VARCHAR(255),
                FOREIGN KEY (event_id) REFERENCES events(id)
            );
        `);
        pool = mysql.createPool({
            host: dbCreds.host,
            user: dbCreds.username,
            password: dbCreds.password,
            database: 'bodas'
        });
    }
}

app.post('/events', async (req, res) => {
    await initDB();
    const { name, type, date } = req.body;
    const [result] = await pool.query('INSERT INTO events (name, type, date) VALUES (?, ?, ?)', [name, type, date]);
    res.json({ event_id: result.insertId });
});

app.post('/upload', upload.single('photo'), async (req, res) => {
    await initDB();
    const { event_id, message } = req.body;
    const uuid = crypto.randomUUID();
    
    const originalKey = `pictures/${uuid}.jpg`;
    const polaroidKey = `polaroids/${uuid}.jpg`;

    // Resize original a 128x128
    const resizedImage = await sharp(req.file.buffer).resize(128, 128).toBuffer();
    
    // Crear Polaroid (Marco blanco + texto)
    const polaroidImage = await sharp({
        create: { width: 148, height: 178, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
    })
    .composite([
        { input: resizedImage, top: 10, left: 10 },
        {
            input: Buffer.from(`<svg width="128" height="30"><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="black">${message}</text></svg>`),
            top: 148, left: 10
        }
    ])
    .jpeg().toBuffer();

    // Subir a S3
    await s3.send(new PutObjectCommand({ Bucket: BUCKET_NAME, Key: originalKey, Body: resizedImage, ContentType: 'image/jpeg' }));
    await s3.send(new PutObjectCommand({ Bucket: BUCKET_NAME, Key: polaroidKey, Body: polaroidImage, ContentType: 'image/jpeg' }));

    // Guardar en DB
    await pool.query('INSERT INTO photos (event_id, message, original_path, polaroid_path) VALUES (?, ?, ?, ?)', [event_id, message, originalKey, polaroidKey]);
    
    res.json({ success: true, originalKey, polaroidKey });
});

app.get('/events/:event_id', async (req, res) => {
    await initDB();
    const [events] = await pool.query('SELECT * FROM events WHERE id = ?', [req.params.event_id]);
    const [photos] = await pool.query('SELECT COUNT(*) as photoCount FROM photos WHERE event_id = ?', [req.params.event_id]);
    res.json({ event: events[0], photos_associated: photos[0].photoCount });
});

app.post('/finish', async (req, res) => {
    await initDB();
    const { event_id } = req.body;
    const [photos] = await pool.query('SELECT polaroid_path FROM photos WHERE event_id = ?', [event_id]);
    
    res.attachment('polaroids.zip');
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    for (let photo of photos) {
        const fileStream = await s3.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: photo.polaroid_path }));
        archive.append(fileStream.Body, { name: photo.polaroid_path.split('/')[1] });
    }
    archive.finalize();
});

app.listen(80, () => console.log('Servidor corriendo en puerto 80'));
