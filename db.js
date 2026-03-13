const mongoose = require('mongoose');

async function connectDB() {
  const FALLBACK_URI = 'mongodb+srv://Pavanmsskpr:pavanmsskpr@guardril.49la4la.mongodb.net/exam-guardrail?retryWrites=true&w=majority&appName=guardril';

  const envUri = process.env.MONGO_URI;
  // Only use env var if it's a valid MongoDB URI (not a placeholder)
  const uri = (envUri && envUri.startsWith('mongodb')) ? envUri : FALLBACK_URI;

  console.log('🔗 Connecting to MongoDB...');
  await mongoose.connect(uri);

  console.log('✅ MongoDB connected');

  mongoose.connection.on('disconnected', () => {
    console.log('⚠️  MongoDB disconnected');
  });
}

module.exports = connectDB;
