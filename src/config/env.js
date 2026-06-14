'use strict';
const Joi = require('joi');
require('dotenv').config();

const schema = Joi.object({
  PORT:                    Joi.number().default(3001),
  NODE_ENV:                Joi.string().valid('development', 'production', 'test').default('development'),
  MONGO_URI:               Joi.string().required(),
  MONGO_DB_NAME:           Joi.string().default('assetspatial'),
  REDIS_URL:               Joi.string().default('redis://localhost:6379'),
  JWT_SECRET:              Joi.string().min(32).required(),
  JWT_EXPIRES_IN:          Joi.string().default('7d'),
  GRIDFS_BUCKET_PHOTOS:    Joi.string().default('photos'),
  GRIDFS_BUCKET_DOCUMENTS: Joi.string().default('documents'),
  GRIDFS_BUCKET_EXCEL:     Joi.string().default('excel'),
  MAX_PHOTO_SIZE_MB:       Joi.number().default(15),
  MAX_PHOTOS_PER_ASSET:    Joi.number().default(50),
  MAX_DOCUMENT_SIZE_MB:    Joi.number().default(50),
  MAX_EXCEL_SIZE_MB:       Joi.number().default(100),
  TESSERACT_LANG:          Joi.string().default('eng+yor+hau'),
  TESSERACT_WORKERS:       Joi.number().default(2),
  RATE_LIMIT_WINDOW_MS:    Joi.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(200),
  CLIENT_URL:              Joi.string().default('http://localhost:5173'),
  LOG_LEVEL:               Joi.string().default('info'),
}).unknown(true);

const { error, value } = schema.validate(process.env);
if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

module.exports = value;
